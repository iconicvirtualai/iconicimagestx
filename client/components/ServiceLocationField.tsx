import { useEffect, useId, useRef, useState } from "react";
import {
  serviceLocationAfterPick,
  serviceLocationAfterType,
  type PickedServiceLocation,
} from "@shared/serviceLocation";
import { Input } from "@/components/ui/input";
import {
  fetchPickedPlace,
  fetchPlaceSuggestions,
  newPlacesSessionToken,
  type PlaceSuggestion,
} from "@/lib/placesAddress";

const lightControlText = "text-neutral-950 placeholder:text-neutral-500 caret-neutral-950";

export interface ServiceLocationValue {
  query: string;
  picked: PickedServiceLocation | null;
}

interface ServiceLocationFieldProps {
  query: string;
  picked: PickedServiceLocation | null;
  onChange: (next: ServiceLocationValue) => void;
  placeholder?: string;
  className?: string;
}

export default function ServiceLocationField({
  query,
  picked,
  onChange,
  placeholder = "123 Luxury Lane, Houston, TX",
  className,
}: ServiceLocationFieldProps) {
  const listId = useId();
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [resolving, setResolving] = useState(false);
  const sessionRef = useRef(newPlacesSessionToken());
  const requestRef = useRef(0);

  useEffect(() => {
    const typed = query.trim();
    if (picked && picked.formatted === query) {
      setSuggestions([]);
      setOpen(false);
      setUnavailable(false);
      return;
    }
    if (typed.length < 3) {
      setSuggestions([]);
      setOpen(false);
      setUnavailable(false);
      return;
    }

    const controller = new AbortController();
    const handle = window.setTimeout(() => {
      const requestId = requestRef.current + 1;
      requestRef.current = requestId;
      void fetchPlaceSuggestions(typed, sessionRef.current, { signal: controller.signal }).then((result) => {
        if (result.cancelled || requestId !== requestRef.current) return;
        setSuggestions(result.suggestions);
        setUnavailable(result.unavailable);
        setActiveIndex(0);
        setOpen(result.suggestions.length > 0);
      });
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(handle);
    };
  }, [query, picked]);

  const choose = (suggestion: PlaceSuggestion) => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setResolving(true);
    setOpen(false);
    setSuggestions([]);
    void fetchPickedPlace(suggestion.placeId, sessionRef.current).then((place) => {
      if (requestId !== requestRef.current) return;
      setResolving(false);
      sessionRef.current = newPlacesSessionToken();
      onChange(serviceLocationAfterPick(place, suggestion.description || suggestion.mainText));
    });
  };

  const typeQuery = (next: string) => {
    requestRef.current += 1;
    onChange(serviceLocationAfterType({ query, picked }, next));
  };

  const showList = open && suggestions.length > 0;

  return (
    <div className="relative">
      <Input
        id="service-location"
        name="serviceLocation"
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList ? `${listId}-${activeIndex}` : undefined}
        autoComplete="off"
        placeholder={placeholder}
        className={className || `h-14 rounded-xl border-gray-100 focus:border-black text-[15px] px-5 w-full bg-white ${lightControlText}`}
        value={query}
        onChange={(event) => typeQuery(event.target.value)}
        onKeyDown={(event) => {
          if (!showList) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((index) => (index + 1) % suggestions.length);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
          } else if (event.key === "Enter") {
            event.preventDefault();
            const suggestion = suggestions[activeIndex];
            if (suggestion) choose(suggestion);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 150);
        }}
      />
      {showList && (
        <div
          id={listId}
          role="listbox"
          data-testid="service-location-list"
          className="absolute z-[100] left-0 right-0 top-full mt-2 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden max-h-64 overflow-y-auto"
        >
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.placeId}
              id={`${listId}-${index}`}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              data-testid="service-location-option"
              onMouseDown={(event) => {
                event.preventDefault();
                choose(suggestion);
              }}
              className={`w-full px-5 py-3.5 text-left transition-colors border-b border-gray-50 last:border-none group flex flex-col gap-0.5 ${
                index === activeIndex ? "bg-teal-50" : "hover:bg-teal-50"
              }`}
            >
              <p className="font-bold text-[13px] text-black group-hover:text-teal-700 transition-colors leading-tight">
                {suggestion.mainText}
              </p>
              {suggestion.secondaryText && (
                <p className="text-[11px] text-gray-400 font-medium leading-tight">{suggestion.secondaryText}</p>
              )}
            </button>
          ))}
          <p className="px-5 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-400 bg-gray-50">Powered by Google</p>
        </div>
      )}
      {picked ? (
        <p data-testid="service-location-pin" className="mt-2 text-[11px] font-bold text-teal-700">
          Map pin saved for this address.
        </p>
      ) : query.trim() ? (
        <p data-testid="service-location-unpinned" className="mt-2 text-[11px] font-medium text-gray-500">
          {unavailable
            ? "Address suggestions are unavailable right now."
            : resolving
              ? "Saving the map pin for that address."
              : "Choose an address from the list to drop the map pin."}
        </p>
      ) : null}
    </div>
  );
}
