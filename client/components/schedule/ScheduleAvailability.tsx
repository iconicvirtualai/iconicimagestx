import { shooterStatusLabel, type ShooterCue } from "@shared/scheduleBoard";
import { cn } from "@/lib/utils";

const STATUS_CLASS: Record<ShooterCue["status"], string> = {
  open: "border border-gray-200 bg-white text-gray-600",
  booked: "border border-[#0d9488] bg-[#0d9488] text-white",
  twilight: "border border-black bg-black text-[#f3d7a1]",
  hold: "border border-dashed border-gray-300 bg-white text-gray-500",
  unavailable: "border border-gray-200 bg-gray-100 text-gray-500",
};

export function TwilightLabel({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-black px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-[#f3d7a1]", className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-[#e7b25a]" aria-hidden="true" />
      Twilight
    </span>
  );
}

export function ScheduleDayStrip({
  dayLabel,
  summary,
  syncNote,
  shooters,
}: {
  dayLabel: string;
  summary: string;
  syncNote: string;
  shooters: ShooterCue[];
}) {
  return (
    <section className="mb-6 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm" aria-label="Day availability">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-black uppercase tracking-widest text-black">{dayLabel}</h2>
          <p className="mt-1 text-sm font-bold text-[#0d9488]">{summary}</p>
        </div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">{syncNote}</p>
      </div>
      {shooters.length === 0 ? (
        <p className="mt-4 text-sm font-bold text-gray-400">No photographers on the calendar roster.</p>
      ) : (
        <ul className="mt-4 flex flex-wrap gap-2">
          {shooters.map((shooter) => {
            const label = shooterStatusLabel(shooter);
            return (
              <li key={shooter.id}>
                <span
                  className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-widest", STATUS_CLASS[shooter.status])}
                  aria-label={`${shooter.name}: ${label}`}
                >
                  <span>{shooter.name}</span>
                  <span className={shooter.status === "booked" || shooter.status === "twilight" ? "opacity-80" : "text-gray-400"}>{label}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function ScheduleDayShoots({
  shoots,
  onSelect,
}: {
  shoots: Array<{
    id: string;
    time: string;
    clientName: string;
    address: string;
    photographers: string;
    twilight: boolean;
  }>;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="mb-6 rounded-3xl border border-gray-100 bg-white shadow-sm" aria-label="Shoots this day">
      {shoots.length === 0 ? (
        <p className="px-5 py-4 text-sm font-bold text-gray-400">No shoots this day.</p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {shoots.map((shoot) => (
            <li key={shoot.id}>
              <button
                type="button"
                onClick={() => onSelect(shoot.id)}
                className="flex w-full flex-col gap-2 px-5 py-4 text-left hover:bg-gray-50 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-black text-black">{shoot.time}</span>
                    <span className="text-sm font-bold text-black">{shoot.clientName}</span>
                    {shoot.twilight ? <TwilightLabel /> : null}
                  </div>
                  <p className="mt-1 truncate text-xs font-bold text-gray-500">{shoot.address}</p>
                </div>
                <p className="text-xs font-black uppercase tracking-widest text-gray-400">{shoot.photographers}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ScheduleCalendarChip({
  time,
  clientName,
  photographer,
  twilight,
  business,
}: {
  time: string;
  clientName: string;
  photographer: string;
  twilight: boolean;
  business: boolean;
}) {
  return (
    <div className={cn(
      "flex flex-col gap-0.5 rounded-lg border px-1.5 py-1 shadow-sm",
      business ? "border-black bg-black text-white" : "border-[#0d9488] bg-[#0d9488] text-white",
      twilight && "ring-1 ring-[#e7b25a]",
    )}>
      <div className="truncate text-[11px] font-black leading-tight">{time}</div>
      <div className="truncate text-[11px] font-semibold leading-tight">{clientName}</div>
      <div className="truncate text-[10px] font-medium leading-tight opacity-80">{photographer}</div>
      {twilight ? <div className="text-[9px] font-black uppercase tracking-widest text-[#f3d7a1]">Twilight</div> : null}
    </div>
  );
}
