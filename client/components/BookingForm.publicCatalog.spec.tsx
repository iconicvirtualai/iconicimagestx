import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import BookingForm from "./BookingForm";
import { AdminCatalogPackageTitle } from "@/pages/AdminBookingCatalog";
import {
  bookingOffer,
  packagesForStaffEditor,
  publicBookingCatalogResponse,
} from "@shared/bookingCatalog";

function renderBook(url = "/book") {
  return renderToString(
    <MemoryRouter initialEntries={[url]}>
      <BookingForm />
    </MemoryRouter>,
  );
}

describe("public booking catalog", () => {
  it("leaves unpriced packages off /book and shows a priced package", () => {
    const html = renderBook();
    expect(html).toContain("The Essentials");
    expect(html).toContain("Select your Campaign Tier");
    expect(html).not.toContain("Studio Noir");
    expect(html).not.toContain("Studio Blanc");
    expect(html).not.toContain("Call for pricing");
    expect(html).not.toContain("price-hold-");
    expect(html).not.toContain("Studio 105");
  });

  it("falls back to the normal picker when ?package= points at a hidden item", () => {
    const hidden = renderBook("/book?package=studio-noir");
    expect(hidden).toContain("The Essentials");
    expect(hidden).toContain("Select your Campaign Tier");
    expect(hidden).toContain("Select a package");
    expect(hidden).not.toContain("Studio Noir");
    expect(hidden).not.toContain("Call for pricing");
    expect(hidden).not.toContain("scale-[1.01]");

    const priced = renderBook("/book?package=listing-essentials");
    expect(priced).toContain("The Essentials");
    expect(priced).toContain("scale-[1.01]");
    expect(priced).not.toContain("Studio Noir");
  });

  it("omits an unpriced add-on from the public catalog response and keeps a priced one", () => {
    const catalog = packagesForStaffEditor([
      {
        id: "twilight-hold",
        name: "Twilight Hold",
        bookingKind: "addon",
        category: "addon",
        addonGroup: "The Space",
        isActive: true,
      },
    ]);
    const response = publicBookingCatalogResponse(catalog);
    const ids = response.packages.map((item) => item.id);
    expect(ids).not.toContain("twilight-hold");
    expect(ids).not.toContain("studio-noir");
    expect(ids).toContain("aerial-drone");
    expect(ids).toContain("listing-essentials");
    expect(bookingOffer(catalog).addOns.some((group) => group.items.some((item) => item.id === "twilight-hold"))).toBe(false);
    expect(bookingOffer(catalog).addOns.some((group) => group.items.some((item) => item.id === "aerial-drone"))).toBe(true);
  });

  it("still lists the unpriced package for staff", () => {
    const rows = packagesForStaffEditor([], { includeInactive: true });
    const noir = rows.find((item) => item.id === "studio-noir");
    const essentials = rows.find((item) => item.id === "listing-essentials");
    expect(noir).toBeTruthy();
    expect(essentials).toBeTruthy();
    const html = renderToString(
      <>
        <AdminCatalogPackageTitle item={noir!} />
        <AdminCatalogPackageTitle item={essentials!} />
      </>,
    );
    expect(html).toContain("Studio Noir");
    expect(html).toContain("Unpriced, hidden from /book");
    expect(html).toContain("The Essentials");
    expect(html.match(/Unpriced, hidden from \/book/g)).toHaveLength(1);
  });
});
