import { useEffect, useRef, useState } from "react";
import {
  ICONIC_POLISH_INSTRUCTION,
  ICONIC_POLISH_TREATMENTS,
} from "@shared/orderEditPlan";
import {
  AI_EDIT_PRESETS,
  DEFAULT_ADJUSTMENTS,
  adjustmentCssFilter,
  type StudioAdjustments,
} from "@shared/iconicStudio";
import { type ScratchAction } from "@shared/studioScratch";
import { SCRATCH_SORT_DEFAULT, type ScratchSortMode } from "@/lib/scratchSort";
import { Slider } from "@/components/ui/slider";

export type ScratchExportDestination = "gallery" | "dropbox" | "drive" | "zip";

export interface ScratchFrameView {
  id: string;
  name: string;
  beforeUrl: string;
  status: "ready" | "editing" | "done" | "failed";
  error?: string;
  afterUrl?: string;
  selected: boolean;
  focused: boolean;
  lastAction?: string;
  canRevert?: boolean;
}

const labelCls =
  "text-[10px] font-black uppercase tracking-widest text-gray-400";
const gold = "#c4a46a";
const teal = "#0d9488";

const PRESETS = AI_EDIT_PRESETS.filter(
  (preset) =>
    preset.id !== "free_text" &&
    preset.id !== "twilight" &&
    preset.id !== "add_people",
);

const SORTS: Array<{ id: ScratchSortMode; label: string }> = [
  { id: "name-asc", label: "Filename" },
  { id: "name-desc", label: "Filename, high to low" },
  { id: "date-asc", label: "Date shot, oldest first" },
  { id: "date-desc", label: "Date shot, newest first" },
  { id: "size-desc", label: "Size, large to small" },
  { id: "size-asc", label: "Size, small to large" },
  { id: "upload", label: "Upload order" },
];

const CROPS: Array<{ id: StudioAdjustments["crop"]; label: string }> = [
  { id: "original", label: "Original" },
  { id: "1:1", label: "1:1" },
  { id: "4:5", label: "4:5" },
  { id: "16:9", label: "16:9" },
];

function cropFrameClass(crop: StudioAdjustments["crop"]) {
  if (crop === "1:1") return "aspect-square h-[78%] max-h-full";
  if (crop === "4:5") return "aspect-[4/5] h-[78%] max-h-full";
  if (crop === "16:9") return "aspect-video w-[92%] max-h-full";
  return "h-full w-full";
}

function actionLabel(action?: string) {
  if (action === "twilight") return "Twilight";
  if (action === "grass") return "Grass";
  if (action === "revise") return "Revision";
  if (action === "finetune") return "Finetune";
  if (action === "edit") return "Edit";
  return "";
}

function ApplyButton({
  testId,
  label,
  disabled,
  onApply,
}: {
  testId: string;
  label: string;
  disabled?: boolean;
  onApply: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={disabled}
      onClick={onApply}
      className="rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-40"
      style={{ backgroundColor: teal }}
    >
      {label}
    </button>
  );
}

export default function StudioScratchPad({
  frames,
  prompt,
  revision,
  busy,
  progress,
  grassReady,
  grassNote,
  sortMode = SCRATCH_SORT_DEFAULT,
  onPrompt,
  onRevision,
  onAddFiles,
  onSelect,
  onSort,
  onRun,
  onApplyPreset,
  onApplyFinetune,
  onRevertFinetune,
  onDownload,
  onExport,
  onRemove,
}: {
  frames: ScratchFrameView[];
  prompt: string;
  revision: string;
  busy: boolean;
  progress: string;
  grassReady: boolean;
  grassNote: string;
  sortMode?: ScratchSortMode;
  onPrompt: (value: string) => void;
  onRevision: (value: string) => void;
  onAddFiles: (files: File[]) => void;
  onSelect: (id: string, mode: "replace" | "toggle" | "range") => void;
  onSort: (mode: ScratchSortMode) => void;
  onRun: (action: ScratchAction) => void;
  onApplyPreset: (presetPrompt: string) => void;
  onApplyFinetune: (adjustments: StudioAdjustments) => Promise<boolean>;
  onRevertFinetune: () => void;
  onDownload: () => void;
  onExport: (destination: ScratchExportDestination) => void;
  onRemove: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showAfter, setShowAfter] = useState(true);
  const [adjustments, setAdjustments] =
    useState<StudioAdjustments>(DEFAULT_ADJUSTMENTS);
  const focus = frames.find((frame) => frame.focused) || frames[0] || null;
  const setReady = frames.length > 0;
  const checkedCount = frames.filter((frame) => frame.selected).length;
  const editedCount = frames.filter((frame) => frame.afterUrl).length;
  const canRevert = frames.some((frame) => frame.selected && frame.canRevert);
  const displayUrl = focus
    ? showAfter && focus.afterUrl
      ? focus.afterUrl
      : focus.beforeUrl
    : "";
  const applyLocked = busy || checkedCount === 0;

  useEffect(() => {
    setShowAfter(true);
  }, [focus?.id, focus?.afterUrl]);

  const takeFiles = (list: FileList | File[] | null) => {
    const files = Array.from(list || []);
    if (files.length) onAddFiles(files);
  };

  const setSlider = (key: keyof StudioAdjustments, value: number) => {
    setAdjustments((current) => ({ ...current, [key]: value }));
  };

  return (
    <div
      data-testid="scratch-pad"
      data-layout="center-photo bottom-filmstrip right-panel"
      className="flex min-h-[640px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-[#161616] lg:h-[calc(100vh-8.75rem)]"
      onDragOver={(event) => {
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        takeFiles(event.dataTransfer.files);
      }}
    >
      <header className="relative z-20 flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <p
            className="text-[10px] font-black uppercase tracking-[0.18em]"
            style={{ color: gold }}
          >
            Scratch pad
          </p>
          <p className="truncate text-sm font-black text-white">
            {focus?.name || "Scratch pad"}
          </p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
            {frames.length === 0
              ? "No set yet"
              : `${frames.length} in this set`}
            {checkedCount ? ` · ${checkedCount} checked` : ""}
            {progress ? ` · ${progress}` : ""}
            {focus?.lastAction ? ` · ${actionLabel(focus.lastAction)}` : ""}
          </p>
        </div>
        {setReady ? (
          <div
            data-testid="scratch-actions"
            className="flex shrink-0 items-center gap-2"
          >
            <button
              type="button"
              data-testid="scratch-delete"
              disabled={!focus || busy}
              onClick={() => focus && onRemove(focus.id)}
              className="rounded-lg border border-white/15 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-40"
            >
              Delete
            </button>
            <details data-testid="scratch-export" className="relative">
              <summary className="flex cursor-pointer list-none items-center rounded-lg border border-white/15 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white [&::-webkit-details-marker]:hidden">
                Export to…
              </summary>
              <div className="absolute right-0 z-30 mt-2 w-60 rounded-xl border border-slate-200 bg-white p-1 text-left shadow-xl">
                <button
                  type="button"
                  data-testid="scratch-export-gallery"
                  onClick={() => onExport("gallery")}
                  className="block w-full rounded-lg px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-gray-700 hover:bg-slate-50"
                >
                  Gallery
                </button>
                <button
                  type="button"
                  data-testid="scratch-export-dropbox"
                  onClick={() => onExport("dropbox")}
                  className="block w-full rounded-lg px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-gray-700 hover:bg-slate-50"
                >
                  Dropbox
                </button>
                <button
                  type="button"
                  data-testid="scratch-export-drive"
                  onClick={() => onExport("drive")}
                  className="block w-full rounded-lg px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-gray-700 hover:bg-slate-50"
                >
                  Google Drive
                </button>
                <button
                  type="button"
                  data-testid="scratch-download-zip"
                  disabled={editedCount === 0}
                  onClick={() => onExport("zip")}
                  className="block w-full rounded-lg px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-gray-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  Edited set (.zip)
                </button>
                <p className="px-3 py-2 text-[10px] leading-relaxed text-gray-400">
                  Gallery, Dropbox, and Google Drive are not connected here. The
                  zip downloads edits already in this browser.
                </p>
              </div>
            </details>
            <button
              type="button"
              data-testid="scratch-download"
              disabled={!focus}
              onClick={onDownload}
              className="rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-40"
              style={{ backgroundColor: teal }}
            >
              Download
            </button>
          </div>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-col lg:flex-1 lg:flex-row">
        <div className="flex min-w-0 flex-col lg:min-h-0 lg:flex-1">
          <section
            data-testid="scratch-viewer"
            className="relative flex min-h-[240px] flex-1 items-center justify-center overflow-hidden bg-[#1c1c1c]"
          >
            {!focus ? (
              <button
                type="button"
                data-testid="scratch-drop"
                onClick={() => inputRef.current?.click()}
                className={`mx-6 flex min-h-[280px] w-full max-w-xl flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 text-center ${
                  dragOver ? "border-[#0d9488] bg-white/5" : "border-white/20"
                }`}
              >
                <span className="text-sm font-black uppercase tracking-widest text-white">
                  Drop JPEGs here
                </span>
                <span className="mt-2 max-w-sm text-xs text-gray-400">
                  Photos stay in this browser. Nothing is added to an order or a
                  gallery. JPEG only. RAW and HDR brackets are the next pass.
                </span>
              </button>
            ) : (
              <>
                <div
                  className={`flex items-center justify-center overflow-hidden ${cropFrameClass(adjustments.crop)}`}
                  style={{ transform: `rotate(${adjustments.rotate}deg)` }}
                >
                  <img
                    src={displayUrl}
                    alt={focus.name}
                    className={
                      adjustments.crop === "original"
                        ? "max-h-full max-w-full object-contain"
                        : "h-full w-full object-cover"
                    }
                    style={{ filter: adjustmentCssFilter(adjustments) }}
                  />
                </div>
                {focus.afterUrl ? (
                  <div
                    data-testid="scratch-compare"
                    className="absolute left-3 top-3 flex rounded-lg bg-black/70 p-1"
                  >
                    <button
                      type="button"
                      aria-pressed={!showAfter}
                      onClick={() => setShowAfter(false)}
                      className={`rounded-md px-3 py-1.5 text-[10px] font-black uppercase tracking-widest ${showAfter ? "text-gray-300" : "bg-white text-black"}`}
                    >
                      Before
                    </button>
                    <button
                      type="button"
                      aria-pressed={showAfter}
                      onClick={() => setShowAfter(true)}
                      className={`rounded-md px-3 py-1.5 text-[10px] font-black uppercase tracking-widest ${showAfter ? "bg-white text-black" : "text-gray-300"}`}
                    >
                      After
                    </button>
                  </div>
                ) : (
                  <p className="absolute bottom-3 left-3 rounded-lg bg-black/70 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-gray-300">
                    No edit yet
                  </p>
                )}
                {focus.status === "editing" ? (
                  <p className="absolute right-3 top-3 rounded-lg bg-black/70 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white">
                    Editing…
                  </p>
                ) : null}
              </>
            )}
            {focus?.status === "failed" && focus.error ? (
              <p
                data-testid="scratch-error"
                className="absolute inset-x-0 bottom-0 bg-red-950/90 px-4 py-3 text-sm text-red-100"
              >
                {focus.error}
              </p>
            ) : null}
          </section>

          {setReady ? (
            <div className="flex items-center justify-between gap-3 border-t border-white/10 bg-[#111] px-3 py-2">
              <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-400">
                Sort
                <select
                  data-testid="scratch-sort"
                  value={sortMode}
                  onChange={(event) =>
                    onSort(event.target.value as ScratchSortMode)
                  }
                  className="rounded-lg border border-white/15 bg-[#0a0a0a] px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-white"
                >
                  {SORTS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-right text-[10px] font-bold uppercase tracking-widest text-gray-500">
                Check the frames to edit. Nothing is added to an order or a
                gallery.
              </p>
            </div>
          ) : null}

          <footer
            data-testid="scratch-filmstrip"
            data-position="bottom"
            className="scrollbar-hide flex h-[5.75rem] shrink-0 items-center gap-2 overflow-x-auto border-t border-white/10 bg-[#0a0a0a] px-3"
          >
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-dashed border-white/20 text-[10px] font-black uppercase tracking-widest text-gray-400"
            >
              Add
            </button>
            {frames.length === 0 ? (
              <p className="text-xs text-gray-500">
                The edit set shows up here. Click a frame to open it.
              </p>
            ) : (
              frames.map((frame) => (
                <div
                  key={frame.id}
                  className="relative h-14 w-[4.5rem] shrink-0"
                >
                  <button
                    type="button"
                    data-testid={`scratch-frame-${frame.id}`}
                    data-selected={frame.selected ? "true" : "false"}
                    data-focused={frame.focused ? "true" : "false"}
                    title={frame.name}
                    onClick={() => onSelect(frame.id, "replace")}
                    className={`h-full w-full overflow-hidden rounded-lg border-2 ${
                      frame.status === "failed"
                        ? "border-red-500"
                        : frame.focused
                          ? "border-[#c4a46a]"
                          : frame.selected
                            ? "border-[#0d9488]"
                            : "border-transparent"
                    }`}
                  >
                    <img
                      src={frame.afterUrl || frame.beforeUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                    <span className="sr-only">{frame.name}</span>
                  </button>
                  <input
                    type="checkbox"
                    data-testid={`scratch-check-${frame.id}`}
                    checked={frame.selected}
                    aria-label={`Include ${frame.name}`}
                    onChange={() => onSelect(frame.id, "toggle")}
                    className="absolute left-1 top-1 z-10 h-3.5 w-3.5 accent-[#0d9488]"
                  />
                </div>
              ))
            )}
          </footer>
        </div>

        <aside
          data-testid="scratch-adjust"
          className="flex max-h-[46vh] w-full shrink-0 flex-col border-t border-slate-200 bg-white lg:max-h-none lg:w-[22.5rem] lg:border-l lg:border-t-0"
        >
          <div className="border-b border-slate-100 px-4 py-3">
            <h2
              className="text-sm font-black uppercase tracking-widest"
              style={{ color: gold }}
            >
              Adjust enhancement
            </h2>
          </div>
          <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto p-4">
            <section data-testid="scratch-panel-ai" data-active="true">
              <h3
                data-testid="scratch-section-ai"
                className="text-[10px] font-black uppercase tracking-widest text-[#0d9488]"
              >
                AI settings
              </h3>
              <p className="mt-2 text-[11px] leading-snug text-gray-500">
                Applies to the checked photos. Each tool runs on its own.
              </p>

              <label className="mt-4 block">
                <span className={labelCls}>Edit request</span>
                <textarea
                  data-testid="scratch-prompt"
                  value={prompt}
                  onChange={(event) => onPrompt(event.target.value)}
                  rows={2}
                  placeholder="Brighten the interior and clear the window glare."
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#0d9488]"
                />
              </label>
              <div className="mt-2">
                <ApplyButton
                  testId="scratch-run"
                  label="Apply edit"
                  disabled={applyLocked}
                  onApply={() => onRun("edit")}
                />
              </div>

              <div
                data-testid="scratch-polish"
                className="mt-5 border-t border-slate-100 pt-4"
              >
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-900">
                  Iconic Polish
                </p>
                <ul
                  data-testid="scratch-polish-rules"
                  className="mt-2 space-y-1"
                >
                  {ICONIC_POLISH_TREATMENTS.map((treatment) => (
                    <li
                      key={treatment}
                      className="text-[11px] font-medium text-gray-600"
                    >
                      {treatment}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] leading-snug text-gray-500">
                  Does not add people or move the camera. Grass replacement is a
                  separate $25 add-on, included only on classic packages. It is
                  not this polish.
                </p>
                <div className="mt-2">
                  <ApplyButton
                    testId="scratch-apply-polish"
                    label="Apply polish"
                    disabled={applyLocked}
                    onApply={() => onApplyPreset(ICONIC_POLISH_INSTRUCTION)}
                  />
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <p className={labelCls}>Twilight conversion</p>
                <ApplyButton
                  testId="scratch-twilight"
                  label="Apply twilight"
                  disabled={applyLocked}
                  onApply={() => onRun("twilight")}
                />
              </div>

              <div className="mt-4 border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between gap-3">
                  <p className={labelCls}>Grass replacement</p>
                  <ApplyButton
                    testId="scratch-grass"
                    label="Apply grass"
                    disabled={busy || !grassReady || checkedCount === 0}
                    onApply={() => onRun("grass")}
                  />
                </div>
                <p className="mt-2 text-[11px] leading-snug text-gray-500">
                  $25 add-on, included only on classic packages. Not Iconic
                  Polish.
                </p>
                {!grassReady ? (
                  <p
                    data-testid="scratch-grass-note"
                    className="mt-1 text-[11px] leading-snug text-gray-500"
                  >
                    {grassNote}
                  </p>
                ) : null}
              </div>
            </section>

            <details
              data-testid="scratch-section-finetune"
              className="mt-5 border-t border-slate-100 pt-3"
            >
              <summary className="cursor-pointer text-[10px] font-black uppercase tracking-widest text-gray-400">
                Finetune
              </summary>
              <div
                data-testid="scratch-panel-finetune"
                className="mt-3 space-y-3"
              >
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setAdjustments((current) => ({
                        ...current,
                        rotate: ((current.rotate + 90) %
                          360) as StudioAdjustments["rotate"],
                      }))
                    }
                    className="rounded-lg bg-gray-100 px-3 py-2 text-[10px] font-black uppercase tracking-widest"
                  >
                    Rotate
                  </button>
                  {CROPS.map((crop) => (
                    <button
                      key={crop.id}
                      type="button"
                      onClick={() =>
                        setAdjustments((current) => ({
                          ...current,
                          crop: crop.id,
                        }))
                      }
                      className={`rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-widest ${adjustments.crop === crop.id ? "bg-[#0d9488] text-white" : "bg-gray-100"}`}
                    >
                      {crop.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setAdjustments(DEFAULT_ADJUSTMENTS)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gray-600"
                  >
                    Reset
                  </button>
                </div>
                <SliderRow
                  label="Exposure"
                  value={adjustments.exposure}
                  min={-100}
                  max={100}
                  onChange={(value) => setSlider("exposure", value)}
                />
                <SliderRow
                  label="Shadows"
                  value={adjustments.shadows}
                  min={-100}
                  max={100}
                  onChange={(value) => setSlider("shadows", value)}
                />
                <SliderRow
                  label="Saturation"
                  value={adjustments.saturation}
                  min={-100}
                  max={100}
                  onChange={(value) => setSlider("saturation", value)}
                />
                <SliderRow
                  label="Sharpness"
                  value={adjustments.sharpness}
                  min={0}
                  max={100}
                  onChange={(value) => setSlider("sharpness", value)}
                />
                <SliderRow
                  label="Tint"
                  value={adjustments.tint}
                  min={-100}
                  max={100}
                  onChange={(value) => setSlider("tint", value)}
                />
                <div className="flex flex-wrap gap-2">
                  <ApplyButton
                    testId="scratch-finetune"
                    label="Apply finetune"
                    disabled={applyLocked}
                    onApply={() => {
                      void onApplyFinetune(adjustments).then((applied) => {
                        if (applied) setAdjustments(DEFAULT_ADJUSTMENTS);
                      });
                    }}
                  />
                  <button
                    type="button"
                    data-testid="scratch-revert"
                    disabled={busy || !canRevert}
                    onClick={onRevertFinetune}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gray-700 disabled:opacity-40"
                  >
                    Revert
                  </button>
                </div>
                <label className="block">
                  <span className={labelCls}>Additional adjustments</span>
                  <textarea
                    data-testid="scratch-revision"
                    value={revision}
                    onChange={(event) => onRevision(event.target.value)}
                    rows={2}
                    placeholder="Warm the sky a little more and leave the house unchanged."
                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#0d9488]"
                  />
                </label>
                <ApplyButton
                  testId="scratch-revise"
                  label="Apply revision"
                  disabled={busy || editedCount === 0}
                  onApply={() => onRun("revise")}
                />
              </div>
            </details>

            <details
              data-testid="scratch-section-presets"
              className="mt-4 border-t border-slate-100 pt-3"
            >
              <summary className="cursor-pointer text-[10px] font-black uppercase tracking-widest text-gray-400">
                Presets
              </summary>
              <div
                data-testid="scratch-panel-presets"
                className="mt-3 space-y-2"
              >
                {PRESETS.map((preset) => (
                  <div
                    key={preset.id}
                    data-testid={`scratch-preset-${preset.id}`}
                    className="flex items-center justify-between gap-2"
                  >
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-700">
                      {preset.label}
                    </p>
                    <ApplyButton
                      testId={`scratch-apply-preset-${preset.id}`}
                      label="Apply"
                      disabled={applyLocked}
                      onApply={() => onApplyPreset(preset.prompt)}
                    />
                  </div>
                ))}
              </div>
            </details>
          </div>
        </aside>
      </div>

      <input
        ref={inputRef}
        data-testid="scratch-file"
        type="file"
        accept="image/jpeg,.jpg,.jpeg"
        multiple
        className="hidden"
        onChange={(event) => {
          takeFiles(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
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
        onValueChange={(next) => onChange(next[0] ?? 0)}
        className="mt-2"
      />
    </label>
  );
}
