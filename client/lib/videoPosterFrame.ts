/**
 * Browser poster for a video upload. The Vercel function has sharp and no
 * ffmpeg, so the frame is drawn here from a <video> element.
 */

import { posterFrameSeconds } from "@shared/videoPoster";

export { posterFrameSeconds };

export function captureVideoPoster(file: File): Promise<Blob | null> {
  if (typeof document === "undefined" || !file.type.startsWith("video/")) return Promise.resolve(null);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;
    const finish = (blob: Blob | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
      resolve(blob);
    };
    const timer = window.setTimeout(() => finish(null), 8000);
    const draw = () => {
      try {
        const width = video.videoWidth || 0;
        const height = video.videoHeight || 0;
        if (width < 2 || height < 2) {
          finish(null);
          return;
        }
        const scale = Math.min(1, 1600 / Math.max(width, height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(2, Math.round(width * scale));
        canvas.height = Math.max(2, Math.round(height * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          finish(null);
          return;
        }
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => finish(blob), "image/jpeg", 0.82);
      } catch {
        finish(null);
      }
    };
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.onerror = () => finish(null);
    video.onseeked = () => draw();
    video.onloadeddata = () => {
      if (video.readyState >= 2 && posterFrameSeconds(video.duration) === 0) draw();
    };
    video.onloadedmetadata = () => {
      const seek = posterFrameSeconds(video.duration);
      if (!Number.isFinite(video.duration) || seek <= 0.01) {
        draw();
        return;
      }
      try {
        video.currentTime = Math.min(seek, Math.max(0, video.duration - 0.05));
      } catch {
        finish(null);
      }
    };
    video.src = url;
  });
}
