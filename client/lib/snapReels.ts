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

/** Homepage strip: three marketing snaps. Logo and #BEICONIC end card stay in the files. Titles stay off property names. */
export const SNAP_REEL_STRIP = [
  {
    src: "/media/videos/snap-reels/MariasWay_MarketingSnap_v1.mp4",
    title: "Evening Light",
    vibe: "Evening light through the house, paced for a vertical scroll",
  },
  {
    src: "/media/videos/snap-reels/HeronWing_MarketingSnap_v1.mp4",
    title: "Still Water",
    vibe: "Clean lines and still water, cut for the feed",
  },
  {
    src: "/media/videos/snap-reels/BlueLake_MarketingSnap_v1.mp4",
    title: "Golden Hour",
    vibe: "Golden hour across the terrace, cut for the feed",
  },
] as const;

/** Features bento uses a vertical listing tour in a 9:16 frame. It is not part of the homepage strip. */
export const FEATURED_SNAP_REEL = SNAP_REELS[0];

const ADDRESS_SNAP_COPY: Record<string, { title: string; vibe: string }> = {
  "marias way": SNAP_REEL_STRIP[0],
  "maria's way": SNAP_REEL_STRIP[0],
  "heron wing": SNAP_REEL_STRIP[1],
  "blue lake": SNAP_REEL_STRIP[2],
};

/** Published titles that still name a property are shown with the public label. */
export function scrubSnapCopy(title: string, vibe: string): { title: string; vibe: string } {
  const mapped = ADDRESS_SNAP_COPY[title.trim().toLowerCase()];
  if (!mapped) return { title, vibe };
  return { title: mapped.title, vibe: mapped.vibe };
}
