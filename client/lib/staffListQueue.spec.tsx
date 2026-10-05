import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import StaffActionQueue from "@/components/StaffActionQueue";
import {
  CLIENT_QUEUE,
  LISTING_QUEUE,
  clientNextAction,
  countClientQueue,
  countListingQueue,
  listingNextAction,
  listingStatusChips,
} from "./staffListQueue";

const now = new Date("2026-10-05T15:00:00Z");

describe("listing action queue", () => {
  it("asks for a date before a photographer", () => {
    expect(listingNextAction({ status: "unscheduled" }, now)).toBe("needs_date");
    expect(listingNextAction({ status: "scheduled" }, now)).toBe("needs_date");
  });

  it("asks for a photographer on a future dated project", () => {
    expect(listingNextAction({
      status: "scheduled",
      apptDate: "2026-10-08",
    }, now)).toBe("needs_photographer");
    expect(listingNextAction({
      status: "consult_scheduled",
      apptDate: "2026-10-08",
      photographerNames: ["Ava"],
    }, now)).toBeNull();
  });

  it("moves a past or in-progress shoot to photos, then delivery", () => {
    expect(listingNextAction({
      status: "appt_scheduled",
      apptDate: "2026-10-01",
      photographerIds: ["p1"],
    }, now)).toBe("needs_photos");
    expect(listingNextAction({
      status: "in_progress",
      photographerIds: ["p1"],
      images: [{ url: "https://example.com/a.jpg" }],
    }, now)).toBe("ready_to_deliver");
  });

  it("collects payment after delivery and leaves paid work off the queue", () => {
    expect(listingNextAction({ status: "delivered" }, now)).toBe("needs_payment");
    expect(listingNextAction({ status: "delivered_unpaid" }, now)).toBe("needs_payment");
    expect(listingNextAction({ status: "paid", apptDate: "2026-10-01" }, now)).toBeNull();
    expect(listingNextAction({ status: "archived" }, now)).toBeNull();
    expect(listingNextAction({ status: "cancelled" }, now)).toBeNull();
  });

  it("counts each project once", () => {
    const counts = countListingQueue([
      { status: "unscheduled" },
      { status: "scheduled", apptDate: "2026-10-09" },
      { status: "delivered" },
      { status: "paid" },
    ], now);
    expect(counts.needs_date).toBe(1);
    expect(counts.needs_photographer).toBe(1);
    expect(counts.needs_payment).toBe(1);
    expect(counts.needs_photos).toBe(0);
  });

  it("shows business appointment statuses only for that project type", () => {
    expect(listingStatusChips("business").map((chip) => chip.value)).toContain("consult_scheduled");
    expect(listingStatusChips("business").map((chip) => chip.value)).not.toContain("scheduled");
    expect(listingStatusChips("real_estate").map((chip) => chip.value)).toContain("scheduled");
    expect(listingStatusChips("all").map((chip) => chip.label)).toContain("Consult scheduled");
  });
});

describe("client action queue", () => {
  it("puts a missing email ahead of a missing phone", () => {
    expect(clientNextAction({ status: "active" })).toBe("missing_email");
    expect(clientNextAction({ email: "a@b.com", status: "vip" })).toBe("missing_phone");
  });

  it("follows up inactive clients before opening a portal", () => {
    expect(clientNextAction({
      email: "a@b.com",
      phone: "713-555-0100",
      status: "inactive",
      portalAccess: false,
    })).toBe("follow_up");
    expect(clientNextAction({
      email: "a@b.com",
      phone: "713-555-0100",
      status: "active",
    })).toBe("no_portal");
    expect(clientNextAction({
      email: "a@b.com",
      phone: "713-555-0100",
      status: "vip",
      portalAccess: true,
    })).toBeNull();
  });

  it("counts the clients that still need a step", () => {
    const counts = countClientQueue([
      { email: "", phone: "713-555-0100" },
      { email: "a@b.com", phone: "", status: "active" },
      { email: "b@b.com", phone: "713-555-0101", status: "inactive" },
      { email: "c@b.com", phone: "713-555-0102", status: "active", portalAccess: true },
    ]);
    expect(counts).toEqual({
      missing_email: 1,
      missing_phone: 1,
      follow_up: 1,
      no_portal: 0,
    });
  });
});

describe("action queue strip", () => {
  it("prints the Iconic next-step labels and counts", () => {
    const html = renderToString(
      <StaffActionQueue
        activeId="needs_date"
        onSelect={() => undefined}
        note="Status filters pause while an action queue is open."
        items={LISTING_QUEUE.map((item) => ({ ...item, count: item.id === "needs_date" ? 4 : 0 }))}
      />,
    );
    expect(html).toContain("Action queue");
    expect(html).toContain("Set a date");
    expect(html).toContain("Assign photographer");
    expect(html).toContain("Waiting on photos");
    expect(html).toContain("Deliver files");
    expect(html).toContain("Collect payment");
    expect(html).toContain("4 waiting");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Status filters pause while an action queue is open.");
    expect(html).not.toContain("Aryeo");
  });

  it("uses the client follow-up labels", () => {
    const html = renderToString(
      <StaffActionQueue
        activeId={null}
        onSelect={() => undefined}
        items={CLIENT_QUEUE.map((item) => ({ ...item, count: 0 }))}
      />,
    );
    expect(html).toContain("Add an email");
    expect(html).toContain("Add a phone");
    expect(html).toContain("Follow up");
    expect(html).toContain("Open portal");
    expect(html).toContain("0 waiting");
  });
});
