#!/usr/bin/env python3
"""Studio video render worker.

Cloud Run holds this HTTP request for the whole render. Vercel cannot.
Cloud Tasks is the queue. This process does not email or text anyone.

  GET  /health
  POST /render-template     { jobId, request, output? }
  POST /render-timeline     { jobId, request, output? }
  POST /analyze             { storagePath | url }

Progress is posted to VIDEO_API_BASE with header x-video-worker-token.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import traceback
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from prepare_job import music_path, shifted_point, trim_clip, write_template_inputs
from timeline_render import render_timeline

ROOT = os.path.dirname(os.path.abspath(__file__))
ENGINE = os.path.join(ROOT, "templates_engine")
PORT = int(os.environ.get("PORT", "8080"))
API = os.environ.get("VIDEO_API_BASE", "").rstrip("/")
TOKEN = os.environ.get("VIDEO_WORKER_TOKEN", "")
MUSIC_DIR = os.environ.get("VIDEO_MUSIC_DIR", os.path.join(ENGINE, "music"))
FRAME = re.compile(r"frame\s+(\d+)\s*/\s*(\d+)")


def template_file(template_id: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9_-]", "", template_id)
    candidates = [
        os.environ.get("VIDEO_TEMPLATE_DIR", ""),
        os.path.join(ROOT, "templates"),
        os.path.abspath(os.path.join(ROOT, "..", "..", "shared", "videoTemplates")),
    ]
    for directory in candidates:
        if not directory:
            continue
        path = os.path.join(directory, f"{safe}.json")
        if os.path.isfile(path):
            return path
    raise FileNotFoundError(safe)


def callback(job_id: str, payload: dict) -> None:
    if not API or not TOKEN or not job_id:
        print("callback skipped", payload.get("status"), payload.get("message", ""), flush=True)
        return
    body = json.dumps(payload).encode()
    request = urllib.request.Request(
        f"{API}/api/studio/video/template-jobs/{job_id}/progress",
        data=body,
        headers={"Content-Type": "application/json", "x-video-worker-token": TOKEN},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        response.read()


def put_file(url: str, path: str, content_type: str) -> None:
    with open(path, "rb") as handle:
        data = handle.read()
    request = urllib.request.Request(url, data=data, method="PUT", headers={"Content-Type": content_type})
    with urllib.request.urlopen(request, timeout=600) as response:
        response.read()


def fetch(url: str, dest: str) -> str:
    urllib.request.urlretrieve(url, dest)
    return dest


def resolve_ref(ref: str, dest: str) -> str:
    if ref.startswith("https://") or ref.startswith("http://"):
        if not ref.startswith("https://"):
            raise ValueError("Only https clip URLs are accepted.")
        return fetch(ref, dest)
    if os.path.isfile(ref):
        return ref
    raise ValueError(f"Clip is not a local file or https URL: {ref}")


def materialize_slots(request: dict, work: str) -> dict[str, str | list[str]]:
    slots = request.get("slots") or {}
    trims = request.get("trims") or {}
    resolved: dict[str, str | list[str]] = {}
    for slot_id, raw in slots.items():
        refs = raw if isinstance(raw, list) else [raw]
        paths = []
        trim = trims.get(slot_id) or {}
        inn = float(trim.get("in", 0) or 0)
        out = trim.get("out")
        for index, ref in enumerate(refs):
            downloaded = os.path.join(work, f"{slot_id}_{index}_src.mp4")
            src = resolve_ref(str(ref), downloaded)
            if out is None:
                paths.append(src)
                continue
            trimmed = os.path.join(work, f"{slot_id}_{index}.mp4")
            trim_clip(src, trimmed, inn, float(out))
            paths.append(trimmed)
        resolved[slot_id] = paths if len(paths) > 1 else paths[0]
    return resolved


def render_template_job(body: dict) -> None:
    job_id = str(body.get("jobId") or "")
    request = body.get("request") or {}
    work = os.path.join("/tmp", "studio-video", job_id or "direct")
    os.makedirs(work, exist_ok=True)
    callback(job_id, {"status": "rendering", "progress": 0.02, "message": "Preparing clips."})
    resolved = materialize_slots(request, work)
    # Points were authored on the original media. Shift them onto the trimmed files.
    request = dict(request)
    points = {}
    for slot_id, point in (request.get("points") or {}).items():
        trim = (request.get("trims") or {}).get(slot_id) or {}
        shifted = shifted_point(float(point), float(trim.get("in", 0) or 0), float(trim.get("out", 10**6)))
        if shifted is not None:
            points[slot_id] = shifted
    request["points"] = points
    request["trims"] = {}
    prepared = write_template_inputs(request, work, resolved, MUSIC_DIR)
    out = os.path.join(work, "final.mp4")
    cmd = [
        "python3", os.path.join(ENGINE, "render.py"),
        "--template", template_file(str(request.get("templateId") or "")),
        "--clips", prepared["clips"],
        "--points", prepared["points"],
        "--text", prepared["text"],
        "--size", prepared["size"],
        "--out", out,
    ]
    if prepared["music"]:
        cmd += ["--music", prepared["music"]]
    logo = request.get("logoPath") or ""
    if isinstance(logo, str) and logo and os.path.isfile(logo):
        cmd += ["--logo", logo]
    process = subprocess.Popen(cmd, cwd=ENGINE, stderr=subprocess.PIPE, text=True)
    assert process.stderr is not None
    tail = []
    for line in process.stderr:
        tail.append(line)
        if len(tail) > 40:
            tail.pop(0)
        match = FRAME.search(line)
        if match:
            done, total = int(match.group(1)), max(1, int(match.group(2)))
            callback(job_id, {"status": "rendering", "progress": done / total, "message": f"frame {done}/{total}"})
    code = process.wait()
    if code != 0 or not os.path.isfile(out):
        raise RuntimeError("".join(tail)[-2000:] or f"render.py exited {code}")
    publish(job_id, out, body.get("output") or {})


def render_timeline_job(body: dict) -> None:
    job_id = str(body.get("jobId") or "")
    request = body.get("request") or {}
    project = request.get("project") or {}
    export = request.get("export") or {}
    work = os.path.join("/tmp", "studio-video", job_id or "timeline")
    os.makedirs(work, exist_ok=True)
    callback(job_id, {"status": "rendering", "progress": 0.02, "message": "Preparing the timeline."})
    sources: dict[str, str] = {}
    remote = request.get("sources") or {}
    for source_id, ref in remote.items():
        if not isinstance(ref, str):
            continue
        dest = os.path.join(work, f"src_{len(sources)}.bin")
        sources[str(source_id)] = resolve_ref(ref, dest)
    out = os.path.join(work, "final.mp4")

    def progress(value: float) -> None:
        callback(job_id, {"status": "rendering", "progress": value, "message": "Encoding the timeline."})

    render_timeline(project, export, sources, out, progress)
    publish(job_id, out, body.get("output") or {})


def publish(job_id: str, out: str, output: dict) -> None:
    poster = os.path.join(os.path.dirname(out), "poster.jpg")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", "0.5", "-i", out, "-frames:v", "1", poster], check=False)
    payload = {"status": "ready", "progress": 1, "message": "Render finished.", "outputPath": out}
    upload = output.get("uploadUrl")
    if isinstance(upload, str) and upload.startswith("https://"):
        put_file(upload, out, "video/mp4")
        if isinstance(output.get("readUrl"), str):
            payload["outputUrl"] = output["readUrl"]
        if isinstance(output.get("path"), str):
            payload["outputPath"] = output["path"]
    poster_url = output.get("posterUploadUrl")
    if isinstance(poster_url, str) and poster_url.startswith("https://") and os.path.isfile(poster):
        put_file(poster_url, poster, "image/jpeg")
        if isinstance(output.get("posterPath"), str):
            payload["posterPath"] = output["posterPath"]
    callback(job_id, payload)


def analyze(body: dict) -> dict:
    url = body.get("url") or ""
    work = "/tmp/studio-video/analyze"
    os.makedirs(work, exist_ok=True)
    if not isinstance(url, str) or not url.startswith("https://"):
        return {"pending": True, "message": "Pass an https url for the clip. Storage paths are signed by the API when Firebase Storage is configured."}
    dest = os.path.join(work, "clip.mp4")
    fetch(url, dest)
    import sys
    sys.path.insert(0, ENGINE)
    import vtanalyze as VA  # type: ignore
    proxy = VA.conform(dest, 1080, 1920, 60, print)
    analysis = VA.analyze(proxy, print)
    return {"pending": False, "duration": analysis.get("duration"), "rate": analysis.get("rate")}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:
        print(fmt % args, flush=True)

    def _json(self, code: int, payload: dict) -> None:
        raw = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:  # noqa: N802
        if self.path.split("?", 1)[0] != "/health":
            self._json(404, {"error": "Not found."})
            return
        ffmpeg = subprocess.run(["ffmpeg", "-version"], capture_output=True).returncode == 0
        self._json(200, {"ok": ffmpeg, "engine": os.path.isfile(os.path.join(ENGINE, "render.py"))})

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw.decode() or "{}")
        except json.JSONDecodeError:
            self._json(400, {"error": "Expected JSON."})
            return
        path = self.path.split("?", 1)[0]
        if path == "/analyze":
            try:
                self._json(200, analyze(body))
            except Exception as error:  # noqa: BLE001
                self._json(500, {"error": str(error)})
            return
        if path not in {"/render-template", "/render-timeline"}:
            self._json(404, {"error": "Not found."})
            return
        job_id = str(body.get("jobId") or "")
        # Stay on this request until ffmpeg finishes. Cloud Tasks is what holds
        # the connection. Returning early would let Cloud Run freeze the CPU.
        try:
            if path == "/render-template":
                render_template_job(body)
            else:
                render_timeline_job(body)
            self._json(200, {"ok": True, "jobId": job_id})
        except Exception as error:  # noqa: BLE001
            traceback.print_exc()
            callback(job_id, {"status": "failed", "progress": 0, "error": str(error)[-500:], "message": "Render failed."})
            # 200 so a bad clip is not retried until the queue budget is gone.
            self._json(200, {"ok": False, "jobId": job_id})


def main() -> None:
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"video render worker on {PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
