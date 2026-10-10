import { isPlaytestRecord, PLAYTEST_LABEL, type PlaytestLinks } from "@shared/playtestRecord";
import { cn } from "@/lib/utils";

export function PlaytestBadge({
  record,
  links,
  className,
}: {
  record: unknown;
  links?: PlaytestLinks;
  className?: string;
}) {
  if (!isPlaytestRecord(record, links)) return null;
  return (
    <span className={cn(
      "ml-1.5 inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-amber-800",
      className,
    )}>
      {PLAYTEST_LABEL}
    </span>
  );
}
