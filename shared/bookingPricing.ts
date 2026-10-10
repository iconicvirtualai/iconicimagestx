/**
 * Customer booking totals.
 *
 * Prices come from the booking catalog (seed, overlaid with Firestore `packages`
 * when a catalog is passed). calculateSidebarTotal matches the booking form
 * total, including the Math.max(0, …) promo floor. buildSubmittedLineItems is
 * the submitted line list. Its `price` fields are the extended amounts, and
 * sumLineItemPrices is the submitted total. Life of the Listing Care is
 * accepted on the input and never added to either number.
 */

import {
  CALL_FOR_PRICING_LABEL,
  catalogPriceIsBookable,
  packagesForStaffEditor,
  promoDiscountFor,
  type StaffCatalogPackage,
} from "./bookingCatalog.ts";

export interface BookingPriceInput {
  selectedService?: string;
  selectedBasics?: string[];
  selectedAddOns?: string[];
  premiumUpgrade?: boolean;
  virtualStagingCredits?: number;
  specializedPhotography?: string;
  promo?: { code: string; discount: number } | null;
  lifeOfTheListingCare?: boolean;
  /** Active packages. Omit to charge the seed catalog. */
  catalog?: StaffCatalogPackage[];
}

export interface BookingLineItem {
  id?: string;
  name: string;
  unitPrice: number;
  qty: number;
  price: number;
  /** Catalog fields copied onto a staff invoice line. Booking totals ignore them. */
  description?: string;
  category?: string;
  bookingKind?: string;
  tier?: string;
}

function chargeCatalog(input: BookingPriceInput): StaffCatalogPackage[] {
  return input.catalog ?? packagesForStaffEditor([]);
}

function catalogMatchKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[—–]/g, " ")
    .replace(/\$/g, " ")
    .replace(/[_/]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTrailingPrice(key: string): string {
  return key.replace(/\s+\d+\s+video$/, "").replace(/\s+\d[\d\s]*$/, "").trim();
}

function labeledPrice(raw: string): number | undefined {
  const match = raw.match(/\$\s*([0-9][0-9,]*)/);
  if (!match) return undefined;
  const amount = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(amount) ? amount : undefined;
}

function findCatalogItem(catalog: StaffCatalogPackage[], id: string): StaffCatalogPackage | undefined {
  const key = id.trim();
  if (!key) return undefined;
  const active = catalog.filter((item) => item.isActive !== false);
  const direct = active.find((item) => item.id === key || item.bookingId === key);
  if (direct) return direct;

  const wanted = catalogMatchKey(key);
  const stripped = stripTrailingPrice(wanted);
  const matches = active.filter((item) => {
    const name = catalogMatchKey(item.name);
    const title = item.cardTitle ? catalogMatchKey(item.cardTitle) : "";
    return name === wanted || name === stripped || (title !== "" && (title === wanted || title === stripped));
  });
  if (matches.length === 1) return matches[0];
  const price = labeledPrice(key);
  if (price == null) return undefined;
  const priced = matches.filter((item) => item.price === price);
  return priced.length === 1 ? priced[0] : undefined;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function catalogLineName(pkg: StaffCatalogPackage, qty = 1): string {
  if (pkg.id === "virtual-staging" || pkg.bookingId === "virtual-staging") {
    return qty === 1 ? pkg.name : `${pkg.name} (${qty} credits)`;
  }
  if (pkg.appointmentLimit && !pkg.name.includes(pkg.appointmentLimit)) {
    return `${pkg.name} (${pkg.appointmentLimit})`;
  }
  return pkg.name;
}

function catalogLine(pkg: StaffCatalogPackage, qty = 1): BookingLineItem {
  const count = qty > 0 ? qty : 1;
  const unitPrice = roundMoney(pkg.price);
  const line: BookingLineItem = {
    id: pkg.bookingId || pkg.id,
    name: catalogLineName(pkg, count),
    unitPrice,
    qty: count,
    price: roundMoney(unitPrice * count),
  };
  if (pkg.description) line.description = pkg.description;
  if (pkg.category) line.category = pkg.category;
  if (pkg.bookingKind) line.bookingKind = pkg.bookingKind;
  if (pkg.tier) line.tier = pkg.tier;
  return line;
}

function pushCatalogLine(items: BookingLineItem[], pkg: StaffCatalogPackage, qty = 1): void {
  items.push(catalogLine(pkg, qty));
}

function warnUncatalogedPackage(name: string, price: number): void {
  console.warn(`[Bookings] Package not in catalog; keeping submitted line "${name}" at ${price}.`);
}

/** True once the customer has picked something the catalog can price. */
export function hasBookingSelection(input: BookingPriceInput): boolean {
  const explicitCatalog = input.catalog;
  const catalog = explicitCatalog ?? packagesForStaffEditor([]);
  const known = (id?: string) => {
    const key = String(id || "").trim();
    if (!key) return false;
    const item = findCatalogItem(catalog, key);
    if (item) return catalogPriceIsBookable(item.price);
    return explicitCatalog ? false : true;
  };
  const pricedUpgrade = (id: string) => {
    const item = findCatalogItem(catalog, id);
    return item ? catalogPriceIsBookable(item.price) : !explicitCatalog;
  };
  if (known(input.selectedService)) return true;
  if ((input.selectedBasics || []).some((id) => known(id))) return true;
  if ((input.selectedAddOns || []).some((id) => known(id))) return true;
  if (input.premiumUpgrade && pricedUpgrade("iconic-finish")) return true;
  if ((input.virtualStagingCredits || 0) > 0 && pricedUpgrade("virtual-staging")) return true;
  if (input.specializedPhotography === "social") return pricedUpgrade("specialized-social");
  if (input.specializedPhotography === "both") return pricedUpgrade("specialized-both");
  return false;
}

export function calculateSidebarTotal(input: BookingPriceInput): number {
  void input.lifeOfTheListingCare;
  const items = buildSubmittedLineItems({ ...input, promo: null });
  let total = sumLineItemPrices(items);
  if (input.promo) total = Math.max(0, total - input.promo.discount);
  return roundMoney(total);
}

export function buildSubmittedLineItems(input: BookingPriceInput): BookingLineItem[] {
  void input.lifeOfTheListingCare;
  const catalog = chargeCatalog(input);
  const items: BookingLineItem[] = [];
  const seen = new Set<string>();
  const pushOnce = (pkg: StaffCatalogPackage | undefined, qty = 1) => {
    if (!pkg) return;
    const key = pkg.bookingId || pkg.id;
    if (seen.has(key)) return;
    seen.add(key);
    pushCatalogLine(items, pkg, qty);
  };

  pushOnce(findCatalogItem(catalog, input.selectedService || ""));

  for (const id of input.selectedBasics || []) {
    pushOnce(findCatalogItem(catalog, id));
  }

  for (const id of input.selectedAddOns || []) {
    pushOnce(findCatalogItem(catalog, id));
  }

  if (input.premiumUpgrade) pushOnce(findCatalogItem(catalog, "iconic-finish"));

  const credits = input.virtualStagingCredits || 0;
  if (credits > 0) pushOnce(findCatalogItem(catalog, "virtual-staging"), credits);

  if (input.specializedPhotography === "social") pushOnce(findCatalogItem(catalog, "specialized-social"));
  if (input.specializedPhotography === "both") pushOnce(findCatalogItem(catalog, "specialized-both"));

  if (input.promo) {
    items.push({
      id: `promo-${input.promo.code}`,
      name: `Promo Code: ${input.promo.code}`,
      unitPrice: -input.promo.discount,
      qty: 1,
      price: -input.promo.discount,
    });
  }

  return items;
}

export function sumLineItemPrices(items: Array<{ price: number }>): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}

/** Same formatting as booking email Order Total and SMS Estimated total. */
export function orderTotalLabel(value: unknown): string {
  return `$${(Number(value) || 0).toFixed(2)}`;
}

/**
 * Promo is one subtraction. When the negative promo line is already in
 * lineItems, do not also subtract promoDiscount in a display row.
 */
export function separatePromoDiscount(
  lineItems: Array<{ id?: string; name?: string; price?: number }>,
  promoDiscount: unknown,
): number {
  const discount = Number(promoDiscount) || 0;
  if (discount <= 0) return 0;
  const alreadyOnALine = lineItems.some((item) => {
    const name = String(item.name || "");
    const id = String(item.id || "");
    return name.startsWith("Promo Code:") || id.startsWith("promo-");
  });
  return alreadyOnALine ? 0 : discount;
}

export function normalizeBookingLineItems(items: unknown): BookingLineItem[] {
  if (!Array.isArray(items)) return [];
  return items.map((raw) => {
    const item = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const price = Number(item.price) || 0;
    const qty = Number(item.qty) > 0 ? Number(item.qty) : 1;
    const unitPrice =
      item.unitPrice == null || item.unitPrice === ""
        ? price / qty
        : Number(item.unitPrice) || 0;
    const line: BookingLineItem = {
      name: String(item.name || ""),
      unitPrice,
      qty,
      price,
    };
    if (item.id != null && item.id !== "") line.id = String(item.id);
    const description = optionalLineText(item.description);
    if (description) line.description = description;
    const category = optionalLineText(item.category);
    if (category) line.category = category;
    const bookingKind = optionalLineText(item.bookingKind);
    if (bookingKind) line.bookingKind = bookingKind;
    const tier = optionalLineText(item.tier);
    if (tier) line.tier = tier;
    return line;
  });
}

function optionalLineText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function textList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => optionalLineText(entry)).filter(Boolean);
}

export interface ResolvedBookingSubmission {
  lineItems: BookingLineItem[];
  total: number;
  promoCode: string | null;
  promoDiscount: number;
  selectedService: string | null;
  selectedBasics: string[];
  selectedAddOns: string[];
  specializedPhotography: string | null;
  virtualStagingCredits: number;
  premiumUpgrade: boolean;
}

function rawPrice(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

/**
 * public/ordericonic.html posts `{ name, price }` lines and free-text package
 * labels. Those labels are not catalog ids (Hollywood, photo counts, studio,
 * and several add-ons are not in the catalog at all). When the catalog rebuild
 * has no service, keep posted lines that already have a name and a price.
 */
function pricedPostedLines(items: unknown): BookingLineItem[] {
  if (!Array.isArray(items)) return [];
  return normalizeBookingLineItems(items).filter((item, index) => {
    if (!item.name.trim()) return false;
    const raw = items[index];
    if (!raw || typeof raw !== "object") return false;
    return rawPrice((raw as Record<string, unknown>).price) !== undefined;
  });
}

function nestedTotal(pricing: unknown): number | undefined {
  if (!pricing || typeof pricing !== "object") return undefined;
  return rawPrice((pricing as { total?: unknown }).total);
}

function postedLineForLabel(label: string, posted: BookingLineItem[]): BookingLineItem | undefined {
  const wanted = catalogMatchKey(label);
  const stripped = stripTrailingPrice(wanted);
  return posted.find((item) => {
    const name = catalogMatchKey(item.name);
    return name === wanted || name === stripped || stripTrailingPrice(name) === stripped;
  });
}

function adoptPostedLine(catalog: StaffCatalogPackage[], item: BookingLineItem): BookingLineItem {
  const match = (item.id && findCatalogItem(catalog, item.id)) || findCatalogItem(catalog, item.name);
  if (match) return catalogLine(match, item.qty);
  warnUncatalogedPackage(item.name, item.price);
  return item;
}

function fallbackSubmittedLine(
  label: string,
  posted: BookingLineItem[],
  body: Record<string, unknown>,
): BookingLineItem | null {
  const match = postedLineForLabel(label, posted);
  const price = match?.price ?? labeledPrice(label) ?? (
    chargedServiceLines(posted).length === 0
      ? rawPrice(body.total) ?? nestedTotal(body.pricing)
      : undefined
  );
  if (price == null) return null;
  const name = match?.name?.trim() || label;
  warnUncatalogedPackage(name, price);
  return {
    name,
    unitPrice: match?.unitPrice ?? price,
    qty: match?.qty || 1,
    price,
  };
}

function insertServiceLine(items: BookingLineItem[], line: BookingLineItem): BookingLineItem[] {
  const key = catalogMatchKey(line.name);
  if (items.some((item) => catalogMatchKey(item.name) === key || catalogMatchKey(item.id || "") === key)) {
    return items;
  }
  const promoAt = items.findIndex((item) => {
    const id = String(item.id || "");
    return id.startsWith("promo-") || item.name.startsWith("Promo Code:");
  });
  if (promoAt === -1) return [...items, line];
  return [...items.slice(0, promoAt), line, ...items.slice(promoAt)];
}

/**
 * Rebuild a public booking from the catalog.
 * Client line prices are ignored when a catalog id matches. Selection ids, and
 * catalog ids already on the posted lines, are priced from `catalog` (the seed
 * catalog when omitted). If that rebuild has no service, posted name+price
 * lines are kept so the temporary order page can submit.
 */
export function resolveSubmittedBooking(
  body: Record<string, unknown>,
  catalog?: StaffCatalogPackage[],
): ResolvedBookingSubmission {
  const list = catalog ?? packagesForStaffEditor([]);
  const posted = normalizeBookingLineItems(body.lineItems);
  const postedIds = posted.map((item) => item.id).filter((id): id is string => Boolean(id));
  const kindIds = (kind: StaffCatalogPackage["bookingKind"]) =>
    postedIds.filter((id) => findCatalogItem(list, id)?.bookingKind === kind);

  const selectedService = optionalLineText(body.selectedService)
    || kindIds("service")[0]
    || "";
  const selectedBasics = [...new Set([...textList(body.selectedBasics), ...kindIds("basic")])]
    .filter((id) => id !== selectedService);
  const claimed = new Set([selectedService, ...selectedBasics]);
  const selectedAddOns = [...new Set([...textList(body.selectedAddOns), ...kindIds("addon")])]
    .filter((id) => !claimed.has(id));
  const premiumUpgrade = body.premiumUpgrade === true || postedIds.includes("iconic-finish");
  const creditsBody = Number(body.virtualStagingCredits);
  const creditsLine = posted.find((item) => item.id === "virtual-staging")?.qty || 0;
  const virtualStagingCredits = Number.isFinite(creditsBody) && creditsBody > 0
    ? Math.round(creditsBody)
    : creditsLine;

  let specialized = optionalLineText(body.specializedPhotography);
  if (specialized !== "social" && specialized !== "both" && specialized !== "mls") {
    if (postedIds.includes("specialized-both")) specialized = "both";
    else if (postedIds.includes("specialized-social")) specialized = "social";
    else specialized = "";
  }

  const promo = promoDiscountFor(optionalLineText(body.promoCode));
  let lineItems = buildSubmittedLineItems({
    selectedService,
    selectedBasics,
    selectedAddOns,
    premiumUpgrade,
    virtualStagingCredits,
    specializedPhotography: specialized,
    promo,
    lifeOfTheListingCare: Boolean(body.lifeOfTheListingCare),
    catalog: list,
  });

  const pricedPosted = pricedPostedLines(body.lineItems);
  const unresolved = [selectedService, ...selectedBasics, ...selectedAddOns]
    .filter((label) => label && !findCatalogItem(list, label));
  for (const label of unresolved) {
    const fallback = fallbackSubmittedLine(label, pricedPosted, body);
    if (!fallback) continue;
    lineItems = insertServiceLine(lineItems, fallback);
  }

  if (chargedServiceLines(lineItems).length === 0) {
    const temporary = pricedPosted.map((item) => adoptPostedLine(list, item));
    const alreadyDiscounted = temporary.some((item) => {
      const id = String(item.id || "");
      return id.startsWith("promo-") || item.name.startsWith("Promo Code:");
    });
    if (chargedServiceLines(temporary).length > 0) {
      lineItems = promo && !alreadyDiscounted
        ? [
            ...temporary,
            {
              id: `promo-${promo.code}`,
              name: `Promo Code: ${promo.code}`,
              unitPrice: -promo.discount,
              qty: 1,
              price: -promo.discount,
            },
          ]
        : temporary;
    }
  }

  if (chargedServiceLines(lineItems).length === 0 && selectedService) {
    const submitted = rawPrice(body.total) ?? nestedTotal(body.pricing) ?? labeledPrice(selectedService);
    if (submitted != null) {
      const name = selectedService;
      warnUncatalogedPackage(name, submitted);
      lineItems = insertServiceLine(lineItems, {
        name,
        unitPrice: submitted,
        qty: 1,
        price: submitted,
      });
    }
  }

  return {
    lineItems,
    total: roundMoney(sumLineItemPrices(lineItems)),
    promoCode: promo?.code ?? null,
    promoDiscount: promo?.discount ?? 0,
    selectedService: selectedService || null,
    selectedBasics,
    selectedAddOns,
    specializedPhotography: specialized || null,
    virtualStagingCredits,
    premiumUpgrade,
  };
}

export function chargedServiceLines<T extends { id?: string; name?: string }>(items: T[]): T[] {
  return items.filter((item) => {
    const id = String(item.id || "");
    const name = String(item.name || "");
    return !id.startsWith("promo-") && !name.startsWith("Promo Code:");
  });
}

function joinCatalogNames(names: string[]): string {
  if (names.length <= 1) return names[0] || "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

/**
 * Names a catalog package or add-on on this booking whose price is $0 or missing.
 * Returns null when every matched catalog item has a price the form can charge.
 * Uncataloged lines, including the temporary order page, are left alone.
 */
export function unpricedCatalogBookingError(
  body: Record<string, unknown>,
  catalog?: StaffCatalogPackage[],
): string | null {
  const list = catalog ?? packagesForStaffEditor([]);
  const names = new Set<string>();
  const consider = (raw: unknown) => {
    if (typeof raw !== "string") return;
    const item = findCatalogItem(list, raw);
    if (item && !catalogPriceIsBookable(item.price)) names.add(item.name);
  };

  consider(body.selectedService);
  for (const id of textList(body.selectedBasics)) consider(id);
  for (const id of textList(body.selectedAddOns)) consider(id);
  if (body.premiumUpgrade === true) consider("iconic-finish");
  const credits = Number(body.virtualStagingCredits);
  if (Number.isFinite(credits) && credits > 0) consider("virtual-staging");
  const specialized = optionalLineText(body.specializedPhotography);
  if (specialized === "social") consider("specialized-social");
  if (specialized === "both") consider("specialized-both");

  if (Array.isArray(body.lineItems)) {
    for (const raw of body.lineItems) {
      if (!raw || typeof raw !== "object") continue;
      const item = raw as Record<string, unknown>;
      consider(item.id);
      consider(item.name);
    }
  }

  for (const line of chargedServiceLines(resolveSubmittedBooking(body, list).lineItems)) {
    consider(line.id);
    consider(line.name);
  }

  if (names.size === 0) return null;
  const listNames = [...names];
  const verb = listNames.length === 1 ? "is" : "are";
  return `${joinCatalogNames(listNames)} ${verb} not available to book until a price is set. ${CALL_FOR_PRICING_LABEL}.`;
}
