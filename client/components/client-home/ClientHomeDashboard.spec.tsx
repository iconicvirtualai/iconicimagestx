import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import type { ClientAppointment, ClientInvoiceStatement, ClientListingCard } from "@shared/clientHome";
import { ClientHomeView, OrderHistory } from "./ClientHomeDashboard";

const TODAY = "2026-10-03";

function listing(overrides: Partial<ClientListingCard> = {}): ClientListingCard {
  return {
    id: "listing-1",
    address: "10 Oak Street",
    status: "delivered",
    projectType: "real_estate",
    imageCount: 2,
    coverUrl: "https://files.example/cover.jpg",
    createdAt: "2026-09-02T00:00:00.000Z",
    appointmentDate: null,
    href: "/portal/listings/listing-1",
    look: null,
    street: "10 Oak Street",
    locality: "",
    shootDateLabel: "",
    beds: "",
    baths: "",
    garage: "",
    pool: "",
    ...overrides,
  };
}

function invoice(overrides: Partial<ClientInvoiceStatement> = {}): ClientInvoiceStatement {
  return {
    id: "inv-1",
    invoiceNumber: "INV-2026-1042",
    status: "paid",
    clientName: "Ada Agent",
    address: "10 Oak Street",
    createdAt: "2026-09-15T00:00:00.000Z",
    issuedOn: "Sep 15, 2026",
    lineItems: [{ name: "Photos", qty: 1, amount: 250 }],
    subtotal: 250,
    tax: null,
    total: 250,
    amountPaid: 250,
    amountDue: 0,
    ...overrides,
  };
}

function appointment(overrides: Partial<ClientAppointment> = {}): ClientAppointment {
  return {
    id: "appt-1",
    address: "10 Oak Street",
    status: "confirmed",
    date: "2026-10-20",
    time: "10:00 AM",
    requestedDate: "2026-10-20",
    requestedTime: "10:00 AM",
    approved: false,
    createdAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function view(overrides: Partial<Parameters<typeof ClientHomeView>[0]> = {}) {
  return renderToString(
    <MemoryRouter>
      <ClientHomeView
        firstName="Ada"
        listings={[]}
        invoices={[]}
        appointments={[]}
        section="listings"
        onSection={() => undefined}
        onSignOut={() => undefined}
        today={TODAY}
        {...overrides}
      />
    </MemoryRouter>,
  );
}

describe("client home dashboard", () => {
  it("fills the listings section with newest project tiles that open the listing", () => {
    const html = view({
      listings: [
        listing({ id: "old", address: "Old Street", createdAt: "2024-01-01T00:00:00.000Z", href: "/studio/old", coverUrl: null, imageCount: 0 }),
        listing({ id: "new", address: "New Street", createdAt: "2026-09-01T00:00:00.000Z", href: "/studio/new" }),
      ],
    });
    expect(html.indexOf("New Street")).toBeLessThan(html.indexOf("Old Street"));
    expect(html).toContain('href="/portal/listings/new"');
    expect(html).toContain('href="/portal/listings/old"');
    expect(html).not.toContain("/studio/");
    expect(html).not.toContain("?tab=");
    expect(html).toContain("https://files.example/cover.jpg");
    expect(html).toContain("No photos yet");
    expect(html).toContain("Listings");
    expect(html).toContain("Order history");
    expect(html).toContain("Schedule");
    expect(html).not.toContain("/invoice/");
  });

  it("renders each package as its own listing card", () => {
    const html = view({
      listings: [
        listing({
          id: "photos",
          look: "just-photos",
          address: "123 Main Street, Conroe, TX 77304",
          street: "123 Main Street",
          locality: "Conroe, TX 77304",
          shootDateLabel: "01.01.2026",
        }),
        listing({
          id: "essentials",
          look: "essentials",
          address: "123 Main Street, Conroe, TX 77304",
          street: "123 Main Street",
          locality: "Conroe, TX 77304",
          shootDateLabel: "01.01.2026",
        }),
        listing({
          id: "showcase",
          look: "showcase",
          address: "123 Main Street, Conroe, TX 77304",
          street: "123 Main Street",
          locality: "Conroe, TX 77304",
          shootDateLabel: "01.01.2026",
          beds: "3",
          baths: "2",
          garage: "3",
          pool: "Y",
        }),
        listing({
          id: "legacy",
          look: "legacy",
          address: "123 Main St., Conroe, TX 77304",
          street: "123 Main St.",
          locality: "Conroe, TX 77304",
          shootDateLabel: "01.01.2026",
          beds: "3",
          baths: "3",
          garage: "2",
          pool: "Y",
        }),
      ],
    });

    expect(html).toContain('data-look="just-photos"');
    expect(html).toContain("JUST PHOTOS");
    expect(html).toContain("123 Main Street | Conroe, TX 77304");
    expect(html).toContain('data-look="essentials"');
    expect(html).toContain("ESSENTIALS");
    expect(html).toContain('data-look="showcase"');
    expect(html).toContain("THE SHOWCASE");
    expect(html).toContain("123 MAIN STREET");
    expect(html).toContain('aria-label="Drone"');
    expect(html).toContain('aria-label="Video"');
    expect(html).toContain('data-look="legacy"');
    expect(html).toContain("LEGACY");
    expect(html).toContain("123 MAIN ST.");
    expect(html).toContain("Shoot Date: 01.01.2026");
    expect(html).toContain('href="/portal/listings/photos"');
    expect(html).toContain('href="/portal/listings/legacy"');
    expect(html).not.toContain("Real Estate");
  });

  it("shows an empty listings state instead of sample properties", () => {
    const html = view();
    expect(html).toContain("No listings are tied to this account yet");
    expect(html).not.toContain("https://");
  });

  it("expands an invoice into a download and does not ask for payment", () => {
    const closed = renderToString(
      <OrderHistory invoices={[invoice()]} openId={null} onToggle={() => undefined} />,
    );
    expect(closed).toContain("INV-2026-1042");
    expect(closed).not.toContain("Download PDF");

    const open = renderToString(
      <OrderHistory invoices={[invoice()]} openId="inv-1" onToggle={() => undefined} />,
    );
    expect(open).toContain("Download PDF");
    expect(open).toContain("Photos");
    expect(open).toContain("$250.00");
    expect(open).not.toContain("Pay");
    expect(open).not.toContain("/invoice/");
    expect(open).not.toContain("checkout");
  });

  it("says when no invoices are stored", () => {
    const html = view({ section: "orders" });
    expect(html).toContain("No invoices are stored on this account yet");
  });

  it("colors past, submitted, accepted, and changed appointments", () => {
    const html = view({
      section: "schedule",
      appointments: [
        appointment({ id: "past", date: "2026-10-01", status: "confirmed", address: "Past House" }),
        appointment({ id: "submitted", date: "2026-10-11", status: "requested", requestedDate: null, requestedTime: "", address: "Submitted House" }),
        appointment({ id: "accepted", date: "2026-10-20", status: "confirmed", address: "Accepted House" }),
        appointment({
          id: "changed",
          date: "2026-10-22",
          status: "confirmed",
          time: "2:00 PM",
          requestedDate: "2026-10-21",
          requestedTime: "10:00 AM",
          address: "Changed House",
        }),
      ],
    });

    expect(cell(html, "2026-10-01")).toContain('data-tone="past"');
    expect(cell(html, "2026-10-01")).toContain("bg-gray-200");
    expect(cell(html, "2026-10-11")).toContain('data-tone="submitted"');
    expect(cell(html, "2026-10-11")).toContain("bg-blue-600");
    expect(cell(html, "2026-10-20")).toContain('data-tone="accepted"');
    expect(cell(html, "2026-10-20")).toContain("bg-green-600");
    expect(cell(html, "2026-10-22")).toContain('data-tone="change"');
    expect(cell(html, "2026-10-22")).toContain("bg-orange-500");
    expect(html).toContain("You submitted");
    expect(html).toContain("Iconic accepted");
    expect(html).toContain("Different time, approval still open");
  });

  it("shows an empty schedule instead of a sample appointment", () => {
    const html = view({ section: "schedule" });
    expect(html).toContain("No appointments are stored on this account yet");
    expect(html).not.toContain("data-tone=");
  });
});

function cell(html: string, date: string): string {
  const marker = `data-date="${date}"`;
  const start = html.indexOf(marker);
  expect(start).toBeGreaterThan(-1);
  const next = html.indexOf("data-date=", start + marker.length);
  return html.slice(start, next === -1 ? undefined : next);
}
