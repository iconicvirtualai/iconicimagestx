import type { MouseEvent } from "react";
import {
  DOT_BOOKING_CHECKBOX_LABEL,
  DOT_DELIVERY_LINE,
  DOT_OPT_IN_ACTION_LABEL,
  DOT_RECEIPT_LINE,
  DOORS_OPEN_TOUR_URL,
} from "@shared/doorsOpenTour";

const NAME = "DoorsOpenTour.com";

function keepCheckbox(event: MouseEvent) {
  event.stopPropagation();
}

function LinkedSentence({ sentence, className }: { sentence: string; className?: string }) {
  const at = sentence.indexOf(NAME);
  if (at < 0) return <span className={className}>{sentence}</span>;
  return (
    <span className={className}>
      {sentence.slice(0, at)}
      <a
        href={DOORS_OPEN_TOUR_URL}
        rel="noreferrer"
        className="font-semibold text-inherit underline underline-offset-2"
        onClick={keepCheckbox}
        onMouseDown={(event) => event.preventDefault()}
      >
        {NAME}
      </a>
      {sentence.slice(at + NAME.length)}
    </span>
  );
}

export function DoorsOpenTourCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border-2 border-gray-200 bg-white p-4 text-left font-sans">
      <input
        id="dot-opt-in"
        name="dotOptIn"
        data-testid="dot-opt-in"
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 accent-black"
      />
      <label htmlFor="dot-opt-in" className="text-sm leading-relaxed text-neutral-800">
        <LinkedSentence sentence={DOT_BOOKING_CHECKBOX_LABEL} />
      </label>
    </div>
  );
}

export function DoorsOpenDeliveryNote() {
  return (
    <p
      data-testid="doors-open-delivery"
      className="max-w-2xl font-sans text-sm leading-relaxed text-neutral-700"
    >
      <LinkedSentence sentence={DOT_DELIVERY_LINE} />
    </p>
  );
}

export function DoorsOpenReceiptNote({ optInUrl }: { optInUrl?: string | null }) {
  const url = typeof optInUrl === "string" ? optInUrl.trim() : "";
  return (
    <div
      data-testid="doors-open-receipt"
      className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4 font-sans"
    >
      <p className="text-sm leading-relaxed text-neutral-800">
        <LinkedSentence sentence={DOT_RECEIPT_LINE} />
      </p>
      {url.startsWith("https://") ? (
        <a
          href={url}
          data-testid="dot-opt-in-yes"
          className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-black px-4 py-3 text-center text-sm font-semibold text-white sm:w-auto"
        >
          {DOT_OPT_IN_ACTION_LABEL}
        </a>
      ) : null}
    </div>
  );
}

export function DotOptInBadge({ value }: { value: unknown }) {
  if (value !== true && value !== false) return null;
  const on = value === true;
  return (
    <span
      data-testid="dot-opt-in-badge"
      data-dot-opt-in={on ? "true" : "false"}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wide ${
        on
          ? "border-teal-200 bg-teal-50 text-teal-800"
          : "border-neutral-200 bg-neutral-50 text-neutral-500"
      }`}
    >
      {on ? "Doors Open Tour" : "DOT not listed"}
    </span>
  );
}
