import { createPortal } from "react-dom";

export interface DragGhostModel {
  x: number;
  y: number;
  title: string;
  subtitle?: string;
  imageUrl?: string;
}

/** Semi-transparent copy of the dragged card. It follows the pointer on mouse and touch. */
export function DragGhost({ ghost }: { ghost: DragGhostModel | null }) {
  if (!ghost || typeof document === "undefined") return null;
  return createPortal(
    <div
      data-testid="drag-ghost"
      aria-hidden
      className="pointer-events-none fixed z-[90] w-[220px] overflow-hidden rounded-xl border-2 border-[#0d9488]/60 bg-white/75 shadow-[0_16px_40px_rgba(13,148,136,0.35)] ring-4 ring-[#0d9488]/25"
      style={{ left: ghost.x, top: ghost.y, transform: "translate(-42%, -46%)", opacity: 0.72 }}
    >
      {ghost.imageUrl ? (
        <img src={ghost.imageUrl} alt="" className="aspect-[4/3] w-full object-cover opacity-90" />
      ) : null}
      <div className="px-3 py-2">
        <p className="truncate text-sm font-semibold text-slate-900">{ghost.title}</p>
        {ghost.subtitle ? <p className="truncate text-[11px] text-slate-500">{ghost.subtitle}</p> : null}
      </div>
    </div>,
    document.body,
  );
}

/** Highlighted gap where the item will land. */
export function dragDropClass(active: boolean): string {
  return active
    ? "z-[1] border-2 border-dashed border-[#0d9488] bg-[#f0fdfa] shadow-[0_0_0_4px_rgba(13,148,136,0.22)]"
    : "";
}
