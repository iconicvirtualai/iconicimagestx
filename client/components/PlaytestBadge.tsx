import { PLAYTEST_LABEL, isPlaytestRecord } from "@shared/revenueCount";

/** Staff lists keep playtest rows and mark them TEST. */
export function PlaytestBadge({ record }: { record: unknown }) {
  if (!isPlaytestRecord(record)) return null;
  return (
    <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-amber-800">
      {PLAYTEST_LABEL}
    </span>
  );
}
