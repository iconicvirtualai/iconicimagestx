# Products & Services — plan for Cody

This is the data model for the catalog page, pricing plans, adjustments, and filters. It is not built. PR A only changes the order-request service picker. Nothing here sends client email or texts, and nothing flips `CLIENT_NOTIFY_LIVE` or `BOOKING_NOTIFY_LIVE`.

Prices clients pay today come from Firestore `packages`, overlaid on the seed in `shared/bookingCatalog.ts`. Keep that collection. Do not add a second price list.

## What reads the catalog today

These charge or display the seed overlaid with `packages`:

- Public booking form `/book` (`client/components/BookingForm.tsx`)
- Booking submit (`server/routes/bookings.ts`)
- Apprenticeship packages (`server/routes/apprenticeship.ts`, `shared/apprenticeship.ts`)
- Admin invoice editor package picker (`client/pages/AdminInvoiceEditor.tsx`)
- Admin booking catalog (`client/pages/AdminBookingCatalog.tsx`)
- `shared/bookingPricing.ts` (`buildSubmittedLineItems`, `estimateBookingCharge`)

These do **not** read `packages`. They are hardcoded, or they copy whatever was stored on the order:

- `client/pages/Pricing.tsx` — public pricing page, price strings in the file
- `client/pages/AdminCurrentPricing.tsx` — local table only. `shared/bookingCatalog.ts` says not to charge from it. A few rows disagree with the catalog (the page’s video add-on is “350–500+”; the catalog’s Basic Video is $300)
- `client/lib/services.ts` — seed input for the campaign packages (Essentials $249, Showcase $549, and the rest)
- `shared/realestate75.ts`, `shared/headshots10.ts`, `shared/seniorLiving.ts`, `shared/thankfulEvent.ts` — their own offers
- Invoice presets (`invoicePresets`) — flat or percent adjustments, not the service list
- Orders, projects, and invoices — stored line items and totals, not a live catalog lookup
- Order request edit, before this PR — a free-text name and price

A missing `packages` doc keeps the seed price. Staff edits on a `packages` doc are what `/book` charges.

## `packages` (existing collection, extended)

One document per service. Document id stays the current booking id (`listing-essentials`, `photos-35`, `aerial-drone`, …) so `/book` does not change.

| Field | Type | Notes |
| --- | --- | --- |
| `name` | string | Office title. “The Essentials”. |
| `publicTitle` | string | Title on the pricing page and `/book` when it should differ. |
| `description` | string | |
| `price` | number | Dollars. Seed prices stay as they are. |
| `durationMinutes` | number | Appointment length. Empty when the service has no length. |
| `serviceType` | `"primary" \| "addon" \| "business" \| "social" \| "studio"` | Replaces the split between booking kind and the pricing-page categories. |
| `requiresProvider` | boolean | Needs a photographer and an appointment. |
| `showLive` | boolean | On the public booking form and pricing page. Maps to today’s `isActive` plus “priced” check. |
| `filterableByDefault` | boolean | Included when an order form has no extra filter. |
| `payout` | `{ mode: "flat" \| "percent", amount: number }` | Default photographer pay. `amount` is dollars or a percent. |
| `contents` | string[] | What the client gets. “30 photos”, “Snap reel”. |
| `editingRules` | string | “Basic editing”. |
| `deliveryRequirement` | string | “Same day”. |
| `sku` | string | ID number. Defaults to the document id. |
| `variants` | array | See below. Omit when there is only one price. |
| `bookingId`, `bookingKind`, `category`, `tier`, `includedServices`, `sortOrder` | existing | Keep until `/book` reads `serviceType` and `contents`. |

`variants[]`:

| Field | Type |
| --- | --- |
| `id` | string, unique under the parent |
| `name` | string |
| `price` | number |
| `durationMinutes` | number, optional |
| `payout` | same shape as the parent, optional |

Seed the extended fields from today’s seed (`bookingPackageSeedDocs`) and leave `price` alone. Customers should see the same numbers on deploy.

Suggested rules, for Cody to publish from `firestore.rules`: coordinators read and write `packages`, same as today (`match /packages/{packageId}`). No public write.

## `pricingPlans` (new)

A price list for one client or one team. When both match, the client plan wins.

| Field | Type | Notes |
| --- | --- | --- |
| `name` | string | |
| `audience` | `"customer" \| "team"` | |
| `customerId` | string, optional | Set when `audience` is `customer`. |
| `teamId` | string, optional | Set when `audience` is `team`. |
| `overrides` | `{ packageId, variantId?, price }[]` | Only the rows that differ. |
| `hiddenVariantIds` | string[] | Variants this plan does not offer. |
| `couponId` | string, optional | Applied when the plan is used. |
| `active` | boolean | |

Rules: coordinators read/write. Clients do not read other people’s plans.

## `travelFeeRules` (new)

Today’s travel quote lives in `shared/travelZones.ts`: straight-line miles from the studio, six matched bands (zone 1 is $0 through 17 miles, zone 6 is $150 through 84 miles, past that is “Travel quoted”). That is a matched band, not a sum of tiers. The first saved rule should reproduce those bands so a booking’s travel fee does not change.

| Field | Type | Notes |
| --- | --- | --- |
| `name` | string | |
| `mode` | `"flat" \| "percent" \| "perMile" \| "graduated" \| "volume"` | `volume` matches one band, which is what the zones do now. `graduated` adds each tier the miles pass through. |
| `amount` | number | Used by flat, percent, and per-mile. |
| `tiers` | `{ upToMiles, amount }[]` | Used by graduated and volume. |
| `appliesPerProvider` | boolean | Charged once for each person on the shoot. |
| `active` | boolean | |

`assessTravel` stays the mileage source. The rule only decides the dollars.

## `taxRates` (new)

| Field | Type |
| --- | --- |
| `name` | string |
| `scope` | `"universal" \| "state" \| "county"` |
| `region` | string, empty for universal |
| `rate` | number, percent |
| `active` | boolean |

Invoice tax today is a stored amount or an invoice preset, not a rate table. New orders would resolve one active rate. Old invoices keep their stored tax.

## `coupons` (new)

Separate from `PROMO_DISCOUNTS` in `shared/bookingCatalog.ts` (ICONICAI and the other codes baked into the booking form). Those codes keep working until this collection is the one `/book` checks.

| Field | Type | Notes |
| --- | --- | --- |
| `code` | string | Generated in the office if left blank. Stored uppercase. |
| `mode` | `"percent" \| "amount"` | |
| `amount` | number | Percent points or dollars. |
| `appliesTo` | `"order" \| "line"` | |
| `packageIds` | string[] | Empty means the whole order. |
| `newCustomersOnly` | boolean | |
| `maxRedemptions` | number, optional | |
| `maxPerCustomer` | number, optional | |
| `minimumOrder` | number | Dollars. 0 means none. |
| `startsAt`, `endsAt` | timestamp, optional | |
| `active` | boolean | |
| `redemptionCount` | number | Server-incremented. Not client-writable. |

Rules: anyone who can submit a booking may read an active coupon by code through the existing booking API, not by listing the collection. Coordinators write. Redemption counts are Admin SDK only.

## `productFilters` (new)

| Field | Type |
| --- | --- |
| `name` | string |
| `valueType` | `"number" \| "price"` |
| `description` | string |
| `packageIds` | string[] |
| `orderFormIds` | string[] | Which order forms show the filter. |

## Order lines (already started in PR A)

An order service row stores `id`, `catalogId`, `variantId` when it is a variant, `unitPrice`, `qty`, `price`, and `durationMinutes`. A staff-typed row stores `custom: true` and no catalog id. `processing` is the 2.8% fee on the service subtotal, stored on the order, not inside the service price. `catalogPackageIds` and `catalogVariantIds` are the chosen ids.

## Build order after this PR

1. Products & Services page on `packages`, with the fields above, under one nav item that replaces Booking catalog and Current Pricing.
2. Point `/book`, the pricing page, invoices, projects, and apprenticeship at that same list. Seed first so prices do not move.
3. Pricing plans.
4. Travel rules seeded from `TRAVEL_ZONES`, then tax rates and coupons.
5. Filters.

Firestore rules for the new collections go in `firestore.rules` in that PR. Vercel does not publish rules. Cody publishes them.
