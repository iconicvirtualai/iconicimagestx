/**
 * Property address for the apprentice order form.
 *
 * The page sits in a Wix HTML box and clips overflow on the page root, so an
 * in-page suggestion menu is cut off. The menu is portaled to document.body
 * and placed with fixed coordinates under the field. A typed address is kept
 * when suggestions are missing or the person never picks one.
 */

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PickedServiceLocation } from "@shared/serviceLocation";
import {
  fetchPickedPlace,
  fetchPlaceSuggestions,
  newPlacesSessionToken,
  type PlaceSuggestion,
} from "@/lib/placesAddress";

export interface PropertyAddressValue {
  address: string;
  place: PickedServiceLocation | null;
}

interface PropertyAddressFieldProps {
  id?: string;
  value: string;
  onChange: (next: PropertyAddressValue) => void;
  className?: string;
  placeholder?: string;
  debounceMs?: number;
}

interface MenuBox {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

export default function PropertyAddressField({
  id = "re75-address",
  value,
  onChange,
  className,
  placeholder = "123 Oak Dr, Spring, TX 77379",
  debounceMs = 300,
}: PropertyAddressFieldProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionRef = useRef(newPlacesSessionToken());
  const requestRef = useRef(0);
  const settledRef = useRef("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [box, setBox] = useState<MenuBox | null>(null);

  useEffect(() => {
    const typed = value.trim();
    if (typed === settledRef.current) {
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
    }, debounceMs);
    return () => {
      controller.abort();
      window.clearTimeout(handle);
    };
  }, [value, debounceMs]);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const input = inputRef.current;
      if (!input) return;
      const rect = input.getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewTop = viewport?.offsetTop ?? 0;
      const viewLeft = viewport?.offsetLeft ?? 0;
      const viewHeight = viewport?.height ?? window.innerHeight;
      const viewWidth = viewport?.width ?? window.innerWidth;
      const margin = 8;
      const width = Math.min(rect.width, viewWidth - margin * 2);
      let left = rect.left;
      if (left + width > viewLeft + viewWidth - margin) left = viewLeft + viewWidth - margin - width;
      if (left < viewLeft + margin) left = viewLeft + margin;
      const spaceBelow = viewTop + viewHeight - rect.bottom;
      const spaceAbove = rect.top - viewTop;
      const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(96, Math.min(240, (openUp ? spaceAbove : spaceBelow) - margin));
      const top = openUp
        ? Math.max(viewTop + margin, rect.top - maxHeight - 4)
        : rect.bottom + 4;
      setBox({ top, left, width, maxHeight });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
    };
  }, [open, suggestions.length]);

  const choose = (suggestion: PlaceSuggestion) => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    const typed = suggestion.description || suggestion.mainText;
    settledRef.current = typed;
    setOpen(false);
    setSuggestions([]);
    onChange({ address: typed, place: null });
    void fetchPickedPlace(suggestion.placeId, sessionRef.current).then((place) => {
      if (requestId !== requestRef.current) return;
      sessionRef.current = newPlacesSessionToken();
      const next = place?.formatted || typed;
      settledRef.current = next;
      onChange({ address: next, place });
    });
  };

  const showList = open && suggestions.length > 0 && box;
  const menu = showList
    ? createPortal(
      <div
        id={listId}
        role="listbox"
        data-testid="re75-address-list"
        style={{
          position: "fixed",
          top: box.top,
          left: box.left,
          width: box.width,
          maxHeight: box.maxHeight,
          zIndex: 80,
        }}
        className="overflow-y-auto rounded-xl border border-neutral-200 bg-white shadow-2xl"
      >
        {suggestions.map((suggestion, index) => (
          <button
            key={suggestion.placeId}
            id={`${listId}-${index}`}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            data-testid="re75-address-option"
            onPointerDown={(event) => {
              event.preventDefault();
              choose(suggestion);
            }}
            className={`flex min-h-12 w-full flex-col justify-center border-b border-neutral-100 px-4 py-2 text-left last:border-none ${
              index === activeIndex ? "bg-neutral-100" : "bg-white"
            }`}
          >
            <span className="text-sm font-semibold text-neutral-950">{suggestion.mainText}</span>
            {suggestion.secondaryText ? (
              <span className="text-xs text-neutral-600">{suggestion.secondaryText}</span>
            ) : null}
            </button>
          ))}
          <p className="bg-neutral-50 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Google</p>
        </div>,
      document.body,
    )
    : null;

  return (
    <div>
      <input
        ref={inputRef}
        id={id}
        name="re75-property-address"
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={Boolean(showList)}
        aria-controls={listId}
        aria-activedescendant={showList ? `${listId}-${activeIndex}` : undefined}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
        placeholder={placeholder}
        className={className}
        value={value}
        onChange={(event) => {
          requestRef.current += 1;
          settledRef.current = "";
          onChange({ address: event.target.value, place: null });
        }}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
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
          window.setTimeout(() => setOpen(false), 200);
        }}
      />
      {menu}
      {unavailable && value.trim().length >= 3 ? (
        <p data-testid="re75-address-typed" className="mt-2 text-sm text-neutral-600">
          Address suggestions are unavailable. The address you type still works.
        </p>
      ) : null}
    </div>
  );
}
