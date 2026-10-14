export type PublicLink = { label: string; href: string };

/** Keep Crew in the public chrome even when published nav content predates the page. */
export function ensureCrewLink(links: PublicLink[], afterHref: string): PublicLink[] {
  if (links.some((link) => link.href === "/crew")) return links;
  const crew: PublicLink = { label: "Crew", href: "/crew" };
  const index = links.findIndex((link) => link.href === afterHref);
  const next = links.slice();
  next.splice(index >= 0 ? index + 1 : next.length, 0, crew);
  return next;
}
