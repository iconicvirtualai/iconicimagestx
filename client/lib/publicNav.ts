export const STUDIOS_NAV_ITEM = { label: "Studios", href: "/studios" };

export function withStudiosNav<T extends { href: string }>(items: T[], item: T): T[] {
  if (items.some((entry) => entry.href === "/studios" || entry.href === "/iconic-studios")) return items;
  const index = items.findIndex((entry) => entry.href === "/studio-105");
  if (index >= 0) return [...items.slice(0, index + 1), item, ...items.slice(index + 1)];
  return [...items, item];
}
