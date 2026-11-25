import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { Link } from "react-router-dom";
import { Copy, Download } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { UnreadBadge } from "@/components/admin/UnreadBadge";
import {
  GALLERY_PICKS_COLLECTION,
  GALLERY_PICKS_DOC,
  moneyLabel,
  resolvedExtraPrice,
  selectionCountLabel,
  selectionNoun,
  selectionQuote,
  type SelectionBilling,
  type SelectionMode,
  type SelectionSettings,
} from "@shared/gallerySelections";

export interface StaffSelectionPhoto {
  id: string;
  fileName: string;
  selected: boolean;
  archived: boolean;
}

export interface StaffSelectionView {
  settings: SelectionSettings;
  status: "open" | "submitted" | "closed";
  reviewPending: boolean;
  selectedIds: string[];
  fileNames: string[];
  csv: string;
  photos: StaffSelectionPhoto[];
  recordedOnOrder: boolean;
  archivedCount: number;
}

const inputCls = "w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#0d9488]/30";

export function AdminClientSelectionsView({
  view,
  selectedIds,
  saving,
  onSave,
  onArchive,
  onCopy,
  onCsv,
}: {
  view: StaffSelectionView;
  selectedIds: string[];
  saving?: boolean;
  onSave: (body: Record<string, unknown>) => void;
  onArchive: () => void;
  onCopy: () => void;
  onCsv: () => void;
}) {
  const [enabled, setEnabled] = useState(view.settings.open);
  const [billing, setBilling] = useState<SelectionBilling>(view.settings.billing);
  const [mode, setMode] = useState<SelectionMode>(view.settings.mode);
  const [allowance, setAllowance] = useState(view.settings.allowance == null ? "" : String(view.settings.allowance));
  const [override, setOverride] = useState(view.settings.extraPriceOverride == null ? "" : String(view.settings.extraPriceOverride));
  const [show, setShow] = useState<"all" | "selected" | "unselected">("selected");
  const allowanceCount = allowance.trim() === "" ? null : Number(allowance);
  const typedOverride = override.trim() === "" ? null : Number(override);
  const extraPriceOverride = typedOverride != null && Number.isFinite(typedOverride) && typedOverride >= 0 ? typedOverride : null;
  const settings: SelectionSettings = {
    open: enabled,
    mode,
    billing,
    allowance: Number.isInteger(allowanceCount) ? allowanceCount : null,
    extraPriceOverride,
    catalogExtraPrice: view.settings.catalogExtraPrice,
    catalogPackageId: view.settings.catalogPackageId,
    catalogPackageName: view.settings.catalogPackageName,
    extraPhotoPrice: billing === "charge"
      ? resolvedExtraPrice(extraPriceOverride, view.settings.catalogExtraPrice)
      : null,
  };
  const quote = selectionQuote(selectedIds.length, { ...settings, open: true });
  const names = view.photos.filter((photo) => selectedIds.includes(photo.id)).map((photo) => photo.fileName);
  const rows = view.photos.filter((photo) => {
    if (show === "selected") return selectedIds.includes(photo.id);
    if (show === "unselected") return !selectedIds.includes(photo.id) && !photo.archived;
    return true;
  });

  return (
    <section data-testid="admin-client-selections" className="mb-6 rounded-xl border border-gray-100 bg-gray-50 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-black text-black">Photo selections</h3>
          {view.reviewPending ? <UnreadBadge count={1} testId="admin-selection-badge" /> : null}
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
            {enabled ? (view.status === "submitted" ? "Submitted" : "On") : "Off"}
          </span>
        </div>
        <label className="inline-flex items-center gap-2 text-xs font-bold text-black">
          <input
            type="checkbox"
            role="switch"
            aria-label="Photo selections"
            data-testid="admin-selection-toggle"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          {enabled ? "On" : "Off"}
        </label>
      </div>
      <p className="mb-4 text-xs text-gray-500">
        {enabled
          ? "Hearts save on their own and show up here. Nothing is emailed or texted to the client, and no card is charged."
          : "Off. This gallery stays as it is today: no hearts, filters, or submit button."}
      </p>
      {enabled ? (
      <div className="mb-4 grid grid-cols-1 gap-3">
        <fieldset className="space-y-2">
          <legend className="text-[10px] font-black uppercase tracking-widest text-gray-400">Mode</legend>
          <label className="flex items-center gap-2 text-sm font-bold text-black">
            <input type="radio" name="selection-billing" checked={billing === "charge"} onChange={() => setBilling("charge")} />
            Charge per additional photo
          </label>
          <label className="flex items-center gap-2 text-sm font-bold text-black">
            <input type="radio" name="selection-billing" checked={billing === "selections"} onChange={() => setBilling("selections")} />
            No charge, just selections needed
          </label>
        </fieldset>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">
            What they pick
            <select aria-label="What they pick" value={mode} onChange={(event) => setMode(event.target.value === "headshots" ? "headshots" : "listing")} className={`${inputCls} mt-1`}>
              <option value="listing">Listing photos</option>
              <option value="headshots">Headshot finals</option>
            </select>
          </label>
          <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">
            Included
            <input aria-label="Included count" value={allowance} onChange={(event) => setAllowance(event.target.value)} inputMode="numeric" placeholder="Blank" className={`${inputCls} mt-1`} />
          </label>
          {billing === "charge" ? (
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">
              Override this gallery
              <input aria-label="Gallery price override" value={override} onChange={(event) => setOverride(event.target.value)} inputMode="decimal" placeholder="Blank — use the price list" className={`${inputCls} mt-1`} />
            </label>
          ) : null}
        </div>
        {billing === "charge" ? (
          <p data-testid="admin-selection-catalog" className="text-xs text-gray-500">
            {settings.extraPriceOverride != null
              ? `This gallery uses ${moneyLabel(settings.extraPriceOverride)} per extra ${selectionNoun(mode, 1)}.`
              : settings.catalogExtraPrice != null
                ? `${settings.catalogPackageName || "This package"} is ${moneyLabel(settings.catalogExtraPrice)} per extra ${selectionNoun(mode, 1)} on the price list.`
                : "No extra price is saved on this package yet."}
            {" "}
            <Link to="/admin/pricing" className="font-bold text-black underline">Edit the price list</Link>
          </p>
        ) : null}
        <div>
          <Button
            type="button"
            disabled={saving}
            onClick={() => onSave({
              open: true,
              billing,
              mode,
              allowance: allowance.trim() === "" ? null : Number(allowance),
              extraPriceOverride: override.trim() === "" ? null : Number(override),
            })}
            className="rounded-xl bg-black text-xs font-bold text-white hover:bg-gray-900"
          >
            Save
          </Button>
        </div>
      </div>
      ) : (
        <div className="mb-4">
          <Button
            type="button"
            disabled={saving}
            onClick={() => onSave({ open: false })}
            className="rounded-xl bg-black text-xs font-bold text-white hover:bg-gray-900"
          >
            Save
          </Button>
        </div>
      )}

      <p data-testid="admin-selection-count" className="text-sm font-bold text-black">
        {selectionCountLabel(quote.selectedCount, quote.allowance)}
        {billing === "charge" && quote.extraCount > 0 ? ` · ${quote.extraCount} extra ${selectionNoun(mode, quote.extraCount)}` : ""}
        {billing === "charge" && quote.extraTotal > 0 ? ` · ${moneyLabel(quote.extraTotal)} added` : ""}
      </p>
      {view.recordedOnOrder && quote.extraTotal > 0 ? (
        <p className="mt-1 text-xs text-gray-500">The extra amount is on the order. It has not been charged.</p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {(["all", "selected", "unselected"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={show === value}
            onClick={() => setShow(value)}
            className={`min-h-11 rounded-xl px-3 text-[10px] font-black uppercase tracking-widest ${show === value ? "bg-black text-white" : "border border-gray-200 bg-white text-black"}`}
          >
            {value}
          </button>
        ))}
      </div>
      <ul data-testid="admin-selection-names" className="mt-3 max-h-48 space-y-1 overflow-auto rounded-xl bg-white p-3">
        {rows.length === 0 ? <li className="text-sm text-gray-400">No file names in this filter.</li> : null}
        {rows.map((photo) => (
          <li key={photo.id} className="flex items-center justify-between gap-3 text-sm font-bold text-black">
            <span className="truncate">{photo.fileName}</span>
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
              {photo.archived ? "Archived" : selectedIds.includes(photo.id) ? "Selected" : "Not selected"}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="outline" data-testid="admin-selection-copy" onClick={onCopy} className="rounded-xl text-xs font-bold">
          <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy file names
        </Button>
        <Button type="button" variant="outline" data-testid="admin-selection-csv" onClick={onCsv} className="rounded-xl text-xs font-bold">
          <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
        </Button>
        <Button
          type="button"
          data-testid="admin-selection-archive"
          disabled={saving || view.status !== "submitted"}
          onClick={onArchive}
          className="rounded-xl bg-black text-xs font-bold text-white hover:bg-gray-900"
        >
          Archive the rest{view.archivedCount > 0 ? ` (${view.archivedCount} archived)` : ""}
        </Button>
        {view.status === "submitted" ? (
          <Button type="button" variant="outline" disabled={saving} onClick={() => onSave({ reopen: true, open: true })} className="rounded-xl text-xs font-bold">
            Reopen picks
          </Button>
        ) : null}
      </div>
      <p className="mt-3 text-xs text-gray-500">{names.length} file name{names.length === 1 ? "" : "s"} on the selected list.</p>
    </section>
  );
}

export function AdminClientSelections({
  galleryId,
  getToken,
  reviewPending,
  onPending,
}: {
  galleryId: string;
  getToken: () => Promise<string>;
  reviewPending?: boolean;
  onPending?: (pending: boolean) => void;
}) {
  const [view, setView] = useState<StaffSelectionView | null>(null);
  const [liveIds, setLiveIds] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;
  const pendingRef = useRef(onPending);
  pendingRef.current = onPending;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await tokenRef.current();
        const res = await fetch(`/api/galleries/${encodeURIComponent(galleryId)}/selections`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => null);
        if (!cancelled && res.ok && data) setView(data as StaffSelectionView);
      } catch {
        if (!cancelled) toast.error("Client selections could not be loaded.");
      }
    })();
    return () => { cancelled = true; };
  }, [galleryId]);

  useEffect(() => {
    const ref = doc(db, "galleries", galleryId, GALLERY_PICKS_COLLECTION, GALLERY_PICKS_DOC);
    return onSnapshot(ref, (snap) => {
      const ids = snap.data()?.mediaIds;
      setLiveIds(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : []);
    }, () => setLiveIds(null));
  }, [galleryId]);

  useEffect(() => {
    if (!view?.reviewPending) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await tokenRef.current();
        await fetch(`/api/galleries/${encodeURIComponent(galleryId)}/selections/seen`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!cancelled) pendingRef.current?.(false);
      } catch {
        // The badge can stay. Opening the order list still clears the nav count.
      }
    })();
    return () => { cancelled = true; };
  }, [galleryId, view?.reviewPending]);

  const selectedIds = liveIds ?? view?.selectedIds ?? [];

  const send = async (path: string, method: string, body?: Record<string, unknown>) => {
    setSaving(true);
    try {
      const token = await tokenRef.current();
      const res = await fetch(path, {
        method,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Could not update selections.");
      setView(data as StaffSelectionView);
      toast.success("Selections updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update selections.");
    } finally {
      setSaving(false);
    }
  };

  if (!view) {
    return (
      <section className="mb-6 rounded-xl border border-gray-100 bg-gray-50 p-4">
        <h3 className="text-sm font-black text-black">Client selections</h3>
        {reviewPending ? <UnreadBadge count={1} testId="admin-selection-badge" /> : null}
        <p className="mt-2 text-sm text-gray-500">Loading the client&apos;s list.</p>
      </section>
    );
  }

  const fileNames = view.photos.filter((photo) => selectedIds.includes(photo.id)).map((photo) => photo.fileName);

  return (
    <AdminClientSelectionsView
      view={{ ...view, reviewPending: view.reviewPending || reviewPending === true }}
      selectedIds={selectedIds}
      saving={saving}
      onSave={(body) => { void send(`/api/galleries/${encodeURIComponent(galleryId)}/selections`, "PATCH", body); }}
      onArchive={() => { void send(`/api/galleries/${encodeURIComponent(galleryId)}/selections/archive`, "POST"); }}
      onCopy={() => {
        void navigator.clipboard.writeText(fileNames.join("\n")).then(
          () => toast.success("File names copied."),
          () => toast.error("Could not copy file names."),
        );
      }}
      onCsv={() => {
        const header = "fileName\n";
        const body = fileNames.map((name) => (/[",\n]/.test(name) ? `"${name.replace(/"/g, '""')}"` : name)).join("\n");
        const blob = new Blob([`${header}${body}\n`], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "client-selections.csv";
        link.click();
        URL.revokeObjectURL(url);
      }}
    />
  );
}
