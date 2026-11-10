import type { ReactNode } from "react";

/**
 * Cursor-following drag ghost and the slot that shows where a photo or
 * section will land.
 *
 * Another change is adding a shared ghost for the task board and gallery
 * media. That component is not on main, so this one stays self-contained.
 * It uses the same contract: a ghost at the pointer and a drop placeholder
 * at the landing spot. Swap this file for the shared one when it lands.
 */
export interface DragGhostModel {
  x: number;
  y: number;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  kind: "item" | "section";
}

export function DragGhost({ ghost }: { ghost: DragGhostModel | null }) {
  if (!ghost) return null;
  return (
    <div
      data-testid="drag-ghost"
      data-drag-kind={ghost.kind}
      className="pointer-events-none fixed z-[80] w-[210px] overflow-hidden rounded-2xl border border-[#14a08a] bg-white shadow-[0_8px_30px_rgba(26,29,28,.18)]"
      style={{ left: ghost.x + 14, top: ghost.y + 16, transform: "rotate(2.5deg) scale(1.03)" }}
    >
      {ghost.kind === "item" && ghost.imageUrl ? (
        <img src={ghost.imageUrl} alt="" className="h-28 w-full object-cover opacity-80" draggable={false} />
      ) : (
        <div className="flex h-16 items-center justify-center bg-[#e6f6f2] text-[11px] font-semibold uppercase tracking-wider text-[#0e8a76]">
          {ghost.kind === "section" ? "Section" : "File"}
        </div>
      )}
      <div className="px-3 py-2">
        <p className="truncate text-xs font-semibold text-[#1a1d1c]">{ghost.title}</p>
        {ghost.subtitle && <p className="truncate text-[11px] text-[#7a8480]">{ghost.subtitle}</p>}
      </div>
    </div>
  );
}

export function DropPlaceholder({ label = "Drop here", testId = "drop-indicator" }: { label?: string; testId?: string }) {
  return (
    <div
      data-testid={testId}
      className="grid aspect-[4/3] place-items-center rounded-2xl border-2 border-dashed border-[#14a08a] bg-[#14a08a]/5 text-xs font-semibold text-[#0e8a76]"
    >
      {label}
    </div>
  );
}

export function SectionDropBar({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <div
      data-testid="section-drop-indicator"
      className="mb-4 rounded-2xl border border-dashed border-[#14a08a] bg-[#14a08a]/5 px-4 py-3 text-center text-xs font-semibold text-[#0e8a76]"
    >
      {label}
      {children}
    </div>
  );
}
