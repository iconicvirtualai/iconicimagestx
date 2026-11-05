import { useEffect, useState } from "react";
import type { SocialRateStep } from "@shared/thankfulEvent";

function percentLabel(percent: number): string {
  return Number.isInteger(percent) ? String(percent) : String(percent);
}

function chicagoStamp(isoOrDate: string, withTime: boolean): string {
  const when = new Date(withTime ? isoOrDate : `${isoOrDate}T18:00:00Z`);
  return when.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit", timeZoneName: "short" as const } : {}),
    timeZone: "America/Chicago",
  });
}

function remaining(target: string, now: number): { days: number; hours: number; minutes: number; seconds: number } | null {
  const ms = Date.parse(target) - now;
  if (!(ms > 0)) return null;
  const total = Math.floor(ms / 1000);
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

export default function SocialCountdownBanner({
  percent,
  nextPercent,
  nextDropAt,
  schedule,
  today,
}: {
  percent: number;
  nextPercent: number | null;
  nextDropAt: string | null;
  schedule: SocialRateStep[];
  today: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const left = nextDropAt ? remaining(nextDropAt, now) : null;
  const units = left
    ? [
        ["days", left.days],
        ["hrs", left.hours],
        ["min", left.minutes],
        ["sec", left.seconds],
      ] as const
    : [];

  return (
    <div data-testid="social-november-banner" className="overflow-hidden rounded-2xl bg-[#1c140c] px-4 py-4 text-[#fff7ed] shadow-lg ring-2 ring-[#FFD700] sm:px-5">
      <p className="text-2xl font-black leading-none tracking-tight text-white sm:text-3xl">The Countdown is On!</p>
      {units.length > 0 ? (
        <div className="mt-3 grid grid-cols-4 gap-2" aria-hidden="true">
          {units.map(([label, value]) => (
            <div key={label} className="rounded-xl border border-[#FFD700] bg-black/40 px-1 py-2 text-center">
              <span className="block text-2xl font-black leading-none text-[#FFD700]">{String(value).padStart(2, "0")}</span>
              <span className="mt-1 block text-[10px] font-black uppercase tracking-[0.14em] text-[#fff7ed]">{label}</span>
            </div>
          ))}
        </div>
      ) : null}
      <p className="mt-3 text-3xl font-black leading-none tracking-tight text-[#FFD700]">{percentLabel(percent)}% OFF</p>
      <p className="mt-1 text-sm font-black uppercase tracking-[0.14em]">Social packages this November</p>
      {nextPercent != null && nextDropAt ? (
        <p className="mt-2 text-sm font-bold text-[#FFD700]">
          Drops to {percentLabel(nextPercent)}% · {chicagoStamp(nextDropAt, true)}
        </p>
      ) : null}
      {schedule.length > 0 ? (
        <ol className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {schedule.map((step) => {
            const current = step.date === today;
            return (
              <li
                key={step.date}
                className={`min-w-[4.5rem] shrink-0 rounded-xl px-2 py-2 text-center ${current ? "bg-[#FFD700] text-[#1c140c]" : "border border-[#FFD700]/50 bg-black/30 text-[#fff7ed]"}`}
              >
                <span className="block text-sm font-black">{percentLabel(step.percent)}%</span>
                <span className="mt-0.5 block text-[10px] font-bold leading-tight">{chicagoStamp(step.date, false)}</span>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}
