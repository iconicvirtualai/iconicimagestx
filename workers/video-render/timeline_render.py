"""Free-timeline renderer.

Whole frames only: trim, constant or segmented speed, reverse, grade, opacity,
slide/fade transitions, text, rectangles, and image overlays. No per-pixel warp.
The optical-flow whip look stays in the template engine (render.py).
"""

from __future__ import annotations

import os
import subprocess
from typing import Any, Callable

FONT_DIR = "/usr/share/fonts/truetype/sand-box/google"
FONTS = {
    "Inter": f"{FONT_DIR}/Inter/Inter-VariableFont_opsz,wght.ttf",
    "Sacramento": f"{FONT_DIR}/Sacramento/Sacramento-Regular.ttf",
    "Georgia": "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf",
}


def _run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True)


def grade_filter(grade: dict[str, Any] | None) -> str:
    grade = grade or {}
    preset = str(grade.get("preset") or "none")
    exposure = float(grade.get("exposure") or 0)
    contrast = float(grade.get("contrast") or 1)
    saturation = float(grade.get("saturation") or 1)
    temperature = float(grade.get("temperature") or 0)
    tint = float(grade.get("tint") or 0)
    if preset == "mono":
        saturation = 0
    elif preset == "clean":
        contrast *= 1.06
        saturation *= 1.05
    elif preset == "warm":
        temperature += 0.35
    elif preset == "cool":
        temperature -= 0.35
    elif preset == "twilight":
        temperature -= 0.2
        contrast *= 1.08
        saturation *= 0.9
    elif preset == "teal_orange":
        temperature += 0.15
        saturation *= 1.1
    parts = [
        f"eq=brightness={exposure * 0.12:.4f}:contrast={contrast:.4f}:saturation={max(0, saturation):.4f}",
    ]
    if abs(temperature) > 0.01 or abs(tint) > 0.01 or preset == "teal_orange":
        warm = max(-1, min(1, temperature * 0.35))
        green = max(-1, min(1, tint * 0.25))
        teal = 0.12 if preset == "teal_orange" else 0
        parts.append(
            f"colorbalance=rs={warm:.3f}:gs={green:.3f}:bs={-warm + teal:.3f}:rh={warm:.3f}:bh={-warm:.3f}"
        )
    return ",".join(parts)


def ramp_segments(clip: dict[str, Any]) -> list[tuple[float, float, float]]:
    inn = float(clip.get("inPoint") or 0)
    out = float(clip.get("outPoint") or inn + 0.05)
    span = max(0.05, out - inn)
    keys = list(clip.get("speedRamp") or [])
    reverse = bool(clip.get("reverse"))
    speed = max(0.05, abs(float(clip.get("speed") or 1)))
    if len(keys) < 2:
        return [(inn, out, -speed if reverse else speed)]
    keys.sort(key=lambda key: float(key.get("at") or 0))
    segments: list[tuple[float, float, float]] = []
    for left, right in zip(keys, keys[1:]):
        start = inn + span * float(left.get("at") or 0)
        end = inn + span * float(right.get("at") or 0)
        if end - start < 0.02:
            continue
        pace = max(0.05, (abs(float(left.get("speed") or 1)) + abs(float(right.get("speed") or 1))) / 2)
        if reverse:
            segments.append((out - (end - inn), out - (start - inn), -pace))
        else:
            segments.append((start, end, pace))
    return segments or [(inn, out, -speed if reverse else speed)]


def _segment_file(src: str, dest: str, inn: float, out: float, speed: float, grade: str, width: int, height: int, fps: int) -> None:
    duration = max(0.05, out - inn)
    pace = max(0.05, abs(speed))
    filters = [grade, f"scale={width}:{height}:force_original_aspect_ratio=increase", f"crop={width}:{height}", f"fps={fps}"]
    if speed < 0:
        filters.append("reverse")
    filters.append(f"setpts=PTS/{pace:.4f}")
    _run([
        "ffmpeg", "-y", "-v", "error",
        "-ss", f"{max(0.0, inn):.4f}", "-t", f"{duration:.4f}", "-i", src,
        "-an", "-vf", ",".join(filters),
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast",
        dest,
    ])


def render_timeline(
    project: dict[str, Any],
    export: dict[str, Any],
    sources: dict[str, str],
    out_path: str,
    on_progress: Callable[[float], None] | None = None,
) -> str:
    width = int(export.get("width") or project.get("width") or 1080)
    height = int(export.get("height") or project.get("height") or 1920)
    fps = int(export.get("fps") or project.get("fps") or 30)
    bitrate = int(export.get("bitrate") or 8_000_000)
    crf = int(export.get("crf") or 20)
    preset_id = str((export.get("preset") or {}).get("id") or export.get("presetId") or "")
    duration = float(export.get("durationSec") or 0)
    work = os.path.dirname(out_path) or "."
    os.makedirs(work, exist_ok=True)

    video_inputs: list[dict[str, Any]] = []
    audio_inputs: list[dict[str, Any]] = []
    index = 0

    def local(source_id: str) -> str | None:
        path = sources.get(source_id) or ""
        return path if path and os.path.isfile(path) else None

    tracks = sorted(project.get("tracks") or [], key=lambda track: int(track.get("z") or 0))
    for track in tracks:
        for clip in track.get("clips") or []:
            src = local(str(clip.get("sourceId") or ""))
            if not src:
                continue
            pieces = []
            for inn, out, speed in ramp_segments(clip):
                piece = os.path.join(work, f"seg_{index}_{len(pieces)}.mp4")
                _segment_file(src, piece, inn, out, speed, grade_filter(clip.get("grade")), width, height, fps)
                pieces.append(piece)
            merged = os.path.join(work, f"clip_{index}.mp4")
            if len(pieces) == 1:
                merged = pieces[0]
            else:
                listing = os.path.join(work, f"list_{index}.txt")
                with open(listing, "w") as handle:
                    for piece in pieces:
                        handle.write(f"file '{piece}'\n")
                _run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", listing, "-c", "copy", merged])
            play = max(0.05, sum(max(0.05, out - inn) / max(0.05, abs(speed)) for inn, out, speed in ramp_segments(clip)))
            video_inputs.append({
                "path": merged,
                "start": float(clip.get("start") or 0),
                "play": play,
                "opacity": max(0, min(1, float(clip.get("opacity", 1)))),
                "transition": str(clip.get("transitionIn") or "cut"),
                "mute": bool(clip.get("mute")),
                "volume": float(clip.get("volume", 1)),
                "fadeIn": float(clip.get("fadeIn") or 0),
                "fadeOut": float(clip.get("fadeOut") or 0),
                "source": src,
                "inPoint": float(clip.get("inPoint") or 0),
                "outPoint": float(clip.get("outPoint") or 0),
            })
            duration = max(duration, float(clip.get("start") or 0) + play)
            index += 1
        for clip in track.get("audio") or []:
            src = local(str(clip.get("sourceId") or ""))
            if not src:
                continue
            audio_inputs.append(clip | {"path": src})
            span = max(0.05, float(clip.get("outPoint") or 0) - float(clip.get("inPoint") or 0))
            duration = max(duration, float(clip.get("start") or 0) + span)

    duration = max(0.5, min(duration or 1, 600))
    cmd = ["ffmpeg", "-y", "-v", "error", "-progress", "pipe:1"]
    cmd += ["-f", "lavfi", "-i", f"color=c=black:s={width}x{height}:r={fps}:d={duration:.3f}"]
    for item in video_inputs:
        cmd += ["-i", item["path"]]
    overlay_paths: list[str] = []
    for track in tracks:
        for item in track.get("overlays") or []:
            src = local(str(item.get("sourceId") or ""))
            if src:
                overlay_paths.append(src)
                cmd += ["-i", src]
    filter_parts: list[str] = []
    current = "[0:v]"
    for nth, item in enumerate(video_inputs):
        label = f"[{nth + 1}:v]"
        out = f"[v{nth}]"
        opacity = item["opacity"]
        slide = item["transition"] in {"whip", "mirror_whip", "mask_wipe"}
        direction = -1 if item["transition"] == "mirror_whip" else 1
        x_expr = "0"
        if slide:
            x_expr = f"if(lt(t-{item['start']:.3f}\\,0.25)\\,{-direction}*W*(1-(t-{item['start']:.3f})/0.25)\\,0)"
        fade = ",fade=t=in:st=0:d=0.2" if item["transition"] in {"fade", "dip_black", "dip_white", "flash", "glitch", "zoom_through"} else ""
        filter_parts.append(
            f"{label}format=yuva420p,colorchannelmixer=aa={opacity:.3f}{fade},setpts=PTS-STARTPTS+{item['start']:.4f}/TB[c{nth}]"
        )
        filter_parts.append(
            f"{current}[c{nth}]overlay=x='{x_expr}':y=0:eof_action=pass:enable='between(t,{item['start']:.3f},{item['start'] + item['play']:.3f})'{out}"
        )
        current = out
    text_index = 0
    for track in tracks:
        for item in track.get("texts") or []:
            font = FONTS.get(str(item.get("font") or "Inter"), FONTS["Inter"])
            font_arg = f":fontfile='{font}'" if os.path.isfile(font) else ""
            text = str(item.get("text") or "").replace(":", "\\:").replace("'", "")
            color = str(item.get("color") or "white")
            start = float(item.get("start") or 0)
            end = float(item.get("end") or start + 1)
            out = f"[t{text_index}]"
            y = int(item.get("y") or 120)
            if item.get("animation") == "rise":
                y_expr = f"{y}-20*(1-clip((t-{start:.3f})/0.4\\,0\\,1))"
            else:
                y_expr = str(y)
            filter_parts.append(
                f"{current}drawtext=text='{text}'{font_arg}:fontsize={int(item.get('size') or 48)}:fontcolor={color}:x={int(item.get('x') or 80)}:y={y_expr}:alpha={float(item.get('opacity') or 1):.2f}:enable='between(t,{start:.3f},{end:.3f})'{out}"
            )
            current = out
            text_index += 1
        for item in track.get("shapes") or []:
            start = float(item.get("start") or 0)
            end = float(item.get("end") or start + 1)
            out = f"[s{text_index}]"
            filter_parts.append(
                f"{current}drawbox=x={int(item.get('x') or 0)}:y={int(item.get('y') or 0)}:w={int(item.get('w') or 200)}:h={int(item.get('h') or 80)}:color={item.get('color') or 'white'}@{float(item.get('opacity') or 1):.2f}:t=fill:enable='between(t,{start:.3f},{end:.3f})'{out}"
            )
            current = out
            text_index += 1
    base_inputs = 1 + len(video_inputs)
    for nth, track in enumerate(overlay_paths):
        del track
        out = f"[o{nth}]"
        filter_parts.append(
            f"{current}[{base_inputs + nth}:v]overlay=eof_action=pass{out}"
        )
        current = out
    if not filter_parts:
        filter_parts.append(f"[0:v]null[vout]")
        current = "[vout]"
    else:
        filter_parts[-1] = filter_parts[-1].rsplit("[", 1)[0] + "[vout]"
        current = "[vout]"

    audio_labels = []
    audio_start_index = base_inputs + len(overlay_paths)
    extra_audio = []
    for item in video_inputs:
        if item["mute"]:
            continue
        extra_audio.append(item)
    # Video segment files were encoded without audio. Pull original audio from the source when not muted.
    for item in extra_audio:
        cmd += ["-i", item["source"]]
    for clip in audio_inputs:
        cmd += ["-i", clip["path"]]
    for nth, item in enumerate(extra_audio):
        label = f"[a{nth}]"
        span = max(0.05, item["outPoint"] - item["inPoint"])
        fade_out_at = max(0, span - item["fadeOut"])
        delay = int(max(0, item["start"]) * 1000)
        src = audio_start_index + nth
        filter_parts.append(
            f"[{src}:a]atrim=start={item['inPoint']:.3f}:duration={span:.3f},asetpts=PTS-STARTPTS,"
            f"volume={max(0, item['volume']):.3f},afade=t=in:st=0:d={max(0, item['fadeIn']):.3f},"
            f"afade=t=out:st={fade_out_at:.3f}:d={max(0.01, item['fadeOut']):.3f},adelay={delay}|{delay}{label}"
        )
        audio_labels.append(label)
    for nth, clip in enumerate(audio_inputs):
        label = f"[m{nth}]"
        inn = float(clip.get("inPoint") or 0)
        span = max(0.05, float(clip.get("outPoint") or inn + 1) - inn)
        fade_in = float(clip.get("fadeIn") or 0)
        fade_out = float(clip.get("fadeOut") or 0)
        delay = int(max(0, float(clip.get("start") or 0)) * 1000)
        src = audio_start_index + len(extra_audio) + nth
        filter_parts.append(
            f"[{src}:a]atrim=start={inn:.3f}:duration={span:.3f},asetpts=PTS-STARTPTS,"
            f"volume={max(0, float(clip.get('volume') or 1)):.3f},afade=t=in:st=0:d={max(0, fade_in):.3f},"
            f"afade=t=out:st={max(0, span - fade_out):.3f}:d={max(0.01, fade_out):.3f},adelay={delay}|{delay}{label}"
        )
        audio_labels.append(label)
    if audio_labels:
        filter_parts.append("".join(audio_labels) + f"amix=inputs={len(audio_labels)}:duration=longest:normalize=0[aout]")
        audio_map = ["-map", "[aout]"]
    else:
        cmd += ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"]
        audio_map = ["-map", f"{audio_start_index}:a", "-shortest"]

    encode = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", str(fps), "-preset", "veryfast"]
    if preset_id == "mls":
        encode += ["-b:v", str(bitrate), "-maxrate", str(bitrate), "-bufsize", str(bitrate * 2)]
    else:
        encode += ["-crf", str(crf), "-maxrate", str(bitrate), "-bufsize", str(bitrate * 2)]
    encode += ["-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart"]
    filter_complex = ";".join(filter_parts)
    cmd += ["-filter_complex", filter_complex, "-map", "[vout]", *audio_map, *encode, "-t", f"{duration:.3f}", out_path]

    process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    assert process.stdout is not None
    for line in process.stdout:
        if line.startswith("out_time_ms=") and on_progress and duration:
            try:
                seconds = int(line.split("=", 1)[1]) / 1_000_000
                on_progress(min(0.99, seconds / duration))
            except ValueError:
                pass
    stderr = process.stderr.read() if process.stderr else ""
    code = process.wait()
    if code != 0:
        raise RuntimeError(stderr[-2000:] or f"ffmpeg exited {code}")
    if on_progress:
        on_progress(1)
    return out_path


def self_test() -> None:
    assert "eq=" in grade_filter({"preset": "mono", "saturation": 1})
    assert grade_filter({"preset": "mono"}) .split("saturation=")[1].startswith("0")
    clip = {"inPoint": 4, "outPoint": 14, "speed": 1, "reverse": False, "speedRamp": [{"at": 0, "speed": 1}, {"at": 1, "speed": 2.2}]}
    segments = ramp_segments(clip)
    assert abs(segments[0][2] - 1.6) < 0.01
    assert "hue" not in grade_filter({"preset": "teal_orange"})


if __name__ == "__main__":
    self_test()
    print("timeline_render ok")
