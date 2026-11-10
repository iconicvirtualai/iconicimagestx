import type { ClientAppointment, ClientInvoiceStatement, ClientListingCard } from "@shared/clientHome";
import type { UnifiedThread } from "@shared/communications/threads";
import {
  exampleBilling,
  exampleProfile,
  type AgentContactRecord,
  type ClientHubProfile,
  type TeamMemberRecord,
} from "@shared/clientHubSettings";

const PORTRAIT = "/media/portal-v2";

export function exampleListing(): ClientListingCard {
  return {
    id: "example-listing",
    address: "100 Example Street, Spring, TX",
    status: "delivered",
    projectType: "real_estate",
    imageCount: 1,
    coverUrl: `${PORTRAIT}/deliver-hero.jpg`,
    createdAt: "2026-11-08T00:00:00.000Z",
    appointmentDate: "2026-10-04",
    href: "/portal/listings/example-listing?example=1",
    look: null,
    street: "100 Example Street",
    locality: "Spring, TX",
    shootDateLabel: "10.04.2026",
    beds: "4",
    baths: "3",
    garage: "2",
    pool: "",
  };
}

function sampleCard(partial: Partial<ClientListingCard> & Pick<ClientListingCard, "id" | "address" | "coverUrl">): ClientListingCard {
  return {
    status: "delivered",
    projectType: "real_estate",
    imageCount: 0,
    createdAt: "2026-10-01T00:00:00.000Z",
    appointmentDate: null,
    href: "/portal/listings/example-listing?example=1",
    look: null,
    street: partial.address,
    locality: "",
    shootDateLabel: "",
    beds: "",
    baths: "",
    garage: "",
    pool: "",
    ...partial,
  };
}

/** Signed-in sample client. Listing-site branding stays on exampleProfile (Example Agent). */
export function samplePortalProfile(): ClientHubProfile {
  return {
    ...exampleProfile(),
    firstName: "Jordan",
    lastName: "Hale",
    email: "jordan.hale@example.com",
    phone: "(281) 555-0148",
    headshotUrl: "",
  };
}

export function exampleListings(): ClientListingCard[] {
  return [
    exampleListing(),
    sampleCard({
      id: "sample-windsong",
      address: "Windsong Place",
      coverUrl: `${PORTRAIT}/deliver-angle.jpg`,
      createdAt: "2026-11-07T00:00:00.000Z",
      imageCount: 42,
      locality: "Houston area",
    }),
    sampleCard({
      id: "sample-forest",
      address: "Forest Heights",
      coverUrl: `${PORTRAIT}/card-forest.jpg`,
      createdAt: "2026-11-06T00:00:00.000Z",
      locality: "The Woodlands",
    }),
    sampleCard({
      id: "sample-estate",
      address: "Wooded estate",
      coverUrl: `${PORTRAIT}/card-estate.jpg`,
      createdAt: "2026-11-05T00:00:00.000Z",
      locality: "The Woodlands",
    }),
    sampleCard({
      id: "sample-grogan",
      address: "Grogan’s Mill oaks",
      coverUrl: `${PORTRAIT}/card-grove.jpg`,
      status: "in_progress",
      createdAt: "2026-11-04T00:00:00.000Z",
      locality: "The Woodlands",
      imageCount: 22,
    }),
  ];
}

export interface SampleCardFace {
  meta: string;
  bits: string[];
  stage: string;
  stageValue: string;
  width: string;
  badge: string;
  soft?: boolean;
}

const SAMPLE_FACES: Record<string, SampleCardFace> = {
  "example-listing": {
    meta: "1 photo · Oct 4, 2026",
    bits: ["Order #001 · Partial", "Downloads locked until the balance is paid"],
    stage: "Delivery",
    stageValue: "Ready",
    width: "100%",
    badge: "Delivered",
  },
  "sample-windsong": {
    meta: "Houston area · gallery just arrived",
    bits: ["42 photos · High & Web Res", "Branded + unbranded video", "Listing Kit generated on payment"],
    stage: "Delivery",
    stageValue: "Ready",
    width: "100%",
    badge: "Delivered",
  },
  "sample-forest": {
    meta: "The Woodlands · twilight set delivered",
    bits: ["Just Listed kit is in the gallery", "Snap Reel with your branding"],
    stage: "Delivery",
    stageValue: "Ready",
    width: "100%",
    badge: "Delivered",
  },
  "sample-estate": {
    meta: "The Woodlands · aerial & interiors",
    bits: ["3D tour & floorplan", "Listing Kit on payment"],
    stage: "Delivery",
    stageValue: "Ready",
    width: "100%",
    badge: "Delivered",
  },
  "sample-grogan": {
    meta: "The Woodlands · editing now",
    bits: ["Shot on a Broker Bundle credit", "Complimentary 2D floorplan included"],
    stage: "Photos",
    stageValue: "22 of 25",
    width: "88%",
    badge: "Editing",
    soft: true,
  },
};

export function sampleCardFace(id: string): SampleCardFace | null {
  return SAMPLE_FACES[id] || null;
}

export function exampleAppointments(): ClientAppointment[] {
  return [
    {
      id: "example-past",
      address: "100 Example Street, Spring, TX",
      status: "delivered",
      date: "2026-10-04",
      time: "",
      requestedDate: "2026-10-04",
      requestedTime: "",
      approved: true,
      createdAt: "2026-10-01T00:00:00.000Z",
    },
    {
      id: "example-hunter",
      address: "Hunter Creek, The Woodlands",
      status: "confirmed",
      date: "2026-11-12",
      time: "5:30 PM",
      requestedDate: "2026-11-12",
      requestedTime: "5:30 PM",
      approved: true,
      createdAt: "2026-11-01T00:00:00.000Z",
    },
  ];
}

export const SAMPLE_NEXT_SHOOT = {
  date: "2026-11-12",
  time: "5:30 PM",
  whenLabel: "Thursday, November 12 at 5:30 in the evening",
  where: "Hunter Creek, The Woodlands",
  hero: `${PORTRAIT}/hero-twilight.jpg`,
  note: "Please have every light on by 5:15. Cars off the drive, bins out of sight. The gate can stay unlocked — Mike already has the code.",
};

function threadMessage(id: string, direction: "inbound" | "outbound", senderName: string, body: string, createdAt: string) {
  return {
    id,
    direction,
    senderId: direction === "outbound" ? "sample-client" : "sample-desk",
    senderName,
    senderType: direction === "outbound" ? "client" : "staff",
    body,
    channel: "portal",
    createdAt,
    delivery: "sample",
  };
}

export function exampleThreads(): UnifiedThread[] {
  return [
    {
      id: "sample-mike",
      audiences: ["clients"],
      source: "messages",
      title: "Mike Luna",
      subtitle: "Your photographer · Hunter Creek",
      preview: "Lights on by 5:15 — I’ve got the gate code.",
      updatedAt: "2026-11-10T18:00:00.000Z",
      email: "",
      phone: "",
      orderId: "",
      clientId: "example-owner",
      photographerId: "",
      photographerPhone: "",
      participantIds: [],
      unread: 1,
      connectorNeeded: false,
      messages: [
        threadMessage("m1", "inbound", "Mike Luna", "Jordan — Thursday is looking clear. I’ll be at Hunter Creek for 5:30. Please have every light on by 5:15, cars off the drive, bins out of sight. The gate can stay unlocked; I already have the code.", "2026-11-10T15:00:00.000Z"),
        threadMessage("m2", "outbound", "Jordan Hale", "Thank you, Mike. We’ll have the house ready. See you Thursday.", "2026-11-10T16:00:00.000Z"),
        threadMessage("m3", "inbound", "Mike Luna", "Perfect. I’ll catch the last light.", "2026-11-10T16:20:00.000Z"),
      ],
    },
    {
      id: "sample-desk",
      audiences: ["clients"],
      source: "messages",
      title: "Iconic desk",
      subtitle: "Studio 105",
      preview: "Windsong Place is in your gallery.",
      updatedAt: "2026-11-09T15:00:00.000Z",
      email: "",
      phone: "",
      orderId: "",
      clientId: "example-owner",
      photographerId: "",
      photographerPhone: "",
      participantIds: [],
      unread: 1,
      connectorNeeded: false,
      messages: [
        threadMessage("d1", "inbound", "Iconic desk", "Windsong Place is in your gallery. The Listing Kit generates when the invoice is paid.", "2026-11-09T15:00:00.000Z"),
      ],
    },
  ];
}

export function exampleInvoice(): ClientInvoiceStatement {
  return {
    id: "example-invoice",
    invoiceNumber: "#001",
    status: "partial",
    clientName: "Example Agent",
    address: "100 Example Street, Suite 200, Spring, TX 77373",
    createdAt: "2026-10-02T00:00:00.000Z",
    issuedOn: "Oct 2, 2026",
    lineItems: [{ name: "Example photos", qty: 1, amount: 250 }],
    subtotal: 250,
    processing: null,
    fees: null,
    travel: null,
    promoDiscount: null,
    promoCode: "",
    tax: null,
    total: 250,
    amountPaid: 121.5,
    amountDue: 128.5,
    payPath: "",
  };
}

export function exampleMembers(): TeamMemberRecord[] {
  return [
    {
      id: "example-member",
      teamId: "example-team",
      ownerClientId: "example-owner",
      name: "Example Teammate",
      email: "example.teammate@example.com",
      phone: "(281) 555-0111",
      permissions: ["view", "order", "download"],
      logoUrl: "/media/brand/iconic-camera-logo.png",
      status: "invited",
      linkedClientId: "",
      inviteEmail: "paused",
    },
    {
      id: "example-admin",
      teamId: "example-team",
      ownerClientId: "example-owner",
      name: "Example Admin",
      email: "example.admin@example.com",
      phone: "(281) 555-0112",
      permissions: ["view", "order", "download", "billing", "admin"],
      logoUrl: "",
      status: "active",
      linkedClientId: "example-admin",
      inviteEmail: "paused",
    },
  ];
}

export function exampleContacts(): AgentContactRecord[] {
  return [
    {
      id: "example-client",
      ownerClientId: "example-owner",
      teamId: "example-team",
      name: "Example Client",
      email: "example.client@example.com",
      phone: "(281) 555-0130",
      tags: ["vip", "buyer"],
      notes: "Example note from a showing.",
      lastContact: "2026-10-03",
      status: "active",
      source: "manual",
      shareRef: "",
    },
    {
      id: "share:example",
      ownerClientId: "example-owner",
      teamId: "example-team",
      name: "Example Buyer",
      email: "example.buyer@example.com",
      phone: "",
      tags: ["shared"],
      notes: "Shared from the listing site.",
      lastContact: "2026-10-02",
      status: "lead",
      source: "share",
      shareRef: "example-listing:0",
    },
  ];
}

export function exampleOrders() {
  return [
    {
      id: "example-order",
      address: "100 Example Street",
      status: "confirmed",
      href: "/portal/listings/example-listing?example=1",
    },
  ];
}

export { exampleBilling, exampleProfile };
