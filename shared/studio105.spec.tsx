import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { BUSINESS_CONTACT } from "./businessContact";
import { resolveSubmittedBooking, unpricedCatalogBookingError } from "./bookingPricing";
import { metaPlan } from "./siteSeo";
import { isStudio105Request, studioRoomRequestBody } from "./studio105";
import Studio105 from "../client/pages/Studio105";
import Header from "../client/components/Header";

describe("Studio 105 microsite", () => {
  it("keeps a room request unpriced and off the card path", () => {
    const body = studioRoomRequestBody({
      roomId: "studio-noir",
      roomName: "Studio Noir",
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      phone: "2813560965",
      preferredDate: "2026-12-01",
      preferredTime: "10:00 AM",
      notes: "Headshots",
    });
    expect(unpricedCatalogBookingError(body)).toBeNull();
    const resolved = resolveSubmittedBooking(body);
    expect(resolved.total).toBe(0);
    expect(resolved.lineItems.map((item) => item.price)).toEqual([0]);
    expect(JSON.stringify(body)).not.toMatch(/paymentMethod|pay_at_close|CLIENT_NOTIFY|BOOKING_NOTIFY/);
    expect(body.address).toBe(BUSINESS_CONTACT.address);
    expect(isStudio105Request(body.leadSource)).toBe(true);
    expect(isStudio105Request("Iconic temporary booking page")).toBe(false);
    expect(isStudio105Request(undefined)).toBe(false);
  });

  it("renders its own shell, rooms, and request form", () => {
    const home = renderToString(
      <MemoryRouter initialEntries={["/studio-105"]}>
        <Studio105 />
      </MemoryRouter>,
    );
    expect(home).toContain("by");
    expect(home).toContain("Iconic Images");
    expect(home).toContain("Studio Noir");
    expect(home).toContain("Studio Blanc");
    expect(home).toContain("does not charge a card");
    expect(home).toContain(BUSINESS_CONTACT.address);
    expect(home).not.toContain("Book Now");

    const book = renderToString(
      <MemoryRouter initialEntries={["/studio-105/book?room=studio-blanc"]}>
        <Studio105 />
      </MemoryRouter>,
    );
    expect(book).toContain('data-testid="studio105-book-form"');
    expect(book).toContain("Studio Blanc");
    expect(book).toContain("does not charge a card");
    expect(metaPlan("/studio-105/book").kind).toBe("public");
  });

  it("moves Studio 105 out of the main link group and redirects old room links", () => {
    const header = renderToString(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    );
    expect(header).toContain('data-testid="nav-studio-105"');
    expect(header).toContain('href="/studio-105"');
    const nav = header.slice(header.indexOf("<nav"), header.indexOf("</nav>"));
    expect(nav).not.toContain("Studio 105");

    const book = readFileSync(new URL("../client/pages/Book.tsx", import.meta.url), "utf8");
    expect(book).toContain("isStudioRoomId(requested)");
    expect(book).toContain("STUDIO105_PATHS.book");
    expect(book).toContain("?room=${requested}");

    const form = readFileSync(new URL("../client/components/studio105/Studio105BookForm.tsx", import.meta.url), "utf8");
    expect(form).not.toMatch(/CLIENT_NOTIFY_LIVE|BOOKING_NOTIFY_LIVE|THANKFUL_RSVP_CONFIRM_LIVE/);
    expect(form).not.toMatch(/paymentMethod/);
  });
});
