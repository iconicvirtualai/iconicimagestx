import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { buildPhotographerPortal } from "@shared/photographerPortal";
import { PhotographerPortal } from "./PhotographerPortal";

const TODAY = "2026-10-05";

function renderPortal(overrides: Partial<Parameters<typeof PhotographerPortal>[0]> = {}) {
  const jobs = overrides.jobs ?? buildPhotographerPortal({
    today: TODAY,
    listings: [
      {
        id: "today-job",
        status: "scheduled",
        address: "10 Oak Street, Austin, TX",
        clientName: "Ada Agent",
        apptDate: "2026-10-05T17:00:00.000Z",
        apptTime: "10:00 AM",
        accessInfo: "Lockbox 4481",
        images: [],
      },
      {
        id: "editing-job",
        status: "uploaded",
        propertyAddress: "88 River Road",
        clientName: "Bea Broker",
        apptDate: "2026-10-01T17:00:00.000Z",
        images: [{ name: "front.jpg" }],
      },
    ],
    studioJobs: [
      { listingId: "editing-job", status: "processing", sourcePath: "listings/editing-job/photos/front.jpg" },
    ],
  });
  return renderToString(
    <MemoryRouter>
      <PhotographerPortal
        firstName="Casey"
        jobs={jobs}
        tab="next"
        onTab={() => undefined}
        iconicPolish={false}
        onIconicPolish={() => undefined}
        payRate={75}
        onUpload={() => undefined}
        {...overrides}
        jobs={jobs}
      />
    </MemoryRouter>,
  );
}

describe("photographer portal view", () => {
  it("shows the upload step and Iconic status on the next list", () => {
    const html = renderPortal();
    expect(html).toContain("Photographer portal");
    expect(html).toContain("Casey, your assigned shoots are on this page.");
    expect(html).toContain("Upload the shoot");
    expect(html).toContain("10 Oak Street, Austin, TX");
    expect(html).toContain("Needs upload");
    expect(html).toContain("Lockbox 4481");
    expect(html).toContain("Open the job");
    expect(html).toContain("Read the status");
    expect(html).not.toContain("88 River Road");
  });

  it("shows Iconic Studio progress on the all-jobs list", () => {
    const html = renderPortal({ tab: "all" });
    expect(html).toContain("88 River Road");
    expect(html).toContain("Editing now");
    expect(html).toContain("Iconic Studio is editing 1 photo.");
    expect(html).toContain('href="/admin/studio/editing?listingId=editing-job"');
    expect(html).not.toContain("/admin/iconic-studio");
    expect(html).toContain("Add photos");
  });

  it("explains an empty assignment list", () => {
    const html = renderPortal({ jobs: [], tab: "next" });
    expect(html).toContain("No jobs are assigned to this login.");
  });

  it("does not call a failed load an empty assignment list", () => {
    const html = renderPortal({ jobs: [], tab: "next", error: "Failed to load jobs." });
    expect(html).toContain("Jobs did not load.");
    expect(html).not.toContain("No jobs are assigned to this login.");
  });

  it("labels pay as an estimate", () => {
    const html = renderPortal({ tab: "pay" });
    expect(html).toContain("Pay estimate");
    expect(html).toContain("Pay rates shown are estimates.");
    expect(html).toContain("88 River Road");
  });
});
