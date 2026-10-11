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
    `Community: ${value.community}`,
    `Services: ${serviceLabels}`,
    `Preferred dates: ${value.preferredDates}`,
    value.notes,
  ].filter(Boolean);
  return {
    id,
    kind: "senior-living-request",
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
