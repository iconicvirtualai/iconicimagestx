/**
 * Browsers that may call this API.
 * The public order page is a Wix HTML component. Its iframe is served from
 * filesusr.com, so the form's Origin is that host, not www.iconicimagestx.com.
 * A free Wix address uses wixsite.com the same way.
 */

const SITE_ORIGINS = [
  "https://iconicimagestx.com",
  "https://www.iconicimagestx.com",
  "https://iconic-booking-test.cadi0224.chatgpt.site",
];

/** Dots in the site host become hyphens on the Wix HTML-component host. */
const WIX_IFRAME_HOSTS = new Set([
  "www-iconicimagestx-com.filesusr.com",
  "iconicimagestx-com.filesusr.com",
  "iconicimagestx.wixsite.com",
]);

export function isPublicApiOrigin(origin: string | undefined, configuredOrigin?: string): boolean {
  if (!origin) return true;
  if (SITE_ORIGINS.includes(origin)) return true;
  if (configuredOrigin && origin === configuredOrigin) return true;

  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.origin !== origin) return false;
  return WIX_IFRAME_HOSTS.has(url.hostname.toLowerCase());
}
