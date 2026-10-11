/**
 * Senior living community photos.
 *
 * The list starts empty. The page then uses a typographic hero and hides the
 * gallery. To publish photos:
 *
 * 1. Save each original as JPEG, PNG, or WebP, at least 1600 pixels wide.
 *    Name it with lowercase letters, numbers, and hyphens, such as
 *    community-lobby.jpg. No spaces. Do not put a community name in the filename.
 * 2. Put the originals in incoming/senior-living/. That folder is not public.
 * 3. Run `pnpm optimize:senior-living`.
 *    Sharp writes these files into public/senior-living/ for each stem:
 *    - {stem}-1600.webp
 *    - {stem}-1024.webp
 *    - {stem}-640.webp
 *    - {stem}.jpg (1600-pixel JPEG fallback)
 * 4. Add one entry here, in display order. The first entry is the hero.
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

export const SENIOR_LIVING_PHOTOS: readonly SeniorLivingPhoto[] = [];

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
