/** Durable profile image URLs. Signed storage URLs expire and are not saved as the avatar. */

export const PROFILE_MEDIA_PATH = /^\/api\/clients\/profile-media\/[a-f0-9]{32}$/;

export function isProfileMediaPath(value: string): boolean {
  return PROFILE_MEDIA_PATH.test(value);
}

export function isExpiringStorageUrl(value: string): boolean {
  return /(?:X-Goog-Algorithm|X-Goog-Signature|X-Goog-Expires|GoogleAccessId)=/i.test(value)
    || (/[?&]Expires=\d+/.test(value) && /[?&]Signature=/.test(value));
}

/** Pull the object path out of a Firebase download URL or a GCS signed URL. */
export function storagePathFromUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.hostname === "firebasestorage.googleapis.com" || url.hostname === "127.0.0.1" || url.hostname === "localhost") {
      const match = url.pathname.match(/\/o\/([^/]+)$/);
      return match ? decodeURIComponent(match[1]) : "";
    }
    if (url.hostname === "storage.googleapis.com") {
      const parts = url.pathname.split("/").filter(Boolean);
      return parts.length >= 2 ? decodeURIComponent(parts.slice(1).join("/")) : "";
    }
  } catch {
    return "";
  }
  return "";
}
