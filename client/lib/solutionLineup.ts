export type SolutionClip = {
  id: string;
  url: string;
  title: string;
  aspect: "16/9" | "9/16";
};

/**
 * Homepage "all-in-one" lineup.
 * Horizontal, vertical, horizontal, vertical.
 * The We Are the Bar clip stays on its own section and is not in this list.
 */
export const SOLUTION_LINEUP: SolutionClip[] = [
  {
    id: "product",
    url: "/media/video/product-photography.mp4",
    title: "Product Film",
    aspect: "16/9",
  },
  {
    id: "built",
    url: "/media/blaze/01_BUILT_v2.mp4",
    title: "Brand Film",
    aspect: "9/16",
  },
  {
    id: "crew",
    url: "/media/about/about_were_here_v1.mp4",
    title: "Crew Film",
    aspect: "16/9",
  },
  {
    id: "vertical",
    url: "/media/reels/superpower-reel-12s.mp4",
    title: "Vertical Reel",
    aspect: "9/16",
  },
  {
    id: "holiday",
    url: "/media/holiday/hero-web.mp4",
    title: "Holiday Film",
    aspect: "16/9",
  },
  {
    id: "listing",
    url: "/media/videos/snap-reels/snap-reel-01.mp4",
    title: "Listing Tour",
    aspect: "9/16",
  },
];

const HORIZONTAL_KEYS = ["product-photography", "about_were_here", "hero-web.mp4"];

export function aspectForMedia(url: string): "16/9" | "9/16" {
  return HORIZONTAL_KEYS.some((key) => url.includes(key)) ? "16/9" : "9/16";
}

/** The previous lineup included the We Are the Bar clip. That set is replaced whole. */
export function resolveSolutionLineup(
  clips: { id: string; url: string; title: string }[] | null,
): SolutionClip[] {
  if (!clips?.length || clips.some((clip) => clip.url.includes("content-web-clip"))) {
    return SOLUTION_LINEUP;
  }
  return clips.map((clip) => ({
    id: clip.id,
    url: clip.url,
    title: clip.title,
    aspect: aspectForMedia(clip.url),
  }));
}
