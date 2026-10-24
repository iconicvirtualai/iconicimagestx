"""Clip conforming (proxy) + motion analysis for the template renderer.

conform(): any raw clip (any fps / res / rotation / codec) -> cached H.264 proxy at the output size, 60 fps, cover-cropped.
analyze(): 10 Hz optical-flow track of a proxy -> per-sample global motion (dx, dy, zoom), magnitude and sharpness,
cached as JSON. Used to pick the default animation point (most motion-rich, sharp window) and the whip direction."""
import hashlib, json, os, subprocess
import numpy as np, cv2

ROOT = os.path.dirname(os.path.abspath(__file__))
CACHE = os.environ.get("VT_CACHE", os.path.join(ROOT, "cache"))
AN_FPS = 10.0
AN_W, AN_H = 144, 256  # analysis frame (portrait); landscape swaps


def _key(path, *extra):
    st = os.stat(path)
    h = hashlib.sha1(f"{os.path.abspath(path)}|{st.st_size}|{int(st.st_mtime)}|{extra}".encode()).hexdigest()[:12]
    return f"{os.path.basename(path)}.{h}"


def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                          "stream=width,height,r_frame_rate:stream_side_data=rotation:format=duration",
                          "-of", "json", path], capture_output=True, text=True).stdout
    j = json.loads(out)
    st = j["streams"][0]
    rot = 0
    for sd in st.get("side_data_list", []) or []:
        if "rotation" in sd:
            rot = int(sd["rotation"])
    w, h = st["width"], st["height"]
    if abs(rot) in (90, 270):
        w, h = h, w
    n, d = st["r_frame_rate"].split("/")
    return {"w": w, "h": h, "fps": float(n) / float(d), "duration": float(j["format"]["duration"]), "rotation": rot}


def conform(path, W, H, fps=60, log=print):
    """Cover-crop + scale to WxH, constant fps, yuv420p. Cached; returns proxy path."""
    os.makedirs(os.path.join(CACHE, "proxies"), exist_ok=True)
    out = os.path.join(CACHE, "proxies", f"{_key(path, W, H, fps)}.{W}x{H}.mp4")
    if os.path.exists(out) and os.path.getsize(out) > 1000:
        return out
    log(f"  conform {os.path.basename(path)} -> {W}x{H}@{fps}")
    vf = f"scale={W}:{H}:force_original_aspect_ratio=increase:flags=lanczos,crop={W}:{H},fps={fps},format=yuv420p"
    tmp = out + ".tmp.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", path, "-vf", vf, "-an", "-c:v", "libx264", "-preset", "veryfast",
                    "-crf", "16", "-g", "30", tmp], check=True)
    os.replace(tmp, out)
    return out


def analyze(proxy, log=print):
    os.makedirs(os.path.join(CACHE, "analysis"), exist_ok=True)
    out = os.path.join(CACHE, "analysis", os.path.basename(proxy) + ".json")
    if os.path.exists(out):
        return json.load(open(out))
    info = probe(proxy)
    w, h = (AN_W, AN_H) if info["h"] >= info["w"] else (AN_H, AN_W)
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-i", proxy, "-vf", f"fps={AN_FPS},scale={w}:{h},format=gray",
                          "-f", "rawvideo", "-"], stdout=subprocess.PIPE)
    prev = None
    rows = []
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    xs -= w / 2; ys -= h / 2
    rr = xs * xs + ys * ys + 1e-3
    while True:
        b = p.stdout.read(w * h)
        if len(b) < w * h:
            break
        g = np.frombuffer(b, np.uint8).reshape(h, w)
        sharp = float(cv2.Laplacian(g, cv2.CV_32F).var())
        bright = float(g.mean()) / 255
        if prev is None:
            rows.append([0, 0, 0, 0, sharp, bright])
        else:
            f = cv2.calcOpticalFlowFarneback(prev, g, None, 0.5, 3, 15, 3, 5, 1.2, 0)
            dx, dy = float(np.median(f[..., 0])), float(np.median(f[..., 1]))
            # radial (zoom) component: projection of residual flow on the radius
            rx, ry = f[..., 0] - dx, f[..., 1] - dy
            zoom = float(np.median((rx * xs + ry * ys) / rr))  # >0 = expanding = pushing in
            mag = float(np.mean(np.hypot(f[..., 0], f[..., 1])))
            # convert to fraction-of-frame-width per second
            rows.append([dx / w * AN_FPS, dy / w * AN_FPS, zoom * AN_FPS, mag / w * AN_FPS, sharp, bright])
        prev = g
    p.wait()
    a = np.array(rows, np.float32)
    if len(a) > 1:
        a[0, :4] = a[1, :4]
    res = {"proxy": proxy, "duration": info["duration"], "rate": AN_FPS,
           "dx": a[:, 0].round(4).tolist(), "dy": a[:, 1].round(4).tolist(), "zoom": a[:, 2].round(4).tolist(),
           "mag": a[:, 3].round(4).tolist(), "sharp": a[:, 4].round(1).tolist(), "bright": a[:, 5].round(3).tolist()}
    json.dump(res, open(out, "w"))
    return res


def window_stats(an, s0, s1):
    r = an["rate"]
    i0, i1 = max(0, int(s0 * r)), max(int(s0 * r) + 1, int(np.ceil(s1 * r)))
    sl = lambda k: np.array(an[k][i0:i1] or [0.0], np.float32)
    return {k: float(np.mean(sl(k))) for k in ("dx", "dy", "zoom", "mag", "sharp", "bright")}


def camera_direction(an, s0, s1, thr=0.04):
    """Dominant camera move in [s0,s1]: 'left'/'right'/'up'/'down'/'in'/'out' or None (static).
    Camera pans right => content flows left (dx<0)."""
    st = window_stats(an, s0, s1)
    dx, dy, z = st["dx"], st["dy"], st["zoom"]
    cand = {"right": -dx, "left": dx, "down": -dy * 0.8, "up": dy * 0.8, "in": z * 3.0, "out": -z * 3.0}
    k = max(cand, key=cand.get)
    return (k if cand[k] > thr else None), st
