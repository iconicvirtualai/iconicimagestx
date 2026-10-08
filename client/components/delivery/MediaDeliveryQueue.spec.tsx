import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import MediaDeliveryQueue from "./MediaDeliveryQueue";
import { sampleMediaDeliveryRows } from "@shared/mediaDelivery";

const rows = sampleMediaDeliveryRows();

function render(filter: "all" | "pending" | "undelivered" | "delivered" = "all", canMove = true) {
  return renderToString(
    <MediaDeliveryQueue
      rows={rows}
      filter={filter}
      canMove={canMove}
      onFilter={() => undefined}
      onMove={() => undefined}
    />,
  );
}

describe("staff delivery queue", () => {
  it("shows Iconic labels and studio job counts", () => {
    const html = render();
    expect(html).toContain("delivery-queue");
    expect(html).toContain("Pending");
    expect(html).toContain("Undelivered");
    expect(html).toContain("Delivered");
    expect(html).toContain("22 River Road, Austin, TX");
    expect(html).toContain('href="/admin/studio/editing?listingId=listingReady001"');
    expect(html).not.toContain("/admin/iconic-studio");
    expect(html).toContain("Studio: 1 in review · 1 approved");
    expect(html).not.toContain("Iconic Studio");
    expect(html).toContain("No gallery is linked yet");
    expect(html).toContain("delivery-move-galleryUndeliver1-delivered");
    expect(html).not.toContain("delivery-move-galleryDelivered1-delivered");
    expect(html.toLowerCase()).not.toContain("autohdr");
  });

  it("filters to Undelivered and hides moves when the viewer cannot deliver", () => {
    const filtered = render("undelivered", false);
    expect(filtered).toContain("22 River Road, Austin, TX");
    expect(filtered).not.toContain("10 Oak Street");
    expect(filtered).not.toContain("Mark Delivered");
    expect(filtered).toContain("Studio: 1 in review · 1 approved");
    expect(filtered).not.toContain("Iconic Studio");
  });
});
