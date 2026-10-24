#!/usr/bin/env python3
"""Transition QA: for every cut in a render's manifest, grab every frame in a window around the cut,
save a contact strip, and score smoothness. A 'pop' = one frame-to-frame change much larger than its
neighbours (a visible jump/glitch). Rigid transitions have a smooth bell of change; jelly/warps are
avoided by construction (no per-pixel warping), so we look for pops and dropped/duplicated frames."""
import json, subprocess, sys, os
import numpy as np, cv2

def frames(path, t0, t1, W=180, H=320):
    p = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{max(0,t0):.3f}", "-i", path, "-t", f"{t1-t0:.3f}",
                        "-vf", f"scale={W}:{H}", "-f", "rawvideo", "-pix_fmt", "bgr24", "-"], capture_output=True)
    a = np.frombuffer(p.stdout, np.uint8)
    return a.reshape(-1, H, W, 3)

def main(video, outdir):
    m = json.load(open(video + ".manifest.json"))
    os.makedirs(outdir, exist_ok=True)
    rep = []
    for i, s in enumerate(m["slots"][:-1]):
        t = s["t1"]; ty = s["out"].get("type")
        F = frames(video, t - 0.30, t + 0.30)
        if len(F) < 4:
            continue
        g = F.astype(np.float32).mean(3)
        d = np.abs(np.diff(g, axis=0)).mean((1, 2))
        med = float(np.median(d)) + 1e-3
        # pop: a single step >2.6x the larger of its two neighbours (and big in absolute terms)
        pops = []
        for k in range(1, len(d) - 1):
            nb = max(d[k - 1], d[k + 1])
            if d[k] > 2.6 * nb and d[k] > 12 and ty not in ("cut",):
                pops.append(round(t - 0.30 + (k + 1) / 60, 3))
        dup = int(np.sum(d < 0.15))
        rep.append({"cut": s["id"], "t": t, "type": ty, "dir": s["out"].get("cam"), "max_step": round(float(d.max()), 1),
                    "median_step": round(med, 1), "pops": pops, "dup_frames": dup})
        strip = F[::3][:12]
        cv2.imwrite(os.path.join(outdir, f"{i:02d}_{s['id']}_{ty}.jpg"), np.hstack(list(strip)))
    json.dump(rep, open(os.path.join(outdir, "qa.json"), "w"), indent=1)
    bad = [r for r in rep if r["pops"]]
    print(f"{len(rep)} transitions checked, {len(bad)} with pops")
    for r in rep:
        print(f"  {r['cut']:>4} {r['t']:6.2f} {r['type']:>12} {str(r['dir']):>6} max {r['max_step']:5.1f} med {r['median_step']:5.1f} pops {r['pops']} dup {r['dup_frames']}")

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
