/**
 * Staff photo editor. Old Iconic Studio and operations URLs land here.
 * Public client galleries stay on /studio/:listingId.
 */

export const STUDIO_EDITOR_PATH = "/admin/studio/editing";

const LEGACY_ICONIC = "/admin/iconic-studio";
const LEGACY_OPERATIONS = "/admin/studio/operations";

export function studioEditorHref(listingId?: string): string {
  const id = listingId?.trim();
  if (!id) return STUDIO_EDITOR_PATH;
  return `${STUDIO_EDITOR_PATH}?listingId=${encodeURIComponent(id)}`;
}

/** listingId is canonical. listing and project are accepted from older links. */
export function studioEditorListingId(search: string): string {
  const raw = search.startsWith("?") ? search.slice(1) : search.split("#")[0];
  const params = new URLSearchParams(raw);
  return (params.get("listingId") || params.get("listing") || params.get("project") || "").trim();
}

/**
 * Bookmark and email targets for the previous staff studio.
 * Returns null for the public gallery and for the current Studio sections.
 */
export function legacyStudioRedirect(pathname: string, search = ""): string | null {
  const path = pathname.split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
  const iconic = path.match(/^\/admin\/iconic-studio(?:\/([^/]+))?$/);
  if (!iconic && path !== LEGACY_OPERATIONS) return null;
  let fromPath = "";
  if (iconic?.[1]) {
    try {
      fromPath = decodeURIComponent(iconic[1]);
    } catch {
      fromPath = iconic[1];
    }
  }
  const id = fromPath.trim() || studioEditorListingId(search);
  return studioEditorHref(id || undefined);
}

export { LEGACY_ICONIC as LEGACY_ICONIC_STUDIO_PATH, LEGACY_OPERATIONS as LEGACY_STUDIO_OPERATIONS_PATH };
