import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import MediaDeliveryQueue from "./MediaDeliveryQueue";
import { sampleMediaDeliveryRows, type MediaDeliveryRow } from "@shared/mediaDelivery";

const rows = sampleMediaDeliveryRows();

const orphan: MediaDeliveryRow = {
  id: "galleryOrphan01",
  galleryId: "galleryOrphan01",
  listingId: "zT9VnzBHtPjzEY3LFKGJ",
  orderId: null,
  address: "123 Iconic Test Lane",
  clientName: "Iconic Test",
  galleryStatus: "delivered",
  deliveryStatus: "delivered",
  label: "Delivered",
  mediaCount: 3,
  studio: { active: 0, review: 0, approved: 0, failed: 0 },
  moves: ["pending", "undelivered"],
  projectMissing: true,
  galleryMissing: false,
};

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
    expect(html).not.toContain("Project missing");
    expect(html).not.toContain("Gallery missing");
    expect(html.toLowerCase()).not.toContain("autohdr");
  });

  it("flags a deleted project and keeps the Studio link on live rows", () => {
    const html = renderToString(
      <MediaDeliveryQueue
        rows={[orphan, ...rows]}
        filter="delivered"
        canMove
        onFilter={() => undefined}
        onMove={() => undefined}
      />,
    );
    expect(html).toContain("123 Iconic Test Lane");
    expect(html).toContain("delivery-project-missing-galleryOrphan01");
    expect(html).toContain("Project missing");
    expect(html).not.toContain('href="/admin/studio/editing?listingId=zT9VnzBHtPjzEY3LFKGJ"');
    expect(html).not.toMatch(/href="[^"]*galleryOrphan01/);
    expect(html).toContain('href="/admin/studio/editing?listingId=listingDone0001"');
    expect(html).toContain("8 Cedar Lane, Austin, TX");
    expect(html).not.toContain("10 Oak Street");
    expect(html).toContain("delivery-move-galleryOrphan01-pending");
  });

  it("flags a deleted gallery without linking to it", () => {
    const live = rows.find((row) => row.id === "galleryDelivered1");
    if (!live) throw new Error("missing delivered sample");
    const gone: MediaDeliveryRow = {
      ...live,
      id: "listing:listingBare0001",
      galleryId: null,
      listingId: "listingBare0001",
      address: "4 Bare Studio, Austin, TX",
      galleryMissing: true,
      projectMissing: false,
      moves: [],
    };
    const html = renderToString(
      <MediaDeliveryQueue
        rows={[gone, live]}
        filter="all"
        canMove={false}
        onFilter={() => undefined}
        onMove={() => undefined}
      />,
    );
    expect(html).toContain("delivery-gallery-missing-listing:listingBare0001");
    expect(html).toContain("Gallery missing");
    expect(html).toContain('href="/admin/studio/editing?listingId=listingDone0001"');
    expect(html).toContain('href="/admin/studio/editing?listingId=listingBare0001"');
    expect(html).not.toMatch(/href="[^"]*galleryDelivered1/);
    expect(html).not.toContain("Project missing");
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
