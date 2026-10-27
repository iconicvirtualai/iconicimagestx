import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { OpsBoard } from "./OpsBoard";
import { sampleOpsBoard } from "@shared/opsLifecycle";

const jobs = sampleOpsBoard("2026-10-27");

function render(stage: "shoots" | "uploads" | "review" | "delivered") {
  return renderToString(
    <MemoryRouter>
      <OpsBoard
        stage={stage}
        jobs={jobs}
        selectedId=""
        canMove
        canUpload
        showPreview
        demo={false}
        iconicPolish={false}
        onStage={() => undefined}
        onSelect={() => undefined}
        onIconicPolish={() => undefined}
        onMove={() => undefined}
      />
    </MemoryRouter>,
  );
}

describe("ops board", () => {
  it("shows one lifecycle and one list per stage", () => {
    const shoots = render("shoots");
    expect(shoots).toContain('data-testid="ops-board"');
    expect(shoots).toContain("View as photographer");
    expect(shoots).toContain("14 Maple Drive, Austin, TX");
    expect(shoots).not.toContain("10 Oak Street, Austin, TX");
    expect(shoots).not.toContain("22 River Road, Austin, TX");
    expect(shoots).not.toContain("8 Cedar Lane, Austin, TX");

    const uploads = render("uploads");
    expect(uploads).toContain("10 Oak Street, Austin, TX");
    expect(uploads).toContain("HDR 1");
    expect(uploads).toContain("Cull 1");
    expect(uploads).not.toContain("14 Maple Drive, Austin, TX");
    expect(uploads.toLowerCase()).not.toContain("autohdr");

    const review = render("review");
    expect(review).toContain("22 River Road, Austin, TX");
    expect(review).toContain("Undelivered");
    expect(review).not.toContain("8 Cedar Lane, Austin, TX");

    const delivered = render("delivered");
    expect(delivered).toContain("8 Cedar Lane, Austin, TX");
    expect(delivered).toContain("Delivered");
    expect(delivered).not.toContain("22 River Road, Austin, TX");
  });
});
