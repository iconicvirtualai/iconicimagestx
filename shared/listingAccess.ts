/**
 * Pure helpers for portal signup and listing media access.
 * Safe to import from both the client and the server.
 */

export const PLAYTEST_ADDRESS = "100 Playtest Lane, Austin, TX 78701";

const STAFF_ROLES = ["admin", "coordinator", "photographer", "editor"] as const;
export type StaffRoleName = (typeof STAFF_ROLES)[number];

export function normalizeEmail(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

export function cleanPersonName(value: unknown): string {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);
}

export function isStaffRole(value: unknown): value is StaffRoleName {
  return STAFF_ROLES.includes(value as StaffRoleName);
}

export function safeStorageFileName(fileName: unknown): string {
  const base = String(fileName || "upload")
    .split(/[/\\]/)
    .pop() || "upload";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
  return cleaned.slice(0, 180) || "upload";
}

export function contentTypeForUpload(fileName: string, provided?: string): string {
  const raw = String(provided || "").trim().toLowerCase();
  if (/^[\w.+-]+\/[\w.+-]+$/.test(raw) && raw.length <= 120 && raw !== "application/octet-stream") {
    return raw;
  }
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".heif")) return "image/heif";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".mov")) return "video/quicktime";
  return raw && /^[\w.+-]+\/[\w.+-]+$/.test(raw) ? raw : "application/octet-stream";
}

export function isListingStoragePath(listingId: string, storagePath: unknown): boolean {
  if (!listingId || typeof storagePath !== "string") return false;
  if (storagePath.includes("..") || storagePath.includes("\\") || storagePath.startsWith("/")) return false;
  const prefix = `listings/${listingId}/`;
  if (!storagePath.startsWith(prefix)) return false;
  const rest = storagePath.slice(prefix.length);
  return rest.startsWith("photos/") || rest.startsWith("raw/");
}

export function staffCanAccessListing(
  role: string | undefined,
  uid: string,
  listing: Record<string, any> | null | undefined,
): boolean {
  if (!listing || !uid) return false;
  if (role === "admin" || role === "coordinator") return true;
  if (listing.photographerUid === uid) return true;
  if (Array.isArray(listing.photographerIds) && listing.photographerIds.includes(uid)) return true;
  if (Array.isArray(listing.assignedProviders)) {
    return listing.assignedProviders.some((provider) =>
      provider?.providerId === uid || provider?.uid === uid || provider?.id === uid
    );
  }
  return false;
}

export function clientCanViewListing(
  listing: Record<string, any> | null | undefined,
  identity: { uid: string; email?: string; ids?: string[] },
): boolean {
  if (!listing || !identity?.uid) return false;
  const ids = new Set([identity.uid, ...(identity.ids || [])]);
  if (listing.clientId && ids.has(String(listing.clientId))) return true;
  const email = normalizeEmail(identity.email);
  const listingEmail = normalizeEmail(listing.clientEmail);
  return Boolean(email && listingEmail && email === listingEmail);
}
