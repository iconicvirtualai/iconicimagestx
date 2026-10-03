import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { PortalListingDetailView } from "./PortalListingDetail";
import { buildPortalListingDetail, defaultPortalWebsite } from "@shared/portalListingDetail";

const detail = buildPortalListingDetail({
  listing: {
    id: "listing1234",
    status: "scheduled",
    address: { street: "18 Oak Hollow", city: "Spring", state: "TX", zip: "77389" },
    bedrooms: 3,
    images: [
      { id: "front", name: "front.jpg", url: "https://cdn.example/front.jpg", contentType: "image/jpeg" },
      { id: "back", name: "back.jpg", url: "https://cdn.example/back.jpg", contentType: "image/jpeg", hiddenFromPresentation: true },
    ],
    videos: [{ id: "reel", name: "tour.mov", url: "https://cdn.example/tour.mov", contentType: "video/quicktime" }],
  },
  orderRequest: { id: "req1", submittedAt: "2026-03-30T15:00:00.000Z" },
  invoices: [{ id: "inv1", invoiceNumber: "INV-2026-100", status: "draft", total: 100, amountDue: 100 }],
});

function render(tab: "data" | "photos" | "marketing" | "orders" | "activity" | "website", editing: "photo" | null = null) {
  return renderToString(
    <MemoryRouter>
      <PortalListingDetailView
        detail={detail}
        tab={tab}
        editing={editing}
        saving={false}
        website={defaultPortalWebsite()}
        onTab={() => undefined}
        onToggleEditing={() => undefined}
        onMedia={() => undefined}
        onWebsite={() => undefined}
        onWebsiteSave={() => undefined}
      />
    </MemoryRouter>,
  );
}

describe("portal listing detail page", () => {
  it("shows the address and leaves missing property facts as placeholders", () => {
    const html = render("data");
    expect(html).toContain("18 Oak Hollow");
    expect(html).toContain("Spring");
    expect(html).toContain("77389");
    expect(html).toContain("Not on file yet");
    expect(html).toContain("Public record lookups are not part of this page.");
    for (const tab of ["data", "photos", "video", "tours", "floorplans", "marketing", "website", "orders", "activity"]) {
      expect(html).toContain(`listing-tab-${tab}`);
    }
  });

  it("shows a hidden photo only while editing", () => {
    expect(render("photos")).not.toContain("back.jpg");
    const editing = render("photos", "photo");
    expect(editing).toContain("back.jpg");
    expect(editing).toContain("Hidden");
    expect(editing).toContain("Hide");
  });

  it("scaffolds marketing, invoices, and activity without a pay action", () => {
    expect(render("marketing")).toContain("Design tools are not connected yet.");
    const orders = render("orders");
    expect(orders).toContain("INV-2026-100");
    expect(orders).toContain("draft");
    expect(orders).toContain("Total");
    expect(orders).not.toContain("View invoice");
    expect(orders).not.toContain("/invoice/");
    expect(orders).not.toContain("Pay now");
    expect(render("activity")).toContain("Booking request received");
    expect(render("website")).toContain("Save site style");
  });
});
