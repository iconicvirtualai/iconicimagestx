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

/** Homepage strip. Captions stay free of street names and addresses. */
export const SNAP_REEL_STRIP: readonly SnapReel[] = [
  {
    src: "/media/videos/snap-reels/forest-heights-blaze.mp4",
    poster: "/media/videos/snap-reels/forest-heights-blaze.jpg",
    title: "",
    vibe: "Daylight on brick and stone, the arrival buyers picture first.",
  },
  {
    src: "/media/videos/snap-reels/arcane-court-blaze.mp4",
    poster: "/media/videos/snap-reels/arcane-court-blaze.jpg",
    title: "",
    vibe: "A broad facade in the shade, easy to take in at a glance.",
  },
  {
    src: "/media/videos/snap-reels/tall-trees-blaze.mp4",
    poster: "/media/videos/snap-reels/tall-trees-blaze.jpg",
    title: "",
    vibe: "Stone at the door, with a quiet beat before the interior.",
  },
  {
    src: "/media/videos/snap-reels/heron-wing-blaze.mp4",
    poster: "/media/videos/snap-reels/heron-wing-blaze.jpg",
    title: "",
    vibe: "A covered porch that opens the showing on a welcoming note.",
  },
] as const;

/** Features bento keeps Grand Arrival. It is not part of the homepage strip. */
export const FEATURED_SNAP_REEL = SNAP_REELS[3];

export function snapPoster(src: string): string | undefined {
  const match = [...SNAP_REELS, ...SNAP_REEL_STRIP].find((reel) => reel.src === src);
  return match?.poster || undefined;
}
