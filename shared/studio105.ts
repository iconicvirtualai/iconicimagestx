/**
 * Studio 105 microsite. The room request uses the existing booking API.
 * The catalog price is $0, so the line is an uncataloged request: staff confirm
 * availability and the rate, and this page does not charge a card.
 */

import { BUSINESS_CONTACT } from "./businessContact.ts";

export const STUDIO105_PATHS = {
  home: "/studio-105",
  rooms: "/studio-105/rooms",
  noir: "/studio-105/noir",
  blanc: "/studio-105/blanc",
  podcast: "/studio-105/podcast",
  rates: "/studio-105/rates",
  faq: "/studio-105/faq",
  location: "/studio-105/location",
  book: "/studio-105/book",
} as const;

/** Subpages. /studio-105 itself stays the public SEO shell. */
export const STUDIO105_APP_SOURCES = [
  STUDIO105_PATHS.rooms,
  STUDIO105_PATHS.noir,
  STUDIO105_PATHS.blanc,
  STUDIO105_PATHS.podcast,
  STUDIO105_PATHS.rates,
  STUDIO105_PATHS.faq,
  STUDIO105_PATHS.location,
  STUDIO105_PATHS.book,
] as const;

export const STUDIO105_SEO_DESCRIPTION =
  "Studio Noir, Studio Blanc, and the Podcast setup at Studio 105 in Spring, Texas. Request a room and a time. We confirm availability and the rate.";

/** Saved on the booking as leadSource. The API uses this to skip client mail. */
export const STUDIO105_LEAD_SOURCE = "Studio 105";

export const STUDIO_ROOM_IDS = ["studio-noir", "studio-blanc", "studio-podcast"] as const;
export type StudioRoomId = (typeof STUDIO_ROOM_IDS)[number];

/** Catalog id for the podcast setup. Staff edit the price on this package. */
export const STUDIO_PODCAST_ID = "studio-podcast";

/** Admin order studio value. The orders tile already labels this Podcast Studio. */
export const STUDIO_PODCAST_ADMIN_ID = "podcast-studio";

/** Existing library still. Not a generated image. */
export const STUDIO_PODCAST_IMAGE = "/media/home-v2/lifestyle/podcast-set-wide.jpg";
export const STUDIO_PODCAST_IMAGE_ALT = "The Iconic podcast set, cameras and lights";

/**
 * Placeholder until staff set a catalog price. Same shape as Noir and Blanc:
 * price 0, no separate duration, rate confirmed when the hold is set.
 */
export const STUDIO_PODCAST_DESCRIPTION =
  "Podcast setup in Studio 105. Rate confirmed when the hold is set.";

export function podcastCatalogFields(
  packages: Array<{ id?: string; bookingId?: string; name?: string; price?: unknown; description?: string }>,
): { name: string; price: number; description: string } {
  const seed = { name: "Podcast", price: 0, description: STUDIO_PODCAST_DESCRIPTION };
  const live = packages.find((item) => item?.id === STUDIO_PODCAST_ID || item?.bookingId === STUDIO_PODCAST_ID);
  if (!live) return seed;
  const amount = typeof live.price === "number" ? live.price : Number(live.price);
  return {
    name: typeof live.name === "string" && live.name.trim() ? live.name.trim() : seed.name,
    price: Number.isFinite(amount) && amount > 0 ? amount : 0,
    description: typeof live.description === "string" && live.description.trim() ? live.description.trim() : seed.description,
  };
}

export function isStudioRoomId(value: string): value is StudioRoomId {
  return (STUDIO_ROOM_IDS as readonly string[]).includes(value);
}

/**
 * Studio 105 room requests must not send booking_received.
 * That template is excluded from the client-notice pause, so the lead source
 * is the skip. Other booking forms do not set this source.
 */
export function isStudio105Request(leadSource: unknown): boolean {
  return typeof leadSource === "string" && leadSource.trim() === STUDIO105_LEAD_SOURCE;
}

/** Same uncataloged studio line the order form already accepts. The room is in the name. */
export function studioRoomRequestName(roomName: string): string {
  return `Studio booking / pre-sale — ${roomName}`;
}

export function studioRoomRequestBody(input: {
  roomId: StudioRoomId;
  roomName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  preferredDate: string;
  preferredTime: string;
  notes: string;
}): Record<string, unknown> {
  const lineName = studioRoomRequestName(input.roomName);
  const note = [
    `Room: ${input.roomName} (${input.roomId})`,
    input.notes.trim(),
    "Request only. Confirm availability and the rate. Do not charge a card.",
  ].filter(Boolean).join("\n");
  return {
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    email: input.email.trim(),
    phone: input.phone.trim(),
    address: BUSINESS_CONTACT.address,
    selectedService: lineName,
    lineItems: [{ name: lineName, price: 0 }],
    total: 0,
    pricing: { subtotal: 0, total: 0 },
    scheduledDate: input.preferredDate,
    scheduledTime: input.preferredTime,
    vibeNote: note,
    leadSource: STUDIO105_LEAD_SOURCE,
    accessMethod: "Studio 105",
    propertyStatus: "Not specified",
    furnishingStatus: "Not specified",
  };
}
