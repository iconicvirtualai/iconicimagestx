/**
 * Senior living community photos.
 *
 * The first entry is the hero. Later entries are the gallery, in order.
 * An empty list uses the typographic hero and hides the gallery.
 *
 * To add a photo:
 *
 * 1. Save the original as JPEG, PNG, or WebP, at least 1600 pixels wide.
 *    Name it with lowercase letters, numbers, and hyphens, such as
 *    community-lobby.jpg. No spaces. Do not put a community name in the filename.
 * 2. Put the original in incoming/senior-living/. That folder is not public.
 * 3. Run `pnpm optimize:senior-living`.
 *    Sharp writes these files into public/senior-living/ for each stem:
 *    - {stem}-1600.webp
 *    - {stem}-1024.webp
 *    - {stem}-640.webp
 *    - {stem}.jpg (1600-pixel JPEG fallback)
 * 4. Add one entry here. The first entry is the hero.
 *
 *    { stem: "community-lobby", alt: "Lobby at a Woodlands-area senior living community" }
 */

export const SENIOR_LIVING_WIDTHS = [1600, 1024, 640] as const;

export const SENIOR_LIVING_MATTERPORT_SRC =
  "https://my.matterport.com/show/?m=PNCyedKDjvi&play=1";

export const SENIOR_LIVING_MATTERPORT_ALLOW = "fullscreen; xr-spatial-tracking";

export const SENIOR_LIVING_MATTERPORT_TITLE =
  "Sample tour of a Woodlands-area senior living community";

export interface SeniorLivingPhoto {
  /** Filename stem. Matches the files written by pnpm optimize:senior-living. */
  stem: string;
  alt: string;
}

export const SENIOR_LIVING_PHOTOS: readonly SeniorLivingPhoto[] = [
  {
    stem: "senior-living-01-hero",
    alt: "Senior living community front entrance with covered drive and wraparound porches",
  },
  {
    stem: "senior-living-02-front-porch",
    alt: "Front porch with blue cushioned rocking chairs",
  },
  {
    stem: "senior-living-03-lobby",
    alt: "Bright two-story lobby and reception area",
  },
  {
    stem: "senior-living-04-dining-room",
    alt: "Dining room with stone fireplace and set tables",
  },
  {
    stem: "senior-living-05-bistro",
    alt: "Bistro café with round tables and window seating",
  },
  {
    stem: "senior-living-06-living-room",
    alt: "Comfortable living room lounge with sofa and armchairs",
  },
  {
    stem: "senior-living-07-covered-patio",
    alt: "Covered outdoor patio with lounge chairs and dining table",
  },
  {
    stem: "senior-living-08-private-dining",
    alt: "Private dining room with long table and pendant lights",
  },
  {
    stem: "senior-living-09-library",
    alt: "Library lounge with fireplace and bookshelves",
  },
  {
    stem: "senior-living-10-courtyard",
    alt: "Landscaped courtyard garden with walking path",
  },
  {
    stem: "senior-living-11-model-suite",
    alt: "Furnished model suite bedroom",
  },
];

/** One fictional family photo for the "Life here" band. Not part of the building gallery. */
export const SENIOR_LIVING_FAMILY_PHOTO: SeniorLivingPhoto = {
  stem: "senior-living-family",
  alt: "Smiling older woman holding hands with her adult daughter",
};

const STEM = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function publishedSeniorLivingPhotos(
  photos: readonly SeniorLivingPhoto[] = SENIOR_LIVING_PHOTOS,
): SeniorLivingPhoto[] {
  return photos.filter(
    (photo) => STEM.test(photo.stem) && photo.alt.trim().length > 0,
  );
}

export function seniorLivingPhotoSrc(photo: SeniorLivingPhoto) {
  const base = `/senior-living/${photo.stem}`;
  return {
    jpg: `${base}.jpg`,
    webpSrcSet: SENIOR_LIVING_WIDTHS.map(
      (width) => `${base}-${width}.webp ${width}w`,
    ).join(", "),
  };
}
