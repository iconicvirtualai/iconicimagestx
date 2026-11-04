export type SnapReel = {
  src: string;
  poster?: string;
  title: string;
  vibe: string;
  /** Seconds to skip a dark or labeled opener. */
  startAt?: number;
};

export const SNAP_REELS: readonly SnapReel[] = [
  {
    src: "/media/videos/snap-reels/bayonne-snap.mp4",
    poster: "/media/videos/snap-reels/bayonne-snap.jpg",
    title: "Luxury Tour",
    vibe: "Sunlit rooms, paced for a scroll-stopping walkthrough",
  },
  {
    src: "/media/videos/snap-reels/snap-reel-02.mp4",
    poster: "/media/videos/snap-reels/snap-reel-02.jpg",
    title: "Modern Living",
    vibe: "Open rooms and a calm line through the house",
  },
  {
    src: "/media/videos/snap-reels/stoney-brook-blaze.mp4",
    poster: "/media/videos/snap-reels/stoney-brook-blaze.jpg",
    title: "Kitchen Glow",
    vibe: "Warm light and tight cuts — the room buyers replay",
  },
  {
    src: "/media/videos/snap-reels/hereford-way-snap.mp4",
    poster: "/media/videos/snap-reels/hereford-way-snap.jpg",
    title: "Grand Arrival",
    vibe: "A vertical first look, from the front door in",
  },
] as const;

/** Homepage strip. Newest Blaze cuts, bright covers, no street names. */
export const SNAP_REEL_STRIP: readonly SnapReel[] = [
  {
    src: "/media/videos/snap-reels/heron-wing-blaze-v2.mp4",
    poster: "/media/videos/snap-reels/heron-wing-blaze-v2.jpg",
    title: "",
    vibe: "JPGs rendering...",
    startAt: 2,
  },
  {
    src: "/media/videos/snap-reels/woodville-blaze-v4.mp4",
    poster: "/media/videos/snap-reels/woodville-blaze-v4.jpg",
    title: "",
    vibe: "Files uploading...",
    startAt: 1,
  },
  {
    src: "/media/videos/snap-reels/stoneridge-blaze-v2.mp4",
    poster: "/media/videos/snap-reels/stoneridge-blaze-v2.jpg",
    title: "",
    vibe: "Ready for Sundown",
    startAt: 2,
  },
  {
    src: "/media/videos/snap-reels/abbylane-blaze-v4.mp4",
    poster: "/media/videos/snap-reels/abbylane-blaze-v4.jpg",
    title: "",
    vibe: "Once upon a PNG there was a For Sale sign",
    startAt: 2.1,
  },
] as const;

/** Features bento keeps Grand Arrival. It is not part of the homepage strip. */
export const FEATURED_SNAP_REEL = SNAP_REELS[3];

export function snapPoster(src: string): string | undefined {
  const match = [...SNAP_REEL_STRIP, ...SNAP_REELS].find((reel) => reel.src === src && reel.poster);
  return match?.poster || undefined;
}

export function snapStart(src: string): number {
  return SNAP_REEL_STRIP.find((reel) => reel.src === src)?.startAt ?? 0;
}
