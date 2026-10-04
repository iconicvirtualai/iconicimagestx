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

/** Homepage strip: three marketing snaps. Logo and #BEICONIC end card stay in the files. */
export const SNAP_REEL_STRIP = [
  {
    src: "/media/videos/snap-reels/MariasWay_MarketingSnap_v1.mp4",
    title: "Marias Way",
    vibe: "Evening light through the house, paced for a vertical scroll",
  },
  {
    src: "/media/videos/snap-reels/HeronWing_MarketingSnap_v1.mp4",
    title: "Heron Wing",
    vibe: "Clean lines and still water, cut for the feed",
  },
  {
    src: "/media/videos/snap-reels/BlueLake_MarketingSnap_v1.mp4",
    title: "Blue Lake",
    vibe: "Golden hour from the terrace to the lake",
  },
] as const;

/** Features bento keeps Grand Arrival. It is not part of the homepage strip. */
export const FEATURED_SNAP_REEL = SNAP_REELS[3];
