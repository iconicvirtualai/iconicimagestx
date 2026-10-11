/**
 * Read-only comparison of share photos.
 * "Today" is the cut that dropped MLS and full-res rasters.
 * "Kept" routes those rasters through the display image route.
 * Nothing here writes.
 */

import { listingAddressLabel } from "./iconicStudio.ts";
import { isPlaytestDoc } from "./lockImpact.ts";
import { rasterShareSource, shareRasterCount, type ShareListing } from "./publicShare.ts";

export interface SharePhotoTag {
  name: string;
  category: string;
  type: string;
  downloadable: boolean;
  today: "keep" | "drop";
  kept: "keep" | "drop";
}

export interface SharePhotoListingReport {
  id: string;
  address: string;
  today: number;
  kept: number;
  photos: SharePhotoTag[];
}

export interface SharePhotoScan {
  listings: Array<Record<string, unknown> & { id?: string }>;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function rowOf(item: unknown): Record<string, unknown> | null {
  return item && typeof item === "object" ? item as Record<string, unknown> : null;
}

function photoTags(listing: ShareListing): SharePhotoTag[] {
  const tags: SharePhotoTag[] = [];
  const groups = [listing.images, listing.floorplans, listing.floorPlans];
  for (const group of groups) {
    if (!Array.isArray(group)) continue;
    for (const item of group) {
      const row = rowOf(item);
      if (!row) continue;
      const today = rasterShareSource(row, true) ? "keep" : "drop";
      const kept = rasterShareSource(row, false) ? "keep" : "drop";
      tags.push({
        name: text(row.name) || text(row.fileName) || text(row.title) || "(unnamed)",
        category: text(row.category),
        type: text(row.type),
        downloadable: row.downloadable === true,
        today,
        kept,
      });
    }
  }
  return tags;
}

export function sharePhotoListingReport(listing: ShareListing): SharePhotoListingReport {
  const address = listingAddressLabel({
    address: listing.address,
    shootLocation: listing.shootLocation,
    propertyAddress: listing.propertyAddress,
    addressLabel: listing.addressLabel,
  });
  return {
    id: listing.id,
    address: address === "Untitled listing" ? "" : address,
    today: shareRasterCount(listing, true),
    kept: shareRasterCount(listing, false),
    photos: photoTags(listing),
  };
}

export function sharePhotoReports(scan: SharePhotoScan): { skippedPlaytest: number; listings: SharePhotoListingReport[] } {
  let skippedPlaytest = 0;
  const listings: SharePhotoListingReport[] = [];
  for (const doc of scan.listings) {
    const id = text(doc.id);
    if (isPlaytestDoc({ id, playtest: doc.playtest })) {
      skippedPlaytest += 1;
      continue;
    }
    listings.push(sharePhotoListingReport({ ...doc, id }));
  }
  listings.sort((a, b) => a.id.localeCompare(b.id));
  return { skippedPlaytest, listings };
}

export function formatSharePhotoReport(scan: SharePhotoScan, projectId: string): string {
  const report = sharePhotoReports(scan);
  const lines = [
    "Share photo report (read-only)",
    `Firebase project: ${projectId}`,
    "No documents were written.",
    `Real listings: ${report.listings.length}`,
    `Skipped playtest listings: ${report.skippedPlaytest}`,
    "",
  ];
  let blankUnderOldRules = 0;
  let gained = 0;
  for (const listing of report.listings) {
    if (listing.today === 0 && listing.kept > 0) blankUnderOldRules += 1;
    if (listing.kept > listing.today) gained += 1;
    lines.push(`${listing.id}  today ${listing.today}  kept ${listing.kept}  ${listing.address}`);
    if (listing.photos.length === 0) {
      lines.push("  (no photo fields)");
      continue;
    }
    for (const photo of listing.photos) {
      const category = photo.category || "-";
      const type = photo.type || "-";
      const downloadable = photo.downloadable ? "downloadable" : "not-downloadable";
      lines.push(`  ${photo.name}  category ${category}  type ${type}  ${downloadable}  today ${photo.today}  kept ${photo.kept}`);
    }
  }
  lines.push(
    "",
    `Listings that gain photos: ${gained}`,
    `Listings that would have been blank under the old drop rules: ${blankUnderOldRules}`,
    "Kept photos are served from /api/media/display. Original file URLs stay off the share payload.",
    "",
  );
  return `${lines.join("\n")}\n`;
}

export function sharePhotoFixtureScan(): SharePhotoScan {
  return {
    listings: [
      {
        id: "listing-mls-only-real",
        address: "18 Oak Hollow, Spring, TX",
        images: [
          { name: "living.jpg", category: "mls", type: "photo", downloadable: true, url: "https://cdn.example/living.jpg" },
          { name: "exterior.jpg", category: "full-res", type: "photo", downloadable: true, url: "https://cdn.example/exterior.jpg" },
        ],
      },
      {
        id: "listing-mixed-real",
        address: "100 Congress Ave, Austin, TX",
        images: [
          { name: "front.jpg", category: "final", url: "https://cdn.example/front.jpg" },
          { name: "mls.jpg", category: "mls", downloadable: true, url: "https://cdn.example/mls.jpg" },
        ],
        floorplans: [
          { name: "level1.jpg", url: "https://cdn.example/level1.jpg" },
          { name: "plans.pdf", contentType: "application/pdf", url: "https://cdn.example/plans.pdf" },
        ],
      },
      {
        id: "playtest-delivery-qa-listing",
        playtest: true,
        address: "100 Playtest Lane",
        images: [{ name: "secret.jpg", category: "mls", url: "https://cdn.example/secret.jpg" }],
      },
    ],
  };
}
