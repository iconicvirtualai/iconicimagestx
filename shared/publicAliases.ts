/**
 * Public paths that 404 on iconicimagestx.vercel.app and are not in the Wix map.
 * Each one hops once to a page that already exists.
 * /studios is left alone for PR #161. /forgot-password is left alone for the
 * photographer password page. A redirect here would conflict with those.
 */

export type PublicAlias = {
  path: string;
  destination: string;
  statusCode: 301 | 302;
  note: string;
};

export const PUBLIC_ALIASES: readonly PublicAlias[] = [
  {
    path: "/booking",
    destination: "/book",
    statusCode: 301,
    note: "Booking is /book. There is no /booking page.",
  },
  {
    path: "/holiday-event",
    destination: "/thankful",
    statusCode: 302,
    note: "PR #161 does not add /holiday-event. Its December promo is already /tis-the-season. This name matches the Iconic Client Holiday Event on /thankful. Temporary.",
  },
  {
    path: "/services",
    destination: "/pricing",
    statusCode: 301,
    note: "No /services page. The services menu is /pricing. /services/virtual-staging stays its own page.",
  },
];

export function publicAliasRedirects(): { source: string; destination: string; statusCode: 301 | 302 }[] {
  const rules: { source: string; destination: string; statusCode: 301 | 302 }[] = [];
  for (const entry of PUBLIC_ALIASES) {
    for (const source of [entry.path, `${entry.path}/`]) {
      rules.push({ source, destination: entry.destination, statusCode: entry.statusCode });
    }
  }
  return rules;
}
