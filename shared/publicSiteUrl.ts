/**
 * Origin for links a client opens: gallery, studio, invoice/pay, and portal.
 * APP_URL stays the Wix domain until that cutover. This does not read it.
 */

export const DEFAULT_PUBLIC_SITE_URL = "https://iconicimagestx.vercel.app";

export interface PublicSiteEnv {
  PUBLIC_SITE_URL?: string;
  VITE_PUBLIC_SITE_URL?: string;
}

export function livePublicSiteEnv(): PublicSiteEnv {
  const nodePublic = typeof process !== "undefined" ? process.env?.PUBLIC_SITE_URL : undefined;
  const nodeVite = typeof process !== "undefined" ? process.env?.VITE_PUBLIC_SITE_URL : undefined;
  const vitePublic =
    typeof import.meta !== "undefined" && import.meta.env
      ? import.meta.env.VITE_PUBLIC_SITE_URL
      : undefined;
  return {
    PUBLIC_SITE_URL: typeof nodePublic === "string" ? nodePublic : undefined,
    VITE_PUBLIC_SITE_URL: typeof nodeVite === "string" && nodeVite.trim()
      ? nodeVite
      : typeof vitePublic === "string"
        ? vitePublic
        : undefined,
  };
}

/** https origin with no trailing slash. Unset uses the Vercel app. */
export function publicSiteUrl(env: PublicSiteEnv = livePublicSiteEnv()): string {
  const configured = String(env.PUBLIC_SITE_URL || env.VITE_PUBLIC_SITE_URL || "").trim();
  const candidate = (configured || DEFAULT_PUBLIC_SITE_URL).replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("PUBLIC_SITE_URL must be an https URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("PUBLIC_SITE_URL must use https.");
  }
  if (!parsed.hostname) {
    throw new Error("PUBLIC_SITE_URL must be an https URL.");
  }
  return candidate;
}

/** Absolute client URL. `path` is a site path such as `/gallery/id`. */
export function publicClientUrl(path: string, env?: PublicSiteEnv): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${publicSiteUrl(env)}${suffix}`;
}
