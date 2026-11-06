/**
 * Decade / About banner mashups.
 * Web files are the muted 720 square cuts. Full mixes stay off the site.
 */

export const DECADE_PLAYBACK_RATE = 1.35;

export type DecadeMashup = {
  id: string;
  video: string;
  poster: string;
  label: string;
};

export const DECADE_MASHUPS: DecadeMashup[] = [
  { id: "mix-1", video: "/media/about/decade-mashups/mix-1.mp4", poster: "/media/about/decade-mashups/mix-1.jpg", label: "The Standard" },
  { id: "mix-2", video: "/media/about/decade-mashups/mix-2.mp4", poster: "/media/about/decade-mashups/mix-2.jpg", label: "On Set" },
  { id: "mix-3", video: "/media/about/decade-mashups/mix-3.mp4", poster: "/media/about/decade-mashups/mix-3.jpg", label: "Together" },
  { id: "mix-4", video: "/media/about/decade-mashups/mix-4.mp4", poster: "/media/about/decade-mashups/mix-4.jpg", label: "The Field" },
  { id: "mix-5", video: "/media/about/decade-mashups/mix-5.mp4", poster: "/media/about/decade-mashups/mix-5.jpg", label: "In House" },
  { id: "mix-6", video: "/media/about/decade-mashups/mix-6.mp4", poster: "/media/about/decade-mashups/mix-6.jpg", label: "The Craft" },
];
