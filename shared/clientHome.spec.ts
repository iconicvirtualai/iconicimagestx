import { describe, expect, it } from "vitest";
import {
  appointmentSummary,
  appointmentTone,
  buildClientAppointment,
  buildClientInvoice,
  buildClientListing,
  calendarDateKey,
  clientListingPath,
  clientInvoicePdfInput,
  invoicePdf,
  sortNewestFirst,
} from "./clientHome.ts";

const TODAY = "2026-10-03";

/** Text drawn on the invoice page, without the logo image bytes. */
function pdfPageText(bytes: Uint8Array): string {
  const raw = new TextDecoder("latin1").decode(bytes);
  const start = raw.lastIndexOf("stream\n");
  const end = raw.indexOf("\nendstream", start);
  const content = start >= 0 && end > start ? raw.slice(start, end) : raw;
  return [...content.matchAll(/\((?:\\.|[^\\)])*\)/g)]
    .map((match) => match[0].slice(1, -1).replace(/\\([()\\])/g, "$1"))
    .join("\n");
}

describe("stored appointment dates", () => {
  it("keeps a booking-form date on the day the agent picked", () => {
    expect(calendarDateKey("Saturday, October 3, 2026")).toBe("2026-10-03");
    expect(calendarDateKey("2026-10-03")).toBe("2026-10-03");
    expect(calendarDateKey("2026-10-03T00:00:00.000Z")).toBe("2026-10-03");
    expect(calendarDateKey("2026-10-03T17:00:00.000Z")).toBe("2026-10-03");
  });
});

describe("client listing cards", () => {
  it("keeps the stored cover and opens the listing", () => {
    const card = buildClientListing("listing-1", {
      address: "10 Oak St, Houston, TX",
      status: "delivered",
      projectType: "real_estate",
      createdAt: "2026-09-01T15:00:00.000Z",
      images: [{ url: "https://files.example/cover.jpg" }, { url: "not-a-url" }],
    });
    expect(card.href).toBe("/portal/listings/listing-1");
    expect(card.href).toBe(clientListingPath("listing-1"));
    expect(card.href).not.toContain("?");
    expect(card.coverUrl).toBe("https://files.example/cover.jpg");
    expect(card.imageCount).toBe(2);
    expect(card.address).toBe("10 Oak St, Houston, TX");
    expect(card.look).toBeNull();
  });

  it("chooses the card look from the stored package", () => {
    expect(buildClientListing("photos", { package: "Photos Only" }).look).toBe("just-photos");
    expect(buildClientListing("just", { packageName: "Just Photos" }).look).toBe("just-photos");
    expect(buildClientListing("essentials", { services: ["The Essentials"] }).look).toBe("essentials");
    expect(buildClientListing("showcase", { serviceIds: ["listing-showcase"] }).look).toBe("showcase");
    expect(buildClientListing("legacy", { selectedService: "listing-legacy" }).look).toBe("legacy");
    expect(buildClientListing("leader", { package: "The Market Leader" }).look).toBe("market-leader");
    expect(buildClientListing("refresh", { services: ["The Refresh"] }).look).toBe("refresh");
    expect(buildClientListing("legend", { packageName: "The Local Legend" }).look).toBe("local-legend");
    expect(buildClientListing("stack", { selectedService: "business-authority-stack" }).look).toBe("authority-stack");
    expect(buildClientListing("strategic", { package: "The Foundation" }).look).toBeNull();

    const showcase = buildClientListing("styled", {
      package: "The Showcase",
      address: "123 Main Street, Conroe, TX 77304",
      apptDate: "2026-01-01",
      bedrooms: 3,
      bathrooms: 2,
      garage: 3,
      pool: true,
    });
    expect(showcase.street).toBe("123 Main Street");
    expect(showcase.locality).toBe("Conroe, TX 77304");
    expect(showcase.shootDateLabel).toBe("01.01.2026");
    expect(showcase.beds).toBe("3");
    expect(showcase.baths).toBe("2");
    expect(showcase.garage).toBe("3");
    expect(showcase.pool).toBe("Y");
  });

  it("sorts newest listings first and leaves undated ones after", () => {
    const ordered = sortNewestFirst([
      { id: "old", createdAt: "2024-01-01T00:00:00.000Z" },
      { id: "missing", createdAt: null },
      { id: "new", createdAt: "2026-08-01T00:00:00.000Z" },
    ]);
    expect(ordered.map((item) => item.id)).toEqual(["new", "old", "missing"]);
  });
});

describe("appointment calendar colors", () => {
  it("greys a past appointment", () => {
    const appointment = buildClientAppointment("a1", {
      status: "confirmed",
      scheduledDate: "2026-09-01",
      scheduledTime: "10:00 AM",
      address: "1 Past Ln",
    });
    expect(appointmentTone(appointment, TODAY)).toBe("past");
  });

  it("blues an appointment the agent submitted", () => {
    const appointment = buildClientAppointment("a2", {
      status: "requested",
      scheduledDate: "2026-10-20",
      scheduledTime: "9:00 AM",
    });
    expect(appointmentTone(appointment, TODAY)).toBe("submitted");
    expect(appointmentSummary(appointment, TODAY)).toBe("You submitted this appointment.");
  });

  it("greens an appointment Iconic accepted at the requested time", () => {
    const appointment = buildClientAppointment("a3", {
      status: "confirmed",
      scheduledDate: "2026-10-20T15:00:00.000Z",
      scheduledTime: "10:00 AM",
      requestedDate: "2026-10-20",
      requestedTime: "10:00",
    });
    expect(appointment.date).toBe("2026-10-20");
    expect(appointmentTone(appointment, TODAY)).toBe("accepted");
  });

  it("oranges a different accepted time until the agent approves it", () => {
    const appointment = buildClientAppointment(
      "a4",
      {
        status: "confirmed",
        scheduledDate: "2026-10-22",
        scheduledTime: "2:00 PM",
        addressLabel: "88 Pine",
      },
      { scheduledDate: "2026-10-20", scheduledTime: "10:00 AM" },
    );
    expect(appointment.date).toBe("2026-10-22");
    expect(appointment.requestedDate).toBe("2026-10-20");
    expect(appointmentTone(appointment, TODAY)).toBe("change");
    expect(appointmentSummary(appointment, TODAY)).toContain("instead of");
    expect(appointmentSummary(appointment, TODAY)).toContain("approval is still open");
  });

  it("greens a different time after the stored approval stamp", () => {
    const appointment = buildClientAppointment("a5", {
      status: "scheduled",
      scheduledDate: "2026-10-22",
      scheduledTime: "14:00",
      requestedDate: "2026-10-20",
      requestedTime: "10:00 AM",
      clientConfirmedAt: "2026-10-02T12:00:00.000Z",
    });
    expect(appointment.approved).toBe(true);
    expect(appointmentTone(appointment, TODAY)).toBe("accepted");
  });

  it("oranges pending confirmation even when the other time was not stored", () => {
    const appointment = buildClientAppointment("a6", {
      status: "pending_confirmation",
      scheduledDate: "2026-11-01",
      scheduledTime: "11:00 AM",
    });
    expect(appointmentTone(appointment, TODAY)).toBe("change");
    expect(appointmentSummary(appointment, TODAY)).toBe("Iconic accepted a different time. Your approval is still open.");
  });

  it("does not invent a date or an acceptance color", () => {
    expect(appointmentTone(buildClientAppointment("a7", { status: "requested" }), TODAY)).toBe("undated");
    expect(appointmentTone(buildClientAppointment("a8", { status: "", scheduledDate: "2026-12-01" }), TODAY)).toBe("unknown");
    expect(appointmentTone(buildClientAppointment("a9", { status: "cancelled", scheduledDate: "2026-12-01" }), TODAY)).toBe("inactive");
  });
});

describe("invoice statements", () => {
  it("copies stored lines and skips amounts that are not on the invoice", () => {
    const statement = buildClientInvoice("inv_1", {
      invoiceNumber: "INV-2026-1042",
      status: "paid",
      clientName: "Ada Agent",
      total: 250,
      lineItems: [{ name: "Photos", qty: 1, price: 250 }],
      createdAt: "2026-09-15T18:00:00.000Z",
    });
    const pdf = pdfPageText(invoicePdf(statement));
    expect(pdf).toContain("INV-2026-1042");
    expect(pdf).toContain("PHOTOS");
    expect(pdf).toContain("INVOICE");
    expect(pdf).toContain("DESCRIPTION");
    expect(pdf).toContain("TOTAL");
    expect(pdf).toContain("$250.00");
    expect(pdf).toContain("PROCESSING");
    expect(pdf).toContain("$0.00");
    expect(pdf).toContain("PAYMENT INFORMATION:");
    expect(pdf).toContain("Iconic Images Photography, LLC");
    expect(pdf).toContain("26410 Oakridge Dr. Ste 105 - 108");
    expect(pdf).toContain("Spring, TX 77380");
    expect(pdf).toContain("281.356.0965");
    expect(pdf).toContain("photos@iconicimagestx.com");
    expect(pdf).not.toContain("Pay Securely");
    expect(pdf).not.toContain("checkout");
    expect(pdf).not.toContain("http");
    expect(pdf).not.toContain("$7.00");
    expect(statement.processing).toBeNull();
    expect(statement.payPath).toBeNull();
  });

  it("adds a tokenized pay path only when the invoice stores a pay token", () => {
    const saved = process.env.PUBLIC_SITE_URL;
    process.env.PUBLIC_SITE_URL = "https://links.example";
    try {
      expect(buildClientInvoice("inv_9", { invoiceNumber: "INV-9", payToken: "abc" }).payPath).toBe(
        "https://links.example/invoice/inv_9?t=abc",
      );
      expect(buildClientInvoice("inv_9", { invoiceNumber: "INV-9", status: "paid", payToken: "abc" }).payPath).toBeNull();
      expect(buildClientInvoice("inv_9", { invoiceNumber: "INV-9", payToken: "  " }).payPath).toBeNull();
    } finally {
      if (saved === undefined) delete process.env.PUBLIC_SITE_URL;
      else process.env.PUBLIC_SITE_URL = saved;
    }
  });

  it("says when an invoice has no stored line items and does not invent processing", () => {
    const statement = buildClientInvoice("inv_2", { invoiceNumber: "INV-2026-2", status: "sent" });
    const input = clientInvoicePdfInput(statement);
    expect(input.face.services).toEqual([]);
    expect(input.face.processing).toBeNull();
    const pdf = pdfPageText(invoicePdf(statement));
    expect(pdf).toContain("DESCRIPTION");
    expect(pdf).toContain("PROCESSING");
    expect(pdf).toContain("TOTAL");
    expect(pdf).toContain("$0.00");
    expect(pdf).not.toContain("No line items yet");
  });

  it("downloads the branded pdf of the stored invoice", () => {
    const statement = buildClientInvoice("inv_3", {
      invoiceNumber: "INV-2026-9",
      status: "paid",
      clientName: "Ada (Agent)",
      total: 80,
      lineItems: [{ name: "Twilight", price: 80 }],
    });
    const bytes = invoicePdf(statement);
    expect(new TextDecoder().decode(bytes.subarray(0, 8))).toBe("%PDF-1.4");
    const pdf = pdfPageText(bytes);
    expect(pdf).toContain("INV-2026-9");
    expect(pdf).toContain("TWILIGHT");
    expect(pdf).toContain("ADA (AGENT)");
    expect(pdf).toContain("TOTAL");
    expect(pdf).toContain("$80.00");
    expect(pdf).toContain("PROCESSING");
    expect(pdf).not.toContain("$2.24");
    expect(pdf).toContain("Iconic Images Photography, LLC");
    expect(pdf).not.toContain("Pay securely");
    expect(pdf).not.toContain("checkout");
  });

  it("keeps a stored processing amount on the branded order-history pdf and hides the adjustment line", () => {
    const statement = buildClientInvoice("inv_4", {
      invoiceNumber: "INV-2026-0008",
      clientName: "Marty",
      subtotal: 100,
      processing: 6,
      total: 106,
      amountDue: 106,
      lineItems: [
        { name: "Photos", price: 100 },
        { id: "adjustment-processing", name: "Processing", price: 6, category: "adjustment-processing" },
      ],
    });
    const input = clientInvoicePdfInput(statement);
    expect(statement.processing).toBe(6);
    expect(input.face.processing).toBe(6);
    expect(input.face.services.map((line) => line.name)).toEqual(["Photos"]);
    const pdf = pdfPageText(invoicePdf(statement));
    expect(pdf.split("PROCESSING").length - 1).toBe(1);
    expect(pdf).toContain("$6.00");
    expect(pdf).toContain("$106.00");
    expect(pdf.split("PHOTOS").length - 1).toBe(1);
  });
});
