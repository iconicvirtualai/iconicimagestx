import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { TaskBoardView } from "./TaskBoardView";
import { sampleTaskBoard } from "@shared/taskBoard";

const TODAY = "2026-11-08";

function renderBoard(view: "list" | "board" = "list") {
  const model = sampleTaskBoard(TODAY);
  return renderToString(
    <MemoryRouter>
      <TaskBoardView
        tasks={model.tasks}
        staff={model.staff}
        today={TODAY}
        meId="sample-cadi"
        sample
        emailNotice={model.emailNotice}
        sourceErrors={[]}
        view={view}
        selectedId={null}
        onView={() => undefined}
        onSelect={() => undefined}
        onToggle={() => undefined}
        onDelete={() => undefined}
        onAssign={() => undefined}
        onPriority={() => undefined}
        onDue={() => undefined}
        onStage={() => undefined}
        onReorder={() => undefined}
        onCreate={() => undefined}
      />
    </MemoryRouter>,
  );
}

describe("task board view", () => {
  it("shows the checklist, real sample counts, links, and strikethrough", () => {
    const html = renderBoard("list");
    expect(html).toContain("Your entire operation. One checklist.");
    expect(html).toContain("Sample data");
    expect(html).toContain("Schedule order #123");
    expect(html).toContain("Deliver order #128");
    expect(html).toContain("Prepare weekly team agenda");
    expect(html).toContain("Approve gallery · order #122");
    expect(html).toContain("line-through");
    expect(html).toContain("/admin/order-request/sample-order-123");
    expect(html).toContain("/admin/ops?stage=review");
    expect(html).toContain("Mike");
    expect(html).toContain("Daniel");
    expect(html).toContain(">7<");
    expect(html).toContain("Mike + Daniel");
    expect(html).toContain("Please replace the opening photo");
    expect(html).toContain("Inbound email is not connected");
    expect(html).toContain("does not send email");
    expect(html).toContain("Delete removes this task only");
  });

  it("uses the same tasks on the board", () => {
    const list = renderBoard("list");
    const board = renderBoard("board");
    for (const title of ["Schedule order #123", "Deliver order #128", "Edit listing reel", "Podcast episode", "Prepare weekly team agenda"]) {
      expect(list).toContain(title);
      expect(board).toContain(title);
    }
    expect(board).toContain("task-board-columns");
    expect(board).toContain("In production");
    expect(board).toContain("Ready");
  });
});

describe("task board page safeguards", () => {
  it("writes the task collection only and does not send mail or texts", () => {
    const page = readFileSync("client/pages/AdminTaskBoard.tsx", "utf8");
    const view = readFileSync("client/components/taskBoard/TaskBoardView.tsx", "utf8");
    const rules = readFileSync("firestore.rules", "utf8");
    expect(page).not.toMatch(/nodemailer|twilio|sendSms|sendMail|updateDoc/);
    expect(view).not.toMatch(/nodemailer|twilio|sendSms|sendMail/);
    expect(page).toContain("TASK_BOARD_COLLECTION");
    expect(page).not.toContain('doc(db, "orders"');
    expect(page).not.toContain('doc(db, "galleries"');
    expect(rules).toContain("match /taskBoardItems/{itemId}");
  });
});
