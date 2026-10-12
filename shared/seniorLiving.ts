import { assessTravel, travelInvoiceLine, type TravelAssessment } from "./travelZones.ts";

/**
 * Senior living campaign pricing and request shape.
 *
 * SENIOR_FACILITY_RATE_PER_SQFT is the only per-square-foot rate.
 * The page renders that constant. Do not copy the number into a component.
 */

export const SENIOR_FACILITY_RATE_PER_SQFT = 0.05;

export const SENIOR_TOUR_PRICE = 250;
export const SENIOR_TOUR_SQFT_CAP = 3_000;

export const SENIOR_ROOM_RATES = [
  { minCount: 1, maxCount: 10, each: 199 },
  { minCount: 11, maxCount: 20, each: 175 },
] as const;

export const SENIOR_FACILITY_SQFT_CAP = 20_000;

export const SENIOR_LIVING_REQUESTS = "seniorLivingRequests";

/** Office inbox for this campaign. Added through the existing office notify helper. */
export const SENIOR_LIVING_OPS_EMAIL = "ops@iconicimagestx.com";

/** Senior living only. Other bookings still pay after the shoot. */
export const SENIOR_LIVING_DEPOSIT_REQUIRED = true;
export const SENIOR_LIVING_DEPOSIT_PERCENT = 50;
export const SENIOR_LIVING_DEPOSIT_LINE =
  "Reserve your date with a 50% deposit. The balance is due after the shoot.";

/** Added on top of services and travel. Senior living orders only. */
export const SENIOR_LIVING_PROCESSING_RATE = 0.028;
export const SENIOR_LIVING_PROCESSING_LABEL = "Processing fee (2.8%)";

/** Same static list BookingForm offers. Not a live calendar. */
export const SENIOR_LIVING_SCHEDULE_TIMES = [
  "9:00 AM",
  "11:00 AM",
  "1:00 PM",
  "3:00 PM",
  "5:00 PM",
] as const;

export const SENIOR_LIVING_ORDER_SOURCE = "senior-living";

export const SENIOR_LIVING_SERVICE_IDS = [
  "tour-3d",
  "rooms",
  "facility",
] as const;

export type SeniorLivingServiceId = (typeof SENIOR_LIVING_SERVICE_IDS)[number];

export const SENIOR_LIVING_SERVICE_LABELS: Record<
  SeniorLivingServiceId,
  string
> = {
  "tour-3d": "3D tour",
  rooms: "Rooms/units",
  facility: "Whole-building facility",
};

const SERVICE_ID_SET = new Set<string>(SENIOR_LIVING_SERVICE_IDS);

export interface NormalizedSeniorLivingRequest {
  name: string;
  community: string;
  email: string;
  phone: string;
  address: string;
  services: SeniorLivingServiceId[];
  preferredDates: string;
  notes: string;
}

export type SeniorLivingParseResult =
  | { ok: true; value: NormalizedSeniorLivingRequest }
  | { ok: false; honeypot: true }
  | { ok: false; honeypot: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function oneLine(value: string, max: number): string {
  return value
    .replace(/[\r\n\u0000]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function formatUsd(amount: number): string {
  const whole = Number.isInteger(amount);
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export function formatSeniorFacilityRate(
  rate = SENIOR_FACILITY_RATE_PER_SQFT,
): string {
  return formatUsd(rate);
}

export function parseSeniorLivingRequest(
  body: unknown,
): SeniorLivingParseResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, honeypot: false, error: "That request could not be read." };
  }
  const raw = body as Record<string, unknown>;
  const trap = text(raw.companyWebsite);
  if (trap) return { ok: false, honeypot: true };

  const name = oneLine(text(raw.name), 80);
  const community = oneLine(text(raw.community), 120);
  const email = oneLine(text(raw.email), 120);
  const phone = oneLine(text(raw.phone), 30);
  const address = oneLine(text(raw.address), 200);
  const preferredDates = oneLine(text(raw.preferredDates), 160);
  const notes = text(raw.notes)
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, 2000);

  if (name.length < 2) return { ok: false, honeypot: false, error: "Enter your name." };
  if (text(raw.name).trim().length > 80)
    return { ok: false, honeypot: false, error: "Name is too long." };
  if (community.length < 2)
    return { ok: false, honeypot: false, error: "Enter the community name." };
  if (text(raw.community).trim().length > 120)
    return { ok: false, honeypot: false, error: "Community name is too long." };
  if (!EMAIL_RE.test(email))
    return { ok: false, honeypot: false, error: "Enter a valid email." };
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15)
    return { ok: false, honeypot: false, error: "Enter a phone number." };
  if (address.length < 5)
    return { ok: false, honeypot: false, error: "Enter the community address." };
  if (text(raw.address).trim().length > 200)
    return { ok: false, honeypot: false, error: "Address is too long." };
  if (preferredDates.length < 2)
    return { ok: false, honeypot: false, error: "Enter preferred dates." };
  if (text(raw.preferredDates).trim().length > 160)
    return { ok: false, honeypot: false, error: "Preferred dates are too long." };
  if (text(raw.notes).trim().length > 2000)
    return { ok: false, honeypot: false, error: "Notes are too long." };

  const servicesRaw = Array.isArray(raw.services) ? raw.services : [];
  const services: SeniorLivingServiceId[] = [];
  for (const entry of servicesRaw) {
    const id = text(entry);
    if (!id) continue;
    if (!SERVICE_ID_SET.has(id))
      return { ok: false, honeypot: false, error: "Choose a listed service." };
    if (!services.includes(id as SeniorLivingServiceId))
      services.push(id as SeniorLivingServiceId);
  }
  if (services.length === 0)
    return { ok: false, honeypot: false, error: "Choose at least one service." };

  return {
    ok: true,
    value: {
      name,
      community,
      email,
      phone,
      address,
      services,
      preferredDates,
      notes,
    },
  };
}

export function seniorLivingServiceLabels(
  services: readonly SeniorLivingServiceId[],
): string {
  return services.map((id) => SENIOR_LIVING_SERVICE_LABELS[id]).join(", ");
}

/**
 * Saved request shaped so the office new-order email can read it.
 * The client address is on the record so the notify helper can keep it off the To line.
 */
export function seniorLivingOfficeRecord(
  id: string,
  value: NormalizedSeniorLivingRequest,
): Record<string, unknown> {
  const serviceLabels = seniorLivingServiceLabels(value.services);
  const noteLines = [
    "Quote request. Not invoiced.",
    `Deposit required: ${SENIOR_LIVING_DEPOSIT_REQUIRED ? "yes" : "no"}`,
    `Deposit percent: ${SENIOR_LIVING_DEPOSIT_PERCENT}`,
    SENIOR_LIVING_DEPOSIT_LINE,
    `Community: ${value.community}`,
    `Services: ${serviceLabels}`,
    `Preferred dates: ${value.preferredDates}`,
    value.notes,
  ].filter(Boolean);
  return {
    id,
    kind: "senior-living-request",
    depositRequired: SENIOR_LIVING_DEPOSIT_REQUIRED,
    depositPercent: SENIOR_LIVING_DEPOSIT_PERCENT,
    clientName: value.name,
    email: value.email,
    clientEmail: value.email,
    phone: value.phone,
    clientPhone: value.phone,
    community: value.community,
    address: value.address,
    propertyAddress: value.address,
    services: value.services,
    serviceLabels: value.services.map(
      (serviceId) => SENIOR_LIVING_SERVICE_LABELS[serviceId],
    ),
    preferredDates: value.preferredDates,
    requestedDate: value.preferredDates,
    notes: value.notes,
    vibeNote: noteLines.join("\n"),
    selectedService: `Senior Living (${serviceLabels})`,
    lineItems: [
      {
        id: "senior-living",
        name: `Senior Living (${serviceLabels})`,
        qty: 1,
        price: 0,
      },
    ],
    leadSource: "Senior living page",
  };
}

/** Existing office recipients, plus the ops inbox, without dropping a configured staff address. */
export function seniorLivingOfficeEnv(
  env: Record<string, string | undefined> = process.env,
): Record<string, string | undefined> {
  const parts = String(env.ADMIN_EMAIL || "")
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.some((part) => part.toLowerCase() === SENIOR_LIVING_OPS_EMAIL)) {
    parts.push(SENIOR_LIVING_OPS_EMAIL);
  }
  return { ...env, ADMIN_EMAIL: parts.join(", ") };
}

export interface SeniorLivingLine {
  id: string;
  name: string;
  qty: number;
  unitPrice: number;
  price: number;
}

export interface SeniorLivingQuote {
  lines: SeniorLivingLine[];
  serviceSubtotal: number;
  travel: TravelAssessment;
  travelLine: SeniorLivingLine;
  processing: number;
  total: number;
  depositAmount: number;
  balanceDue: number;
}

export interface SeniorLivingOrderInput {
  tour: boolean;
  roomCount: number;
  facilitySqft: number;
  community: string;
  address: string;
  name: string;
  title: string;
  phone: string;
  email: string;
  onsiteContact: string;
  notes: string;
  scheduledDate: string;
  scheduledTime: string;
}

function cents(amount: number): number {
  return Math.round(amount * 100);
}

function dollars(amountCents: number): number {
  return amountCents / 100;
}

export function seniorRoomUnitPrice(count: number): number | null {
  if (!Number.isInteger(count) || count < 1) return null;
  const tier = SENIOR_ROOM_RATES.find(
    (band) => count >= band.minCount && count <= band.maxCount,
  );
  return tier ? tier.each : null;
}

export function quoteSeniorLivingOrder(input: {
  tour: boolean;
  roomCount: number;
  facilitySqft: number;
  address: string;
}): { ok: true; quote: SeniorLivingQuote } | { ok: false; error: string } {
  const lines: SeniorLivingLine[] = [];
  if (input.tour) {
    lines.push({
      id: "tour-3d",
      name: SENIOR_LIVING_SERVICE_LABELS["tour-3d"],
      qty: 1,
      unitPrice: SENIOR_TOUR_PRICE,
      price: SENIOR_TOUR_PRICE,
    });
  }
  const roomCount = input.roomCount;
  if (roomCount !== 0) {
    if (!Number.isInteger(roomCount) || roomCount < 0) {
      return { ok: false, error: "Enter a room count from 0 to 20." };
    }
    if (roomCount > SENIOR_ROOM_RATES[SENIOR_ROOM_RATES.length - 1].maxCount) {
      return { ok: false, error: "Room count cannot be more than 20." };
    }
    const each = seniorRoomUnitPrice(roomCount);
    if (each == null) {
      return { ok: false, error: "Enter a room count from 0 to 20." };
    }
    lines.push({
      id: "rooms",
      name: SENIOR_LIVING_SERVICE_LABELS.rooms,
      qty: roomCount,
      unitPrice: each,
      price: dollars(cents(each) * roomCount),
    });
  }
  const facilitySqft = input.facilitySqft;
  if (facilitySqft !== 0) {
    if (!Number.isInteger(facilitySqft) || facilitySqft < 0) {
      return { ok: false, error: "Enter a facility size up to 20,000 sq ft." };
    }
    if (facilitySqft > SENIOR_FACILITY_SQFT_CAP) {
      return { ok: false, error: "Facility size cannot be more than 20,000 sq ft." };
    }
    const price = dollars(Math.round(facilitySqft * SENIOR_FACILITY_RATE_PER_SQFT * 100));
    lines.push({
      id: "facility",
      name: SENIOR_LIVING_SERVICE_LABELS.facility,
      qty: 1,
      unitPrice: price,
      price,
    });
  }
  if (lines.length === 0) {
    return { ok: false, error: "Choose at least one service." };
  }

  const serviceSubtotal = dollars(
    lines.reduce((sum, line) => sum + cents(line.price), 0),
  );
  const travel = assessTravel(input.address);
  const travelItem = travelInvoiceLine(travel);
  const travelLine: SeniorLivingLine = {
    id: travelItem.id,
    name: travelItem.name,
    qty: travelItem.qty,
    unitPrice: travelItem.unitPrice,
    price: travelItem.price,
  };
  const priced = cents(serviceSubtotal) + cents(travelLine.price);
  const processing = dollars(Math.round(priced * SENIOR_LIVING_PROCESSING_RATE));
  const total = dollars(priced + cents(processing));
  const depositAmount = dollars(
    Math.round(cents(total) * (SENIOR_LIVING_DEPOSIT_PERCENT / 100)),
  );
  const balanceDue = dollars(cents(total) - cents(depositAmount));
  return {
    ok: true,
    quote: {
      lines,
      serviceSubtotal,
      travel,
      travelLine,
      processing,
      total,
      depositAmount,
      balanceDue,
    },
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseSeniorLivingOrder(
  body: unknown,
):
  | { ok: true; value: SeniorLivingOrderInput; quote: SeniorLivingQuote }
  | { ok: false; honeypot: true }
  | { ok: false; honeypot: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, honeypot: false, error: "That order could not be read." };
  }
  const raw = body as Record<string, unknown>;
  if (text(raw.companyWebsite)) return { ok: false, honeypot: true };

  const roomCount = raw.roomCount == null || raw.roomCount === "" ? 0 : Number(raw.roomCount);
  const facilitySqft =
    raw.facilitySqft == null || raw.facilitySqft === "" ? 0 : Number(raw.facilitySqft);
  const quoted = quoteSeniorLivingOrder({
    tour: raw.tour === true,
    roomCount,
    facilitySqft,
    address: text(raw.address),
  });
  if (quoted.ok === false) return { ok: false, honeypot: false, error: quoted.error };
  if (quoted.quote.travel.travelQuoted) {
    return {
      ok: false,
      honeypot: false,
      error: "We could not price travel for that address. Call us and we will quote the trip.",
    };
  }

  const name = oneLine(text(raw.name), 80);
  const community = oneLine(text(raw.community), 120);
  const title = oneLine(text(raw.title), 80);
  const email = oneLine(text(raw.email), 120);
  const phone = oneLine(text(raw.phone), 30);
  const address = oneLine(text(raw.address), 200);
  const onsiteContact = oneLine(text(raw.onsiteContact), 120);
  const notes = text(raw.notes).replace(/\u0000/g, "").trim().slice(0, 2000);
  const scheduledDate = oneLine(text(raw.scheduledDate), 10);
  const scheduledTime = oneLine(text(raw.scheduledTime), 20);

  if (name.length < 2) return { ok: false, honeypot: false, error: "Enter your name." };
  if (community.length < 2) return { ok: false, honeypot: false, error: "Enter the community name." };
  if (title.length < 2) return { ok: false, honeypot: false, error: "Enter your title." };
  if (!EMAIL_RE.test(email)) return { ok: false, honeypot: false, error: "Enter a valid email." };
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) {
    return { ok: false, honeypot: false, error: "Enter a phone number." };
  }
  if (address.length < 5) return { ok: false, honeypot: false, error: "Enter the community address." };
  if (onsiteContact.length < 2) {
    return { ok: false, honeypot: false, error: "Enter the onsite contact." };
  }
  if (!DATE_RE.test(scheduledDate) || Number.isNaN(Date.parse(`${scheduledDate}T12:00:00`))) {
    return { ok: false, honeypot: false, error: "Choose a date." };
  }
  const chosen = new Date(`${scheduledDate}T12:00:00`);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (chosen < start) return { ok: false, honeypot: false, error: "Choose a date that has not passed." };
  if (!(SENIOR_LIVING_SCHEDULE_TIMES as readonly string[]).includes(scheduledTime)) {
    return { ok: false, honeypot: false, error: "Choose a time." };
  }

  return {
    ok: true,
    value: {
      tour: raw.tour === true,
      roomCount,
      facilitySqft,
      community,
      address,
      name,
      title,
      phone,
      email,
      onsiteContact,
      notes,
      scheduledDate,
      scheduledTime,
    },
    quote: quoted.quote,
  };
}
