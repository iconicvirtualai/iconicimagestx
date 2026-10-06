import { useEffect, useRef, useState } from "react";
import {
  ICONIC_POLISH_INSTRUCTION,
  orderExteriorTwilightPrompt,
} from "@shared/orderEditPlan";
import {
  AI_EDIT_PRESETS,
  DEFAULT_ADJUSTMENTS,
  adjustmentCssFilter,
  type StudioAdjustments,
} from "@shared/iconicStudio";
import {
  GRASS_REFERENCE_PUBLIC_PATH,
  type ScratchAction,
} from "@shared/studioScratch";
import { Slider } from "@/components/ui/slider";

export type ScratchApplyScope = "photo" | "set";
export type ScratchExportDestination = "gallery" | "dropbox" | "drive" | "zip";
export type ScratchSection = "ai" | "finetune" | "presets";

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
}

const labelCls =
  "text-[10px] font-black uppercase tracking-widest text-gray-400";
const gold = "#c4a46a";
const teal = "#0d9488";

const SECTIONS: Array<{ id: ScratchSection; label: string }> = [
  { id: "ai", label: "AI settings" },
  { id: "finetune", label: "Finetune" },
  { id: "presets", label: "Presets" },
];

const PRESETS = [
  ...AI_EDIT_PRESETS.filter(
    (preset) => preset.id !== "free_text" && preset.id !== "twilight",
  ),
  {
    id: "iconic_polish",
    label: "Iconic Polish",
    prompt: ICONIC_POLISH_INSTRUCTION,
  },
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

function ScopedApply({
  name,
  testId,
  applyTestId,
  applyLabel,
  disabled,
  onApply,
}: {
  name: string;
  testId: string;
  applyTestId: string;
  applyLabel: string;
  disabled?: boolean;
  onApply: (scope: ScratchApplyScope) => void;
}) {
  const [scope, setScope] = useState<ScratchApplyScope>("photo");
  return (
    <div
      data-testid={testId}
      className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2"
    >
      <label className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-gray-500">
        <input
          type="radio"
          name={name}
          checked={scope === "photo"}
          onChange={() => setScope("photo")}
        />
        This photo
      </label>
      <label className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-gray-500">
        <input
          type="radio"
          name={name}
          checked={scope === "set"}
          onChange={() => setScope("set")}
        />
        All photos in the set
      </label>
      <button
        type="button"
        data-testid={applyTestId}
        disabled={disabled}
        onClick={() => onApply(scope)}
        className="rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-40"
        style={{ backgroundColor: teal }}
      >
        {applyLabel}
      </button>
    </div>
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
  onPrompt,
  onRevision,
  onAddFiles,
  onSelect,
  onRun,
  onApplyPreset,
  onApplyFinetune,
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
  onPrompt: (value: string) => void;
  onRevision: (value: string) => void;
  onAddFiles: (files: File[]) => void;
  onSelect: (id: string, mode: "replace" | "toggle" | "range") => void;
  onRun: (action: ScratchAction, scope: ScratchApplyScope) => void;
  onApplyPreset: (presetPrompt: string, scope: ScratchApplyScope) => void;
  onApplyFinetune: (
    adjustments: StudioAdjustments,
    scope: ScratchApplyScope,
    useOriginal: boolean,
  ) => Promise<boolean>;
  onDownload: () => void;
  onExport: (destination: ScratchExportDestination) => void;
  onRemove: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [section, setSection] = useState<ScratchSection>("ai");
  const [showAfter, setShowAfter] = useState(true);
  const [adjustments, setAdjustments] =
    useState<StudioAdjustments>(DEFAULT_ADJUSTMENTS);
  const focus = frames.find((frame) => frame.focused) || frames[0] || null;
  const setReady = frames.length > 0;
  const editedCount = frames.filter((frame) => frame.afterUrl).length;
  const twilightPrompt = orderExteriorTwilightPrompt();
  const displayUrl = focus
    ? showAfter && focus.afterUrl
      ? focus.afterUrl
      : focus.beforeUrl
    : "";

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

  const applyFinetune = (scope: ScratchApplyScope) => {
    const useOriginal = Boolean(focus?.afterUrl) && !showAfter;
    void onApplyFinetune(adjustments, scope, useOriginal).then((applied) => {
      if (applied) setAdjustments(DEFAULT_ADJUSTMENTS);
    });
  };

  return (
    <div
      data-testid="scratch-pad"
      data-layout="center-photo bottom-filmstrip right-panel"
      className="flex h-[calc(100vh-8.75rem)] min-h-[640px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-[#161616]"
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

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <section
            data-testid="scratch-viewer"
            className="relative flex min-h-[240px] flex-1 items-center justify-center bg-[#1c1c1c]"
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

          <footer
            data-testid="scratch-filmstrip"
            data-position="bottom"
            className="flex h-[5.75rem] shrink-0 items-center gap-2 overflow-x-auto border-t border-white/10 bg-[#0a0a0a] px-3"
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
                <button
                  key={frame.id}
                  type="button"
                  data-testid={`scratch-frame-${frame.id}`}
                  data-selected={frame.selected ? "true" : "false"}
                  data-focused={frame.focused ? "true" : "false"}
                  title={frame.name}
                  onClick={() => onSelect(frame.id, "replace")}
                  className={`h-14 w-[4.5rem] shrink-0 overflow-hidden rounded-lg border-2 ${
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
                  <span className="sr-only">
                    {frame.status === "editing"
                      ? "Editing"
                      : frame.status === "failed"
                        ? "Failed"
                        : frame.name}
                  </span>
                </button>
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
            <p className="mt-1 text-[11px] leading-snug text-gray-500">
              Each tool is optional. Applying one does not run the others.
            </p>
          </div>
          <div
            role="tablist"
            aria-label="Adjust enhancement"
            className="grid grid-cols-3 border-b border-slate-100"
          >
            {SECTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={section === item.id}
                data-testid={`scratch-section-${item.id}`}
                onClick={() => setSection(item.id)}
                className={`px-2 py-3 text-[10px] font-black uppercase tracking-widest ${
                  section === item.id
                    ? "text-[#0d9488] shadow-[inset_0_-2px_0_#0d9488]"
                    : "text-gray-400"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div
              data-testid="scratch-panel-ai"
              data-active={section === "ai" ? "true" : "false"}
              className={section === "ai" ? "space-y-5" : "hidden"}
            >
              <p className="text-xs leading-relaxed text-gray-500">
                Command, grass, and twilight stay off until you apply that tool.
                Photos stay in this browser. Nothing is added to an order or a
                gallery.
              </p>
              <section className="rounded-xl border border-slate-200 p-3">
                <label className="block">
                  <span className={labelCls}>Edit request</span>
                  <textarea
                    data-testid="scratch-prompt"
                    value={prompt}
                    onChange={(event) => onPrompt(event.target.value)}
                    rows={3}
                    placeholder="Brighten the interior and clear the window glare."
                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#0d9488]"
                  />
                </label>
                <ScopedApply
                  name="scope-edit"
                  testId="scratch-scope-edit"
                  applyTestId="scratch-run"
                  applyLabel="Apply edit"
                  disabled={busy || !setReady}
                  onApply={(scope) => onRun("edit", scope)}
                />
              </section>
              <section className="rounded-xl border border-slate-200 p-3">
                <p className={labelCls}>Twilight conversion</p>
                <p
                  data-testid="scratch-twilight-prompt"
                  className="mt-2 line-clamp-4 text-xs leading-relaxed text-gray-500"
                >
                  {twilightPrompt}
                </p>
                <ScopedApply
                  name="scope-twilight"
                  testId="scratch-scope-twilight"
                  applyTestId="scratch-twilight"
                  applyLabel="Apply twilight"
                  disabled={busy || !setReady}
                  onApply={(scope) => onRun("twilight", scope)}
                />
              </section>
              <section className="rounded-xl border border-slate-200 p-3">
                <p className={labelCls}>Grass replacement</p>
                {grassReady ? (
                  <img
                    src={GRASS_REFERENCE_PUBLIC_PATH}
                    alt="Grass reference lawn"
                    data-testid="scratch-grass-preview"
                    className="mt-2 h-16 w-28 rounded-lg object-cover"
                  />
                ) : null}
                <p
                  data-testid="scratch-grass-note"
                  className="mt-2 text-xs leading-relaxed text-gray-500"
                >
                  {grassNote}
                </p>
                <ScopedApply
                  name="scope-grass"
                  testId="scratch-scope-grass"
                  applyTestId="scratch-grass"
                  applyLabel="Apply grass"
                  disabled={busy || !grassReady || !setReady}
                  onApply={(scope) => onRun("grass", scope)}
                />
              </section>
            </div>

            <div
              data-testid="scratch-panel-finetune"
              data-active={section === "finetune" ? "true" : "false"}
              className={section === "finetune" ? "space-y-5" : "hidden"}
            >
              <p className="text-xs leading-relaxed text-gray-500">
                Sliders preview on the photo. Apply writes a JPEG in this
                browser. The revision box is a separate pass on an edit you
                already ran.
              </p>
              <section className="space-y-4 rounded-xl border border-slate-200 p-3">
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
                <p className="text-[11px] text-gray-500">
                  Sharpness is written into the JPEG on apply. The preview shows
                  exposure, shadows, saturation, tint, crop, and rotate.
                </p>
                <ScopedApply
                  name="scope-finetune"
                  testId="scratch-scope-finetune"
                  applyTestId="scratch-finetune"
                  applyLabel="Apply finetune"
                  disabled={busy || !setReady}
                  onApply={applyFinetune}
                />
              </section>
              <section className="rounded-xl border border-slate-200 p-3">
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
                <p className="mt-2 text-xs text-gray-500">
                  Uses the current result. A photo with no edit yet is skipped.
                </p>
                <ScopedApply
                  name="scope-revise"
                  testId="scratch-scope-revise"
                  applyTestId="scratch-revise"
                  applyLabel="Apply revision"
                  disabled={busy || editedCount === 0}
                  onApply={(scope) => onRun("revise", scope)}
                />
              </section>
            </div>

            <div
              data-testid="scratch-panel-presets"
              data-active={section === "presets" ? "true" : "false"}
              className={section === "presets" ? "space-y-3" : "hidden"}
            >
              <p className="text-xs leading-relaxed text-gray-500">
                Iconic presets. Leave them off. Applying one sends only that
                preset.
              </p>
              {PRESETS.map((preset) => (
                <section
                  key={preset.id}
                  data-testid={`scratch-preset-${preset.id}`}
                  className="rounded-xl border border-slate-200 p-3"
                >
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-900">
                    {preset.label}
                  </p>
                  <ScopedApply
                    name={`scope-preset-${preset.id}`}
                    testId={`scratch-scope-preset-${preset.id}`}
                    applyTestId={`scratch-apply-preset-${preset.id}`}
                    applyLabel="Apply preset"
                    disabled={busy || !setReady}
                    onApply={(scope) => onApplyPreset(preset.prompt, scope)}
                  />
                </section>
              ))}
            </div>
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
