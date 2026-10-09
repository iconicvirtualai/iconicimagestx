import { describe, expect, it } from "vitest";
import {
  buildPhotographerPortal,
  chicagoDateKey,
  filterPhotographerJobs,
  jobNeedsPhotographer,
  photographerAcceptsFile,
  photographerPayEstimate,
  photographerUploadFolder,
  photographerUploadHref,
  type PhotographerListingInput,
} from "./photographerPortal";

const TODAY = "2026-10-05";

function listing(overrides: PhotographerListingInput = {}): PhotographerListingInput {
  return {
    id: "job-1",
    status: "scheduled",
    address: "10 Oak Street, Austin, TX",
    clientName: "Ada Agent",
    apptDate: "2026-10-05T17:00:00.000Z",
    apptTime: "10:00 AM",
    services: ["Photography"],
    images: [],
    ...overrides,
  };
}

describe("photographer portal jobs", () => {
  it("keeps Chicago calendar days on the shoot date", () => {
    expect(chicagoDateKey(new Date("2026-10-05T05:00:00.000Z"))).toBe("2026-10-05");
    expect(chicagoDateKey(new Date("2026-10-05T04:59:00.000Z"))).toBe("2026-10-04");
  });

  it("keeps a date-only shoot and a UTC-midnight timestamp on November 17", () => {
    const today = "2026-11-16";
    const [fromDay] = buildPhotographerPortal({
      today,
      listings: [listing({ id: "day", apptDate: "2026-11-17" })],
    });
    const [fromMidnight] = buildPhotographerPortal({
      today,
      listings: [listing({ id: "midnight", apptDate: "2026-11-17T00:00:00.000Z" })],
    });
    expect(fromDay.when).toBe("upcoming");
    expect(fromDay.dateLabel).toBe("Tue, Nov 17");
    expect(fromMidnight.when).toBe("upcoming");
    expect(fromMidnight.dateLabel).toBe("Tue, Nov 17");
    expect(fromMidnight.dateLabel).not.toContain("16");
  });

  it("asks for an upload when today's shoot has no photos", () => {
    const [job] = buildPhotographerPortal({ today: TODAY, listings: [listing()] });
    expect(job.when).toBe("today");
    expect(job.address).toBe("10 Oak Street, Austin, TX");
    expect(job.action.kind).toBe("upload");
    expect(job.action.statusLabel).toBe("Needs upload");
    expect(job.action.label).toBe("Upload the shoot");
    expect(job.studio.headline).toBe("No photos on this job yet.");
    expect(jobNeedsPhotographer(job)).toBe(true);
    expect(filterPhotographerJobs([job], "next")).toHaveLength(1);
  });

  it("uses property address and still shows a job with no shoot time", () => {
    const [job] = buildPhotographerPortal({
      today: TODAY,
      listings: [listing({
        id: "undated",
        address: "",
        propertyAddress: "88 River Road",
        apptDate: null,
        shootDate: null,
      })],
    });
    expect(job.address).toBe("88 River Road");
    expect(job.when).toBe("unscheduled");
    expect(job.action.kind).toBe("upload");
    expect(job.dateLabel).toBe("No shoot time");
    expect(filterPhotographerJobs([job], "today")).toHaveLength(0);
    expect(filterPhotographerJobs([job], "next")).toHaveLength(1);
  });

  it("formats a street object and leaves an upcoming shoot off the action list", () => {
    const [job] = buildPhotographerPortal({
      today: TODAY,
      listings: [listing({
        address: { street: "4 Elm Ave", city: "Dallas", state: "TX", zip: "75201" },
        apptDate: "2026-10-20",
      })],
    });
    expect(job.address).toBe("4 Elm Ave, Dallas, TX, 75201");
    expect(job.when).toBe("upcoming");
    expect(job.action.kind).toBe("shoot");
    expect(job.action.label).toBe("Get directions");
    expect(job.mapsHref).toContain("maps.google.com");
    expect(jobNeedsPhotographer(job)).toBe(false);
  });

  it("reads a Google Places address on the job card", () => {
    const [job] = buildPhotographerPortal({
      today: TODAY,
      listings: [listing({
        address: {
          formatted: "100 Congress Ave, Austin, TX 78701",
          lat: 30.2648,
          lng: -97.7431,
          placeId: "place_congress",
        },
      })],
    });
    expect(job.address).toBe("100 Congress Ave, Austin, TX 78701");
    expect(job.mapsHref).toContain("100%20Congress");
  });

  it("shows Iconic Studio editing status after photos are in", () => {
    const [job] = buildPhotographerPortal({
      today: TODAY,
      listings: [listing({ images: [{ name: "a.jpg" }, { name: "b.jpg" }] })],
      studioJobs: [
        { listingId: "job-1", status: "processing", sourcePath: "listings/job-1/photos/a.jpg" },
        { listingId: "job-1", status: "pending", sourcePath: "listings/job-1/photos/b.jpg" },
        { listingId: "other", status: "failed", sourcePath: "x" },
      ],
    });
    expect(job.imageCount).toBe(2);
    expect(job.action.statusLabel).toBe("Editing now");
    expect(job.action.kind).toBe("wait");
    expect(job.studio.headline).toBe("Studio is editing 1 photo.");
    expect(job.studio.counts.map((count) => count.label)).toEqual(["Editing", "Queued"]);
    expect(jobNeedsPhotographer(job)).toBe(false);
  });

  it("puts a failed edit ahead of the upload step", () => {
    const [job] = buildPhotographerPortal({
      today: TODAY,
      listings: [listing({ images: [{ name: "a.jpg" }] })],
      studioJobs: [{ listingId: "job-1", status: "failed", sourcePath: "listings/job-1/photos/a.jpg" }],
    });
    expect(job.action.kind).toBe("review");
    expect(job.action.statusLabel).toBe("Needs a look");
    expect(job.studio.headline).toContain("failed");
    expect(job.studioHref).toBe("/admin/studio/editing?listingId=job-1");
  });

  it("asks for review when Iconic Studio finishes a photo", () => {
    const [job] = buildPhotographerPortal({
      today: TODAY,
      listings: [listing({ status: "uploaded", images: [{ name: "a.jpg" }] })],
      studioJobs: [{ listingId: "job-1", status: "review", sourcePath: "listings/job-1/photos/a.jpg" }],
    });
    expect(job.action.label).toBe("Review edits");
    expect(job.action.statusLabel).toBe("Ready to review");
    expect(job.officeStatus).toBe("uploaded");
  });

  it("sends a delivered job with approved edits to the office", () => {
    const [job] = buildPhotographerPortal({
      today: TODAY,
      listings: [listing({
        status: "delivered",
        apptDate: "2026-09-01T17:00:00.000Z",
        images: [{ name: "a.jpg" }],
      })],
      studioJobs: [{ listingId: "job-1", status: "approved", sourcePath: "listings/job-1/photos/a.jpg" }],
    });
    expect(job.when).toBe("past");
    expect(job.action.kind).toBe("done");
    expect(job.action.statusLabel).toBe("With the office");
    expect(photographerPayEstimate([job], 75)).toEqual({ completed: 1, amount: 75 });
  });

  it("closes a cancelled job even when photos are missing", () => {
    const [job] = buildPhotographerPortal({
      today: TODAY,
      listings: [listing({ status: "cancelled" })],
    });
    expect(job.action.kind).toBe("closed");
    expect(jobNeedsPhotographer(job)).toBe(false);
  });

  it("points twilight waits back to Iconic Studio", () => {
    const [job] = buildPhotographerPortal({
      today: TODAY,
      listings: [listing({ images: [{ name: "front.jpg" }] })],
      studioJobs: [{ listingId: "job-1", status: "pending", origin: "order", sourcePath: "" }],
    });
    expect(job.action.statusLabel).toBe("Waiting on a photo");
    expect(job.action.detail).toContain("exterior");
  });

  it("routes JPEG uploads to photos and RAW uploads to raw", () => {
    expect(photographerUploadFolder("front.jpg", "image/jpeg")).toBe("photos");
    expect(photographerUploadFolder("frame.CR2", "")).toBe("raw");
    expect(photographerAcceptsFile("frame.NEF", "")).toBe(true);
    expect(photographerAcceptsFile("notes.txt", "text/plain")).toBe(false);
    expect(photographerUploadHref("job 1", true)).toBe("/admin/upload?job=job+1&polish=1");
  });
});
