import { useEffect, useMemo, useState } from "react";
import { saturdayDeliveryNote } from "@shared/bookingHours";
import { SuggestedAppointmentPills } from "@/components/SuggestedAppointments";

export interface BookingSlotChoice {
  start: string;
  end: string;
  date: string;
  time: string;
  label: string;
  photographerId: string;
  photographerName: string;
}

export function BookingSlotPicker({
  slots,
  suggestions = [],
  selectedStart,
  onSelect,
  loading,
  showPhotographer,
  emptyMessage,
}: {
  slots: BookingSlotChoice[];
  suggestions?: BookingSlotChoice[];
  selectedStart: string;
  onSelect: (slot: BookingSlotChoice) => void;
  loading: boolean;
  showPhotographer: boolean;
  emptyMessage: string;
}) {
  const days = useMemo(() => {
    const groups = new Map<string, BookingSlotChoice[]>();
    for (const slot of slots) {
      const list = groups.get(slot.date) || [];
      list.push(slot);
      groups.set(slot.date, list);
    }
    return [...groups.entries()];
  }, [slots]);
  const [day, setDay] = useState(days[0]?.[0] || "");

  useEffect(() => {
    if (!days.some(([date]) => date === day)) setDay(days[0]?.[0] || "");
  }, [days, day]);

  useEffect(() => {
    const match = slots.find((slot) => slot.start === selectedStart);
    if (match) setDay(match.date);
  }, [selectedStart, slots]);

  const daySlots = days.find(([date]) => date === day)?.[1] || [];
  const selected = slots.find((slot) => slot.start === selectedStart);
  const saturdayNote = saturdayDeliveryNote(selected?.date);

  const offered = suggestions.filter((slot) => slots.some((item) => item.start === slot.start)).slice(0, 3);

  return (
    <div data-testid="booking-slot-picker" className="space-y-4">
      {!loading && (
        <SuggestedAppointmentPills
          suggestions={offered}
          selectedStart={selectedStart}
          showPhotographer={showPhotographer}
          onSelect={(slot) => {
            setDay(slot.date);
            onSelect(slot);
          }}
        />
      )}
      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-2 px-1">
        Open times (CST)
      </label>
      {loading && <p className="text-sm font-semibold text-neutral-600">Checking open times.</p>}
      {!loading && days.length === 0 && (
        <p data-testid="booking-slots-empty" className="text-sm font-semibold leading-relaxed text-neutral-700">{emptyMessage}</p>
      )}
      {!loading && days.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {days.map(([date, times]) => (
              <button
                key={date}
                type="button"
                data-testid={`booking-day-${date}`}
                aria-pressed={date === day}
                onClick={() => setDay(date)}
                className={`min-h-12 rounded-full border px-4 text-sm font-bold ${date === day ? "border-black bg-black text-white" : "border-neutral-300 bg-white text-neutral-950"}`}
              >
                {times[0]?.label.split("·")[0]?.trim()}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {daySlots.map((slot) => {
              const selected = slot.start === selectedStart;
              return (
                <button
                  key={`${slot.photographerId}-${slot.start}`}
                  type="button"
                  data-testid={`booking-slot-${slot.start}`}
                  aria-pressed={selected}
                  onClick={() => onSelect(slot)}
                  className={`min-h-12 rounded-xl border px-3 py-2 text-sm font-bold ${selected ? "border-black bg-black text-white" : "border-neutral-300 bg-white text-neutral-950"}`}
                >
                  <span className="block">{slot.time}</span>
                  {showPhotographer && (
                    <span className={`mt-0.5 block text-[10px] font-semibold uppercase tracking-wide ${selected ? "text-white/80" : "text-neutral-500"}`}>
                      {slot.photographerName}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {saturdayNote && (
            <p data-testid="saturday-delivery-note" className="text-sm font-semibold leading-relaxed text-neutral-800">
              {saturdayNote}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
