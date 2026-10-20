import { useEffect, useState } from "react";
import { photographerPreferenceForNames, suggestedAppointmentLabel } from "@shared/suggestedAppointments";
import type { BookingSlotChoice } from "@/components/BookingSlotPicker";

export function cleanBookingSlots(slots: BookingSlotChoice[]): BookingSlotChoice[] {
  return slots.filter((slot) => slot?.start && slot?.time && slot?.date && !String(slot.photographerName || "").includes("@"));
}

export function suggestedFromAvailability(data: {
  live?: unknown;
  slots?: unknown;
  suggestions?: unknown;
} | null): BookingSlotChoice[] {
  const live = Boolean(data?.live);
  const slots = live && Array.isArray(data?.slots) ? cleanBookingSlots(data.slots as BookingSlotChoice[]) : [];
  const suggested = live && Array.isArray(data?.suggestions) ? data.suggestions as BookingSlotChoice[] : [];
  return suggested.filter((slot) => slots.some((item) => item.start === slot.start)).slice(0, 3);
}

export function SuggestedAppointmentPills({
  suggestions,
  selectedStart,
  onSelect,
  showPhotographer,
}: {
  suggestions: BookingSlotChoice[];
  selectedStart: string;
  onSelect: (slot: BookingSlotChoice) => void;
  showPhotographer: boolean;
}) {
  if (!suggestions.length) return null;
  return (
    <div data-testid="suggested-appointments" className="space-y-3">
      <div className="px-1">
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Suggested times</p>
        <p className="mt-1 text-sm font-semibold leading-relaxed text-neutral-700">
          Grouped near other shoots. You can still pick any open time.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((slot) => {
          const selected = slot.start === selectedStart;
          return (
            <button
              key={slot.start}
              type="button"
              data-testid={`suggested-time-${slot.start}`}
              aria-pressed={selected}
              onClick={() => onSelect(slot)}
              className={`min-h-11 max-w-full rounded-full border-2 px-4 py-2 text-left text-sm font-bold leading-snug ${selected ? "border-[#0f766e] bg-[#0d9488] text-white" : "border-[#0d9488] bg-white text-[#0f766e]"}`}
            >
              <span className="block">{suggestedAppointmentLabel(slot)}</span>
              {showPhotographer && (
                <span className={`mt-0.5 block text-[10px] font-semibold uppercase tracking-wide ${selected ? "text-white/80" : "text-[#0f766e]/70"}`}>
                  {slot.photographerName}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400" aria-hidden="true">
        <span className="h-px flex-1 bg-gray-200" />
        Or
        <span className="h-px flex-1 bg-gray-200" />
      </div>
    </div>
  );
}

export function useBookingPhotographers(active: boolean) {
  const [people, setPeople] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    fetch("/api/bookings/photographers")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const list = Array.isArray(data.photographers) ? data.photographers : [];
        setPeople(list.flatMap((person: { id?: unknown; name?: unknown }) => {
          const id = typeof person?.id === "string" ? person.id.trim() : "";
          const name = typeof person?.name === "string" ? person.name.trim() : "";
          if (!id || !name || name.includes("@")) return [];
          return [{ id, name }];
        }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [active]);
  return people;
}

export function useSuggestedAppointments(input: {
  active: boolean;
  address?: string;
  photographerId?: string;
  service?: string;
  basics?: string;
  durationMinutes?: number | null;
}) {
  const [suggestions, setSuggestions] = useState<BookingSlotChoice[]>([]);
  const [loading, setLoading] = useState(false);
  const address = input.address?.trim() || "";
  const photographerId = input.photographerId?.trim() || "no-preference";
  const service = input.service?.trim() || "";
  const basics = input.basics?.trim() || "";
  const duration = input.durationMinutes && input.durationMinutes >= 15 ? String(input.durationMinutes) : "";

  useEffect(() => {
    if (!input.active) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({
        address,
        photographer: photographerId,
        service,
        basics,
      });
      if (duration) params.set("duration", duration);
      setLoading(true);
      fetch(`/api/bookings/slots?${params.toString()}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!cancelled) setSuggestions(suggestedFromAvailability(data));
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [input.active, address, photographerId, service, basics, duration]);

  return { suggestions, loading };
}

export function StaffSuggestedTimes({
  active,
  address,
  photographerNames,
  service,
  basics,
  durationMinutes,
  selectedStart,
  onSelect,
}: {
  active: boolean;
  address?: string;
  photographerNames?: string[];
  service?: string;
  basics?: string;
  durationMinutes?: number | null;
  selectedStart: string;
  onSelect: (slot: BookingSlotChoice) => void;
}) {
  const people = useBookingPhotographers(active);
  const { suggestions, loading } = useSuggestedAppointments({
    active,
    address,
    photographerId: photographerPreferenceForNames(photographerNames || [], people),
    service,
    basics,
    durationMinutes,
  });
  return (
    <>
      <SuggestedAppointmentPills
        suggestions={suggestions}
        selectedStart={selectedStart}
        showPhotographer
        onSelect={onSelect}
      />
      {loading && suggestions.length === 0 && (
        <p className="text-sm font-semibold text-gray-500">Checking suggested times.</p>
      )}
    </>
  );
}
