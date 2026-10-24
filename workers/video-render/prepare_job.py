"""Turn a queued template job into render.py inputs.

User in/out trimming is not a render.py flag. This module cuts each clip to
the staff in/out range with ffmpeg, then shifts the animation point by the
in-point so the engine window stays inside that range.
"""

from __future__ import annotations

import json
import os
import subprocess
from typing import Any

MUSIC = {
    "heartbeat_mixkit1000": "heartbeat_mixkit1000.mp3",
    "offmymind_mixkit1210": "offmymind_mixkit1210.mp3",
}


def shifted_point(point: float | None, inn: float, out: float) -> float | None:
    """Map an animation point on the original clip onto a file trimmed to [inn, out]."""
    if point is None:
        return None
    inn = max(0.0, float(inn))
    out = max(inn + 0.05, float(out))
    clamped = min(max(float(point), inn), out)
    return round(clamped - inn, 4)


def music_path(music_id: str | None, music_dir: str) -> str:
    if not music_id:
        return ""
    name = MUSIC.get(music_id, "")
    if not name:
        return ""
    path = os.path.join(music_dir, name)
    return path if os.path.isfile(path) else ""


def trim_clip(src: str, dest: str, inn: float, out: float) -> None:
    """Re-encode [inn, out]. Copy mode skips to keyframes and would miss the window."""
    duration = max(0.05, float(out) - float(inn))
    subprocess.run(
        [
            "ffmpeg", "-y", "-v", "error",
            "-ss", f"{max(0.0, float(inn)):.4f}",
            "-i", src,
            "-t", f"{duration:.4f}",
            "-an",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast",
            dest,
        ],
        check=True,
    )


def write_template_inputs(
    request: dict[str, Any],
    work: str,
    resolved: dict[str, str | list[str]],
    music_dir: str,
) -> dict[str, str]:
    """Write the slot map, shifted points, and text JSON render.py expects."""
    os.makedirs(work, exist_ok=True)
    points_in = request.get("points") or {}
    trims = request.get("trims") or {}
    points_out: dict[str, float] = {}
    for slot_id, raw in points_in.items():
        trim = trims.get(slot_id) or {}
        shifted = shifted_point(float(raw), float(trim.get("in", 0)), float(trim.get("out", 10**6)))
        if shifted is not None:
            points_out[slot_id] = shifted
    clips_path = os.path.join(work, "clips.json")
    points_path = os.path.join(work, "points.json")
    text_path = os.path.join(work, "text.json")
    json.dump(resolved, open(clips_path, "w"), indent=1)
    json.dump(points_out, open(points_path, "w"), indent=1)
    json.dump(request.get("text") or {}, open(text_path, "w"), indent=1)
    return {
        "clips": clips_path,
        "points": points_path,
        "text": text_path,
        "music": music_path(request.get("musicId"), music_dir),
        "size": str(request.get("size") or "1080x1920"),
    }


def self_test() -> None:
    assert shifted_point(8, 4, 14) == 4
    assert shifted_point(2, 4, 14) == 0
    assert shifted_point(20, 4, 14) == 10
    assert shifted_point(None, 4, 14) is None
    assert music_path("not-a-track", "/tmp") == ""


if __name__ == "__main__":
    self_test()
    print("prepare_job ok")
