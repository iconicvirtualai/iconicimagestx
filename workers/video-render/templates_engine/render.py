#!/usr/bin/env python3
"""Iconic Video Templates renderer.

  python3 render.py --template templates/glamping_whip_tour.json --clips clips_dir_or_list \
      [--points points.json | --points s05=2.4,C4041.MP4=1.2] [--text title="High Meadow Ridge"] \
      [--music track.mp3] [--size 1080x1920|1920x1080] [--out out.mp4] [--seconds 15] [--preview]

Pipeline: conform every raw clip to a cached 60 fps proxy at the output size -> optical-flow analysis ->
assign clips to template slots (drop optional slots / reuse clips when there are fewer clips than slots) ->
lock the slot grid to the music's beats -> per slot pick the source window around its animation point
(user point, or the most motion-rich sharp window) and apply the speed curve -> pick whip directions from
camera motion -> render 60 fps frames with rigid transitions -> synthesize whooshes/hits, mix, loudness-normalize."""
import argparse, glob, json, math, os, subprocess, sys, time
import numpy as np, cv2

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)
import vtanalyze as VA, vtfx as FX, vtaudio as AU

VIDEO_EXT = (".mp4", ".mov", ".m4v", ".mkv", ".avi", ".webm", ".mts", ".mxf")


def log(*a):
    print(*a, file=sys.stderr, flush=True)


# ---------------------------------------------------------------------------------------------- inputs
def parse_clips(arg):
    if os.path.isdir(arg):
        return sorted(p for p in glob.glob(os.path.join(arg, "*")) if p.lower().endswith(VIDEO_EXT))
    if arg.startswith("@"):
        base = os.path.dirname(os.path.abspath(arg[1:]))
        out = []
        for l in open(arg[1:]):
            l = l.strip()
            if l and not l.startswith("#"):
                out.append(l if os.path.isabs(l) else os.path.join(base, l))
        return out
    return [p for p in arg.split(",") if p]


def parse_kv(arg, cast=str):
    """'a=1,b=2' or a JSON file / JSON string -> dict."""
    if not arg:
        return {}
    if os.path.exists(arg):
        return json.load(open(arg))
    s = arg.strip()
    if s.startswith("{"):
        return json.loads(s)
    out = {}
    for part in s.split(",") if cast is not str else [s]:
        pass
    # text values may contain commas: split on ',key=' boundaries only
    import re
    for m in re.finditer(r'([A-Za-z0-9_.\-]+)=("([^"]*)"|[^,]*)', s):
        k, v = m.group(1), (m.group(3) if m.group(3) is not None else m.group(2))
        out[k] = cast(v)
    return out


# ---------------------------------------------------------------------------------------------- speed
def speed_fn(spec, P, slot_len):
    """Returns v(dt) where dt = seconds since the slot's cut-in (may be <0 or > slot_len in transition overhangs)."""
    spec = spec or {}
    base = float(spec.get("base", 1.0))
    ri, ro = spec.get("in_ramp"), spec.get("out_ramp")
    curve = spec.get("curve")

    def v(dt):
        x = base
        if curve == "slow_mid":  # classic speed ramp: fast - slow - fast
            u = min(1, max(0, dt / max(slot_len, 1e-3)))
            x = base * (1 + (spec.get("edge", 2.5) - 1) * (1 - math.sin(math.pi * u)) ** 2)
        if ri:
            L = ri.get("beats", 0.6) * P
            if dt < L:
                k = 1 - FX.smooth(dt / L) if dt > 0 else 1.0
                x = x + (ri.get("peak", 2.0) * base - x) * k
        if ro:
            L = ro.get("beats", 0.75) * P
            r = slot_len - dt
            if r < L:
                k = 1 - FX.smooth(r / L) if r > 0 else 1.0
                x = x + (ro.get("peak", 2.4) * base - x) * k
        return max(0.05, x)
    return v


# ---------------------------------------------------------------------------------------------- source reader
class Reader:
    """Sequential frame reader over [s0, s1] of a proxy; frame_at(s, span) returns nearest frame or the mean of
    the frames covering a fast speed-ramp span (natural shutter blur, rigid)."""

    def __init__(self, path, s0, s1, W, H, fps_src=60.0):
        self.W, self.H, self.fps = W, H, fps_src
        self.s0 = max(0.0, s0)
        self.p = subprocess.Popen(["ffmpeg", "-v", "error", "-ss", f"{self.s0:.4f}", "-i", path, "-t",
                                   f"{max(0.1, s1 - self.s0 + 0.2):.4f}", "-f", "rawvideo", "-pix_fmt", "bgr24", "-"],
                                  stdout=subprocess.PIPE)
        self.buf = []  # (time, frame)
        self.idx = 0
        self.eof = False
        self.last = None

    def _read(self):
        if self.eof:
            return False
        b = self.p.stdout.read(self.W * self.H * 3)
        if len(b) < self.W * self.H * 3:
            self.eof = True
            return False
        f = np.frombuffer(b, np.uint8).reshape(self.H, self.W, 3)
        self.buf.append((self.s0 + self.idx / self.fps, f))
        self.idx += 1
        return True

    def frame_at(self, s, span=0.0):
        lo, hi = s - span / 2, s + span / 2
        while (not self.buf or self.buf[-1][0] < hi) and self._read():
            pass
        while len(self.buf) > 2 and self.buf[1][0] < lo - 0.5 / self.fps:
            self.buf.pop(0)
        if not self.buf:
            return self.last if self.last is not None else np.zeros((self.H, self.W, 3), np.uint8)
        if span * self.fps > 1.6:
            sel = [f for (t, f) in self.buf if lo - 0.5 / self.fps <= t <= hi + 0.5 / self.fps]
            if len(sel) > 8:
                sel = sel[:: int(math.ceil(len(sel) / 8))]
            if len(sel) > 1:
                acc = np.zeros((self.H, self.W, 3), np.float32)
                for f in sel:
                    acc += f
                self.last = (acc / len(sel)).astype(np.uint8)
                return self.last
        # blend the two bracketing frames: even cadence for 0.5x-1.6x speeds (no skip/duplicate judder)
        prev = nxt = None
        for (t, f) in self.buf:
            if t <= s:
                prev = (t, f)
            elif nxt is None:
                nxt = (t, f)
                break
        if prev is None or nxt is None:
            t, f = min(self.buf, key=lambda tf: abs(tf[0] - s))
            self.last = f
            return f
        w = (s - prev[0]) / max(1e-6, nxt[0] - prev[0])
        if w < 0.12:
            f = prev[1]
        elif w > 0.88:
            f = nxt[1]
        else:
            f = cv2.addWeighted(prev[1], 1 - w, nxt[1], w, 0)
        self.last = f
        return f

    def close(self):
        try:
            self.p.stdout.close(); self.p.kill(); self.p.wait()
        except Exception:
            pass


# ---------------------------------------------------------------------------------------------- planning
def choose_window(an, rel_lo, rel_hi, user_point, used, margin=0.06, avoid_head=0.25):
    """Returns (point, scale) so that [point+rel_lo*scale, point+rel_hi*scale] fits inside the clip.
    Default point = the most motion-rich, sharp window not already used by another slot."""
    dur = an["duration"]
    need = rel_hi - rel_lo
    avail = dur - 2 * margin
    scale = 1.0
    if need > avail:
        scale = max(0.35, avail / need)
    lo_ok = margin - rel_lo * scale
    hi_ok = dur - margin - rel_hi * scale
    if hi_ok < lo_ok:  # still doesn't fit even slowed: center it, ends will hold
        return (lo_ok + hi_ok) / 2, scale, "clip too short: holding ends"
    if user_point is not None:
        pt = min(max(float(user_point), lo_ok), hi_ok)
        return pt, scale, ("" if abs(pt - float(user_point)) < 1e-3 else f"point moved {user_point:.2f}->{pt:.2f}s to fit")
    r = an["rate"]
    mag = np.array(an["mag"], np.float32)
    sh = np.array(an["sharp"], np.float32)
    shn = np.clip(sh / (np.median(sh) + 1e-6), 0.3, 1.5)
    best, bp = -1e9, lo_ok
    for pt in np.arange(lo_ok, hi_ok + 1e-6, 0.05):
        a, b = pt + rel_lo * scale, pt + rel_hi * scale
        i0, i1 = int(a * r), max(int(a * r) + 1, int(b * r))
        m = mag[i0:i1]
        score = float(np.mean(m)) * float(np.mean(shn[i0:i1])) ** 0.4
        score -= 0.6 * float(np.std(np.diff(m))) if len(m) > 2 else 0  # prefer smooth motion over jitter
        if a < avoid_head:
            score -= 0.05 * (avoid_head - a)
        for (ua, ub) in used:
            ov = max(0.0, min(b, ub) - max(a, ua))
            score -= 2.0 * ov / max(need, 1e-3)
        if score > best:
            best, bp = score, pt
    return float(bp), scale, ""


def assign_mapped(slots, mapping, keep_all=False):
    """Explicit slot -> clip(s) mapping (what the Studio UI sends after drag-and-drop).
    Unfilled optional slots are dropped; unfilled required slots re-use a filled slot's clip
    (same kind first, least-used, farthest away) with a different, non-overlapping window."""
    active, dropped = [], []
    for s in slots:
        if s["id"] in mapping:
            v = mapping[s["id"]]
            s["_clips"] = v if isinstance(v, list) else [v]
            active.append(s)
        elif s.get("optional") and not keep_all:
            dropped.append(s["id"])
        else:
            active.append(s)
    filled = [i for i, s in enumerate(active) if "_clips" in s]
    if not filled:
        sys.exit("no clips mapped to slots")
    uses, reused = {}, 0
    for i, s in enumerate(active):
        if "_clips" in s:
            continue
        same = [j for j in filled if active[j].get("kind") == s.get("kind")] or filled
        j = min(same, key=lambda j: (uses.get(active[j]["_clips"][0]["path"], 0), -abs(i - j)))
        c = active[j]["_clips"][0]
        uses[c["path"]] = uses.get(c["path"], 0) + 1
        need = s.get("clips", 1)
        s["_clips"] = [c] + [active[filled[(filled.index(j) + q) % len(filled)]]["_clips"][0] for q in range(1, need)]
        s["_reuse"] = True
        reused += 1
    return active, dropped, reused


def assign_clips(slots, clips, reuse_max_frac=0.25):
    """Clips are consumed in order. If there are fewer clips than the template wants:
    1) drop optional slots (highest drop_priority first);
    2) split-screen side panels reuse the neighbouring slots' clips (other moments of them);
    3) any remaining shortfall: evenly spaced middle slots reuse the clip from two slots earlier
       (a different, non-overlapping window is picked), so the LAST clip still lands on the LAST slot."""
    N = len(clips)
    demand = lambda ss: sum(s.get("clips", 1) for s in ss)
    dropped = []
    if N < demand(slots):
        opt = sorted([s for s in slots if s.get("optional")], key=lambda s: -s.get("drop_priority", 1))
        budget = N / max(0.01, 1 - reuse_max_frac)  # allow up to reuse_max_frac of slots to re-use a clip
        for s in opt:
            if demand([x for x in slots if x not in dropped]) <= budget:
                break
            dropped.append(s)
    active = [s for s in slots if s not in dropped]
    side_reuse = set()
    if N < demand(active):
        for s in active:
            if s.get("clips", 1) > 1 and N < demand(active) * (1 - reuse_max_frac) - len(side_reuse) * 2:
                side_reuse.add(s["id"])
    need = sum(1 if s["id"] in side_reuse else s.get("clips", 1) for s in active)
    r = max(0, need - N)
    reuse_idx = set()
    if r:
        cand = [i for i in range(2, len(active) - 1) if active[i].get("clips", 1) == 1]
        step = len(cand) / (r + 1)
        reuse_idx = {cand[min(len(cand) - 1, int(step * (j + 1)))] for j in range(r) if cand}
    k = 0
    uses = {}
    for i, s in enumerate(active):
        if i in reuse_idx:
            pool = [j for j in range(i - 2, -1, -1) if not active[j].get("_reuse")]
            same = [j for j in pool if active[j].get("kind") == s.get("kind")] or pool
            src_i = min(same, key=lambda j: (uses.get(active[j]["_clips"][0]["path"], 0), -(i - j)))
            s["_clips"] = [active[src_i]["_clips"][0]]
            s["_reuse"] = True
            uses[s["_clips"][0]["path"]] = uses.get(s["_clips"][0]["path"], 0) + 1
            continue
        n = 1 if s["id"] in side_reuse else s.get("clips", 1)
        s["_clips"] = [clips[min(k + j, N - 1)] for j in range(n)]
        k += n
        if s["id"] in side_reuse:
            prev = [a["_clips"][0] for a in active[max(0, i - 2):i]] or [s["_clips"][0]]
            s["_clips"] += (prev + prev)[:2]
    if k < N:
        log(f"note: {N - k} clip(s) not used by this template (it has {len(active)} slots)")
    return active, [s["id"] for s in dropped], len(reuse_idx) + 2 * len(side_reuse)


def plan(T, clips, points, texts, music, size, fps, seconds=None):
    W, H = size
    P0 = 60.0 / T["music"]["bpm"]
    mstart = float(T["music"].get("start", 0.0))
    bpm_det, beats = AU.detect_beats(music, mstart) if music else (None, [])
    P, phi = AU.beat_grid(T["music"]["bpm"], T["music"].get("beat_offset", 0.0), beats)
    log(f"music: template {T['music']['bpm']} BPM, detected {bpm_det and round(bpm_det, 2)} BPM -> grid P={P:.4f}s phase={phi:.3f}s")
    btime = lambda b: phi + b * P

    slots = [dict(s) for s in T["slots"]]
    if isinstance(clips, dict):
        active, dropped, reused = assign_mapped(slots, clips, T.get("_keep_all", False))
    else:
        active, dropped, reused = assign_clips(slots, clips, 0.99 if T.get("_keep_all") else T.get("reuse_max_frac", 0.25))
    if dropped:
        log(f"fewer clips ({len(clips)}) than slots: dropped optional slots {dropped}")
    if reused:
        log(f"reusing {reused} clip(s) with different windows")
    # beat boundaries
    b = float(T["music"].get("first_cut_beat", 4))
    cuts = [0.0]
    beat_pos = [None]
    for i, s in enumerate(active):
        if i == 0:
            bb = b
        else:
            bb = beat_pos[-1] + float(s["beats"])
        beat_pos.append(bb)
        cuts.append(round(btime(bb) * fps) / fps)
    # transitions (between slot i and i+1 = slot i 'out')
    D = T.get("defaults", {})
    for i, s in enumerate(active):
        s["_t0"], s["_t1"] = cuts[i], cuts[i + 1]
        s["_beat0"] = beat_pos[i] if i else beat_pos[1] - (cuts[1] - cuts[0]) / P
        o = dict(D.get("out", {"type": "cut"}))
        o.update(s.get("out", {}))
        if i == len(active) - 1:
            o = {"type": "none"}
        nT = int(round(o.get("beats", D.get("trans_beats", 0.4)) * P * fps)) if o["type"] not in ("cut", "none") else 0
        nT = max(nT, 2) if nT else 0
        nT += nT % 2  # even, centered on the cut
        s["_out"] = o
        s["_nT"] = nT
    total = cuts[-1]
    # analysis + windows
    used = {}
    pt_moves = []
    for i, s in enumerate(active):
        nin = active[i - 1]["_nT"] if i else 0
        a = s["_t0"] - nin / 2 / fps
        bnd = s["_t1"] + s["_nT"] / 2 / fps
        L = s["_t1"] - s["_t0"]
        sp = dict(D.get("speed", {}))
        sp.update(s.get("speed", {}))
        if sp.get("auto_ramps", True):
            if s["_out"]["type"] in ("whip", "mirror_whip", "zoom_through", "mask_wipe") and "out_ramp" not in sp:
                sp["out_ramp"] = D.get("whip_out_ramp", {"peak": 2.2, "beats": 0.6})
            if i and active[i - 1]["_out"]["type"] in ("whip", "mirror_whip", "zoom_through", "mask_wipe") and "in_ramp" not in sp:
                sp["in_ramp"] = D.get("whip_in_ramp", {"peak": 2.0, "beats": 0.5})
        v = speed_fn(sp, P, L)
        thit = s["_t0"] + float(s.get("hit_beat", 0.0)) * P
        n0, n1 = int(round(a * fps)), int(round(bnd * fps))
        ts = np.arange(n0, n1) / fps
        vs = np.array([v(t - s["_t0"]) for t in ts])
        rel = np.cumsum(vs) / fps
        ih = int(np.clip(round((thit - a) * fps), 0, len(rel) - 1))
        rel = rel - rel[ih]
        s["_frames"] = (n0, n1)
        s["_v"] = vs
        s["_rel"] = rel
        s["_wins"] = []
        for j, c in enumerate(s["_clips"]):
            an = VA.analyze(c["proxy"], log)
            up = None
            for key in (f"{s['id']}" + (f".{j}" if j else ""), os.path.basename(c["path"]) if j == 0 else None):
                if key and key in points:
                    up = float(points[key])
                    break
            relj = rel + (j * 0.0)
            pt, scale, note = choose_window(an, float(relj.min()), float(relj.max()), up, used.get(c["path"], []))
            if note:
                pt_moves.append(f"{s['id']}: {note}")
            sw = (pt + relj.min() * scale, pt + relj.max() * scale)
            used.setdefault(c["path"], []).append(sw)
            s["_wins"].append({"clip": c, "point": pt, "scale": scale, "win": sw, "an": an,
                               "auto_point": up is None})
    # whip directions from camera motion
    alt = 1
    for i, s in enumerate(active[:-1]):
        o = s["_out"]
        if o["type"] in ("whip", "mirror_whip", "mask_wipe"):
            d = o.get("dir", "auto")
            src = "template"
            if d == "auto" or d.startswith("auto"):
                wa = s["_wins"][0]
                ca, _ = VA.camera_direction(wa["an"], wa["win"][1] - 0.5, wa["win"][1])
                nb = active[i + 1]["_wins"][0]
                cb, _ = VA.camera_direction(nb["an"], nb["win"][0], nb["win"][0] + 0.5)
                fallback = o.get("fallback") or ("right" if alt > 0 else "left")
                if ca in FX.DIRV:
                    d, src = ca, "outgoing camera motion"
                elif cb in FX.DIRV:
                    d, src = cb, "incoming camera motion"
                else:
                    d, src = fallback, "fallback"
                    alt = -alt
            o["cam"] = d
            o["_dir_src"] = src
    # layers
    layers = []
    for L0 in T.get("layers", []):
        L = dict(L0)
        if L.get("id") in texts:
            L["text"] = texts[L["id"]]
        if L["type"] == "logo" and not (L.get("path") and os.path.exists(L["path"])):
            continue
        if L["type"] == "text" and not str(L.get("text", "")).strip():
            continue
        tgt = L.get("slot")
        ids = [s["id"] for s in active]
        if tgt == "last":
            tgt = ids[-1]
        if tgt == "first":
            tgt = ids[0]
        if tgt not in ids:  # slot dropped: move to the nearest following slot
            order = [s["id"] for s in T["slots"]]
            later = [x for x in order[order.index(tgt) + 1:] if x in ids] if tgt in order else []
            tgt = later[0] if later else ids[-1]
        L["slot"] = tgt
        layers.append(L)
    truncated = bool(seconds and seconds < total)
    if seconds:
        total = min(total, seconds)
    return {"W": W, "H": H, "fps": fps, "P": P, "phi": phi, "total": total, "slots": active, "dropped": dropped,
            "reused": reused, "layers": layers, "notes": pt_moves, "truncated": truncated, "music": music, "mstart": mstart}


# ---------------------------------------------------------------------------------------------- slot rendering
class SlotRender:
    def __init__(self, s, plan_, G):
        self.s, self.pl, self.G = s, plan_, G
        W, H, fps = plan_["W"], plan_["H"], plan_["fps"]
        self.readers = []
        for w in s["_wins"]:
            pr = w["clip"]["proxy"]
            self.readers.append(Reader(pr, w["win"][0] - 0.05, w["win"][1] + 0.05, W, H))
            w["gain"] = self._levels(pr, (w["win"][0] + w["win"][1]) / 2, W, H)
        self.layers = [L for L in plan_["layers"] if L["slot"] == s["id"]]
        self.track = np.zeros(2, np.float32)
        self.prev_small = None
        self._text_cache = {}

    @staticmethod
    def _levels(proxy, t, W, H, strength=0.65, target=0.45):
        """Auto levels from one frame in the window: (alpha, beta) for convertScaleAbs. Stretches the 0.5-99.7 %
        luma range part-way to full range, then nudges mean luma toward `target`."""
        p = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.3f}", "-i", proxy, "-frames:v", "1", "-vf",
                            "scale=270:480,format=gray", "-f", "rawvideo", "-"], capture_output=True)
        g = np.frombuffer(p.stdout, np.uint8).astype(np.float32)
        if g.size < 100:
            return (1.0, 0.0)
        lo, hi = np.percentile(g, 0.5), np.percentile(g, 99.7)
        hi = max(hi, lo + 40)
        a_full = 250.0 / (hi - lo); b_full = 3 - lo * a_full
        a = 1 + (a_full - 1) * strength; b = b_full * strength
        m = float(np.clip(g * a + b, 0, 255).mean()) / 255
        k = float(np.clip((target / max(m, 0.05)) ** 0.5, 0.9, 1.3))
        return (float(np.clip(a * k, 0.8, 2.2)), float(np.clip(b * k, -90, 40)))

    def close(self):
        for r in self.readers:
            r.close()

    def _src(self, j, k):
        """Frame j-th clip at output frame index k (absolute)."""
        s = self.s
        n0 = s["_frames"][0]
        i = int(np.clip(k - n0, 0, len(s["_rel"]) - 1))
        w = s["_wins"][j]
        st = w["point"] + s["_rel"][i] * w["scale"]
        st = min(max(st, 0.0), w["an"]["duration"] - 0.02)
        span = s["_v"][i] * w["scale"] / self.pl["fps"]
        f = self.readers[j].frame_at(st, span)
        return FX.apply_grade(f, self.G, w["gain"])

    def frame(self, k):
        s, pl = self.s, self.pl
        W, H, fps, P = pl["W"], pl["H"], pl["fps"], pl["P"]
        t = k / fps
        dt = t - s["_t0"]
        if s.get("layout") == "split3":
            img = self._split3(k, dt)
        else:
            img = self._src(0, k)
        # base camera move on top of the footage (subtle push for static clips)
        bm = s.get("push")
        if bm:
            u = FX.clamp01(dt / max(1e-3, s["_t1"] - s["_t0"]))
            img = FX.affine(img, 1 + bm * u)
        img = self._effects(img, dt, P)
        img = self._layers(img, dt, k)
        return img

    def _split3(self, k, dt):
        s, pl = self.s, self.pl
        W, H, P = pl["W"], pl["H"], pl["P"]
        vertical = H >= W
        frames = [self._src(j, k) for j in range(len(s["_wins"]))]
        while len(frames) < 3:
            frames.append(frames[0])
        center, a, b = frames[0], frames[1], frames[2]
        L = s["_t1"] - s["_t0"]
        ex = s.get("expand_center_beats", 1.5) * P
        e = FX.smooth((dt - (L - ex)) / ex) if ex > 0 else 0.0
        side = H if vertical else W
        band = side / 3 + e * (side - side / 3)
        gap = int(6 * (1 - e))
        out = np.zeros_like(center)
        # entrance: panels slide in, staggered, during the first 0.5 beat
        def slide(j):
            q = FX.steep(FX.clamp01((dt + 0.02 - j * 0.08) / (0.5 * P)), 2.4)
            return (1 - q) * (1 if j % 2 == 0 else -1) * (W if vertical else H)
        c0 = int(side / 2 - band / 2)
        c1 = int(side / 2 + band / 2)
        if vertical:
            top_h = c0 - gap
            if top_h > 0:  # top panel shows the centre band of clip a, pushed up as the centre grows
                src0 = int(H / 2 - (side / 3) / 2)
                seg = a[src0 + int(side / 3) - top_h: src0 + int(side / 3)] if top_h <= side / 3 else a[:top_h]
                out[0:top_h] = FX.affine(cv2.resize(seg, (W, top_h)) if seg.shape[0] != top_h else seg, 1, 0, slide(1), 0)
            bot_y = c1 + gap
            if bot_y < H:
                hh = H - bot_y
                src0 = int(H / 2 - (side / 3) / 2)
                seg = b[src0: src0 + hh] if hh <= side / 3 else b[H - hh:]
                out[bot_y:H] = FX.affine(cv2.resize(seg, (W, hh)) if seg.shape[0] != hh else seg, 1, 0, slide(2), 0)
            out[c0:c1] = FX.affine(center, 1, 0, slide(0), 0)[c0:c1]
        else:
            lw = c0 - gap
            if lw > 0:
                src0 = int(W / 2 - (side / 3) / 2)
                seg = a[:, src0 + int(side / 3) - lw: src0 + int(side / 3)] if lw <= side / 3 else a[:, :lw]
                out[:, 0:lw] = seg if seg.shape[1] == lw else cv2.resize(seg, (lw, H))
            rx = c1 + gap
            if rx < W:
                ww = W - rx
                src0 = int(W / 2 - (side / 3) / 2)
                seg = b[:, src0: src0 + ww] if ww <= side / 3 else b[:, W - ww:]
                out[:, rx:W] = seg if seg.shape[1] == ww else cv2.resize(seg, (ww, H))
            out[:, c0:c1] = center[:, c0:c1]
        return out

    def _effects(self, img, dt, P):
        for e in self.s.get("effects", []):
            at = (float(self.s.get("hit_beat", 0.0)) if e.get("at") == "hit" else float(e.get("at_beat", 0.0))) * P
            dur = float(e.get("beats", 0.5)) * P
            x = (dt - at) / max(dur, 1e-3)
            ty = e["type"]
            if ty == "punch" and -0.05 <= x <= 1:
                q = FX.smooth(x / 0.18) if x < 0.18 else 1 - FX.smooth((x - 0.18) / 0.82)
                img = FX.affine(img, 1 + e.get("amount", 0.08) * q)
            elif ty == "bw":
                a0, a1 = float(e.get("from_beat", 0)) * P, float(e.get("to_beat", 1)) * P
                if dt < a1 + 0.05:
                    k = 1.0 if dt < a1 else 1 - (dt - a1) / 0.05
                    g = cv2.cvtColor(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), cv2.COLOR_GRAY2BGR)
                    g = cv2.convertScaleAbs(g, alpha=1.15, beta=-10)
                    img = cv2.addWeighted(img, 1 - k, g, k, 0)
            elif ty == "rgb_split" and 0 <= x <= 1:
                k = 1 - abs(x - 0.5) * 2
                img = FX.rgb_split(img, e.get("amount", 22) * k, slices=int(e.get("slices", 5) * k), seed=int(dt * 60))
            elif ty == "flash" and 0 <= x <= 1:
                k = (1 - FX.smooth(x)) ** 1.5
                img = cv2.addWeighted(img, 1 - 0.9 * k, np.full_like(img, 255), 0.9 * k, 0)
            elif ty == "shake" and 0 <= x <= 1:
                a = e.get("amount", 14) * (1 - x) ** 2
                img = FX.affine(img, 1.03, 0, a * math.sin(dt * 90), a * math.cos(dt * 70))
        return img

    def _layers(self, img, dt, k):
        if not self.layers:
            return img
        pl = self.pl
        W, H, P, fps = pl["W"], pl["H"], pl["P"], pl["fps"]
        need_track = any(L.get("track") for L in self.layers)
        if need_track:
            sm = cv2.cvtColor(cv2.resize(img, (W // 4, H // 4)), cv2.COLOR_BGR2GRAY).astype(np.float32)
            if self.prev_small is not None:
                (sx, sy), resp = cv2.phaseCorrelate(self.prev_small, sm)
                if resp > 0.08 and abs(sx) < W / 16 and abs(sy) < H / 16:
                    self.track += np.array([sx * 4, sy * 4], np.float32)
            self.prev_small = sm
        for L in self.layers:
            a0 = float(L.get("start_beat", 0)) * P
            a1 = float(L.get("end_beat", 99)) * P
            if not (a0 <= dt <= a1 + 0.3):
                continue
            key = (L.get("id"), L.get("text"))
            if key not in self._text_cache:
                if L["type"] == "text":
                    lay = dict(L)
                    lay["size"] = L.get("size", 0.12) * min(W, H) / W
                    self._text_cache[key] = FX.render_text_rgba(lay, W, H)
                else:
                    self._text_cache[key] = FX.load_logo(L["path"], min(W, H), L.get("width", 0.4))
            col, al = self._text_cache[key]
            op = 1.0
            if L.get("style") == "neon_script":
                op = FX.neon_flicker(dt - a0)
            else:
                op = FX.smooth((dt - a0) / 0.25)
            if dt > a1:
                op *= 1 - FX.smooth((dt - a1) / 0.3)
            px, py = L.get("pos", [0.5, 0.5])
            cx, cy = px * W, py * H
            if L.get("track"):
                lim = L.get("track_limit", 0.08)
                tr = np.clip(self.track * L.get("follow", 1.0), [-W * lim, -H * lim], [W * lim, H * lim])
                cx += tr[0]; cy += tr[1]
            rise = L.get("rise", 0.0)
            if rise:
                cy += (1 - FX.smooth((dt - a0) / (0.6 * P))) * rise * H
            img = FX.composite(img.copy() if not img.flags.writeable else img, col, al, cx, cy, op,
                               additive=L.get("style") == "neon_script")
        return img


# ---------------------------------------------------------------------------------------------- main render
def build_cues(pl, T):
    cues = []
    P = pl["P"]
    sf = T.get("sfx", {})
    wg = sf.get("whoosh_gain", 0.55)
    for i, s in enumerate(pl["slots"][:-1]):
        o, tcut = s["_out"], s["_t1"]
        ty = o["type"]
        if ty in ("whip", "mirror_whip", "mask_wipe", "zoom_through"):
            cues.append((tcut, "whoosh", max(0.42, s["_nT"] / pl["fps"] * 2.4), wg * o.get("sfx_gain", 1.0), "center"))
        elif ty in ("flash", "flash_bw"):
            cues.append((tcut, "shimmer", max(0.5, s["_nT"] / pl["fps"] * 2.5), sf.get("shimmer_gain", 0.5), "center"))
            cues.append((tcut, "whoosh", 0.45, wg * 0.6, "center"))
        elif ty == "glitch":
            cues.append((tcut, "glitch", 0.22, sf.get("glitch_gain", 0.35), "center"))
        if o.get("hit"):
            cues.append((tcut, o["hit"], 1.2, sf.get("hit_gain", 0.85), "start"))
    for s in pl["slots"]:
        for e in s.get("effects", []):
            if e.get("sfx"):
                at = (float(s.get("hit_beat", 0)) if e.get("at") == "hit" else float(e.get("at_beat", 0))) * P
                cues.append((s["_t0"] + at, e["sfx"], 1.2 if e["sfx"] == "sub_boom" else 0.3, sf.get("hit_gain", 0.85), "start"))
    for h in sf.get("hits", []):
        s = next((x for x in pl["slots"] if x["id"] == h["slot"]), None)
        if s:
            cues.append((s["_t0"] + h.get("at_beat", 0) * P, h.get("kind", "sub_boom"), h.get("dur", 1.2), h.get("gain", 0.85), "start"))
    return [c for c in cues if c[0] < pl["total"]]


def render(T, pl, out, crf=19):
    W, H, fps = pl["W"], pl["H"], pl["fps"]
    G = FX.make_grade(T.get("grade"))
    nF = int(round(pl["total"] * fps))
    P = pl["P"]
    # audio first
    wav = out + ".mix.wav"
    cues = build_cues(pl, T)
    mus = T["music"]
    AU.mixdown(pl["total"], pl["music"], pl["mstart"], cues, wav, fade_in=mus.get("fade_in", 0.0),
               fade_out=(0.3 if pl.get("truncated") else mus.get("fade_out_beats", 4) * P), music_gain=mus.get("gain", 0.9))
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}",
                            "-r", str(fps), "-i", "-", "-i", wav, "-map", "0:v", "-map", "1:a",
                            "-c:v", "libx264", "-preset", "medium", "-crf", str(crf), "-pix_fmt", "yuv420p",
                            "-profile:v", "high", "-movflags", "+faststart",
                            "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
                            "-shortest", out], stdin=subprocess.PIPE)
    slots = pl["slots"]
    active = {}
    fade_in_n = int(T.get("fade_in_beats", 0.0) * P * fps)
    fade_out_n = 0 if pl.get("truncated") else int(T.get("fade_out_beats", 0.0) * P * fps)
    vig = FX.make_grade({"vignette": (T.get("grade") or {}).get("vignette", 0.0)})
    t_start = time.time()

    def get(i):
        if i not in active:
            active[i] = SlotRender(slots[i], pl, G)
        return active[i]

    for k in range(nF):
        t = k / fps
        # current slot
        i = 0
        while i + 1 < len(slots) and t >= slots[i]["_t1"]:
            i += 1
        frame = None
        # incoming transition from slot i-1?
        if i > 0 and slots[i - 1]["_nT"]:
            nT = slots[i - 1]["_nT"]
            c = int(round(slots[i - 1]["_t1"] * fps))
            if k < c + nT // 2:
                p = (k - (c - nT // 2) + 0.5) / nT
                fa, fb = get(i - 1).frame(k), get(i).frame(k)
                frame = FX.transition(slots[i - 1]["_out"]["type"], fa, fb, p, nT, slots[i - 1]["_out"])
        if frame is None and i + 1 < len(slots) and slots[i]["_nT"]:
            nT = slots[i]["_nT"]
            c = int(round(slots[i]["_t1"] * fps))
            if k >= c - nT // 2:
                p = (k - (c - nT // 2) + 0.5) / nT
                fa, fb = get(i).frame(k), get(i + 1).frame(k)
                frame = FX.transition(slots[i]["_out"]["type"], fa, fb, p, nT, slots[i]["_out"])
        if frame is None:
            frame = get(i).frame(k)
        # close finished slots
        for j in list(active):
            if j < i - 1 or (j == i - 1 and k > int(round(slots[j]["_t1"] * fps)) + slots[j]["_nT"]):
                active.pop(j).close()
        if vig["vig"] > 0:
            frame = FX.apply_grade(frame, {"luts": [np.arange(256, dtype=np.uint8)] * 3, "sat": 1.0, "vig": vig["vig"], "sharpen": 0})
        if fade_in_n and k < fade_in_n:
            frame = cv2.convertScaleAbs(frame, alpha=FX.smooth(k / fade_in_n))
        if fade_out_n and k > nF - fade_out_n:
            frame = cv2.convertScaleAbs(frame, alpha=FX.smooth((nF - k) / fade_out_n))
        enc.stdin.write(np.ascontiguousarray(frame).tobytes())
        if k % 300 == 0:
            el = time.time() - t_start
            log(f"  frame {k}/{nF}  slot {slots[i]['id']}  {el:.0f}s")
    enc.stdin.close(); enc.wait()
    for r in active.values():
        r.close()
    os.remove(wav)
    return out


def manifest(T, pl, out):
    m = {"template": T["id"], "output": out, "size": [pl["W"], pl["H"]], "fps": pl["fps"], "duration": round(pl["total"], 3),
         "music": pl["music"], "bpm": round(60 / pl["P"], 2), "beat_phase": round(pl["phi"], 3),
         "dropped_slots": pl["dropped"], "reused_clips": pl["reused"], "notes": pl["notes"], "slots": []}
    for s in pl["slots"]:
        m["slots"].append({
            "id": s["id"], "label": s.get("label"), "t0": round(s["_t0"], 3), "t1": round(s["_t1"], 3),
            "out": {k: v for k, v in s["_out"].items() if not k.startswith("_") or k == "_dir_src"},
            "clips": [{"file": os.path.basename(w["clip"]["path"]), "animation_point": round(w["point"], 3),
                       "auto_point": w["auto_point"], "source_window": [round(w["win"][0], 3), round(w["win"][1], 3)],
                       "speed_scale": round(w["scale"], 3)} for w in s["_wins"]]})
    json.dump(m, open(out + ".manifest.json", "w"), indent=1)
    return m


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--template", required=True)
    ap.add_argument("--clips", required=True, help="folder, comma list, or @list.txt (order = slot order)")
    ap.add_argument("--points", default="", help="JSON file/string or slot_id=sec / clipname=sec pairs")
    ap.add_argument("--text", default=None, action="append", help='layer_id="new wording" (repeatable) or JSON')
    ap.add_argument("--music", default="")
    ap.add_argument("--music-start", type=float, default=None)
    ap.add_argument("--logo", default="", help="optional PNG for the template's logo layer")
    ap.add_argument("--size", default="")
    ap.add_argument("--fps", type=int, default=0)
    ap.add_argument("--seconds", type=float, default=0)
    ap.add_argument("--preview", action="store_true", help="half resolution, 30 fps")
    ap.add_argument("--crf", type=int, default=0)
    ap.add_argument("--out", default="")
    ap.add_argument("--plan-only", action="store_true")
    ap.add_argument("--keep-all-slots", action="store_true", help="never drop optional slots; reuse clips instead (full template length)")
    a = ap.parse_args()
    T = json.load(open(a.template))
    T["_keep_all"] = a.keep_all_slots
    W, H = T["output"]["w"], T["output"]["h"]
    if a.size:
        W, H = map(int, a.size.lower().split("x"))
    fps = a.fps or T["output"].get("fps", 60)
    if a.preview:
        W, H, fps = W // 2, H // 2, 30
    music = a.music or T["music"].get("track", "")
    if music and not os.path.isabs(music):
        music = os.path.join(ROOT, music)
    if a.music_start is not None:
        T["music"]["start"] = a.music_start
    if a.music and a.music != T["music"].get("track"):
        bpm, _ = AU.detect_beats(music, T["music"].get("start", 0.0))
        if bpm:  # follow the user's track tempo; template beats stay the same, seconds change
            T["music"]["bpm"] = bpm
    texts = {}
    for t in a.text or []:
        t = t.strip()
        if t.startswith("{") or os.path.exists(t):
            texts.update(parse_kv(t))
        elif "=" in t:  # one layer per --text; the value may contain commas
            k, v = t.split("=", 1)
            v = v.strip()
            if len(v) >= 2 and v[0] == v[-1] == '"':
                v = v[1:-1]
            texts[k.strip()] = v
    points = parse_kv(a.points, float) if a.points else {}
    if a.logo:
        for L in T.get("layers", []):
            if L["type"] == "logo":
                L["path"] = a.logo
    if a.clips.endswith(".json"):  # {"s01": "clip.mp4", "s16": ["a.mp4","b.mp4","c.mp4"], ...}
        base = os.path.dirname(os.path.abspath(a.clips))
        raw = json.load(open(a.clips))
        raw = raw.get("slots", raw)
        cache = {}
        def C(p):
            p = p if os.path.isabs(p) else os.path.join(base, p)
            if p not in cache:
                cache[p] = {"path": p, "proxy": VA.conform(p, W, H, 60, log)}
            return cache[p]
        clips = {k: ([C(x) for x in v] if isinstance(v, list) else C(v)) for k, v in raw.items() if not k.startswith("_")}
        clips = {k: (v if isinstance(v, list) else [v]) for k, v in clips.items()}
        log(f"{len(cache)} clips mapped to {len(clips)} slots, template '{T['name']}' ({len(T['slots'])} slots), {W}x{H}@{fps}")
    else:
        paths = parse_clips(a.clips)
        if not paths:
            sys.exit("no clips")
        log(f"{len(paths)} clips, template '{T['name']}' ({len(T['slots'])} slots), {W}x{H}@{fps}")
        clips = []
        for p in paths:
            clips.append({"path": p, "proxy": VA.conform(p, W, H, 60, log)})
    pl = plan(T, clips, points, texts, music, (W, H), fps, a.seconds or None)
    out = a.out or os.path.join(ROOT, "out", f"{T['id']}_{W}x{H}.mp4")
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    m = manifest(T, pl, out)
    for s in m["slots"]:
        log(f"  {s['id']:>4} {s['t0']:6.2f}-{s['t1']:6.2f} {s['out'].get('type', ''):>12} {s['out'].get('cam', ''):>6}  "
            + "; ".join(f"{c['file']}@{c['animation_point']:.2f}{'' if c['auto_point'] else '*'}" for c in s["clips"]))
    if a.plan_only:
        return
    t0 = time.time()
    render(T, pl, out, a.crf or T["output"].get("crf", 21))
    log(f"done {out} in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
