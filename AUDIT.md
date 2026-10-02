# Launch audit — public site

Walk of the public routes on 2026-10-02. Live target: https://iconicimagestx.vercel.app. This PR is the launch cleanup. It does not turn on client or marketing sends, and it does not set `BOOKING_NOTIFY_LIVE`.

Captions on marketing stills stay Iconic-only: no agent names, no listing street addresses.

## What this PR changes

- Header no longer links Resources or Stock Footage. Portfolio is in the nav.
- `/insights`, `/insights/prep`, and `/stock-footage` redirect home. Direct URLs do not render the old pages.
- Homepage testimonial block is gone. `TestimonialsSection` and the unused `TestimonialVideoCarousel` (fake names, Pexels clips) are deleted.
- Contact no longer shows the Bryce Perez / pravatar quote.
- Insights source no longer has a testimonial carousel, pravatar avatars, or Unsplash article images. The route still redirects, so the leftover article blurbs are not public.
- Socials uses Iconic stills and the real profile links. Fake follower counts, pravatar faces, and the invented “on market” listings are gone.
- Hero, before/after carousel, About filmstrip, pricing background, and the virtual-staging checkout thumb use files under `public/media`.
- About no longer uses the Builder CDN frame as a portrait of Cadi. There is no confirmed portrait of Cadi in `public/media`, so that column shows a daytime front entry labeled as an Iconic still.
- Homepage lower half no longer renders the SaaS feature bento, the audience circles, the network manifesto, the process mockups, or the stats bar. In their place: a selected-work section of the 15 launch stills, Snap Reels, FAQ, and a book/pricing close.
- The invented “James Dalton / Luxury Estate Group” quote on the homepage was removed. The close no longer offers a free video or media licensing.

## Page walk

| Route | Status after this PR |
| --- | --- |
| `/` Home | Hero is the daytime front elevation in `public/media/launch`. Before/after track is still the Hockley-era pairs in `client/lib/beforeAfter.ts`. Below that: selected work (launch stills), Snap Reels, FAQ, and a book/pricing close. Stats bar, feature bento, audience block, and the fake quote are not rendered. |
| `/pricing` Services / pricing | Package photos were already Iconic. Background video was a Pexels clip; it is now `/media/video/content-web-clip.mp4`. Amenity add-on is a price line only. No amenity photo grid. |
| `/book` Booking | Form only. No stock images. Submits a booking request. Order-received email/SMS behavior is unchanged. |
| `/portfolio` | Existing stills and before/after pairs stay. The 15 launch stills are added under Listings and Aerial. Captions do not name agents or streets. |
| `/studio-105` Amenities / studio | Text only for Studio Noir and Studio Blanc. No stock photos. No room photography is in `public/media` yet, so the page does not invent a gallery. |
| `/contact` | Quote block removed. Form, phone link, and chat button remain. |
| `/about` | Filmstrip uses launch stills plus the twilight before/after frame. The side still is the daytime front entry, not a portrait of Cadi. Bio copy remains. |
| `/socials` | Footer link. Real profile URLs. Selected stills only. |
| `/agents` | Not in the nav. Fake stars, “4.98”, invented quotes, and Unsplash frames removed. Booking form remains. |
| `/privacy`, `/terms` | Text pages. No stock images. Linked from the footer legal row. |
| `/present/preview` | Staff preview shell. Uses the logo and presentation media helpers. Auth is not required for the preview token. Not changed. |
| `/login`, `/portal` | Client portal sign-in. Not changed. |
| `/portal/home` | Client home after a real portal profile loads. Not changed. |
| `/admin/login` | Staff sign-in, including photographers. A photographer role still goes to `/admin/photographer`. Not changed. |
| `/go` | Shirt QR page. No stock images. Not changed. |
| `/insights`, `/insights/prep`, `/stock-footage` | Redirect to `/`. |

## Broken links

- Resources and Stock Footage are no longer nav items. Old URLs redirect home instead of 404ing into Unsplash.
- `/agents` “Ask about referrals” now goes to `/contact`. It previously had no destination.
- `FeaturedServices` is not mounted. It used to link to `/services`, which is not a route. Its images are local now, but the component is still unused.
- Footer social URLs match the handles already on the site (`facebook.com/iconicimagestx`, `instagram.com/iconicimagestx`, `tiktok.com/@iconicimagestx`, `youtube.com/@iconicimagestx`). This audit did not verify that each profile is live.

## Stock and social proof still open

- No neighborhood stock packs exist in `public/media`. `/stock-footage` redirects. The page file is a short “not live” screen with no outside images, in case the redirect is removed.
- No confirmed portrait of Cadi in `public/media`.
- No Studio 105 room photos in `public/media`.
- Insights article titles are still placeholder blurbs in source. They are not routed.
- `/insights/prep` redirects. The unmounted prep screen no longer uses Unsplash or a placeholder YouTube embed; thumbs are Iconic stills and the clip is `/media/video/content-web-clip.mp4`. It is not a finished guide.
- Homepage `StatsBar` (“100,000+”, “24 hrs”, “+403%”) is no longer rendered. The component file is unused.
- `/agents` still shows “1,200+ listings shot” and “Next Day”. The fake 4.98 rating and 34% ROI stat were removed. The page hero is now the daytime exterior alternate.
- `ImageEditorModal` is not mounted. Its style thumbs now point at local stills.

## Forms, email, and SMS (status only)

- Contact `POST /api/contact` still tries `contact_form` (to `CONTACT_FORM_EMAIL` or `photos@iconicimagestx.com`) and `contact_confirmation` (to the sender). Both templates are blocked unless `CLIENT_NOTIFY_LIVE` is exactly `true` and `CLIENT_COMMS_ZONE` is not `RED`. This PR does not enable either flag. Under RED the handler can still return success after the send is suppressed.
- Live chat on Contact is local only. It replies in the browser and does not call email or SMS.
- Booking order-received email (`booking_received`) and SMS (`booking_confirmation`) stay default-on. `BOOKING_NOTIFY_LIVE` was not set and was not added.
- Stock-footage checkout was a simulated purchase with an SMS consent checkbox. That flow is no longer routed.

## Portal pathways

- Client: `/login` and `/portal` share the client sign-in. A client profile lands on `/portal/home`.
- Photographer and other staff: `/admin/login`. Photographers continue to `/admin/photographer`. Editors to `/admin/editor`. Other staff to `/admin/dashboard`.
- This PR does not change auth guards.

## What each launch still replaced

Files live in `public/media/launch/`. Captions do not name agents or streets.

| Still | Replaced |
| --- | --- |
| `hero_day_exterior_front.jpg` | Homepage hero. Was `/media/photos/website-hero-dan.jpg` (itself a stand-in for the old Builder CDN hero). Default `heroImage` in site settings matches. |
| `hero_day_exterior_alt.jpg` | Selected-work lead frame, portfolio listing, and the `/agents` hero. Was `/media/photos/luxury-exterior.jpg` on the agent page. |
| `kitchen_island_hero.jpg` | Interiors grid and About filmstrip. Was a generic interior slot (`luxury-interior` / feature-bento filler). |
| `living_room_bright.jpg` | Interiors grid and About filmstrip living frame. Was `listing-living` / `staged-living-room` in that strip. |
| `living_open_concept.jpg` | Interiors grid. New homepage frame in place of the feature-bento “open living” mock. |
| `dining_room.jpg` | Interiors grid and portfolio. No public dining still was on the homepage. |
| `foyer_stairs.jpg` | Interiors grid and About entry frame. |
| `primary_suite.jpg` | Interiors grid and portfolio. The older primary-suite before/after still stays in the carousel. |
| `interior_kitchen_detail.jpg` | Interiors grid and portfolio. |
| `backyard_pool_lifestyle.jpg` | Outdoor row and About filmstrip. Daylight pool, separate from the twilight before/after pair. |
| `covered_patio.jpg` | Outdoor row and portfolio. |
| `exterior_entry_day.jpg` | Outdoor row, portfolio, and the About side still (was `luxury-exterior.jpg`). |
| `aerial_neighborhood_drone.jpg` | Aerial row, About filmstrip, and portfolio. Was `drone-hero.jpg` in the About strip. |
| `aerial_property_overview.jpg` | Aerial row, portfolio, and the homepage “this is our market” side frame. Was `drone-hero.jpg` there. |
| `floorplan_sample_cropped.jpg` | Homepage 2D floorplan sample next to honest add-on copy, plus portfolio. Pricing had a price line and no image. |

