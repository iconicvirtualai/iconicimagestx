/**
 * Bare /studio and /gallery are not client delivery links.
 * Those links always include an id: /studio/:listingId and /gallery/:galleryId.
 */

export type BareClientRouteKind = "studio" | "gallery";

export const BARE_CLIENT_ROUTE_TITLE = "Page not found";

export const BARE_CLIENT_ROUTE_LINKS = [
  { href: "/", label: "Home" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/contact", label: "Contact" },
  { href: "/login", label: "Client Login" },
] as const;

export function bareClientRouteKind(pathname: string): BareClientRouteKind | null {
  const pathOnly = pathname.split("#")[0]?.split("?")[0] ?? "";
  if (pathOnly === "/studio" || pathOnly === "/studio/") return "studio";
  if (pathOnly === "/gallery" || pathOnly === "/gallery/") return "gallery";
  return null;
}

export function isBareClientRoute(pathname: string): boolean {
  return bareClientRouteKind(pathname) !== null;
}

export function bareClientRouteMessage(kind: BareClientRouteKind): string {
  if (kind === "gallery") {
    return "A gallery link includes an ID. This address does not. Open the full link from your delivery, or sign in to the client portal.";
  }
  return "A studio link includes an ID. This address does not. Open the full link from your delivery, or sign in to the client portal.";
}
