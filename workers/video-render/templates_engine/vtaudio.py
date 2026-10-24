"""Music beat grid + procedurally synthesized SFX (royalty-free by construction) + mixdown/normalize."""
import os, subprocess
import numpy as np

SR = 48000


def load_audio(path, start=0.0, dur=None, sr=SR):
    cmd = ["ffmpeg", "-v", "error", "-ss", str(start)]
    if dur:
        cmd += ["-t", str(dur)]
    cmd += ["-i", path, "-ac", "2", "-ar", str(sr), "-f", "f32le", "-"]
    x = np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, np.float32)
    return x.reshape(-1, 2).copy()


def detect_beats(path, start=0.0, dur=120.0):
    """Returns (bpm, beat_times relative to `start`). librosa if available, else autocorrelation fallback."""
    try:
        import librosa
        y, sr = librosa.load(path, sr=22050, offset=start, duration=dur, mono=True)
        tempo, beats = librosa.beat.beat_track(y=y, sr=sr, units="time")
        bpm = float(np.atleast_1d(tempo)[0])
        return bpm, [float(b) for b in beats]
    except Exception:
        return None, []


def beat_grid(bpm, offset, beats_detected, n=400):
    """Uniform grid locked to detected beats when they agree with the template tempo (phase from detection)."""
    P = 60.0 / bpm
    if beats_detected and len(beats_detected) > 8:
        b = np.array(beats_detected)
        P_det = float(np.median(np.diff(b)))
        if abs(P_det - P) / P < 0.04:
            P = P_det
        # best phase: least-squares fit of k*P + phi
        k = np.round((b - b[0]) / P)
        A = np.vstack([k, np.ones_like(k)]).T
        P, phi = np.linalg.lstsq(A, b, rcond=None)[0]
        phi = phi - np.floor(phi / P) * P
        return float(P), float(phi)
    return P, offset % P


# ---------------------------------------------------------------- SFX synthesis
def _env(n, a, d, sr=SR, shape=2.0):
    t = np.arange(n) / sr
    e = np.where(t < a, (t / max(a, 1e-4)) ** shape, np.exp(-(t - a) / max(d, 1e-4)))
    return e.astype(np.float32)


def _bandnoise(n, f0, f1, q=1.5, sr=SR, seed=0):
    """Noise through a time-varying 2-pole bandpass sweeping f0->f1 (log)."""
    rng = np.random.default_rng(seed)
    x = rng.standard_normal(n).astype(np.float32)
    f = np.exp(np.linspace(np.log(f0), np.log(f1), n))
    y = np.zeros(n, np.float32)
    y1 = y2 = 0.0
    for i in range(n):  # state-variable filter (numba-free but n is small: <1 s)
        w = 2 * np.sin(np.pi * f[i] / sr)
        hp = x[i] - y2 - y1 / q
        y1 += w * hp
        y2 += w * y1
        y[i] = y1
    return y / (np.abs(y).max() + 1e-6)


_cache = {}


def sfx(kind, dur=0.5, seed=0):
    key = (kind, round(dur, 3), seed)
    if key in _cache:
        return _cache[key]
    n = int(dur * SR)
    if kind == "whoosh":  # peak at the middle (the cut)
        up = _bandnoise(n // 2, 300, 4200, 2.2, seed=seed)
        dn = _bandnoise(n - n // 2, 4200, 600, 2.2, seed=seed + 1)
        x = np.concatenate([up, dn])
        t = np.linspace(0, 1, n)
        e = np.exp(-((t - 0.5) / 0.17) ** 2).astype(np.float32)
        x = x * e * 0.55
        st = np.stack([x * (0.6 + 0.4 * t), x * (1.0 - 0.4 * t)], 1)  # pans across
    elif kind == "sub_boom":
        t = np.arange(n) / SR
        f = 32 + 48 * np.exp(-t * 7)
        ph = 2 * np.pi * np.cumsum(f) / SR
        x = np.sin(ph) * _env(n, 0.004, 0.45) * 0.95
        click = _bandnoise(min(n, 2400), 2000, 300, 1.0, seed=seed) * _env(min(n, 2400), 0.001, 0.01)
        x[:len(click)] += click * 0.3
        st = np.stack([x, x], 1)
    elif kind == "shimmer":  # flash: reverse swell into the cut then airy tail
        a = _bandnoise(n, 6000, 9000, 1.2, seed=seed)
        t = np.linspace(0, 1, n)
        e = np.where(t < 0.5, (t / 0.5) ** 3, np.exp(-(t - 0.5) * 9))
        x = a * e * 0.25
        st = np.stack([x, np.roll(x, 240)], 1)
    elif kind == "glitch":
        rng = np.random.default_rng(seed)
        x = np.zeros(n, np.float32)
        pos = 0
        while pos < n:
            ln = int(rng.integers(300, 1600)); fr = float(rng.choice([180, 360, 720, 1400, 2800]))
            tt = np.arange(min(ln, n - pos)) / SR
            x[pos:pos + len(tt)] = np.sign(np.sin(2 * np.pi * fr * tt)) * float(rng.uniform(0.1, 0.3))
            pos += ln + int(rng.integers(0, 900))
        x = np.round(x * 8) / 8 * _env(n, 0.002, dur * 0.5)
        st = np.stack([x, x * 0.8], 1)
    elif kind == "riser":
        a = _bandnoise(n, 400, 7000, 3.0, seed=seed)
        t = np.linspace(0, 1, n)
        x = a * t ** 2.5 * 0.35
        st = np.stack([x, x], 1)
    else:
        st = np.zeros((n, 2), np.float32)
    st = st.astype(np.float32)
    _cache[key] = st
    return st


def mixdown(total, music_path, music_start, cues, out_wav, fade_in=0.0, fade_out=2.0, music_gain=0.9, duck=None):
    """cues: list of (time_center_or_start, kind, dur, gain, align) — align 'center' puts the sfx midpoint at t."""
    n = int(total * SR)
    mix = np.zeros((n, 2), np.float32)
    if music_path:
        m = load_audio(music_path, music_start, total + 0.1)[:n]
        if len(m) < n:  # loop if short
            reps = int(np.ceil(n / max(1, len(m))))
            m = np.tile(m, (reps, 1))[:n]
        t = np.arange(n) / SR
        g = np.ones(n, np.float32)
        if fade_in > 0:
            g *= np.clip(t / fade_in, 0, 1)
        if fade_out > 0:
            g *= np.clip((total - t) / fade_out, 0, 1) ** 1.5
        mix += m * g[:, None] * music_gain
    for (tc, kind, dur, gain, align) in cues:
        s = sfx(kind, dur, seed=int(tc * 100) % 7)
        i0 = int((tc - (dur / 2 if align == "center" else 0)) * SR)
        a, b = max(0, i0), min(n, i0 + len(s))
        if b > a:
            mix[a:b] += s[a - i0:b - i0] * gain
    # soft limiter
    pk = np.abs(mix).max() + 1e-9
    mix = np.tanh(mix * 1.1) / np.tanh(1.1) if pk > 0.9 else mix
    import wave
    pcm = (np.clip(mix, -1, 1) * 32767).astype("<i2")
    with wave.open(out_wav, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    return out_wav
