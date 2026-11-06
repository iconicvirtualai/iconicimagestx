/**
 * Full amenity sets for staff fulfillment.
 * These filenames stay off the public client. The image bytes live in
 * server/private/amenities and are not served to anonymous visitors.
 * Payment does not open a download of this catalog.
 */

export type AmenityStockFile = {
  file: string;
  alt: string;
};

export const AMENITY_STOCK_FILES: Record<string, readonly AmenityStockFile[]> = {
  artavia: [
    { file: "A7303322.jpg", alt: "Artavia entrance with a large letter A sculpture" },
    { file: "A7303323.jpg", alt: "Artavia lake and curved walking path" },
    { file: "A7303338.jpg", alt: "Artavia covered seating plaza with picnic tables" },
    { file: "A7303339.jpg", alt: "Artavia amenity buildings along a paved walkway" },
    { file: "A7303349.jpg", alt: "Artavia sculpture of nested pink frames" },
    { file: "A7303350.jpg", alt: "Artavia covered deck with picnic tables beside the lake" },
  ],
  "benders-landing": [
    { file: "DJI_0002_edits.jpg", alt: "Aerial view of a Bender's Landing playground" },
    { file: "DJI_0005_edits.jpg", alt: "Aerial view of the Bender's Landing pool beside a lake" },
    { file: "DJI_0009_edits.jpg", alt: "Aerial view of Bender's Landing tennis courts and a basketball court" },
    { file: "DJI_0021_edits.jpg", alt: "Aerial view of the Bender's Landing pool, dock, and sports fields" },
    { file: "DJI_0026_edits.jpg", alt: "Aerial view of a Bender's Landing soccer field" },
    { file: "DSC02422_edits.jpg", alt: "Bender's Landing soccer field with goals" },
  ],
  "carlton-woods": [
    { file: "MLU07984.jpg", alt: "Carlton Woods outdoor basketball court" },
    { file: "MLU07990.jpg", alt: "Carlton Woods garden with benches and a stone planter" },
    { file: "MLU07991.jpg", alt: "Carlton Woods shaded benches around a stone planter" },
    { file: "MLU08015.jpg", alt: "Carlton Woods playground with a slide" },
    { file: "MLU08020.jpg", alt: "Carlton Woods tennis courts" },
    { file: "MLU08024.jpg", alt: "Carlton Woods pavilion overlooking a pond" },
  ],
  "east-shore": [
    { file: "A6509322.jpg", alt: "East Shore clubhouse and the East Shore Club sign" },
    { file: "A6509323.jpg", alt: "Front walk to the East Shore clubhouse" },
    { file: "A6509324.jpg", alt: "East Shore clubhouse porch and stone drive" },
    { file: "A6509328.jpg", alt: "East Shore lawn between rows of trees" },
    { file: "A6509329.jpg", alt: "East Shore patio seating in a hedge garden" },
    { file: "A6509330.jpg", alt: "East Shore stone monument in a circular garden" },
  ],
  "woodlands-waterway": [
    { file: "DJI_0100.jpg", alt: "The Woodlands Waterway with glass towers, a bridge, and a fountain" },
    { file: "DJI_0102.jpg", alt: "The Woodlands Waterway glass towers and arched bridge" },
    { file: "DJI_0105.jpg", alt: "The Woodlands Waterway arched bridge, fountain, and docks" },
    { file: "DJI_0107.jpg", alt: "The Woodlands Waterway canal beside office buildings" },
    { file: "DJI_0886.jpg", alt: "The Woodlands Waterway at sunset with lit towers and the bridge" },
    { file: "DJI_0894.jpg", alt: "The Woodlands Waterway shopping district at sunset" },
  ],
  woodforest: [
    { file: "DJI_0088.jpg", alt: "Aerial view of the Woodforest pool and water slides" },
    { file: "DJI_0094.jpg", alt: "Aerial view of a Woodforest lap pool and lawn" },
    { file: "MLU08266.jpg", alt: "Woodforest entrance sign reading Forest Island" },
    { file: "MLU08273.jpg", alt: "Woodforest lawn with cornhole boards and covered seating" },
    { file: "MLU08275.jpg", alt: "Woodforest model home with a Discover Woodforest sign" },
    { file: "MLU08292.jpg", alt: "Woodforest Harvest Market storefront" },
  ],
};
