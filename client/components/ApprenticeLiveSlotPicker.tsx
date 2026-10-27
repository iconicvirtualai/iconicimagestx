/**
 * Live apprentice times for /realestate-75.
 * Reads the same open slots as /ordericonic and /apprenticeship
 * (GET /api/apprenticeship/slots, the apprentice calendar's free/busy).
 * When the calendar cannot be read it shows the public fallback and a
 * preferred-time box instead of inventing hours.
 */

import { useEffect, useMemo, useState } from "react";
import type { ApprenticeshipSlot } from "@shared/apprenticeship";
import { APPRENTICESHIP_CALENDAR_FALLBACK } from "@shared/apprenticeship";
import { BUSINESS_CONTACT } from "@shared/businessContact";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export interface LiveSlotState {
  /** null while loading. */
  available: boolean | null;
  slots: ApprenticeshipSlot[];
  fallback: string;
}

interface Props {
  packageId: string;
  durationMinutes: number;
  date: string;
  slotStart: string;
  preferredTime: string;
  /** Bump to re-read slots, e.g. after a 409 "that time was just taken". */
  reloadKey?: number;
  onChange: (next: { date: string; slotStart: string; preferredTime: string }) => void;
  onState?: (state: LiveSlotState) => void;
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

export default function ApprenticeLiveSlotPicker({
  packageId,
  durationMinutes,
  date,
  slotStart,
  preferredTime,
  reloadKey = 0,
  onChange,
  onState,
}: Props) {
  const [state, setState] = useState<LiveSlotState>({ available: null, slots: [], fallback: "" });
  const [timesOpen, setTimesOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState({ available: null, slots: [], fallback: "" });
    fetch(`/api/apprenticeship/slots?package=${encodeURIComponent(packageId)}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("slots"))))
      .then((data: { available?: boolean; slots?: ApprenticeshipSlot[]; fallback?: string | null }) => {
        if (cancelled) return;
        const open = data?.available === true;
        setState({
          available: open,
          slots: open && Array.isArray(data.slots) ? data.slots : [],
          fallback: open ? "" : data?.fallback || APPRENTICESHIP_CALENDAR_FALLBACK,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ available: false, slots: [], fallback: APPRENTICESHIP_CALENDAR_FALLBACK });
      });
    return () => {
      cancelled = true;
    };
  }, [packageId, reloadKey]);

  useEffect(() => {
    onState?.(state);
    // A saved draft may point at a time that is no longer open.
    if (state.available && slotStart && !state.slots.some((slot) => slot.start === slotStart)) {
      onChange({ date, slotStart: "", preferredTime });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const byDate = useMemo(() => {
    const map = new Map<string, ApprenticeshipSlot[]>();
    for (const slot of state.slots) {
      const list = map.get(slot.date) || [];
      list.push(slot);
      map.set(slot.date, list);
    }
    return map;
  }, [state.slots]);
  const dates = useMemo(() => [...byDate.keys()].sort(), [byDate]);
  const first = parts(dates[0] || "");
  const last = parts(dates[dates.length - 1] || "");
  const [visible, setVisible] = useState<{ year: number; month: number } | null>(null);

  useEffect(() => {
    const target = parts(date && byDate.has(date) ? date : dates[0] || "");
    if (target) setVisible({ year: target.year, month: target.month });
  }, [dates, date, byDate]);

  const cells = useMemo(() => {
    if (!visible) return [];
    const count = new Date(Date.UTC(visible.year, visible.month, 0)).getUTCDate();
    const lead = new Date(Date.UTC(visible.year, visible.month - 1, 1)).getUTCDay();
    const rows: Array<string | null> = [];
    for (let index = 0; index < lead; index += 1) rows.push(null);
    for (let day = 1; day <= count; day += 1) rows.push(`${visible.year}-${pad(visible.month)}-${pad(day)}`);
    return rows;
  }, [visible]);

  const canPrev = Boolean(visible && first && (visible.year > first.year || (visible.year === first.year && visible.month > first.month)));
  const canNext = Boolean(visible && last && (visible.year < last.year || (visible.year === last.year && visible.month < last.month)));
  const times = byDate.get(date) || [];
  const chosen = state.slots.find((slot) => slot.start === slotStart) || null;
  const length = durationMinutes === 60 ? "1-hour" : "20-minute";

  function shiftMonth(delta: number) {
    setVisible((current) => {
      if (!current) return current;
      const next = new Date(Date.UTC(current.year, current.month - 1 + delta, 1));
      return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1 };
    });
  }

  return (
    <div data-testid="re75-schedule">
      <p className="text-sm font-semibold">Date and time</p>
      <p className="mt-1 text-sm leading-relaxed text-neutral-700">
        {state.available === false
          ? `Tell us a preferred ${length} time. The $25 booking fee holds your request.`
          : `Pick an open ${length} time from the apprentice calendar. The $25 booking fee holds it.`}
      </p>
      {state.available === null ? (
        <p className="mt-3 text-sm text-neutral-600" data-testid="re75-slots-loading">Checking open times…</p>
      ) : null}
      {state.available === false ? (
        <div className="mt-3 space-y-2" data-testid="re75-slots-fallback">
          <p className="text-sm leading-relaxed text-neutral-700">{state.fallback}</p>
          <label className="block text-sm font-semibold" htmlFor="re75-preferred">Preferred day and time</label>
          <input
            id="re75-preferred"
            value={preferredTime}
            maxLength={160}
            onChange={(event) => onChange({ date: "", slotStart: "", preferredTime: event.target.value })}
            className="mt-2 w-full min-h-12 rounded-xl border border-neutral-300 bg-white px-4 text-base text-neutral-950 outline-none focus:border-black"
          />
        </div>
      ) : null}
      {state.available === true && dates.length === 0 ? (
        <p className="mt-3 text-sm font-semibold" data-testid="re75-slots-empty">
          No open apprentice times in the next two weeks. Call {BUSINESS_CONTACT.phoneDisplay} and we will set one up.
        </p>
      ) : null}
      {state.available === true && dates.length > 0 && visible ? (
        <>
          <div className="mt-4 rounded-2xl border border-neutral-200 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <button type="button" aria-label="Previous month" disabled={!canPrev} onClick={() => shiftMonth(-1)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-300 text-sm font-semibold disabled:opacity-30">‹</button>
              <p className="text-sm font-semibold">{MONTHS[visible.month - 1]} {visible.year}</p>
              <button type="button" aria-label="Next month" disabled={!canNext} onClick={() => shiftMonth(1)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-300 text-sm font-semibold disabled:opacity-30">›</button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-neutral-500">
              {WEEKDAYS.map((label) => <div key={label} className="py-1">{label}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((key, index) => {
                if (!key) return <div key={`empty-${index}`} />;
                const open = byDate.has(key);
                const parsed = parts(key);
                const picked = key === date;
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={!open}
                    data-testid={`re75-day-${key}`}
                    aria-pressed={picked}
                    aria-label={`${WEEKDAYS[weekdayIndex(key)]} ${MONTHS[(parsed?.month || 1) - 1]} ${parsed?.day}`}
                    onClick={() => {
                      setTimesOpen(true);
                      const keep = (byDate.get(key) || []).some((slot) => slot.start === slotStart);
                      onChange({ date: key, slotStart: keep ? slotStart : "", preferredTime: "" });
                    }}
                    className={`h-9 rounded-lg text-sm font-semibold ${picked ? "bg-black text-white" : open ? "border border-neutral-300 text-neutral-950" : "text-neutral-300"}`}
                  >
                    {parsed?.day}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="mt-3">
            <label className="block text-sm font-semibold" htmlFor="re75-time">Open time</label>
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
              <span>{chosen ? chosen.label : date ? "Choose an open time" : "Choose a date first"}</span>
              <span aria-hidden="true" className="text-neutral-500">▾</span>
            </button>
            {timesOpen && times.length > 0 ? (
              <div role="listbox" aria-label="Open times" data-testid="re75-time-list" className="mt-2 grid max-h-56 grid-cols-2 gap-2 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-2 sm:grid-cols-4">
                {times.map((slot) => (
                  <button
                    key={slot.start}
                    type="button"
                    role="option"
                    aria-selected={slot.start === slotStart}
                    data-testid={`re75-slot-${slot.start}`}
                    onClick={() => {
                      onChange({ date, slotStart: slot.start, preferredTime: "" });
                      setTimesOpen(false);
                    }}
                    className={`min-h-11 rounded-lg border px-2 text-sm font-semibold ${slot.start === slotStart ? "border-black bg-black text-white" : "border-neutral-300 text-neutral-950"}`}
                  >
                    {slot.time}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
