/**
 * Public Iconic Studios landing. Founding Pass amounts are drafts.
 * They are stored as labels for the office, not as a charge.
 */

import {
  cleanText,
  formatUsd,
  isHoneypot,
  phoneDigits,
  PUBLIC_PROCESSING_NOTE,
  validEmail,
  validIsoDate,
  validPhone,
  validTime,
} from "./publicRequests.ts";

export const STUDIOS_PATH = "/studios";
export const STUDIOS_NAME = "Iconic Studios";
export const STUDIOS_PLACE = "Studio 105";
export const STUDIOS_SOURCE = "iconic-studios";
export const STUDIOS_CALENDAR_NOTE =
  "Availability will use the studio calendars. No studio calendar is connected on this page yet, so the office confirms the time from this request.";
export const FOUNDING_PASS_DRAFT_LABEL = "DRAFT — prices pending";
export const FOUNDING_PASS_NOT_FINAL = "These monthly amounts are not final.";

export type StudioRoomId = "noir" | "blanc" | "both";
export type FoundingPassId = "backstage" | "vip" | "headliner";
export type StudioLengthId = "30" | "60" | "120" | "240";

export const STUDIO_ROOMS: readonly {
  id: StudioRoomId;
  name: string;
  vibe: string;
  teaser: string;
}[] = [
  {
    id: "noir",
    name: "Studio Noir",
    vibe: "Dark / dramatic",
    teaser: "A controlled black room for portraits with edge, brand films, and frames that need mood.",
  },
  {
    id: "blanc",
    name: "Studio Blanc",
    vibe: "Bright / white",
    teaser: "A clean white room for crisp headshots, bright product, and holiday minis.",
  },
  {
    id: "both",
    name: "Both rooms",
    vibe: "Noir and Blanc",
    teaser: "Use Studio Noir and Studio Blanc in the same visit.",
  },
];

export const STUDIO_LENGTHS: readonly { id: StudioLengthId; label: string; minutes: number }[] = [
  { id: "30", label: "30 minutes", minutes: 30 },
  { id: "60", label: "1 hour", minutes: 60 },
  { id: "120", label: "2 hours", minutes: 120 },
  { id: "240", label: "4 hours", minutes: 240 },
];

export const FOUNDING_PASSES: readonly {
  id: FoundingPassId;
  name: string;
  draftMonthly: number;
}[] = [
  { id: "backstage", name: "Backstage", draftMonthly: 199 },
  { id: "vip", name: "VIP", draftMonthly: 499 },
  { id: "headliner", name: "Headliner", draftMonthly: 999 },
];

export function studioRoom(id: string) {
  return STUDIO_ROOMS.find((room) => room.id === id);
}

export function studioLength(id: string) {
  return STUDIO_LENGTHS.find((item) => item.id === id);
}

export function foundingPass(id: string) {
  return FOUNDING_PASSES.find((pass) => pass.id === id);
}

export function formatDraftMonthly(amount: number): string {
  return `${formatUsd(amount)}/mo`;
}

type LineItem = { id: string; name: string; qty: number; unitPrice: number; price: number };

export type StudiosRequestRecord = {
  clientName: string;
  email: string;
  clientEmail: string;
  phone: string;
  clientPhone: string;
  title: string;
  selectedService: string;
  requestKind: "session" | "pass";
  roomId: StudioRoomId | "";
  roomName: string;
  passId: FoundingPassId | "";
  passName: string;
  draftMonthly: number | null;
  priceStatus: "quote-pending" | "draft";
  lengthId: StudioLengthId | "";
  lengthLabel: string;
  lineItems: LineItem[];
  subtotal: number;
  processing: number;
  total: number;
  pricing: { subtotal: number; tax: number; processing: number; total: number };
  scheduledDate: string;
  scheduledTime: string;
  requestedDate: string;
  address: string;
  propertyAddress: string;
  notes: string;
  vibeNote: string;
  source: typeof STUDIOS_SOURCE;
  leadSource: string;
  officeFlag: true;
  needsOfficeReview: true;
  clientEmailSent: false;
  payLinkOffered: false;
  calendarConnected: false;
};

export type StudiosParseResult =
  | { ok: true; record: StudiosRequestRecord }
  | { ok: false; error: string; honeypot?: boolean };

function baseRecord(input: {
  name: string;
  email: string;
  phone: string;
  notes: string;
  kind: "session" | "pass";
}): Pick<
  StudiosRequestRecord,
  | "clientName"
  | "email"
  | "clientEmail"
  | "phone"
  | "clientPhone"
  | "notes"
  | "requestKind"
  | "subtotal"
  | "processing"
  | "total"
  | "pricing"
  | "address"
  | "propertyAddress"
  | "source"
  | "officeFlag"
  | "needsOfficeReview"
  | "clientEmailSent"
  | "payLinkOffered"
  | "calendarConnected"
> {
  return {
    clientName: input.name,
    email: input.email,
    clientEmail: input.email,
    phone: input.phone,
    clientPhone: phoneDigits(input.phone),
    notes: input.notes,
    requestKind: input.kind,
    subtotal: 0,
    processing: 0,
    total: 0,
    pricing: { subtotal: 0, tax: 0, processing: 0, total: 0 },
    address: STUDIOS_PLACE,
    propertyAddress: STUDIOS_PLACE,
    source: STUDIOS_SOURCE,
    officeFlag: true,
    needsOfficeReview: true,
    clientEmailSent: false,
    payLinkOffered: false,
    calendarConnected: false,
  };
}

export function parseStudiosRequest(input: unknown): StudiosParseResult {
  const body = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  if (isHoneypot(body.website)) return { ok: false, error: "Request received.", honeypot: true };

  const name = cleanText(body.name, 80);
  if (name.length < 2) return { ok: false, error: "Enter your name." };
  const email = cleanText(body.email, 120).toLowerCase();
  if (!validEmail(email)) return { ok: false, error: "Enter a valid email." };
  const phone = cleanText(body.phone, 30);
  if (!validPhone(phone)) return { ok: false, error: "Enter a phone number." };
  const notes = cleanText(body.notes, 800);
  const kind = cleanText(body.kind, 20);
  if (kind !== "session" && kind !== "pass") return { ok: false, error: "Choose a studio time or a founding pass." };

  if (kind === "pass") {
    const pass = foundingPass(cleanText(body.passId, 40));
    if (!pass) return { ok: false, error: "Choose a founding pass." };
    const preferredDate = cleanText(body.preferredDate, 10);
    if (preferredDate && !validIsoDate(preferredDate)) return { ok: false, error: "Choose a date." };
    const record: StudiosRequestRecord = {
      ...baseRecord({ name, email, phone, notes, kind: "pass" }),
      title: `Founding Pass ${pass.name} (${FOUNDING_PASS_DRAFT_LABEL})`,
      selectedService: `Founding Pass ${pass.name}`,
      roomId: "",
      roomName: "",
      passId: pass.id,
      passName: pass.name,
      draftMonthly: pass.draftMonthly,
      priceStatus: "draft",
      lengthId: "",
      lengthLabel: "",
      lineItems: [{
        id: "pass",
        name: `Founding Pass ${pass.name} (${FOUNDING_PASS_DRAFT_LABEL} ${formatDraftMonthly(pass.draftMonthly)})`,
        qty: 1,
        unitPrice: 0,
        price: 0,
      }],
      scheduledDate: preferredDate,
      scheduledTime: "",
      requestedDate: preferredDate,
      leadSource: "Iconic Studios founding pass",
      vibeNote: [
        "Iconic Studios founding pass request",
        FOUNDING_PASS_DRAFT_LABEL,
        FOUNDING_PASS_NOT_FINAL,
        `Listed draft rate ${formatDraftMonthly(pass.draftMonthly)}`,
        PUBLIC_PROCESSING_NOTE,
        "Not a charge. No pay link was invented.",
        "Office flag: review this request.",
        "Client email was not sent.",
        notes,
      ].filter(Boolean).join("\n"),
    };
    return { ok: true, record };
  }

  const room = studioRoom(cleanText(body.roomId, 20));
  if (!room) return { ok: false, error: "Choose a room." };
  const preferredDate = cleanText(body.preferredDate, 10);
  if (!validIsoDate(preferredDate)) return { ok: false, error: "Choose a date." };
  const preferredTime = cleanText(body.preferredTime, 5);
  if (!validTime(preferredTime)) return { ok: false, error: "Choose a start time." };
  const length = studioLength(cleanText(body.lengthId, 10));
  if (!length) return { ok: false, error: "Choose a session length." };

  const record: StudiosRequestRecord = {
    ...baseRecord({ name, email, phone, notes, kind: "session" }),
    title: `${room.name} · ${length.label}`,
    selectedService: room.name,
    roomId: room.id,
    roomName: room.name,
    passId: "",
    passName: "",
    draftMonthly: null,
    priceStatus: "quote-pending",
    lengthId: length.id,
    lengthLabel: length.label,
    lineItems: [{
      id: "session",
      name: `${room.name} request (${length.label})`,
      qty: 1,
      unitPrice: 0,
      price: 0,
    }],
    scheduledDate: preferredDate,
    scheduledTime: preferredTime,
    requestedDate: preferredDate,
    leadSource: "Iconic Studios calendar request",
    vibeNote: [
      "Iconic Studios session request",
      `Room: ${room.name}`,
      `Length: ${length.label}`,
      STUDIOS_CALENDAR_NOTE,
      "Rate is confirmed by the office.",
      PUBLIC_PROCESSING_NOTE,
      "Not a charge. No pay link was invented.",
      "Office flag: review this request.",
      "Client email was not sent.",
      notes,
    ].filter(Boolean).join("\n"),
  };
  return { ok: true, record };
}
