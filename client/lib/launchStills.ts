/** Launch stills from the 2026-10-01 Iconic set. Alts stay Iconic-only. */

export type LaunchGroup = "Hero" | "Exterior" | "Interior" | "Outdoor" | "Aerial" | "Floorplan";

export type LaunchStill = {
  id: string;
  src: string;
  alt: string;
  title: string;
  group: LaunchGroup;
};

export const LAUNCH_STILLS: LaunchStill[] = [
  {
    id: "hero-front",
    src: "/media/launch/hero_day_exterior_front.jpg",
    alt: "Daytime front elevation of a two-story home with a stone and stucco facade",
    title: "Front elevation",
    group: "Hero",
  },
  {
    id: "hero-alt",
    src: "/media/launch/hero_day_exterior_alt.jpg",
    alt: "Daytime three-quarter view of a luxury home exterior",
    title: "Exterior, three-quarter",
    group: "Exterior",
  },
  {
    id: "kitchen-island",
    src: "/media/launch/kitchen_island_hero.jpg",
    alt: "Kitchen with a large island, white cabinetry, and pendant lights",
    title: "Kitchen",
    group: "Interior",
  },
  {
    id: "living-bright",
    src: "/media/launch/living_room_bright.jpg",
    alt: "Bright living room with a fireplace and wall of windows",
    title: "Living room",
    group: "Interior",
  },
  {
    id: "living-open",
    src: "/media/launch/living_open_concept.jpg",
    alt: "Open-concept living room looking toward the kitchen",
    title: "Open concept",
    group: "Interior",
  },
  {
    id: "dining",
    src: "/media/launch/dining_room.jpg",
    alt: "Dining room with a wood table and upholstered chairs",
    title: "Dining",
    group: "Interior",
  },
  {
    id: "foyer",
    src: "/media/launch/foyer_stairs.jpg",
    alt: "Foyer with a staircase and iron railing",
    title: "Foyer",
    group: "Interior",
  },
  {
    id: "primary",
    src: "/media/launch/primary_suite.jpg",
    alt: "Primary bedroom with a vaulted ceiling and large windows",
    title: "Primary suite",
    group: "Interior",
  },
  {
    id: "kitchen-detail",
    src: "/media/launch/interior_kitchen_detail.jpg",
    alt: "Kitchen detail with a range, hood, and stone backsplash",
    title: "Kitchen detail",
    group: "Interior",
  },
  {
    id: "pool",
    src: "/media/launch/backyard_pool_lifestyle.jpg",
    alt: "Backyard pool with lounge chairs and a covered outdoor living area",
    title: "Pool",
    group: "Outdoor",
  },
  {
    id: "patio",
    src: "/media/launch/covered_patio.jpg",
    alt: "Covered patio with an outdoor kitchen and dining set",
    title: "Covered patio",
    group: "Outdoor",
  },
  {
    id: "entry",
    src: "/media/launch/exterior_entry_day.jpg",
    alt: "Daytime front entry with a wood door and stone columns",
    title: "Front entry",
    group: "Outdoor",
  },
  {
    id: "aerial-neighborhood",
    src: "/media/launch/aerial_neighborhood_drone.jpg",
    alt: "Drone view over a neighborhood of homes and tree cover",
    title: "Neighborhood aerial",
    group: "Aerial",
  },
  {
    id: "aerial-property",
    src: "/media/launch/aerial_property_overview.jpg",
    alt: "Aerial overview of a home, pool, and surrounding lot",
    title: "Property aerial",
    group: "Aerial",
  },
  {
    id: "floorplan",
    src: "/media/launch/floorplan_sample_cropped.jpg",
    alt: "Sample 2D floorplan with room labels and dimensions",
    title: "2D floorplan sample",
    group: "Floorplan",
  },
];

export function launchStill(id: string): LaunchStill {
  const still = LAUNCH_STILLS.find((item) => item.id === id);
  if (!still) throw new Error(`Missing launch still: ${id}`);
  return still;
}

export const HERO_STILL = launchStill("hero-front");

export function launchStillsByGroup(group: LaunchGroup): LaunchStill[] {
  return LAUNCH_STILLS.filter((still) => still.group === group);
}
