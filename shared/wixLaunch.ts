/**
 * Public URLs crawled from the live Wix site (www.iconicimagestx.com) on 2026-10-27.
 * Sitemap index → pages-sitemap.xml, plus pageUriSEO entries in the homepage
 * viewer model, plus internal links. Status:
 * - exact: same path already exists here. No redirect.
 * - redirect: a different path is the same kind of page.
 * - gap: no equivalent page. The Vercel path is the closest existing page.
 * Gaps still redirect. This file does not add pages.
 */

export type WixUrlStatus = "exact" | "redirect" | "gap";

export type WixUrlEntry = {
  path: string;
  title: string;
  vercel: string;
  status: WixUrlStatus;
  note: string;
};

export const WIX_SITEMAP = "https://www.iconicimagestx.com/sitemap.xml";
export const WIX_PAGES_SITEMAP = "https://www.iconicimagestx.com/pages-sitemap.xml";

/** Probed on 2026-10-27. None of these are public Wix pages. */
export const WIX_CONFIRMED_ABSENT = [
  "/blog",
  "/post",
  "/book-online",
  "/contact",
  "/contact-us",
  "/about",
  "/about-us",
  "/portfolio",
  "/gallery",
  "/privacy",
  "/privacy-policy",
  "/service-page",
  "/services",
  "/blank-1",
  "/blank-2",
  "/copy-of-home",
  "/studio",
  "/studio-105",
  "/login",
  "/promotions",
] as const;

export const WIX_URL_MAP: readonly WixUrlEntry[] = [
  { path: "/", title: "Home", vercel: "/", status: "exact", note: "Current marketing home. Apex host still 301s to www; that hop is host-only." },
  { path: "/home", title: "HOME - OLD", vercel: "/", status: "redirect", note: "Previous homepage." },
  { path: "/homev1", title: "Old Home", vercel: "/", status: "redirect", note: "Older homepage." },
  { path: "/new-home", title: "Home", vercel: "/", status: "redirect", note: "Wix already 301s this path to /." },
  { path: "/pricing", title: "Pricing", vercel: "/pricing", status: "exact", note: "Current pricing page." },
  { path: "/pricingv1", title: "GENERAL PRICING", vercel: "/pricing", status: "redirect", note: "Older general pricing." },
  { path: "/oldpricing", title: "PRICING-OLD", vercel: "/pricing", status: "redirect", note: "Older package menu (Hollywood, Hall of Fame)." },
  { path: "/book", title: "BOOK", vercel: "/book", status: "exact", note: "Booking page." },
  { path: "/order", title: "Old Order", vercel: "/book", status: "redirect", note: "Wix copy points bookmarks at /ordericonic. Booking now lives on /book." },
  { path: "/ordericonic", title: "ORDERICONIC", vercel: "/book", status: "redirect", note: "Public order URL. The embed file /ordericonic.html stays where it is and is not redirected." },
  { path: "/orderbridge", title: "orderbridge", vercel: "/book", status: "redirect", note: "Legacy order bridge." },
  { path: "/apprenticeship", title: "APPRENTICESHIP PROGRAM", vercel: "/apprenticeship", status: "exact", note: "Same path. Wix copy says the program ended; this site still publishes the page." },
  { path: "/senior-living", title: "Senior Living", vercel: "/senior-living", status: "exact", note: "Same path." },
  { path: "/realestate-75", title: "$75 Real Estate Photos", vercel: "/realestate-75", status: "exact", note: "Same path. Stays noindex on this site." },
  { path: "/thankful", title: "Thankful", vercel: "/thankful", status: "exact", note: "Do not redirect. https://iconicimagestx.vercel.app/thankful#rsvp must keep working." },
  { path: "/thankful-rsvp", title: "Thankful RSVP", vercel: "/thankful#rsvp", status: "redirect", note: "New route. Lands on the existing RSVP section. Does not change /thankful." },
  { path: "/thankful-social-saves", title: "Thankful Social Saves", vercel: "/thankful#social-saves", status: "redirect", note: "Section already on /thankful." },
  { path: "/thankful-vote", title: "Thankful Vote", vercel: "/thankful#vote", status: "redirect", note: "Menu vote is the #vote block inside the RSVP section." },
  { path: "/tis-the-season", title: "Tis the Season", vercel: "/tis-the-season", status: "exact", note: "Same holiday booking page." },
  { path: "/virtual-staging", title: "STAGING", vercel: "/services/virtual-staging", status: "redirect", note: "Virtual staging service." },
  { path: "/termsandconditions", title: "TERMS & CONDITIONS", vercel: "/terms", status: "redirect", note: "Licensing and terms." },
  { path: "/privacypolicy", title: "Privacy Policy", vercel: "/privacy", status: "redirect", note: "In the Wix page map. Not in pages-sitemap.xml." },
  { path: "/prep", title: "Prep", vercel: "/book", status: "gap", note: "Shoot-prep checklist. Prep.tsx is not a public route, so this does not add one." },
  { path: "/homeprepv1", title: "Old Prep", vercel: "/book", status: "gap", note: "Older copy of the shoot-prep checklist." },
  { path: "/faq", title: "FAQ", vercel: "/", status: "gap", note: "Wix 301s /faq to /faqv1. No standalone FAQ route. The home page has the FAQ section." },
  { path: "/faqv1", title: "FAQv1", vercel: "/", status: "gap", note: "FAQ copy. Closest public FAQ is the home page section. Pricing also has an FAQ block." },
  { path: "/crew", title: "Crew", vercel: "/about", status: "gap", note: "Team roster. No crew page. Closest is About." },
  { path: "/teamv1", title: "Old Team", vercel: "/about", status: "gap", note: "Older team page." },
  { path: "/aboutcadi", title: "aboutcadi", vercel: "/about", status: "gap", note: "Individual bio. No per-person pages." },
  { path: "/aboutmike", title: "aboutmike", vercel: "/about", status: "gap", note: "Individual bio." },
  { path: "/aboutarmando", title: "aboutarmando", vercel: "/about", status: "gap", note: "Individual bio." },
  { path: "/aboutalex", title: "aboutalex", vercel: "/about", status: "gap", note: "Individual bio." },
  { path: "/aboutmichael", title: "aboutmichael", vercel: "/about", status: "gap", note: "Individual bio." },
  { path: "/aboutdaniel", title: "aboutdaniel", vercel: "/about", status: "gap", note: "Individual bio." },
  { path: "/pedro", title: "aboutpedro", vercel: "/about", status: "gap", note: "Individual bio." },
  { path: "/cameronx", title: "aboutcameron", vercel: "/about", status: "gap", note: "Individual bio. Wix path is /cameronx." },
  { path: "/copy-of-aboutnathan", title: "aboutdavid", vercel: "/about", status: "gap", note: "Wix duplicate path. Page title is about David." },
  { path: "/copy-of-aboutjazmin", title: "aboutkaitlyn", vercel: "/about", status: "gap", note: "Wix duplicate path. Page title is about Kaitlyn." },
  { path: "/copy-of-aboutcameron", title: "aboutligia", vercel: "/about", status: "gap", note: "Wix duplicate path. Page title is about Ligia." },
  { path: "/media", title: "Media", vercel: "/pricing", status: "gap", note: "Service menu (photo, video, aerial, staging). No media-services page. Portfolio is work samples, not this menu." },
  { path: "/mediav1", title: "v1media", vercel: "/pricing", status: "gap", note: "Older media menu. Linked in the site, missing from pages-sitemap.xml." },
  { path: "/marketing", title: "Marketing", vercel: "/pricing", status: "gap", note: "Print and digital marketing menu. No marketing-services page." },
  { path: "/v1marketing", title: "v1marketing", vercel: "/pricing", status: "gap", note: "Older marketing menu." },
  { path: "/copy-of-services", title: "SERVICES", vercel: "/pricing", status: "gap", note: "Services overview. Wix duplicate path." },
  { path: "/2025-4th-qtr-menu", title: "2025 - 4th Qtr Menu", vercel: "/pricing", status: "gap", note: "Seasonal menu. No matching menu page." },
  { path: "/3dextension", title: "3D EXTENSION", vercel: "/pricing", status: "gap", note: "3D add-on. Matterport is a pricing line, not its own page." },
  { path: "/bulkorder", title: "BUYINBULK", vercel: "/pricing", status: "gap", note: "Iconic Credits bulk rates. No public credits page." },
  { path: "/specialoffer", title: "SPECIALOFFER", vercel: "/pricing", status: "gap", note: "Bulk-buy offer for agents and brokers." },
  { path: "/smallbusiness2024", title: "smallbusiness2024", vercel: "/pricing", status: "gap", note: "2024 small-business branding promo." },
  { path: "/livingston", title: "LIVINGSTON", vercel: "/pricing", status: "gap", note: "Livingston package sheet, not a generic booking form." },
  { path: "/coverage", title: "ZONE MAP", vercel: "/contact", status: "gap", note: "Travel-fee map. No zone map. Contact has the studio address." },
  { path: "/zone-map", title: "COVERAGE", vercel: "/contact", status: "gap", note: "Same travel-zone content under the other nav label." },
  { path: "/vendors", title: "VENDORS", vercel: "/contact", status: "gap", note: "Preferred vendor categories. No vendor directory." },
  { path: "/joinourcrew", title: "JOIN OUR CREW", vercel: "/contact", status: "gap", note: "Hiring. Not the apprenticeship product page." },
  { path: "/thank-you-iconic", title: "Thank You", vercel: "/book", status: "gap", note: "Post-booking thank-you. No thank-you page." },
  { path: "/nanproperties", title: "NAN Properties", vercel: "/book", status: "gap", note: "Partner order form. No partner-specific pages." },
  { path: "/gtsg", title: "GTSG", vercel: "/book", status: "gap", note: "Gold to Sold Group partner order form." },
  { path: "/bsg", title: "BSG", vercel: "/book", status: "gap", note: "Brian Schweiker Group partner order form." },
  { path: "/larson", title: "Larson", vercel: "/book", status: "gap", note: "Legacy landing. The public HTML is mostly site chrome." },
  { path: "/blank", title: "Promotions (Title)", vercel: "/", status: "gap", note: "Wix returns 200 with a soft 404 ('There's Nothing Here'). Promotions router template. /promotions itself 404s and has no items." },
  { path: "/fullscreen-page", title: "Fullscreen Page", vercel: "/", status: "gap", note: "Empty shell in the page map. Not in pages-sitemap.xml." },
  {
    path: "/_files/ugd/af5b97_46d42cc1f3ff45548e1a5ad44ee4eee3.pdf",
    title: "Home Prep Checklist",
    vercel: "/book",
    status: "gap",
    note: "PDF linked from /prep. The file is not in this repo.",
  },
  {
    path: "/_files/ugd/af5b97_43f960af85be4154ad2e20604610f966.pdf",
    title: "Services PDF",
    vercel: "/pricing",
    status: "gap",
    note: "Untitled PDF linked from /copy-of-services. The file is not in this repo.",
  },
  {
    path: "/_files/ugd/af5b97_4fb2b1154d014ff094f4e3f0c7efe82b.pdf",
    title: "Listing Insert: Landscape",
    vercel: "/pricing",
    status: "gap",
    note: "PDF linked from /copy-of-services. The file is not in this repo.",
  },
  {
    path: "/_files/ugd/af5b97_f330f7bfcfff4c55806c531d2271100a.pdf",
    title: "Listing Insert: Portrait",
    vercel: "/pricing",
    status: "gap",
    note: "PDF linked from /copy-of-services. The file is not in this repo.",
  },
  {
    path: "/_files/ugd/af5b97_b1af2359c4b34575b669d579f0384d31.pdf",
    title: "Open House Feedback Form",
    vercel: "/contact",
    status: "gap",
    note: "PDF linked from /copy-of-services. The file is not in this repo.",
  },
  {
    path: "/_files/ugd/af5b97_0c62fac2f8a347718bb7238f12241fb1.pdf",
    title: "Preferred Vendor List",
    vercel: "/contact",
    status: "gap",
    note: "PDF linked from /copy-of-services. The file is not in this repo.",
  },
];

const STATUS_LABEL: Record<WixUrlStatus, string> = {
  exact: "exact match",
  redirect: "redirect target",
  gap: "GAP",
};

export function wixPathRedirects(): { source: string; destination: string; statusCode: 301 }[] {
  const rules: { source: string; destination: string; statusCode: 301 }[] = [];
  for (const entry of WIX_URL_MAP) {
    if (entry.status === "exact") continue;
    const sources = entry.path.endsWith("/") ? [entry.path] : [entry.path, `${entry.path}/`];
    for (const source of sources) {
      rules.push({ source, destination: entry.vercel, statusCode: 301 });
    }
  }
  return rules;
}

function cell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function wixUrlMapMarkdown(): string {
  const counts = { exact: 0, redirect: 0, gap: 0 };
  for (const entry of WIX_URL_MAP) counts[entry.status] += 1;
  const rows = WIX_URL_MAP.map((entry) => {
    const wix = `https://www.iconicimagestx.com${entry.path === "/" ? "/" : entry.path}`;
    return `| ${cell(wix)} | ${cell(entry.title)} | \`${cell(entry.vercel)}\` | ${STATUS_LABEL[entry.status]} | ${cell(entry.note)} |`;
  }).join("\n");
  const absent = WIX_CONFIRMED_ABSENT.map((path) => `| \`https://www.iconicimagestx.com${path}\` | 404 | Not a public page. No redirect added. |`).join("\n");
  return `# Wix URL map

Crawled 2026-10-27 from the live Wix site. \`https://iconicimagestx.com\` returns **301** to \`https://www.iconicimagestx.com/\`.

Sources:

- \`${WIX_SITEMAP}\` (sitemap index, one child)
- \`${WIX_PAGES_SITEMAP}\` (55 page URLs)
- \`pageUriSEO\` entries in the homepage viewer model (60 static pages, including paths the sitemap omits)
- Internal links on those pages (terms, an older media URL, and six PDFs)
- A promotions dynamic router (\`/promotions/{title}\`) whose index URL 404s and which published no item URLs

Not found: blog posts, \`/post/*\`, \`/book-online\`, \`/service-page/*\`, \`/blank-*\` other than \`/blank\`, portfolio, gallery, contact, and about at those exact paths.

Counts: ${counts.exact} exact, ${counts.redirect} redirect, ${counts.gap} GAP. Gaps redirect to the closest existing page. No new marketing pages were added.

Host rule, separate from the path table: \`iconicimagestx.com\` 301s to \`https://www.iconicimagestx.com\` and keeps the path. The condition is the apex host only. \`iconicimagestx.vercel.app\` and any other \`*.vercel.app\` host are not redirected.

\`/ordericonic.html\` is the booking embed this repo already serves inside the Wix page. That file URL is not in the redirect table.

| Wix URL | Wix title | Vercel route | Status | Notes |
| --- | --- | --- | --- | --- |
${rows}

## Checked and not public

| URL | Result | Notes |
| --- | --- | --- |
${absent}

Nested sitemap names that 404: \`blog-posts-sitemap.xml\`, \`blog-categories-sitemap.xml\`, \`dynamic-pages-sitemap.xml\`, \`portfolio-posts-sitemap.xml\`, \`store-products-sitemap.xml\`.
`;
}
