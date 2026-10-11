/**
 * Locked gallery cards. Photos, aerials, and floor-plan images point at the
 * owner display route. Videos keep a poster and no file URL. Matterport stays
 * an embed. PDF, zip, and raw files stay blank.
 */

import { ownerDisplayPath, signOwnerDisplayToken } from "./ownerDisplayGrant";
import { publicMediaItem, type PublicGalleryMedia } from "./paymentAccess";
import { galleryOwnerDisplayItems, ownerPosterSource, rasterShareSource } from "./publicShare";

function rowOf(item: unknown): Record<string, unknown> {
  return item && typeof item === "object" ? item as Record<string, unknown> : {};
}

function matterportUrl(row: Record<string, unknown>): string {
  for (const key of ["embedUrl", "url", "shareUrl"] as const) {
    const value = row[key];
    if (typeof value !== "string") continue;
    const url = value.trim();
    if (!url) continue;
    try {
      if (new URL(url).hostname.toLowerCase().includes("matterport.com")) return url;
    } catch {
      // Not an embed.
    }
  }
  return "";
}

export function lockedClientGalleryMedia(
  galleryId: string,
  items: unknown[],
  canDownload: boolean,
): PublicGalleryMedia[] {
  const rows = items.map(rowOf);
  if (canDownload) return rows.map((row) => publicMediaItem(row, true));

  const display = galleryOwnerDisplayItems(rows);
  const token = signOwnerDisplayToken({ scope: "gallery", id: galleryId });
  const href = (source: string): string | null => {
    if (!token || !source) return null;
    const index = display.findIndex((item) => item.sourceUrl === source);
    if (index < 0) return null;
    return ownerDisplayPath(token, index);
  };

  return rows.map((row) => {
    const base = publicMediaItem(row, false);
    const tour = matterportUrl(row);
    if (tour) return { ...base, url: tour, shareUrl: tour, embedUrl: tour };
    const type = typeof row.type === "string" ? row.type.toLowerCase() : "";
    if (type === "video" || type === "reel") {
      const poster = href(ownerPosterSource(row));
      return { ...base, poster, thumbnailUrl: poster };
    }
    const image = href(rasterShareSource(row));
    if (!image) return base;
    return { ...base, url: image };
  });
}
