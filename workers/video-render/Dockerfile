# Studio video render worker. Do not deploy until the owner approves the cost.
# Build from the repo root:
#   docker build -f workers/video-render/Dockerfile -t studio-video-render .
FROM python:3.11-slim-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg fonts-liberation ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

# OFL fonts the template engine looks up by these exact paths (vtfx.py FONT_DIR).
RUN mkdir -p \
    "/usr/share/fonts/truetype/sand-box/google/Sacramento" \
    "/usr/share/fonts/truetype/sand-box/google/Great Vibes" \
    "/usr/share/fonts/truetype/sand-box/google/Pacifico" \
    "/usr/share/fonts/truetype/sand-box/google/Inter" \
  && curl -fsSL -o "/usr/share/fonts/truetype/sand-box/google/Sacramento/Sacramento-Regular.ttf" \
      "https://github.com/google/fonts/raw/main/ofl/sacramento/Sacramento-Regular.ttf" \
  && curl -fsSL -o "/usr/share/fonts/truetype/sand-box/google/Great Vibes/GreatVibes-Regular.ttf" \
      "https://github.com/google/fonts/raw/main/ofl/greatvibes/GreatVibes-Regular.ttf" \
  && curl -fsSL -o "/usr/share/fonts/truetype/sand-box/google/Pacifico/Pacifico-Regular.ttf" \
      "https://github.com/google/fonts/raw/main/ofl/pacifico/Pacifico-Regular.ttf" \
  && curl -fsSL -o "/usr/share/fonts/truetype/sand-box/google/Inter/Inter-VariableFont_opsz,wght.ttf" \
      "https://github.com/google/fonts/raw/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf"

WORKDIR /opt/video-render
COPY workers/video-render/requirements.txt /opt/video-render/requirements.txt
RUN pip install --no-cache-dir -r /opt/video-render/requirements.txt

COPY workers/video-render/ /opt/video-render/
COPY shared/videoTemplates/ /opt/video-render/templates/

ENV PYTHONUNBUFFERED=1 \
    VIDEO_TEMPLATE_DIR=/opt/video-render/templates \
    PORT=8080
EXPOSE 8080

# Music is licensed and is not in git. Mount it or set VIDEO_MUSIC_DIR at runtime.
CMD ["python3", "/opt/video-render/server.py"]
