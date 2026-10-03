import { describe, expect, it } from "vitest";
import {
  appointmentSummary,
  appointmentTone,
  buildClientAppointment,
  buildClientInvoice,
  buildClientListing,
  calendarDateKey,
  invoicePdf,
  invoicePdfLines,
  sortNewestFirst,
} from "./clientHome.ts";

const TODAY = "2026-10-03";

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
    expect(card.href).toBe("/studio/listing-1");
    expect(card.coverUrl).toBe("https://files.example/cover.jpg");
    expect(card.imageCount).toBe(2);
    expect(card.address).toBe("10 Oak St, Houston, TX");
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
    const lines = invoicePdfLines(statement);
    expect(lines).toContain("Invoice INV-2026-1042");
    expect(lines).toContain("Photos x1  $250.00");
    expect(lines).toContain("Total: $250.00");
    expect(lines.join("\n")).not.toContain("Tax:");
    expect(lines.join("\n")).not.toContain("Pay");
    expect(lines.join("\n")).not.toContain("http");
  });

  it("says when an invoice has no stored line items", () => {
    const lines = invoicePdfLines(buildClientInvoice("inv_2", { invoiceNumber: "INV-2026-2", status: "sent" }));
    expect(lines).toContain("No line items are stored on this invoice.");
    expect(lines.join("\n")).not.toContain("$0.00");
  });

  it("downloads a pdf of the stored invoice", () => {
    const statement = buildClientInvoice("inv_3", {
      invoiceNumber: "INV-2026-9",
      status: "paid",
      clientName: "Ada (Agent)",
      total: 80,
      lineItems: [{ name: "Twilight", price: 80 }],
    });
    const pdf = new TextDecoder().decode(invoicePdf(statement));
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("Invoice INV-2026-9");
    expect(pdf).toContain("Twilight");
    expect(pdf).toContain("Ada \\(Agent\\)");
    expect(pdf).not.toContain("Pay securely");
    expect(pdf).not.toContain("checkout");
  });
});
