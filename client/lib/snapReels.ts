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

/** Homepage strip. Daytime cuts only. Captions stay free of street names. */
export const SNAP_REEL_STRIP: readonly SnapReel[] = [
  {
    src: "/media/videos/snap-reels/bayonne-snap.mp4",
    poster: "/media/videos/snap-reels/bayonne-snap.jpg",
    title: "",
    vibe: "A sunny lawn and a pool that feels ready for the afternoon.",
  },
  {
    src: "/media/videos/snap-reels/snap-reel-02.mp4",
    poster: "/media/videos/snap-reels/snap-reel-02.jpg",
    title: "",
    vibe: "An airy living room under a high ceiling, easy to settle into.",
  },
  {
    src: "/media/videos/snap-reels/snap-reel-01.mp4",
    poster: "/media/videos/snap-reels/snap-reel-01.jpg",
    title: "",
    vibe: "Window light over the seating, and the yard just beyond the glass.",
  },
] as const;

/** Features bento keeps Grand Arrival. It is not part of the homepage strip. */
export const FEATURED_SNAP_REEL = SNAP_REELS[3];

export function snapPoster(src: string): string | undefined {
  const match = [...SNAP_REELS, ...SNAP_REEL_STRIP].find((reel) => reel.src === src);
  return match?.poster || undefined;
}
