export type AboutTile = {
  img: string;
  label: string;
};

/** Ten-year bar: listings, behind the scenes, crew, and candid frames already in the repo. */
export const ABOUT_RETROSPECTIVE: AboutTile[] = [
  { img: "/media/launch/hero_day_exterior_front.jpg", label: "Listings" },
  { img: "/media/about/03_gear_bts_camera_16x9.jpg", label: "Behind the scenes" },
  { img: "/media/about/06_holiday_group_energy_16x9.jpg", label: "The crew" },
  { img: "/media/photos/family-bryant-mtz09081.jpg", label: "On location" },
  { img: "/media/about/05_office_dog_16x9.jpg", label: "Around the office" },
  { img: "/media/photos/holiday-mtz08102.jpg", label: "Ten years in" },
  { img: "/media/before-after/aerial-estate.jpg", label: "From above" },
];

const OLD_CATEGORY_TILE = "/media/about/tiles/";

export function resolveAboutTiles(tiles: AboutTile[] | null): AboutTile[] {
  if (!tiles?.length || tiles.every((tile) => tile.img.includes(OLD_CATEGORY_TILE))) {
    return ABOUT_RETROSPECTIVE;
  }
  return tiles;
}

/** People frames render as circles. Scene and property frames stay softly rounded. */
export function framesPeople(src: string): boolean {
  return (
    src.includes("/media/photos/family-")
    || src.includes("/media/photos/holiday-")
    || src.includes("/media/photos/lifestyle-")
    || src.includes("/media/photos/headshot-")
    || src.includes("/media/photos/studio-mtz")
    || src.includes("/media/about/06_holiday_group")
  );
}
