/**
 * Requested date and time for an apprentice shoot.
 * Sundays and holidays stay closed. Saturday starts stop before noon.
 * The menu is a request. It does not read live photographer calendars.
 */

import { useEffect, useMemo, useState } from "react";
import { realEstate75OpenSchedule } from "@shared/realestate75";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

interface ApprenticeSchedulePickerProps {
  date: string;
  time: string;
  durationMinutes: number;
  now?: Date;
  onChange: (next: { date: string; time: string }) => void;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function parts(date: string) {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function weekdayIndex(date: string) {
  const parsed = parts(date);
  if (!parsed) return 0;
  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).getUTCDay();
}

function monthLabel(year: number, month: number) {
  return `${MONTHS[month - 1] || ""} ${year}`;
}

export default function ApprenticeSchedulePicker({
  date,
  time,
  durationMinutes,
  now,
  onChange,
}: ApprenticeSchedulePickerProps) {
  const clock = useMemo(() => now ?? new Date(), [now]);
  const days = useMemo(
    () => realEstate75OpenSchedule({ now: clock, durationMinutes }),
    [clock, durationMinutes],
  );
  const byDate = useMemo(() => new Map(days.map((day) => [day.date, day.times])), [days]);
  const selected = parts(date);
  const first = parts(days[0]?.date || "");
  const last = parts(days[days.length - 1]?.date || "");
  const initial = selected || first;
  const [visible, setVisible] = useState(() => (
    initial ? { year: initial.year, month: initial.month } : { year: clock.getFullYear(), month: clock.getMonth() + 1 }
  ));
  const [timesOpen, setTimesOpen] = useState(false);

  useEffect(() => {
    const parsed = parts(date);
    if (!parsed) return;
    setVisible({ year: parsed.year, month: parsed.month });
  }, [date]);
  const times = byDate.get(date) || [];
  const cells = useMemo(() => {
    const count = new Date(Date.UTC(visible.year, visible.month, 0)).getUTCDate();
    const lead = new Date(Date.UTC(visible.year, visible.month - 1, 1)).getUTCDay();
    const rows: Array<string | null> = [];
    for (let index = 0; index < lead; index += 1) rows.push(null);
    for (let day = 1; day <= count; day += 1) {
      rows.push(`${visible.year}-${pad(visible.month)}-${pad(day)}`);
    }
    return rows;
  }, [visible.month, visible.year]);

  const canPrev = Boolean(first && (visible.year > first.year || (visible.year === first.year && visible.month > first.month)));
  const canNext = Boolean(last && (visible.year < last.year || (visible.year === last.year && visible.month < last.month)));

  function shiftMonth(delta: number) {
    setVisible((current) => {
      const next = new Date(Date.UTC(current.year, current.month - 1 + delta, 1));
      return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1 };
    });
  }

  const length = durationMinutes === 60 ? "1-hour" : "20-minute";

  return (
    <div data-testid="re75-schedule">
      <p className="text-sm font-semibold">Date and time</p>
      <p className="mt-1 text-sm leading-relaxed text-neutral-700">
        Request a {length} time. Weekdays 8:00 AM–5:00 PM. Saturday starts before noon. Sunday is closed. We confirm the appointment.
      </p>
      {days.length === 0 ? (
        <p className="mt-3 text-sm font-semibold">No requestable days are open in the current window.</p>
      ) : (
        <div className="mt-4 rounded-2xl border border-neutral-200 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              type="button"
              aria-label="Previous month"
              disabled={!canPrev}
              onClick={() => shiftMonth(-1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-300 text-sm font-semibold disabled:opacity-30"
            >
              ‹
            </button>
            <p className="text-sm font-semibold">{monthLabel(visible.year, visible.month)}</p>
            <button
              type="button"
              aria-label="Next month"
              disabled={!canNext}
              onClick={() => shiftMonth(1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-300 text-sm font-semibold disabled:opacity-30"
            >
              ›
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-neutral-500">
            {WEEKDAYS.map((label) => <div key={label} className="py-1">{label}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((key, index) => {
              if (!key) return <div key={`empty-${index}`} />;
              const openDay = byDate.has(key);
              const parsed = parts(key);
              const chosen = key === date;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={!openDay}
                  data-testid={`re75-day-${key}`}
                  aria-pressed={chosen}
                  aria-label={`${WEEKDAYS[weekdayIndex(key)]} ${MONTHS[(parsed?.month || 1) - 1]} ${parsed?.day}`}
                  onClick={() => {
                    const nextTimes = byDate.get(key) || [];
                    setTimesOpen(true);
                    onChange({ date: key, time: nextTimes.includes(time) ? time : "" });
                  }}
                  className={`h-9 rounded-lg text-sm font-semibold ${
                    chosen
                      ? "bg-black text-white"
                      : openDay
                        ? "border border-neutral-300 text-neutral-950"
                        : "text-neutral-300"
                  }`}
                >
                  {parsed?.day}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="mt-3">
        <label className="block text-sm font-semibold" htmlFor="re75-time">Time</label>
        <button
          id="re75-time"
          type="button"
          data-testid="re75-time"
          aria-haspopup="listbox"
          aria-expanded={timesOpen}
          disabled={!date || times.length === 0}
          onClick={() => setTimesOpen((open) => !open)}
          className="mt-2 flex min-h-12 w-full items-center justify-between rounded-xl border border-neutral-300 bg-white px-4 text-left text-base text-neutral-950 disabled:text-neutral-400"
        >
          <span>{times.includes(time) ? time : (date ? "Choose a time" : "Choose a date first")}</span>
          <span aria-hidden="true" className="text-neutral-500">▾</span>
        </button>
        {timesOpen && times.length > 0 ? (
          <div
            role="listbox"
            aria-label="Times"
            data-testid="re75-time-list"
            className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-neutral-200 bg-white"
          >
            {times.map((choice) => (
              <button
                key={choice}
                type="button"
                role="option"
                aria-selected={choice === time}
                data-testid={`re75-time-${choice}`}
                onClick={() => {
                  onChange({ date, time: choice });
                  setTimesOpen(false);
                }}
                className={`flex min-h-11 w-full items-center px-4 text-left text-sm font-semibold ${
                  choice === time ? "bg-black text-white" : "text-neutral-950"
                }`}
              >
                {choice}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
