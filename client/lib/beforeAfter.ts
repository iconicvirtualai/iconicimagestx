/** Public marketing stills for AI edits. Labels stay Iconic-only: no agent names or listing addresses. */

export type BeforeAfterStill = {
  src: string;
  alt: string;
};

export type BeforeAfterPair = {
  id: string;
  label: string;
  scene: string;
  before: BeforeAfterStill;
  after: BeforeAfterStill;
};

export type MarketingStill = {
  src: string;
  alt: string;
  title: string;
  category: "Aerial" | "Listings" | "Virtual Staging";
};

export const AI_BEFORE_AFTER: BeforeAfterPair[] = [
  {
    id: "twilight-pool",
    label: "Twilight conversion",
    scene: "Rear pool",
    before: {
      src: "/media/before-after/twilight-pool-day.jpg",
      alt: "Rear pool and patio in daylight",
    },
    after: {
      src: "/media/before-after/twilight-pool-lifestyle.jpg",
      alt: "Twilight conversion of a rear pool with a fire feature and outdoor seating",
    },
  },
  {
    id: "pavilion-lifestyle",
    label: "Lifestyle staging",
    scene: "Pool pavilion",
    before: {
      src: "/media/before-after/pavilion-empty.jpg",
      alt: "Empty pool pavilion kitchen and lounge",
    },
    after: {
      src: "/media/before-after/pavilion-lifestyle.jpg",
      alt: "Lifestyle staging of a pool pavilion with outdoor grilling",
    },
  },
  {
    id: "pasture-lifestyle",
    label: "Lifestyle staging",
    scene: "Pasture",
    before: {
      src: "/media/before-after/pasture-animals.jpg",
      alt: "Pasture with horses and a donkey",
    },
    after: {
      src: "/media/before-after/pasture-lifestyle.jpg",
      alt: "Lifestyle staging of children with a donkey in a pasture",
    },
  },
  {
    id: "living-declutter",
    label: "Virtual declutter",
    scene: "Living room",
    before: {
      src: "/media/before-after/living-occupied.jpg",
      alt: "Furnished living room with a seated figure",
    },
    after: {
      src: "/media/before-after/living-declutter.jpg",
      alt: "Virtually decluttered living room staged for a listing",
    },
  },
];

/** Dual aerial crops. The wider frame leads; the closer crop is the variant. */
export const AERIAL_STILLS: MarketingStill[] = [
  {
    src: "/media/before-after/aerial-estate.jpg",
    alt: "Aerial view of a luxury estate, pond, and grounds",
    title: "Aerial estate",
    category: "Aerial",
  },
  {
    src: "/media/before-after/aerial-estate-close.jpg",
    alt: "Closer aerial view of a luxury home and pond",
    title: "Aerial close-up",
    category: "Aerial",
  },
];

/** Preferred primary-suite still: the empty, staged crop. */
export const PRIMARY_SUITE_STILL: MarketingStill = {
  src: "/media/before-after/primary-suite-staged.jpg",
  alt: "Virtually decluttered primary suite staged for a listing",
  title: "Staged primary suite",
  category: "Virtual Staging",
};

export function beforeAfterById(id: string): BeforeAfterPair {
  const pair = AI_BEFORE_AFTER.find((item) => item.id === id);
  if (!pair) {
    throw new Error(`Unknown before/after pair: ${id}`);
  }
  return pair;
}

export function marketingCopy(): string[] {
  const lines: string[] = [];
  for (const pair of AI_BEFORE_AFTER) {
    lines.push(pair.id, pair.label, pair.scene, pair.before.src, pair.before.alt, pair.after.src, pair.after.alt);
  }
  for (const still of [...AERIAL_STILLS, PRIMARY_SUITE_STILL]) {
    lines.push(still.src, still.alt, still.title, still.category);
  }
  return lines;
}
