/**
 * Old Communications → Email bookmarks land on Marketing.
 * The public /unsubscribe page is not part of this map.
 */

export function marketingPathForLegacy(pathname: string): string | null {
  if (pathname === "/admin/campaigns" || pathname.startsWith("/admin/campaigns/")) {
    return `/admin/marketing${pathname.slice("/admin".length)}`;
  }
  const prefix = "/admin/communications/email";
  if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) return null;
  const rest = pathname.slice(prefix.length) || "/";
  if (rest === "/" || rest === "") return "/admin/marketing";
  if (rest === "/campaigns" || rest === "/campaigns/") return "/admin/marketing/campaigns";
  if (rest.startsWith("/campaigns/")) {
    return `/admin/marketing/campaigns/email${rest.slice("/campaigns".length)}`;
  }
  return `/admin/marketing${rest}`;
}
