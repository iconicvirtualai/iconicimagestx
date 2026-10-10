import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { AdminOrderTile } from "./AdminOrderTile";
import { sampleAdminOrderTiles } from "@shared/adminOrderTile";
import { projectSurfaceStatus } from "@shared/projectSurfaceStatus";

const [listing, business] = sampleAdminOrderTiles();

describe("admin order tile chrome", () => {
  it("shows the shared package line and listing ops slots", () => {
    const html = renderToString(<AdminOrderTile order={listing} selected onToggleSelect={() => undefined} />);
    expect(html).toContain("The Showcase");
    expect(html).toContain("Client skin: Showcase");
    expect(html).toContain("$549");
    expect(html).toContain("per listing");
    expect(html).toContain("Paid");
    expect(html).toContain("In progress");
    expect(html).toContain(">Client<");
    expect(html).toContain("Location:");
    expect(html).toContain("123 Main Street, Conroe, TX 77304");
    expect(html).toContain("01.01.2026");
    expect(html).toContain("ORD - L - 10482");
    expect(html).toContain("Listings &amp; Spaces");
    expect(html).toContain("Listing");
    expect(html).not.toContain("data-slot=\"studio\"");
    expect(html).not.toContain("Studio Blanc");
    expect(html.toLowerCase()).not.toMatch(/pink|magenta|fuchsia/);
  });

  it("selects one studio on the business tile", () => {
    const html = renderToString(<AdminOrderTile order={business} onStudioChange={() => undefined} />);
    expect(html).toContain("Content Partner");
    expect(html).toContain("Client skin: Content Partner");
    expect(html).toContain("$999/mo");
    expect(html).toContain("per month");
    expect(html).toContain("Delivered");
    expect(html).toContain("N/A — brand session");
    expect(html).toContain("ORD - B - 22017");
    expect(html).toContain("Human Brand");
    expect(html).toContain("Studio Noir");
    expect(html).toContain("Studio Blanc");
    expect(html).toContain("Podcast Studio");
    expect(html).toContain("Offsite");
    expect(html).toContain("aria-pressed=\"true\"");
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain("Business");
  });

  it("shows Cancelled and Paid together and does not call a cancelled project Delivered", () => {
    const surface = projectSurfaceStatus({
      listing: {
        id: "5PBP8HYUaADAOJRGwoeU",
        status: "cancelled",
        invoiceStatus: "paid",
        galleryStatus: "delivered",
        deliveredAt: "2026-02-02",
      },
      invoices: [{ id: "inv_paid", status: "paid", total: 549, amountPaid: 549, listingId: "5PBP8HYUaADAOJRGwoeU" }],
    });
    const html = renderToString(<AdminOrderTile order={listing} surface={surface} />);
    expect(html).toContain("Cancelled");
    expect(html).toContain("Paid");
    expect(html).toContain('data-status="cancelled"');
    expect(html).toContain('data-paid="paid"');
    expect(html).not.toContain(">Delivered<");
  });
});
