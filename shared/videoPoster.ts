/**
 * Frame time for a video poster.
 * Seek 2 seconds into the clip. When the clip is shorter than 2 seconds,
 * seek 10% of its duration so the frame is still inside the file.
 * An unknown duration plans 2 seconds and the extractor clamps it.
 */
export function posterFrameSeconds(durationSeconds: number | null | undefined): number {
  if (typeof durationSeconds !== "number" || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return 2;
  if (durationSeconds < 2) return Math.round(durationSeconds * 0.1 * 1000) / 1000;
  return 2;
}
