export const SNAP_REELS = [
  {
    src: "/media/videos/snap-reels/snap-reel-01.mp4",
    title: "Luxury Tour",
    vibe: "Sunlit rooms, paced for a scroll-stopping walkthrough",
  },
  {
    src: "/media/videos/snap-reels/snap-reel-02.mp4",
    title: "Modern Living",
    vibe: "Clean lines and open rooms, cut for the feed",
  },
  {
    src: "/media/videos/snap-reels/snap-reel-03.mp4",
    title: "Kitchen Glow",
    vibe: "Warm light and tight cuts — the room buyers replay",
  },
  {
    src: "/media/videos/snap-reels/snap-reel-04.mp4",
    title: "Grand Arrival",
    vibe: "A vertical first look, from the front door in",
  },
] as const;

/** Homepage strip keeps a tight row of three. */
export const SNAP_REEL_STRIP = SNAP_REELS.slice(0, 3);

/** Features bento uses the extra marketing cut so the strip stays at three. */
export const FEATURED_SNAP_REEL = SNAP_REELS[3];
