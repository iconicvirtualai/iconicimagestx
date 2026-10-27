import type { ClientInvoiceStatement, ClientListingCard } from "@shared/clientHome";
import {
  exampleBilling,
  exampleProfile,
  type AgentContactRecord,
  type TeamMemberRecord,
} from "@shared/clientHubSettings";

export function exampleListing(): ClientListingCard {
  return {
    id: "example-listing",
    address: "100 Example Street, Spring, TX",
    status: "delivered",
    projectType: "real_estate",
    imageCount: 1,
    coverUrl: "/media/photos/headshot-gracepoint-1.jpg",
    createdAt: "2026-10-01T00:00:00.000Z",
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

export function exampleInvoice(): ClientInvoiceStatement {
  return {
    id: "example-invoice",
    invoiceNumber: "INV-EXAMPLE-1001",
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
