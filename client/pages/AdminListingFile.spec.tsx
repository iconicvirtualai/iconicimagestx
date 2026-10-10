import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AdminListingFile from "./AdminListingFile";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { getIdToken: async () => "token" },
    staffProfile: { role: "coordinator", name: "QA" },
    loading: false,
    isStaff: true,
    signOutUser: async () => undefined,
  }),
}));

const PLACES = {
  formatted: "100 Congress Ave, Austin, TX 78701",
  lat: 30.2648,
  lng: -97.7431,
  placeId: "place_congress",
};

function renderListing(address: unknown, extra: Record<string, unknown> = {}) {
  const project: Record<string, unknown> = {
    id: "bklist_req_m6dPeawQ4RQ63gA7LAMl",
    projectType: "real_estate",
    status: "scheduled",
    clientName: "QA Tester",
    ...extra,
  };
  if (address !== undefined) project.address = address;
  return renderToString(
    <MemoryRouter initialEntries={["/admin/listing/bklist_req_m6dPeawQ4RQ63gA7LAMl"]}>
      <Routes>
        <Route
          path="/admin/listing/:id"
          element={<AdminListingFile initialProject={project} initialTab={5} />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

function heading(html: string): string {
  return html.match(/<h1 class="text-2xl[^"]*text-white">([^<]*)<\/h1>/)?.[1] ?? "";
}

function pressed(html: string, label: string): string | undefined {
  return html.match(new RegExp(`aria-label="${label}" aria-pressed="(true|false)"`))?.[1];
}

describe("admin listing page address", () => {
  it("renders a legacy string address", () => {
    const html = renderListing("456 QA Lane");
    expect(heading(html)).toBe("456 QA Lane");
    expect(html).toContain("Property Address");
    expect(html).toContain("456 QA Lane");
    expect(html).not.toContain("[object Object]");
  });

  it("renders a Google Places address object as text", () => {
    const html = renderListing(PLACES);
    expect(heading(html)).toBe("100 Congress Ave, Austin, TX 78701");
    expect(html).toContain("100 Congress Ave, Austin, TX 78701");
    expect(html).not.toContain("place_congress");
    expect(html).not.toContain("[object Object]");
    expect(html).not.toContain("Minified React error");
  });

  it("shows a date-only shoot on the Chicago calendar day", () => {
    const html = renderListing("456 QA Lane", { apptDate: "2026-11-17", apptTime: "9:00 AM" });
    expect(html).toContain("Nov 17, 2026");
    expect(html).toContain("9:00 AM");
    expect(html).not.toContain("Nov 16, 2026");
  });

  it("shows a UTC-midnight timestamp on that same calendar day", () => {
    const html = renderListing("456 QA Lane", { apptDate: "2026-11-17T00:00:00.000Z", apptTime: "9:00 AM" });
    expect(html).toContain("Nov 17, 2026");
    expect(html).not.toContain("Nov 16, 2026");
  });

  it("treats a missing gallery lock as locked until paid", () => {
    const html = renderListing("456 QA Lane");
    expect(pressed(html, "Lock Downloads")).toBe("true");
    expect(pressed(html, "Require Payment")).toBe("true");
    expect(pressed(html, "Lock Studio")).toBe("false");
  });

  it("keeps an explicit download release off", () => {
    const html = renderListing("456 QA Lane", { lockDownloads: false, requirePayment: false, lockStudio: true });
    expect(pressed(html, "Lock Downloads")).toBe("false");
    expect(pressed(html, "Require Payment")).toBe("false");
    expect(pressed(html, "Lock Studio")).toBe("true");
  });

  it("shows Cancelled from the shared helper while billing is still loading", () => {
    const html = renderListing("1906 Pagemill", {
      status: "cancelled",
      invoiceStatus: "paid",
      paymentStatus: "paid",
      paidAt: "2026-02-01",
      galleryStatus: "delivered",
      deliveredAt: "2026-02-02",
      amountPaid: 549,
      total: 549,
    });
    expect(html).toMatch(/bg-red-100 text-red-700[^"]*">Cancelled/);
    expect(html).toContain("Checking");
    expect(html).toContain("Checking invoice");
  });

  it("renders a placeholder when the address is missing", () => {
    const html = renderListing(undefined);
    expect(heading(html)).toBe("—");
    expect(html).toContain("QA Tester");
    expect(html).not.toContain("[object Object]");
  });
});
