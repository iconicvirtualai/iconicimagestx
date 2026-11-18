import { Heart } from "lucide-react";
import {
  filterBySelection,
  moneyLabel,
  overAllowanceCopy,
  selectionCountLabel,
  selectionNoun,
  selectionQuote,
  type SelectionBilling,
  type SelectionFilter,
  type SelectionMode,
  type SelectionSettings,
} from "@shared/gallerySelections";
import { ClientGalleryMediaCard } from "./ClientGalleryMedia";
import type { ClientGalleryItem } from "./clientGalleryMedia";
import { useState } from "react";

export function GallerySelectionPanel({
  mode,
  billing,
  allowance,
  extraPhotoPrice,
  submitted,
  items,
  selectedIds,
  saving,
  onToggle,
  onSubmit,
}: {
  mode: SelectionMode;
  billing: SelectionBilling;
  allowance: number | null;
  extraPhotoPrice: number | null;
  submitted: boolean;
  items: ClientGalleryItem[];
  selectedIds: string[];
  saving?: boolean;
  onToggle?: (id: string) => void;
  onSubmit?: () => void;
}) {
  const [filter, setFilter] = useState<SelectionFilter>("all");
  const settings: SelectionSettings = {
    open: true,
    mode,
    billing,
    allowance,
    extraPriceOverride: null,
    catalogExtraPrice: null,
    catalogPackageId: null,
    catalogPackageName: null,
    extraPhotoPrice: billing === "charge" ? extraPhotoPrice : null,
  };
  const quote = selectionQuote(selectedIds.length, settings);
  const overCopy = overAllowanceCopy(settings, quote);
  const visible = filterBySelection(items, selectedIds, filter);
  const noun = selectionNoun(mode);
  const heading = mode === "headshots" ? "Pick your finals" : "Select the photos you want";

  return (
    <section data-testid="gallery-selection" className="mb-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-black">{heading}</h2>
          <p className="mt-1 text-sm text-gray-500" data-testid="gallery-selection-count">
            {selectionCountLabel(quote.selectedCount, allowance)}
          </p>
        </div>
        <div className="flex gap-2" role="group" aria-label="Filter photos">
          {(["all", "selected", "unselected"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              data-testid={`gallery-selection-filter-${value}`}
              onClick={() => setFilter(value)}
              className={`min-h-11 rounded-xl px-3 text-[10px] font-black uppercase tracking-widest ${
                filter === value ? "bg-black text-white" : "border border-gray-200 bg-white text-black"
              }`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      {overCopy ? (
        <p data-testid="gallery-selection-over" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-950">
          {overCopy}
        </p>
      ) : null}

      {visible.length === 0 ? (
        <p className="py-10 text-center text-sm font-bold text-gray-400">
          {items.length === 0 ? `No ${noun} to choose yet.` : `No ${filter} ${noun}.`}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {visible.map((item) => {
            const id = item.id || "";
            const picked = Boolean(id && selectedIds.includes(id));
            return (
              <div key={id || item.fileName} className="min-w-0">
                <ClientGalleryMediaCard item={item} />
                {id ? (
                  <button
                    type="button"
                    disabled={submitted || !onToggle}
                    aria-pressed={picked}
                    data-testid={`gallery-selection-heart-${id}`}
                    onClick={() => onToggle?.(id)}
                    className={`mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-3 text-[10px] font-black uppercase tracking-widest ${
                      picked ? "bg-black text-white" : "border border-gray-200 bg-white text-black"
                    } disabled:opacity-60`}
                  >
                    <Heart className={`h-3.5 w-3.5 ${picked ? "fill-white" : ""}`} />
                    {picked ? "Selected" : "Select"}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {submitted ? (
          <p data-testid="gallery-selection-submitted" className="text-sm font-bold text-black">
            Submitted. Iconic has this list.
          </p>
        ) : (
          <button
            type="button"
            data-testid="gallery-selection-submit"
            disabled={saving || !onSubmit || !quote.canSubmit}
            onClick={onSubmit}
            className="inline-flex min-h-11 items-center rounded-xl bg-[#0d9488] px-4 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-50"
          >
            {saving ? "Saving" : "Submit"}
          </button>
        )}
        {quote.blockReason && !submitted && !overCopy ? (
          <p className="text-sm text-gray-500">{quote.blockReason}</p>
        ) : null}
        {quote.canSubmit && quote.extraTotal > 0 && !submitted ? (
          <p className="text-sm font-bold text-black">Added total {moneyLabel(quote.extraTotal)}</p>
        ) : null}
      </div>
    </section>
  );
}
