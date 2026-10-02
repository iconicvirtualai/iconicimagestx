import { useEffect, useMemo, useRef, useState } from "react";
import {
  AI_EDIT_PRESETS,
  DEFAULT_ADJUSTMENTS,
  RAW_IMPORT_LABEL,
  STUDIO_FLAGS,
  adjustmentCssFilter,
  presetPrompt,
  type StudioAdjustments,
  type StudioFrame,
} from "@shared/iconicStudio";
import type { OrderEditPlan } from "@shared/orderEditPlan";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { loadHtmlImage, paintProceduralRoom, renderAdjustedJpeg } from "@/lib/studioCanvas";

export interface StudioJobView {
  id: string;
  listingId?: string;
  kind?: string;
  type?: string;
  status?: string;
  prompt?: string;
  beforeUrl?: string;
  afterUrl?: string;
  note?: string;
  placeholder?: boolean;
  sourcePath?: string;
  resultPath?: string;
  fileCount?: number;
  origin?: string;
  label?: string;
  slot?: string;
}

export interface StudioListingOption {
  id: string;
  address: string;
  status?: string;
  imageCount?: number;
}

const TABS = [
  { id: "adjust", label: "Adjust" },
  { id: "ai", label: "AI" },
  { id: "brand", label: "Brand" },
  { id: "gallery", label: "Gallery" },
] as const;

type StudioTab = (typeof TABS)[number]["id"];

const CROPS: Array<{ id: StudioAdjustments["crop"]; label: string }> = [
  { id: "original", label: "Original" },
  { id: "1:1", label: "1:1" },
  { id: "4:5", label: "4:5" },
  { id: "16:9", label: "16:9" },
];

const labelCls = "text-[10px] font-black uppercase tracking-widest text-gray-400";

function cropClass(crop: StudioAdjustments["crop"]) {
  if (crop === "1:1") return "aspect-square h-[70%] max-h-full";
  if (crop === "4:5") return "aspect-[4/5] h-[70%] max-h-full";
  if (crop === "16:9") return "aspect-video w-[90%] max-h-full";
  return "max-h-full max-w-full";
}

export default function IconicStudioWorkspace({
  listings,
  jobs,
  listingId,
  address,
  frames,
  demo = false,
  editPlan = null,
  initialTab,
  onSelectListing,
  onAiEdit,
  onRunOrder,
  onSaveAdjust,
  onApprove,
  onReject,
}: {
  listings: StudioListingOption[];
  jobs: StudioJobView[];
  listingId: string | null;
  address: string;
  frames: StudioFrame[];
  demo?: boolean;
  editPlan?: OrderEditPlan | null;
  initialTab?: StudioTab;
  onSelectListing: (id: string) => void;
  onAiEdit: (input: { type: string; prompt: string; frame: StudioFrame }) => Promise<void>;
  onRunOrder?: () => Promise<void>;
  onSaveAdjust: (input: { frame: StudioFrame; adjustments: StudioAdjustments; dataBase64: string }) => Promise<void>;
  onApprove: (input: { frame?: StudioFrame; job?: StudioJobView }) => Promise<void>;
  onReject?: (job: StudioJobView) => Promise<void>;
}) {
  const [tab, setTab] = useState<StudioTab>(initialTab || "adjust");
  const [selectedId, setSelectedId] = useState(frames[0]?.id || "");
  const [adjustments, setAdjustments] = useState<StudioAdjustments>(DEFAULT_ADJUSTMENTS);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [sampleUrl, setSampleUrl] = useState("");
  const sampleCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    setSelectedId(frames[0]?.id || "");
    setAdjustments(DEFAULT_ADJUSTMENTS);
  }, [listingId, frames]);

  useEffect(() => {
    const canvas = sampleCanvasRef.current;
    if (!canvas) return;
    paintProceduralRoom(canvas);
    setSampleUrl(canvas.toDataURL("image/jpeg", 0.9));
  }, []);

  const frame = frames.find((item) => item.id === selectedId) || frames[0] || null;
  const previewUrl = frame?.url || (frame && !frame.raw ? sampleUrl : "");
  const reviewJobs = jobs.filter((job) => {
    if (listingId && job.listingId && job.listingId !== listingId) return false;
    if (job.status === "review" || job.status === "failed") return true;
    return job.status === "pending" && job.origin === "order" && !job.sourcePath;
  });
  const queueListings = useMemo(() => {
    const active = new Set(
      jobs.filter((job) => job.status === "pending" || job.status === "review").map((job) => job.listingId),
    );
    return listings.filter((item) => active.has(item.id));
  }, [jobs, listings]);

  const setSlider = (key: keyof StudioAdjustments, value: number) => {
    setAdjustments((current) => ({ ...current, [key]: value }));
  };

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Iconic Studio could not finish that action.");
    } finally {
      setBusy(false);
    }
  };

  const saveAdjust = () => run(async () => {
    if (!frame) return;
    if (frame.raw || !frame.previewable) {
      toast.message(RAW_IMPORT_LABEL);
      return;
    }
    const url = frame.url || sampleUrl;
    if (!url) throw new Error("Choose a JPEG, PNG, or WebP to adjust.");
    if (demo && !frame.url) {
      toast.message("Sample preview", { description: "Sliders update this preview. A listing JPEG is required before Save writes Storage." });
      return;
    }
    const image = await loadHtmlImage(url);
    const dataUrl = renderAdjustedJpeg(image, adjustments);
    const dataBase64 = dataUrl.split(",")[1] || "";
    await onSaveAdjust({ frame, adjustments, dataBase64 });
  });

  const enqueue = (type: string) => run(async () => {
    if (!frame) return;
    const text = type === "free_text" ? prompt.trim() : (prompt.trim() || presetPrompt(type));
    if (type === "free_text" && text.length < 3) {
      toast.error("Describe the AI edit.");
      return;
    }
    await onAiEdit({ type, prompt: text, frame });
    if (type === "free_text") setPrompt("");
  });

  return (
    <div data-testid="iconic-studio" className="flex h-[calc(100vh-8.5rem)] min-h-[720px] flex-col gap-3">
      <canvas ref={sampleCanvasRef} className="hidden" width={960} height={640} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-[220px] flex-1">
          <p className={labelCls}>Listing</p>
          <select
            aria-label="Listing"
            value={listingId || ""}
            onChange={(event) => onSelectListing(event.target.value)}
            className="mt-1 w-full max-w-xl rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold"
          >
            <option value="">Choose a listing</option>
            {listings.map((item) => (
              <option key={item.id} value={item.id}>
                {item.address} ({item.imageCount ?? 0})
              </option>
            ))}
          </select>
        </div>
        <p className="max-w-sm text-[11px] font-bold text-gray-500">
          Agents: later. Outside photographer accounts stay off.
        </p>
      </div>

      {demo && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
          Sample layout. Firebase Admin is not configured here, so Save and Approve do not write Storage.
        </p>
      )}

      <div className="flex gap-2 overflow-x-auto">
        {queueListings.length === 0 ? (
          <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-widest text-gray-400">
            Queue empty
          </span>
        ) : queueListings.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelectListing(item.id)}
            className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${item.id === listingId ? "bg-[#0d9488] text-white" : "bg-white text-gray-600"}`}
          >
            Edits begin · {item.address}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <aside data-testid="studio-filmstrip" className="flex gap-2 overflow-x-auto rounded-2xl bg-[#111] p-2 lg:w-28 lg:flex-col lg:overflow-y-auto">
          {frames.length === 0 && (
            <p className="px-2 py-6 text-center text-[10px] font-bold uppercase tracking-widest text-gray-500">No photos</p>
          )}
          {frames.map((item) => {
            const thumb = item.url || (!item.raw ? sampleUrl : "");
            const active = item.id === frame?.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-label={item.name}
                onClick={() => {
                  setSelectedId(item.id);
                  setAdjustments(DEFAULT_ADJUSTMENTS);
                }}
                className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border-2 ${active ? "border-[#0d9488]" : "border-transparent"}`}
              >
                {thumb ? (
                  <img src={thumb} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full items-center justify-center bg-zinc-800 px-1 text-[9px] font-black uppercase text-amber-200">RAW</span>
                )}
              </button>
            );
          })}
        </aside>

        <section data-testid="studio-preview" className="flex min-h-[320px] flex-1 items-center justify-center overflow-hidden rounded-2xl bg-[#1c1c1c] p-4">
          {!frame && <p className="text-sm font-bold text-gray-400">Select a listing photo.</p>}
          {frame?.raw && (
            <div className="max-w-sm text-center">
              <p className="text-sm font-black uppercase tracking-widest text-amber-200">{RAW_IMPORT_LABEL}</p>
              <p className="mt-2 text-xs text-gray-400">{frame.name} stays in the raw folder until an AI job returns a JPEG.</p>
            </div>
          )}
          {frame && !frame.raw && previewUrl && (
            <div className={`max-h-full max-w-full overflow-hidden rounded-xl ${cropClass(adjustments.crop)}`} style={{ transform: `rotate(${adjustments.rotate}deg)` }}>
              <img
                src={previewUrl}
                alt={frame.name}
                className={`h-full w-full ${adjustments.crop === "original" ? "object-contain" : "object-cover"}`}
                style={{ filter: adjustmentCssFilter(adjustments) }}
              />
            </div>
          )}
        </section>

        <aside data-testid="studio-tools" className="flex w-full flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white lg:w-80">
          <div role="tablist" aria-label="Iconic Studio tools" className="grid grid-cols-4 border-b border-gray-100">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                data-testid={`studio-tab-${item.id}`}
                onClick={() => setTab(item.id)}
                className={`px-2 py-3 text-[10px] font-black uppercase tracking-widest ${tab === item.id ? "text-[#0d9488] shadow-[inset_0_-2px_0_#0d9488]" : "text-gray-400"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <p className="text-xs font-bold text-gray-500">{address}</p>
            {tab === "adjust" && (
              <AdjustPanel
                adjustments={adjustments}
                disabled={!frame || frame.raw || busy}
                onSlider={setSlider}
                onRotate={() => setAdjustments((current) => ({ ...current, rotate: ((current.rotate + 90) % 360) as StudioAdjustments["rotate"] }))}
                onCrop={(crop) => setAdjustments((current) => ({ ...current, crop }))}
                onReset={() => setAdjustments(DEFAULT_ADJUSTMENTS)}
                onSave={saveAdjust}
              />
            )}
            {tab === "ai" && (
              <AiPanel
                prompt={prompt}
                busy={busy || !frame}
                reviewJobs={reviewJobs}
                sampleUrl={sampleUrl}
                editPlan={editPlan}
                onPrompt={setPrompt}
                onEnqueue={enqueue}
                onRunOrder={onRunOrder ? () => run(onRunOrder) : undefined}
                onApprove={(job) => run(() => onApprove({ job, frame: frames.find((item) => item.path === (job.resultPath || job.sourcePath)) }))}
                onReject={onReject ? (job) => run(() => onReject(job)) : undefined}
              />
            )}
            {tab === "brand" && <BrandPanel />}
            {tab === "gallery" && (
              <GalleryPanel
                selected={frame}
                frames={frames.filter((item) => item.studioApproved || item.studioRole === "final" || item.path.includes("/finals/"))}
                busy={busy}
                onApprove={(item) => run(() => onApprove({ frame: item }))}
              />
            )}
          </div>
        </aside>
      </div>
      {!STUDIO_FLAGS.agentUpsell && <span className="sr-only">Agent upsell is off</span>}
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between">
        <span className={labelCls}>{label}</span>
        <span className="text-[10px] font-bold text-gray-500">{value}</span>
      </span>
      <Slider
        aria-label={label}
        min={min}
        max={max}
        step={1}
        value={[value]}
        disabled={disabled}
        onValueChange={(next) => onChange(next[0] ?? 0)}
        className="mt-2"
      />
    </label>
  );
}

function AdjustPanel({
  adjustments,
  disabled,
  onSlider,
  onRotate,
  onCrop,
  onReset,
  onSave,
}: {
  adjustments: StudioAdjustments;
  disabled?: boolean;
  onSlider: (key: keyof StudioAdjustments, value: number) => void;
  onRotate: () => void;
  onCrop: (crop: StudioAdjustments["crop"]) => void;
  onReset: () => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onRotate} className="rounded-lg bg-gray-100 px-3 py-2 text-[10px] font-black uppercase tracking-widest">Rotate</button>
        {CROPS.map((crop) => (
          <button
            key={crop.id}
            type="button"
            onClick={() => onCrop(crop.id)}
            className={`rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-widest ${adjustments.crop === crop.id ? "bg-[#0d9488] text-white" : "bg-gray-100"}`}
          >
            {crop.label}
          </button>
        ))}
      </div>
      <SliderRow label="Exposure" value={adjustments.exposure} min={-100} max={100} disabled={disabled} onChange={(value) => onSlider("exposure", value)} />
      <SliderRow label="Shadows" value={adjustments.shadows} min={-100} max={100} disabled={disabled} onChange={(value) => onSlider("shadows", value)} />
      <SliderRow label="Saturation" value={adjustments.saturation} min={-100} max={100} disabled={disabled} onChange={(value) => onSlider("saturation", value)} />
      <SliderRow label="Sharpness" value={adjustments.sharpness} min={0} max={100} disabled={disabled} onChange={(value) => onSlider("sharpness", value)} />
      <SliderRow label="Tint" value={adjustments.tint} min={-100} max={100} disabled={disabled} onChange={(value) => onSlider("tint", value)} />
      <p className="text-[11px] text-gray-500">Sharpness is applied in the JPEG when you save. The preview uses exposure, shadows, saturation, tint, crop, and rotate.</p>
      <div className="flex gap-2">
        <button type="button" onClick={onReset} className="rounded-xl border border-gray-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest">Reset</button>
        <button type="button" disabled={disabled} onClick={onSave} className="rounded-xl bg-[#0d9488] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-40">Save JPEG</button>
      </div>
    </div>
  );
}

function AiPanel({
  prompt,
  busy,
  reviewJobs,
  sampleUrl,
  editPlan,
  onPrompt,
  onEnqueue,
  onRunOrder,
  onApprove,
  onReject,
}: {
  prompt: string;
  busy?: boolean;
  reviewJobs: StudioJobView[];
  sampleUrl: string;
  editPlan?: OrderEditPlan | null;
  onPrompt: (value: string) => void;
  onEnqueue: (type: string) => void;
  onRunOrder?: () => void;
  onApprove: (job: StudioJobView) => void;
  onReject?: (job: StudioJobView) => void;
}) {
  const polish = editPlan?.iconicPolish ? "Iconic Polish on" : "Iconic Polish off";
  const twilight = editPlan?.twilight.length
    ? `${editPlan.twilight.length} twilight (${editPlan.twilight.map((slot) => slot.role).join(", ")})`
    : "No twilight on this order";
  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-gray-100 bg-gray-50 p-3">
        <p className={labelCls}>Order edits</p>
        <p className="mt-1 text-xs font-bold text-gray-700">{editPlan?.packageName || "No package on this listing yet"}</p>
        <p className="mt-1 text-[11px] leading-snug text-gray-500">
          {twilight}. {polish}. Uploaded photos use the order prompt. Shooters do not pick an edit per photo.
        </p>
        {editPlan && editPlan.deliverables.length > 0 && (
          <p className="mt-1 text-[11px] text-gray-500">
            Not image edits: {editPlan.deliverables.map((item) => item.label).join(", ")}.
          </p>
        )}
        <p className="mt-1 text-[11px] text-gray-500">Gallery stays held until the order is complete.</p>
        <button
          type="button"
          disabled={busy || !onRunOrder}
          onClick={onRunOrder}
          className="mt-2 rounded-xl bg-black px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-40"
        >
          {busy ? "Editing…" : "Run next order edit"}
        </button>
      </section>
      <p className={labelCls}>Staff override</p>
      <div className="grid grid-cols-2 gap-2">
        {AI_EDIT_PRESETS.filter((preset) => preset.id !== "free_text").map((preset) => (
          <button
            key={preset.id}
            type="button"
            disabled={busy}
            onClick={() => onEnqueue(preset.id)}
            className="rounded-xl border border-gray-200 px-2 py-2 text-left text-[10px] font-black uppercase tracking-widest hover:border-[#0d9488] disabled:opacity-40"
          >
            {preset.label}
          </button>
        ))}
      </div>
      <label className="block">
        <span className={labelCls}>AI edit</span>
        <textarea
          aria-label="AI edit"
          value={prompt}
          onChange={(event) => onPrompt(event.target.value)}
          rows={3}
          placeholder="Describe the edit"
          className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
        />
      </label>
      <button type="button" disabled={busy} onClick={() => onEnqueue("free_text")} className="rounded-xl border border-black px-3 py-2 text-[10px] font-black uppercase tracking-widest disabled:opacity-40">
        {busy ? "Editing…" : "Queue AI edit"}
      </button>
      <div data-testid="studio-review-tray">
        <p className={labelCls}>Needs review</p>
        {reviewJobs.length === 0 && <p className="mt-2 text-xs text-gray-500">No edits waiting.</p>}
        <div className="mt-2 space-y-3">
          {reviewJobs.map((job) => {
            const before = job.beforeUrl || "";
            const after = job.afterUrl || "";
            const canApprove = job.status === "review" && !job.placeholder && Boolean(after);
            return (
              <article key={job.id} className="rounded-xl border border-gray-100 p-2">
                <p className="text-[10px] font-black uppercase tracking-widest">{job.label || job.type || "edit"} · {job.status}</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <figure>
                    {before ? <img src={before} alt="" className="h-16 w-full rounded object-cover" /> : <div className="h-16 rounded bg-gray-100" />}
                    <figcaption className="mt-1 text-[9px] font-bold uppercase text-gray-400">Before</figcaption>
                  </figure>
                  <figure>
                    {after ? <img src={after} alt="" className="h-16 w-full rounded object-cover" /> : <div className="h-16 rounded bg-gray-100" />}
                    <figcaption className="mt-1 text-[9px] font-bold uppercase text-gray-400">
                      After{job.placeholder ? " · placeholder" : ""}
                    </figcaption>
                  </figure>
                </div>
                {job.note && (
                  <p className={`mt-2 text-[11px] leading-snug ${job.status === "failed" ? "text-red-700" : "text-gray-500"}`}>{job.note}</p>
                )}
                <div className="mt-2 flex gap-2">
                  {canApprove && (
                    <button type="button" onClick={() => onApprove(job)} className="rounded-lg bg-[#0d9488] px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white">
                      Approve final
                    </button>
                  )}
                  {onReject && job.status !== "pending" && (
                    <button type="button" onClick={() => onReject(job)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest">
                      Reject
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function BrandPanel() {
  const soon = () => toast.message("Coming soon");
  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">Brand tools stay off until Canva is connected. No OAuth in this version.</p>
      <button type="button" onClick={soon} className="w-full rounded-xl border border-dashed border-gray-300 px-3 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400">
        Brand with logo · coming soon
      </button>
      <button type="button" onClick={soon} className="w-full rounded-xl border border-dashed border-gray-300 px-3 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400">
        Create social post (Canva) · coming soon
      </button>
    </div>
  );
}

function GalleryPanel({
  selected,
  frames,
  busy,
  onApprove,
}: {
  selected: StudioFrame | null;
  frames: StudioFrame[];
  busy?: boolean;
  onApprove: (frame: StudioFrame) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Approve copies a JPEG, PNG, or WebP into the listing finals folder and adds it to the linked gallery. Delivered galleries stay delivered. No client email is sent.
      </p>
      {selected && !selected.raw && (
        <button type="button" disabled={busy} onClick={() => onApprove(selected)} className="w-full rounded-xl bg-[#0d9488] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-40">
          Approve selected and add to gallery
        </button>
      )}
      {selected?.raw && <p className="text-xs font-bold text-amber-700">{RAW_IMPORT_LABEL}</p>}
      {frames.length === 0 && <p className="text-xs text-gray-500">Approved finals show up here after the first approve.</p>}
      {frames.map((frame) => (
        <div key={frame.id} className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 p-2">
          <p className="truncate text-xs font-bold">{frame.name}</p>
          <button type="button" disabled={busy} onClick={() => onApprove(frame)} className="shrink-0 rounded-lg bg-[#0d9488] px-2 py-1 text-[10px] font-black uppercase tracking-widest text-white">
            Add to gallery
          </button>
        </div>
      ))}
      <p className="text-[11px] text-gray-400">Mark ready for deliver happens when the gallery is still in upload or editing.</p>
    </div>
  );
}
