# Wix URL map

Crawled 2026-10-27 from the live Wix site. `https://iconicimagestx.com` returns **301** to `https://www.iconicimagestx.com/`.

Sources:

- `https://www.iconicimagestx.com/sitemap.xml` (sitemap index, one child)
- `https://www.iconicimagestx.com/pages-sitemap.xml` (55 page URLs)
- `pageUriSEO` entries in the homepage viewer model (60 static pages, including paths the sitemap omits)
- Internal links on those pages (terms, an older media URL, and six PDFs)
- A promotions dynamic router (`/promotions/{title}`) whose index URL 404s and which published no item URLs

Not found: blog posts, `/post/*`, `/book-online`, `/service-page/*`, `/blank-*` other than `/blank`, portfolio, gallery, contact, and about at those exact paths.

Counts: 8 exact, 14 redirect, 45 GAP. Gaps redirect to the closest existing page. No new marketing pages were added.

Host rule, separate from the path table: `iconicimagestx.com` 301s to `https://www.iconicimagestx.com` and keeps the path. The condition is the apex host only. `iconicimagestx.vercel.app` and any other `*.vercel.app` host are not redirected.

`/ordericonic.html` is the booking embed this repo already serves inside the Wix page. That file URL is not in the redirect table.

| Wix URL | Wix title | Vercel route | Status | Notes |
| --- | --- | --- | --- | --- |
| https://www.iconicimagestx.com/ | Home | `/` | exact match | Current marketing home. Apex host still 301s to www; that hop is host-only. |
| https://www.iconicimagestx.com/home | HOME - OLD | `/` | redirect target | Previous homepage. |
| https://www.iconicimagestx.com/homev1 | Old Home | `/` | redirect target | Older homepage. |
| https://www.iconicimagestx.com/new-home | Home | `/` | redirect target | Wix already 301s this path to /. |
| https://www.iconicimagestx.com/pricing | Pricing | `/pricing` | exact match | Current pricing page. |
| https://www.iconicimagestx.com/pricingv1 | GENERAL PRICING | `/pricing` | redirect target | Older general pricing. |
| https://www.iconicimagestx.com/oldpricing | PRICING-OLD | `/pricing` | redirect target | Older package menu (Hollywood, Hall of Fame). |
| https://www.iconicimagestx.com/book | BOOK | `/book` | exact match | Booking page. |
| https://www.iconicimagestx.com/order | Old Order | `/book` | redirect target | Wix copy points bookmarks at /ordericonic. Booking now lives on /book. |
| https://www.iconicimagestx.com/ordericonic | ORDERICONIC | `/book` | redirect target | Public order URL. The embed file /ordericonic.html stays where it is and is not redirected. |
| https://www.iconicimagestx.com/orderbridge | orderbridge | `/book` | redirect target | Legacy order bridge. |
| https://www.iconicimagestx.com/apprenticeship | APPRENTICESHIP PROGRAM | `/apprenticeship` | exact match | Same path. Wix copy says the program ended; this site still publishes the page. |
| https://www.iconicimagestx.com/senior-living | Senior Living | `/senior-living` | exact match | Same path. |
| https://www.iconicimagestx.com/realestate-75 | $75 Real Estate Photos | `/realestate-75` | exact match | Same path. Stays noindex on this site. |
| https://www.iconicimagestx.com/thankful | Thankful | `/thankful` | exact match | Do not redirect. https://iconicimagestx.vercel.app/thankful#rsvp must keep working. |
| https://www.iconicimagestx.com/thankful-rsvp | Thankful RSVP | `/thankful#rsvp` | redirect target | New route. Lands on the existing RSVP section. Does not change /thankful. |
| https://www.iconicimagestx.com/thankful-social-saves | Thankful Social Saves | `/thankful#social-saves` | redirect target | Section already on /thankful. |
| https://www.iconicimagestx.com/thankful-vote | Thankful Vote | `/thankful#vote` | redirect target | Menu vote is the #vote block inside the RSVP section. |
| https://www.iconicimagestx.com/tis-the-season | Tis the Season | `/tis-the-season` | exact match | Same holiday booking page. |
| https://www.iconicimagestx.com/virtual-staging | STAGING | `/services/virtual-staging` | redirect target | Virtual staging service. |
| https://www.iconicimagestx.com/termsandconditions | TERMS & CONDITIONS | `/terms` | redirect target | Licensing and terms. |
| https://www.iconicimagestx.com/privacypolicy | Privacy Policy | `/privacy` | redirect target | In the Wix page map. Not in pages-sitemap.xml. |
| https://www.iconicimagestx.com/prep | Prep | `/book` | GAP | Shoot-prep checklist. Prep.tsx is not a public route, so this does not add one. |
| https://www.iconicimagestx.com/homeprepv1 | Old Prep | `/book` | GAP | Older copy of the shoot-prep checklist. |
| https://www.iconicimagestx.com/faq | FAQ | `/` | GAP | Wix 301s /faq to /faqv1. No standalone FAQ route. The home page has the FAQ section. |
| https://www.iconicimagestx.com/faqv1 | FAQv1 | `/` | GAP | FAQ copy. Closest public FAQ is the home page section. Pricing also has an FAQ block. |
| https://www.iconicimagestx.com/crew | Crew | `/about` | GAP | Team roster. No crew page. Closest is About. |
| https://www.iconicimagestx.com/teamv1 | Old Team | `/about` | GAP | Older team page. |
| https://www.iconicimagestx.com/aboutcadi | aboutcadi | `/about` | GAP | Individual bio. No per-person pages. |
| https://www.iconicimagestx.com/aboutmike | aboutmike | `/about` | GAP | Individual bio. |
| https://www.iconicimagestx.com/aboutarmando | aboutarmando | `/about` | GAP | Individual bio. |
| https://www.iconicimagestx.com/aboutalex | aboutalex | `/about` | GAP | Individual bio. |
| https://www.iconicimagestx.com/aboutmichael | aboutmichael | `/about` | GAP | Individual bio. |
| https://www.iconicimagestx.com/aboutdaniel | aboutdaniel | `/about` | GAP | Individual bio. |
| https://www.iconicimagestx.com/pedro | aboutpedro | `/about` | GAP | Individual bio. |
| https://www.iconicimagestx.com/cameronx | aboutcameron | `/about` | GAP | Individual bio. Wix path is /cameronx. |
| https://www.iconicimagestx.com/copy-of-aboutnathan | aboutdavid | `/about` | GAP | Wix duplicate path. Page title is about David. |
| https://www.iconicimagestx.com/copy-of-aboutjazmin | aboutkaitlyn | `/about` | GAP | Wix duplicate path. Page title is about Kaitlyn. |
| https://www.iconicimagestx.com/copy-of-aboutcameron | aboutligia | `/about` | GAP | Wix duplicate path. Page title is about Ligia. |
| https://www.iconicimagestx.com/media | Media | `/pricing` | GAP | Service menu (photo, video, aerial, staging). No media-services page. Portfolio is work samples, not this menu. |
| https://www.iconicimagestx.com/mediav1 | v1media | `/pricing` | GAP | Older media menu. Linked in the site, missing from pages-sitemap.xml. |
| https://www.iconicimagestx.com/marketing | Marketing | `/pricing` | GAP | Print and digital marketing menu. No marketing-services page. |
| https://www.iconicimagestx.com/v1marketing | v1marketing | `/pricing` | GAP | Older marketing menu. |
| https://www.iconicimagestx.com/copy-of-services | SERVICES | `/pricing` | GAP | Services overview. Wix duplicate path. |
| https://www.iconicimagestx.com/2025-4th-qtr-menu | 2025 - 4th Qtr Menu | `/pricing` | GAP | Seasonal menu. No matching menu page. |
| https://www.iconicimagestx.com/3dextension | 3D EXTENSION | `/pricing` | GAP | 3D add-on. Matterport is a pricing line, not its own page. |
| https://www.iconicimagestx.com/bulkorder | BUYINBULK | `/pricing` | GAP | Iconic Credits bulk rates. No public credits page. |
| https://www.iconicimagestx.com/specialoffer | SPECIALOFFER | `/pricing` | GAP | Bulk-buy offer for agents and brokers. |
| https://www.iconicimagestx.com/smallbusiness2024 | smallbusiness2024 | `/pricing` | GAP | 2024 small-business branding promo. |
| https://www.iconicimagestx.com/livingston | LIVINGSTON | `/pricing` | GAP | Livingston package sheet, not a generic booking form. |
| https://www.iconicimagestx.com/coverage | ZONE MAP | `/contact` | GAP | Travel-fee map. No zone map. Contact has the studio address. |
| https://www.iconicimagestx.com/zone-map | COVERAGE | `/contact` | GAP | Same travel-zone content under the other nav label. |
| https://www.iconicimagestx.com/vendors | VENDORS | `/contact` | GAP | Preferred vendor categories. No vendor directory. |
| https://www.iconicimagestx.com/joinourcrew | JOIN OUR CREW | `/contact` | GAP | Hiring. Not the apprenticeship product page. |
| https://www.iconicimagestx.com/thank-you-iconic | Thank You | `/book` | GAP | Post-booking thank-you. No thank-you page. |
| https://www.iconicimagestx.com/nanproperties | NAN Properties | `/book` | GAP | Partner order form. No partner-specific pages. |
| https://www.iconicimagestx.com/gtsg | GTSG | `/book` | GAP | Gold to Sold Group partner order form. |
| https://www.iconicimagestx.com/bsg | BSG | `/book` | GAP | Brian Schweiker Group partner order form. |
| https://www.iconicimagestx.com/larson | Larson | `/book` | GAP | Legacy landing. The public HTML is mostly site chrome. |
| https://www.iconicimagestx.com/blank | Promotions (Title) | `/` | GAP | Wix returns 200 with a soft 404 ('There's Nothing Here'). Promotions router template. /promotions itself 404s and has no items. |
| https://www.iconicimagestx.com/fullscreen-page | Fullscreen Page | `/` | GAP | Empty shell in the page map. Not in pages-sitemap.xml. |
| https://www.iconicimagestx.com/_files/ugd/af5b97_46d42cc1f3ff45548e1a5ad44ee4eee3.pdf | Home Prep Checklist | `/book` | GAP | PDF linked from /prep. The file is not in this repo. |
| https://www.iconicimagestx.com/_files/ugd/af5b97_43f960af85be4154ad2e20604610f966.pdf | Services PDF | `/pricing` | GAP | Untitled PDF linked from /copy-of-services. The file is not in this repo. |
| https://www.iconicimagestx.com/_files/ugd/af5b97_4fb2b1154d014ff094f4e3f0c7efe82b.pdf | Listing Insert: Landscape | `/pricing` | GAP | PDF linked from /copy-of-services. The file is not in this repo. |
| https://www.iconicimagestx.com/_files/ugd/af5b97_f330f7bfcfff4c55806c531d2271100a.pdf | Listing Insert: Portrait | `/pricing` | GAP | PDF linked from /copy-of-services. The file is not in this repo. |
| https://www.iconicimagestx.com/_files/ugd/af5b97_b1af2359c4b34575b669d579f0384d31.pdf | Open House Feedback Form | `/contact` | GAP | PDF linked from /copy-of-services. The file is not in this repo. |
| https://www.iconicimagestx.com/_files/ugd/af5b97_0c62fac2f8a347718bb7238f12241fb1.pdf | Preferred Vendor List | `/contact` | GAP | PDF linked from /copy-of-services. The file is not in this repo. |

## Checked and not public

| URL | Result | Notes |
| --- | --- | --- |
| `https://www.iconicimagestx.com/blog` | 404 | Not a public page. No redirect added. |
| `https://www.iconicimagestx.com/post` | 404 | Not a public page. No redirect added. |
| `https://www.iconicimagestx.com/book-online` | 404 | Not a public page. No redirect added. |
| `https://www.iconicimagestx.com/contact` | 404 | Not a public page. No redirect added. |
| `https://www.iconicimagestx.com/contact-us` | 404 | Not a public page. No redirect added. |
| `https://www.iconicimagestx.com/about` | 404 | Not a public page. No redirect added. |
| `https://www.iconicimagestx.com/about-us` | 404 | Not a public page. No redirect added. |
| `https://www.iconicimagestx.com/portfolio` | 404 | Not a public page. No redirect added. |
| `https://www.iconicimagestx.com/gallery` | 404 | Not a public page. No redirect added. |
| `https://www.iconicimagestx.com/privacy` | 404 | Not a public page. No redirect added. |
| `https://www.iconicimagestx.com/privacy-policy` | 404 | Not a public page. No redirect added. |
| `https://www.iconicimagestx.com/service-page` | 404 | Not a public page. No redirect added. |
| `https://www.iconicimagestx.com/services` | 404 | Not a public page. No redirect added. |
| `https://www.iconicimagestx.com/blank-1` | 404 | Not a public page. No redirect added. |
| `https://www.iconicimagestx.com/blank-2` | 404 | Not a public page. No redirect added. |
| `https://www.iconicimagestx.com/copy-of-home` | 404 | Not a public page. No redirect added. |
| `https://www.iconicimagestx.com/studio` | 404 | Not a public page. No redirect added. |
| `https://www.iconicimagestx.com/studio-105` | 404 | Not a public page. No redirect added. |
| `https://www.iconicimagestx.com/login` | 404 | Not a public page. No redirect added. |
| `https://www.iconicimagestx.com/promotions` | 404 | Not a public page. No redirect added. |

Nested sitemap names that 404: `blog-posts-sitemap.xml`, `blog-categories-sitemap.xml`, `dynamic-pages-sitemap.xml`, `portfolio-posts-sitemap.xml`, `store-products-sitemap.xml`.
