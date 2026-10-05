import { queueTone, type QueueChip } from "@/lib/staffListQueue";

export interface StaffQueueItem extends QueueChip {
  count: number;
}

interface StaffActionQueueProps {
  items: StaffQueueItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  note?: string;
}

/** Shared action-queue strip for the client and project lists. */
export default function StaffActionQueue({ items, activeId, onSelect, note }: StaffActionQueueProps) {
  const waiting = items.reduce((sum, item) => sum + item.count, 0);

  return (
    <section className="mb-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm" aria-label="Action queue">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Action queue</p>
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
          {`${waiting} waiting`}
        </p>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by next step">
        {items.map((item) => {
          const active = activeId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={active}
              title={item.hint}
              onClick={() => onSelect(item.id)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-colors ${queueTone(active, item.count)}`}
            >
              {item.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${active ? "bg-white/20" : "bg-gray-100 text-gray-600"}`}>
                {item.count}
              </span>
            </button>
          );
        })}
      </div>
      {note && <p className="mt-3 text-xs font-bold text-gray-500">{note}</p>}
    </section>
  );
}
