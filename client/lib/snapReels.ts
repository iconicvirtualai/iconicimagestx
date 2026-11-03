export type SnapReel = {
  src: string;
  poster?: string;
  title: string;
  vibe: string;
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
    title: "Modern Living",
    vibe: "Clean lines and open rooms, cut for the feed",
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

/**
 * Homepage strip. Cards 1–3 are the newer Blaze cuts.
 * Heron Wing stays, with heron-wing-blaze in place of the MarketingSnap.
 */
export const SNAP_REEL_STRIP: readonly SnapReel[] = [
  {
    src: "/media/videos/snap-reels/forest-heights-blaze.mp4",
    poster: "/media/videos/snap-reels/forest-heights-blaze.jpg",
    title: "Forest Heights",
    vibe: "Front elevation, paced for a vertical scroll",
  },
  {
    src: "/media/videos/snap-reels/arcane-court-blaze.mp4",
    poster: "/media/videos/snap-reels/arcane-court-blaze.jpg",
    title: "Arcane Court",
    vibe: "A wide front elevation, cut for the feed",
  },
  {
    src: "/media/videos/snap-reels/tall-trees-blaze.mp4",
    poster: "/media/videos/snap-reels/tall-trees-blaze.jpg",
    title: "Tall Trees",
    vibe: "Stone entry, cut for the feed",
  },
  {
    src: "/media/videos/snap-reels/heron-wing-blaze.mp4",
    poster: "/media/videos/snap-reels/heron-wing-blaze.jpg",
    title: "Heron Wing",
    vibe: "Clean lines and still water, cut for the feed",
  },
] as const;

/** Features bento keeps Grand Arrival. It is not part of the homepage strip. */
export const FEATURED_SNAP_REEL = SNAP_REELS[3];

export function snapPoster(src: string): string | undefined {
  const match = [...SNAP_REELS, ...SNAP_REEL_STRIP].find((reel) => reel.src === src);
  return match?.poster || undefined;
}
