"""Frame-level look, transitions, hit effects and text layers. Everything here is RIGID: frames are only
translated / scaled / rotated as a whole, blurred, tinted or masked. No per-pixel warping (no 'jelly')."""
import math, os
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont, ImageFilter

FONT_DIR = "/usr/share/fonts/truetype/sand-box/google"
FONTS = {
    "Sacramento": f"{FONT_DIR}/Sacramento/Sacramento-Regular.ttf",
    "Great Vibes": f"{FONT_DIR}/Great Vibes/GreatVibes-Regular.ttf",
    "Pacifico": f"{FONT_DIR}/Pacifico/Pacifico-Regular.ttf",
    "Inter": f"{FONT_DIR}/Inter/Inter-VariableFont_opsz,wght.ttf",
}


def clamp01(x):
    return min(1.0, max(0.0, x))


def smooth(t):  # smootherstep
    t = clamp01(t)
    return t * t * t * (t * (t * 6 - 15) + 10)


def steep(t, k=3.2):
    """Steep ease-in/out (whip): slow start, very fast middle, slow settle. Monotone, 0->1."""
    t = clamp01(t)
    a = t ** k
    return a / (a + (1 - t) ** k)


def steep_speed(t, k=3.2, h=1e-3):
    return (steep(min(1, t + h), k) - steep(max(0, t - h), k)) / (min(1, t + h) - max(0, t - h))


# ------------------------------------------------------------------ look
def make_grade(g):
    """Per-channel LUTs: exposure gain is applied per slot; contrast S-curve, teal shadows / warm highlights."""
    g = g or {}
    con, to, lift = g.get("contrast", 1.0), g.get("teal_orange", 0.0), g.get("lift", 0.0)
    x = np.arange(256, dtype=np.float32) / 255
    s = x + (con - 1) * (x - 0.5) * (1 - np.abs(2 * x - 1)) * 1.6  # soft S around mid
    s = np.clip(lift + s * (1 - lift), 0, 1)
    sh = np.clip(1 - x * 2, 0, 1) ** 1.5  # shadow weight
    hi = np.clip(x * 2 - 1, 0, 1) ** 1.5  # highlight weight
    b = np.clip(s + to * (0.06 * sh - 0.05 * hi), 0, 1)
    gch = np.clip(s + to * (0.02 * sh + 0.005 * hi), 0, 1)
    r = np.clip(s + to * (-0.04 * sh + 0.05 * hi), 0, 1)
    luts = [(c * 255).astype(np.uint8) for c in (b, gch, r)]  # BGR
    return {"luts": luts, "sat": g.get("saturation", 1.0), "vig": g.get("vignette", 0.0), "sharpen": g.get("sharpen", 0.0)}


_vig_cache = {}


def apply_grade(img, G, gain=1.0):
    if isinstance(gain, tuple):
        if gain != (1.0, 0.0):
            img = cv2.convertScaleAbs(img, alpha=gain[0], beta=gain[1])
    elif gain != 1.0:
        img = cv2.convertScaleAbs(img, alpha=gain, beta=0)
    img = cv2.merge([cv2.LUT(c, l) for c, l in zip(cv2.split(img), G["luts"])])
    if G["sat"] != 1.0:
        gray = cv2.cvtColor(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), cv2.COLOR_GRAY2BGR)
        img = cv2.addWeighted(img, G["sat"], gray, 1 - G["sat"], 0)
    if G["sharpen"] > 0:
        bl = cv2.GaussianBlur(img, (0, 0), 1.2)
        img = cv2.addWeighted(img, 1 + G["sharpen"], bl, -G["sharpen"], 0)
    if G["vig"] > 0:
        H, W = img.shape[:2]
        k = (W, H, G["vig"])
        if k not in _vig_cache:
            y, x = np.mgrid[0:H, 0:W].astype(np.float32)
            r = np.hypot((x - W / 2) / (W / 2), (y - H / 2) / (H / 2)) / math.sqrt(2)
            _vig_cache[k] = (1 - G["vig"] * np.clip((r - 0.45) / 0.55, 0, 1) ** 2)[..., None].astype(np.float32)
        img = (img.astype(np.float32) * _vig_cache[k]).astype(np.uint8)
    return img


def affine(img, scale=1.0, rot=0.0, dx=0.0, dy=0.0, border=cv2.BORDER_REFLECT):
    if scale == 1.0 and rot == 0.0 and dx == 0.0 and dy == 0.0:
        return img
    H, W = img.shape[:2]
    M = cv2.getRotationMatrix2D((W / 2, H / 2), rot, scale)
    M[0, 2] += dx; M[1, 2] += dy
    return cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=border)


def dir_blur(img, L, vertical=False):
    L = int(L)
    if L < 3:
        return img
    return cv2.blur(img, (L, 1) if not vertical else (1, L))


def radial_blur(img, spread, rot=0.0, taps=7):
    """Zoom blur: average of rigid scaled copies (each copy is a plain zoom)."""
    if spread < 0.004 and abs(rot) < 0.05:
        return img
    acc = np.zeros(img.shape, np.float32)
    for j in range(taps):
        f = j / (taps - 1) - 0.5
        acc += affine(img, 1 + spread * f, rot * f)
    return (acc / taps).astype(np.uint8)


# ------------------------------------------------------------------ transitions  (p in [0,1], cut at p=0.5)
DIRV = {"right": (-1, 0), "left": (1, 0), "down": (0, -1), "up": (0, 1)}  # content motion for a camera move


def tr_whip(fa, fb, p, nT, cam="right", blur_k=1.0):
    """Camera whip: A and B ride one rigid strip (mirror-padded like a real fast pan); directional blur scales
    with the instantaneous speed (180-degree shutter), steep ease so the move is snappy, never stuttery."""
    H, W = fa.shape[:2]
    cx, cy = DIRV.get(cam, (-1, 0))
    vertical = cy != 0
    L = H if vertical else W
    e = steep(p)
    off = e * L
    # strip: A at 0, B adjacent on the side content is coming from
    if not vertical:
        strip = np.hstack([fa, fb]) if cx < 0 else np.hstack([fb, fa])
        x0 = off if cx < 0 else (L - off)
        M = np.float32([[1, 0, -x0], [0, 1, 0]])
    else:
        strip = np.vstack([fa, fb]) if cy < 0 else np.vstack([fb, fa])
        y0 = off if cy < 0 else (L - off)
        M = np.float32([[1, 0, 0], [0, 1, -y0]])
    out = cv2.warpAffine(strip, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    v = steep_speed(p) * L / max(nT, 1)  # px / frame
    out = dir_blur(out, min(v * 1.0 * blur_k, L * 0.35), vertical)
    return out


def tr_zoom_through(fa, fb, p, nT, rot=0.0, Z=0.9):
    """Punch through A into B: A accelerates in (scale 1->1+Z, optional roll) under zoom blur; B arrives already
    zoomed and decelerates to 1x. The swap happens at peak blur across ~5 frames, so no frame jumps."""
    sp = steep_speed(p, 2.6) / 2.6
    if p < 0.5:
        q = steep(p / 0.5 * 0.5, 2.6) * 2  # 0..1 accelerating
        img = radial_blur(affine(fa, 1 + Z * q, rot * q), 0.35 * sp, rot * 0.3 * sp)
    else:
        q = 1 - (steep(0.5 + (p - 0.5) / 0.5 * 0.5, 2.6) - 0.5) * 2  # 1..0 decelerating
        img = radial_blur(affine(fb, 1 + Z * 0.7 * q, -rot * q), 0.35 * sp, rot * 0.3 * sp)
    w = smooth((p - 0.42) / 0.16)
    if 0 < w < 1:
        other = radial_blur(affine(fb if p < 0.5 else fa, 1 + Z * 0.7, 0), 0.35 * sp)
        img = cv2.addWeighted(img, (1 - w) if p < 0.5 else w, other, w if p < 0.5 else (1 - w), 0)
    return img


def _leak(H, W, p, warm=(80, 170, 255)):
    """Soft warm light-leak blob drifting across (BGR)."""
    y, x = np.ogrid[0:H, 0:W]
    cx, cy = W * (0.1 + 0.8 * p), H * (0.35 + 0.2 * math.sin(p * 3))
    r = np.exp(-(((x - cx) / (W * 0.55)) ** 2 + ((y - cy) / (H * 0.45)) ** 2))
    return (r[..., None] * np.array(warm, np.float32)[None, None, :])


def tr_flash(fa, fb, p, nT, leak=True):
    """Bloom-to-white flash: A blooms up, hard swap under full white at p=0.5, B decays out of it with a warm leak."""
    H, W = fa.shape[:2]
    if p < 0.5:
        k = smooth(p / 0.5) ** 1.6
        base = fa
    else:
        k = (1 - smooth((p - 0.5) / 0.5)) ** 1.3
        base = fb
    f = base.astype(np.float32)
    bloom = cv2.GaussianBlur(base, (0, 0), 18).astype(np.float32)
    f = f * (1 - 0.35 * k) + bloom * 0.35 * k
    f = f + (255 - f) * k * 0.97
    if leak:
        f = f + _leak(H, W, p) * (k ** 0.6) * 0.55
    return np.clip(f, 0, 255).astype(np.uint8)


def rgb_split(img, amt, slices=0, seed=0):
    """Chromatic split (+ optional horizontal slice jitter) — rigid channel/strip shifts only."""
    if amt <= 0.5 and slices == 0:
        return img
    b, g, r = cv2.split(img)
    d = int(amt)
    if d:
        r = np.roll(r, d, axis=1); b = np.roll(b, -d, axis=1)
    out = cv2.merge([b, g, r])
    if slices:
        rng = np.random.default_rng(seed)
        H = out.shape[0]
        for _ in range(slices):
            y0 = int(rng.integers(0, H - 40)); hh = int(rng.integers(12, 90))
            out[y0:y0 + hh] = np.roll(out[y0:y0 + hh], int(rng.integers(-40, 40)), axis=1)
    return out


def tr_glitch(fa, fb, p, nT, seed=1):
    """RGB-split hit with a short (≈3 frame) blurred hand-off instead of a raw hard cut, so it reads as a
    deliberate hit, not a dropped frame."""
    k = 1 - abs(p - 0.5) * 2  # peak at the cut
    w = smooth((p - 0.38) / 0.24)
    base = fa if w <= 0 else fb if w >= 1 else cv2.addWeighted(fa, 1 - w, fb, w, 0)
    base = dir_blur(base, 40 * k * k)
    return rgb_split(base, 26 * k, slices=int(6 * k), seed=seed + int(p * 97))


def tr_mask_wipe(fa, fb, p, nT, cam="right"):
    """Foreground-occluder wipe: a dark, motion-blurred 'pillar' (sampled from A's shadows) sweeps through the
    frame like a door frame / post passing the lens; A is replaced by B behind it. Rigid & sharp edges blurred
    only along the motion."""
    H, W = fa.shape[:2]
    cx, cy = DIRV.get(cam, (-1, 0))
    vertical = cy != 0
    L = H if vertical else W
    bar = 0.42 * L
    e = steep(p, 2.4)
    pos = -bar + e * (L + 2 * bar)  # leading edge position along travel
    lum = cv2.cvtColor(cv2.resize(fa, (64, 112)), cv2.COLOR_BGR2GRAY)
    dark = fa.reshape(-1, 3)[:: max(1, (H * W) // 20000)]
    col = np.percentile(dark, 4, axis=0).astype(np.float32) * 0.8
    t = np.arange(L, dtype=np.float32)
    if (cx < 0) or (cy < 0):  # content flows toward -axis: bar enters from the far side
        t = L - 1 - t
    # 0 = A side (ahead of bar), 1 = B side (behind bar); occluder between pos-bar and pos
    mB = (t < pos - bar).astype(np.float32)
    occ = ((t >= pos - bar) & (t < pos)).astype(np.float32)
    v = steep_speed(p, 2.4) * (L + 2 * bar) / max(nT, 1)
    k = int(max(3, min(v * 0.9, L * 0.25))) | 1
    mB = cv2.blur(mB[None, :], (k, 1))[0]; occ = cv2.blur(occ[None, :], (k, 1))[0]
    shape = (H, 1, 1) if not vertical else (1, W, 1)
    if not vertical:
        mB = mB[None, :, None]; occ = occ[None, :, None]
    else:
        mB = mB[:, None, None]; occ = occ[:, None, None]
    out = fa.astype(np.float32) * (1 - mB) + fb.astype(np.float32) * mB
    out = out * (1 - occ) + col[None, None, :] * occ
    return np.clip(out, 0, 255).astype(np.uint8)


def tr_fade(fa, fb, p, nT):
    return cv2.addWeighted(fa, 1 - smooth(p), fb, smooth(p), 0)


def tr_dip(fa, fb, p, nT, color=0):
    k = 1 - abs(p - 0.5) * 2
    base = fa if p < 0.5 else fb
    return cv2.addWeighted(base, 1 - smooth(k), np.full_like(base, color), smooth(k), 0)


def transition(kind, fa, fb, p, nT, opts):
    if kind == "cut":
        return fa if p < 0.5 else fb
    if kind in ("whip", "mirror_whip"):
        return tr_whip(fa, fb, p, nT, opts.get("cam", "right"), opts.get("blur", 1.0))
    if kind == "zoom_through":
        return tr_zoom_through(fa, fb, p, nT, opts.get("rot", 0.0), opts.get("zoom", 0.9))
    if kind in ("flash", "flash_bw"):
        return tr_flash(fa, fb, p, nT, opts.get("leak", True))
    if kind == "glitch":
        return tr_glitch(fa, fb, p, nT)
    if kind == "mask_wipe":
        return tr_mask_wipe(fa, fb, p, nT, opts.get("cam", "right"))
    if kind == "fade":
        return tr_fade(fa, fb, p, nT)
    if kind == "dip_black":
        return tr_dip(fa, fb, p, nT, 0)
    if kind == "dip_white":
        return tr_dip(fa, fb, p, nT, 255)
    return fa if p < 0.5 else fb


# ------------------------------------------------------------------ text / logo layers
def _font(name, px):
    path = FONTS.get(name, name if name and os.path.exists(str(name)) else FONTS["Inter"])
    f = ImageFont.truetype(path, px)
    if "Inter" in path:
        try:
            f.set_variation_by_axes([32, 800])
        except Exception:
            pass
    return f


def _wrap_lines(text):
    return [l for l in str(text).split("\\n") for l in l.split("\n")]


def render_text_rgba(layer, W, H):
    """Returns (RGBA float32 premultiplied-ready image, anchor offset). Styles: neon_script, title, lower_third, caption."""
    style = layer.get("style", "title")
    lines = _wrap_lines(layer.get("text", ""))
    px = int(layer.get("size", 0.12) * W)
    font = _font(layer.get("font", "Sacramento" if style == "neon_script" else "Inter"), px)
    track = layer.get("tracking", 0.0 if style == "neon_script" else 0.08)
    if style != "neon_script":
        lines = [l.upper() if layer.get("upper", True) else l for l in lines]
    # measure
    dummy = ImageDraw.Draw(Image.new("L", (10, 10)))
    sizes = []
    for l in lines:
        wsum = 0
        for ch in l:
            wsum += dummy.textlength(ch, font=font) + track * px
        sizes.append(wsum)
    maxw = layer.get("max_width", 0.9) * W
    if style != "neon_script" and max(sizes or [0]) + px > maxw:  # auto-fit long wording
        k = maxw / (max(sizes) + px)
        px = max(10, int(px * k))
        font = _font(layer.get("font", "Inter"), px)
        sizes = [sum(dummy.textlength(ch, font=font) + track * px for ch in l) for l in lines]
    asc, desc = font.getmetrics()
    lh = int((asc + desc) * layer.get("line_height", 0.95))
    tw, th = int(max(sizes or [1]) + px), int(lh * len(lines) + px)
    pad = int(px * 0.9)
    mask = Image.new("L", (tw + 2 * pad, th + 2 * pad), 0)
    d = ImageDraw.Draw(mask)
    for i, l in enumerate(lines):
        x = pad + (tw - sizes[i]) / 2 + px / 2
        y = pad + i * lh + px * 0.3
        sw = int(px * layer.get("stroke", 0.008 if style == "neon_script" else 0.0))
        for ch in l:
            d.text((x, y), ch, font=font, fill=255, stroke_width=sw, stroke_fill=255)
            x += d.textlength(ch, font=font) + track * px
    m = np.asarray(mask, np.float32) / 255
    color = layer.get("color", "#7ff6ff" if style == "neon_script" else "#ffffff")
    rgb = np.array([int(color[i:i + 2], 16) for i in (1, 3, 5)], np.float32)
    bgr = rgb[::-1]
    if style == "neon_script":
        # neon tube: white-hot core, colored halo, wide soft bloom
        core = cv2.GaussianBlur(m, (0, 0), px * 0.012 + 0.6)
        g1 = cv2.GaussianBlur(m, (0, 0), px * 0.06)
        g2 = cv2.GaussianBlur(m, (0, 0), px * 0.22)
        col = (core[..., None] * (bgr * 0.45 + 255 * 0.55) + g1[..., None] * bgr * 1.25 + g2[..., None] * bgr * 0.7)
        alpha = np.clip(core * 1.0 + g1 * 1.0 + g2 * 0.5, 0, 1)
        dark = cv2.GaussianBlur(m, (0, 0), px * 0.10) * layer.get("backing", 0.0)
        alpha = np.clip(np.maximum(alpha, dark * 2.2), 0, 1)
    else:
        sh = cv2.GaussianBlur(m, (0, 0), px * 0.08) * layer.get("shadow", 0.55)
        col = m[..., None] * bgr[None, None, :]
        alpha = np.clip(m + sh, 0, 1)
        col = col  # shadow is black: contributes alpha only
    return np.clip(col, 0, 255).astype(np.float32), alpha.astype(np.float32)


def composite(frame, col, alpha, cx, cy, opacity=1.0, additive=False):
    """Paste premultiplied col/alpha centered at (cx,cy) (pixels)."""
    H, W = frame.shape[:2]
    h, w = alpha.shape
    x0, y0 = int(round(cx - w / 2)), int(round(cy - h / 2))
    X0, Y0, X1, Y1 = max(0, x0), max(0, y0), min(W, x0 + w), min(H, y0 + h)
    if X1 <= X0 or Y1 <= Y0 or opacity <= 0:
        return frame
    a = alpha[Y0 - y0:Y1 - y0, X0 - x0:X1 - x0, None] * opacity
    c = col[Y0 - y0:Y1 - y0, X0 - x0:X1 - x0] * opacity
    roi = frame[Y0:Y1, X0:X1].astype(np.float32)
    if additive:
        roi = roi * (1 - a * 0.55) + c
    else:
        roi = roi * (1 - a) + c
    frame[Y0:Y1, X0:X1] = np.clip(roi, 0, 255).astype(np.uint8)
    return frame


def load_logo(path, W, width_frac):
    im = Image.open(path).convert("RGBA")
    lw = int(W * width_frac)
    im = im.resize((lw, max(1, int(im.height * lw / im.width))), Image.LANCZOS)
    a = np.asarray(im, np.float32)
    alpha = a[..., 3] / 255
    col = a[..., :3][..., ::-1] * alpha[..., None]
    return col, alpha


def neon_flicker(t, seed=3):
    """Neon power-on flicker for the first ~0.35 s, then steady with a tiny hum."""
    if t < 0:
        return 0.0
    if t < 0.35:
        rng = np.random.default_rng(seed + int(t * 60))
        return float(rng.choice([0.0, 0.25, 1.0, 0.6], p=[0.3, 0.2, 0.35, 0.15]))
    return 0.96 + 0.04 * math.sin(t * 50)
