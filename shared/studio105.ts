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
  STUDIO105_PATHS.rates,
  STUDIO105_PATHS.faq,
  STUDIO105_PATHS.location,
  STUDIO105_PATHS.book,
] as const;

export const STUDIO105_SEO_DESCRIPTION =
  "Studio Noir and Studio Blanc at Studio 105 in Spring, Texas. Request a room and a time. We confirm availability and the rate.";

export const STUDIO_ROOM_IDS = ["studio-noir", "studio-blanc"] as const;
export type StudioRoomId = (typeof STUDIO_ROOM_IDS)[number];

export function isStudioRoomId(value: string): value is StudioRoomId {
  return (STUDIO_ROOM_IDS as readonly string[]).includes(value);
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
    leadSource: "Studio 105",
    accessMethod: "Studio 105",
    propertyStatus: "Not specified",
    furnishingStatus: "Not specified",
  };
}
