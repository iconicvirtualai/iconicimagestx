import { useRef, useState } from "react";
import { visibleStudioNote } from "@shared/iconicStudio";
import { ICONIC_POLISH_TREATMENTS } from "@shared/orderEditPlan";
import type { StudioOrderTrayJob } from "@shared/studioOrderTray";
import { SCRATCH_SORT_DEFAULT, type ScratchSortMode } from "@/lib/scratchSort";
import { bakeMarkup, bakeStrokes, type MarkupPoint, type ScratchStroke } from "@/lib/scratchBrush";
import { brandFloorplan } from "@/lib/floorplanBrand";
import { loadScratchImage } from "@/lib/scratchPhoto";
import { lookCss, lookIsNeutral, NEUTRAL_LOOK, renderScratchLook, type ScratchLook } from "@/lib/scratchLook";
import {
  EDIT_TOOLS,
  PREFERENCES,
  SKY_PRESETS,
  STAGING_ANGLES,
  STAGING_FURNITURE,
  STAGING_ROOMS,
  STAGING_STYLES,
  STUDIO_CORE,
  STUDIO_EXTRAS,
  editInstructionSteps,
  isLocalStudioTool,
  preferenceSteps,
  stagingApi,
  studioSteps,
  type ScratchDeskMode,
  type ScratchEditStep,
  type ScratchEditTool,
  type ScratchPreference,
  type ScratchStudioTool,
  type SkyPreset,
  type StagingRequest,
} from "./scratchDesk";

export type { ScratchEditStep, ScratchDeskMode, StagingRequest };

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
  editable?: boolean;
}

const SORTS: Array<{ id: ScratchSortMode; label: string }> = [
  { id: "name-asc", label: "Filename" },
  { id: "name-desc", label: "Filename, high to low" },
  { id: "date-asc", label: "Date shot, oldest first" },
  { id: "date-desc", label: "Date shot, newest first" },
  { id: "size-desc", label: "Size, large to small" },
  { id: "size-asc", label: "Size, small to large" },
  { id: "upload", label: "Upload order" },
];

const LOOK_ROWS: Array<{ key: keyof ScratchLook; label: string; min: number; max: number }> = [
  { key: "exposure", label: "Exposure", min: -100, max: 100 },
  { key: "highlights", label: "Highlights", min: -100, max: 100 },
  { key: "shadows", label: "Shadows", min: -100, max: 100 },
  { key: "blacks", label: "Blacks", min: -100, max: 100 },
  { key: "whites", label: "Whites", min: -100, max: 100 },
  { key: "temperature", label: "Temperature", min: -100, max: 100 },
  { key: "vibrance", label: "Vibrance", min: -100, max: 100 },
  { key: "saturation", label: "Saturation", min: -100, max: 100 },
  { key: "sharpness", label: "Sharpness", min: 0, max: 100 },
  { key: "hue", label: "Hue", min: -100, max: 100 },
];

const MODES: Array<{ id: ScratchDeskMode; label: string }> = [
  { id: "upload", label: "Upload" },
  { id: "edit", label: "Edit" },
  { id: "studio", label: "Studio" },
  { id: "staging", label: "Virtual Staging" },
];

const teal = "#0d9488";

function formatLook(key: keyof ScratchLook, value: number) {
  if (key === "exposure") return `${value > 0 ? "+" : ""}${(value / 100).toFixed(2)}`;
  return `${value > 0 ? "+" : ""}${value}`;
}

export default function StudioScratchPad({
  frames,
  busy,
  progress,
  grassReady,
  grassNote,
  listingLabel = "",
  emptyNote = "",
  orderJobs = [],
  orderBusy = false,
  onApproveOrder,
  onRejectOrder,
  onRunOrder,
  sortMode = SCRATCH_SORT_DEFAULT,
  initialMode = "upload",
  initialStudioTool = "sky",
  floorplanUrl,
  onAddFiles,
  onAddFloorplan,
  onSelect,
  onSelectAll,
  onClearSelection,
  onSort,
  onProcess,
  onStage,
  onCommitJpeg,
  onRevert,
  onDownload,
  onExport,
  onRemove,
}: {
  frames: ScratchFrameView[];
  busy: boolean;
  progress: string;
  grassReady: boolean;
  grassNote: string;
  listingLabel?: string;
  emptyNote?: string;
  orderJobs?: StudioOrderTrayJob[];
  orderBusy?: boolean;
  onApproveOrder?: (jobId: string) => void;
  onRejectOrder?: (jobId: string) => void;
  onRunOrder?: () => void;
  sortMode?: ScratchSortMode;
  initialMode?: ScratchDeskMode;
  initialStudioTool?: ScratchStudioTool;
  floorplanUrl?: string;
  onAddFiles: (files: File[]) => void;
  onAddFloorplan: (file: File) => void;
  onSelect: (id: string, mode: "replace" | "toggle" | "range") => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onSort: (mode: ScratchSortMode) => void;
  onProcess: (request: { steps: ScratchEditStep[]; fromOriginal: boolean; label?: string }) => void;
  onStage: (request: StagingRequest) => void;
  onCommitJpeg: (dataUrl: string, frameId: string, label: string) => void;
  onRevert: () => void;
  onDownload: () => void;
  onExport: (destination: ScratchExportDestination) => void;
  onRemove: (id: string) => void;
}) {
  const photoInput = useRef<HTMLInputElement>(null);
  const floorInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<ScratchDeskMode>(initialMode);
  const [preference, setPreference] = useState<ScratchPreference>("full-iconic");
  const [notes, setNotes] = useState("");
  const [instruction, setInstruction] = useState("");
  const [surface, setSurface] = useState<"whole" | "tool">("whole");
  const [editTool, setEditTool] = useState<ScratchEditTool>("brush");
  const [studioTool, setStudioTool] = useState<ScratchStudioTool>(initialStudioTool);
  const [skyPreset, setSkyPreset] = useState<SkyPreset>("dramatic");
  const [intensity, setIntensity] = useState(72);
  const [blend, setBlend] = useState(38);
  const [look, setLook] = useState<ScratchLook>(NEUTRAL_LOOK);
  const [zoom, setZoom] = useState<"fit" | "100" | "200">("fit");
  const [showAfter, setShowAfter] = useState(true);
  const [strokes, setStrokes] = useState<ScratchStroke[]>([]);
  const [marks, setMarks] = useState<MarkupPoint[]>([]);
  const [labelText, setLabelText] = useState("Label");
  const [replaceFooter, setReplaceFooter] = useState(true);
  const [logoBar, setLogoBar] = useState(true);
  const [autoLabel, setAutoLabel] = useState(true);
  const [brandedFloor, setBrandedFloor] = useState<string>();
  const [dragOver, setDragOver] = useState(false);
  const [roomId, setRoomId] = useState("living");
  const [furnitureId, setFurnitureId] = useState("sofa");
  const [angleId, setAngleId] = useState("single");
  const [stageStyle, setStageStyle] = useState("modern");
  const [stageIntensity, setStageIntensity] = useState(70);
  const [stageDensity, setStageDensity] = useState(60);
  const [stageNotes, setStageNotes] = useState("");
  const [stageAiNotes, setStageAiNotes] = useState("");
  const [compare, setCompare] = useState(50);
  const drawing = useRef(false);

  const focus = frames.find((frame) => frame.focused) || frames[0] || null;
  const checked = frames.filter((frame) => frame.selected).length;
  const displayUrl = focus ? (showAfter && focus.afterUrl ? focus.afterUrl : focus.beforeUrl) : "";
  const preferenceMeta = PREFERENCES.find((item) => item.id === preference) || PREFERENCES[1];
  const stageMeta = stagingApi({ roomId, styleId: stageStyle });
  const grassBlocked = !grassReady && (preference === "grass" || studioTool === "grass");
  const stageRequest = (): StagingRequest => ({
    roomId,
    furnitureId,
    angleId,
    styleId: stageStyle,
    intensity: stageIntensity,
    density: stageDensity,
    notes: stageNotes,
    aiNotes: stageAiNotes,
  });

  const takePhotos = (list: FileList | File[] | null) => {
    const files = Array.from(list || []);
    if (files.length) onAddFiles(files);
  };

  const sendProcess = (steps: ScratchEditStep[] | null, fromOriginal: boolean, label?: string) => {
    if (!steps?.length) return;
    if (steps.some((step) => step.action === "grass") && !grassReady) return;
    onProcess({ steps, fromOriginal, label });
  };

  const commitFocused = async (dataUrl: string, label: string) => {
    if (!focus) return;
    onCommitJpeg(dataUrl, focus.id, label);
  };

  const applyLook = async () => {
    if (!focus) return;
    if (surface === "tool") {
      if (!strokes.length) return;
      const image = await loadScratchImage(displayUrl);
      await commitFocused(bakeStrokes(image, strokes), editTool);
      setStrokes([]);
      return;
    }
    if (lookIsNeutral(look)) return;
    const image = await loadScratchImage(displayUrl);
    await commitFocused(renderScratchLook(image, look), "finetune");
    setLook(NEUTRAL_LOOK);
  };

  const applyStudio = async () => {
    if (studioTool === "floorplan") {
      if (!floorplanUrl) return;
      const image = await loadScratchImage(floorplanUrl);
      setBrandedFloor(brandFloorplan(image, { replaceFooter, logoBar, autoLabel }));
      return;
    }
    if (isLocalStudioTool(studioTool)) {
      if (!focus || !marks.length) return;
      const image = await loadScratchImage(displayUrl);
      await commitFocused(bakeMarkup(image, marks), studioTool);
      setMarks([]);
      return;
    }
    sendProcess(studioSteps(studioTool, { skyPreset, intensity, blend, instruction }), false, studioTool);
  };

  const onCanvasPointer = (event: React.PointerEvent<HTMLDivElement>, kind: "stroke" | "mark") => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const point = {
      x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
      y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
    };
    if (kind === "mark") {
      const markKind = studioTool === "pins" ? "pin"
        : studioTool === "lines" ? "line"
          : studioTool === "shapes" ? "shape"
            : studioTool === "logos" ? "logo"
              : "text";
      setMarks((current) => [...current, { ...point, kind: markKind, text: labelText }]);
      return;
    }
    if (event.type === "pointerdown") {
      drawing.current = true;
      setStrokes((current) => [...current, { tool: editTool, points: [point] }]);
      return;
    }
    if (!drawing.current || event.type === "pointerup" || event.type === "pointerleave") {
      drawing.current = false;
      return;
    }
    setStrokes((current) => {
      const next = current.slice();
      const last = next[next.length - 1];
      if (!last) return current;
      next[next.length - 1] = { ...last, points: [...last.points, point] };
      return next;
    });
  };

  return (
    <div
      data-testid="scratch-pad"
      data-layout="center-canvas bottom-filmstrip side-tools"
      data-mode={mode}
      className="flex h-[100vh] min-h-[640px] flex-col overflow-hidden bg-[#070b0c] text-white"
    >
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-white">Scratch pad</p>
          {listingLabel ? (
            <p data-testid="scratch-listing" className="truncate text-[10px] font-bold uppercase tracking-widest text-teal-200">
              {listingLabel}
            </p>
          ) : null}
        </div>
        <div data-testid="scratch-modes" className="flex items-center gap-1 rounded-full border border-white/10 bg-black/40 p-1">
          {MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              data-testid={`scratch-mode-${item.id}`}
              data-active={mode === item.id ? "true" : "false"}
              onClick={() => setMode(item.id)}
              className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-widest ${mode === item.id ? "text-white" : "text-gray-400"}`}
              style={mode === item.id ? { backgroundColor: teal } : undefined}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
          {frames.length} files · {checked} selected{progress ? ` · ${progress}` : ""}
        </p>
      </header>
      {orderJobs.length > 0 ? (
        <div data-testid="scratch-order-tray" className="flex max-h-36 shrink-0 gap-2 overflow-x-auto border-b border-white/10 bg-[#101618] px-3 py-2">
          {orderJobs.some((job) => job.origin === "order" && job.status === "pending" && job.sourcePath) ? (
            <button
              type="button"
              data-testid="scratch-order-run"
              disabled={orderBusy || !onRunOrder}
              onClick={onRunOrder}
              className="shrink-0 self-center rounded-full px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-40"
              style={{ backgroundColor: teal }}
            >
              {orderBusy ? "Editing…" : "Run next order edit"}
            </button>
          ) : null}
          {orderJobs.map((job) => {
            const note = visibleStudioNote(job.note);
            return (
            <article key={job.id} data-testid={`scratch-order-${job.id}`} className="w-56 shrink-0 rounded-xl border border-white/10 bg-black/40 p-2">
              <p className="truncate text-[10px] font-black uppercase tracking-widest text-gray-200">{job.label} · {job.status}</p>
              {job.afterUrl ? <img src={job.afterUrl} alt="" className="mt-2 h-16 w-full rounded object-cover" /> : null}
              {note ? <p className={`mt-1 line-clamp-2 text-[11px] ${job.status === "failed" ? "text-red-300" : "text-gray-400"}`}>{note}</p> : null}
              <div className="mt-2 flex gap-2">
                {job.canApprove ? (
                  <button type="button" data-testid={`scratch-order-approve-${job.id}`} disabled={orderBusy} onClick={() => onApproveOrder?.(job.id)} className="rounded-lg bg-[#0d9488] px-2 py-1 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-40">
                    Approve
                  </button>
                ) : null}
                {job.canReject ? (
                  <button type="button" data-testid={`scratch-order-reject-${job.id}`} disabled={orderBusy} onClick={() => onRejectOrder?.(job.id)} className="rounded-lg border border-white/20 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-gray-200 disabled:opacity-40">
                    Reject
                  </button>
                ) : null}
              </div>
            </article>
            );
          })}
        </div>
      ) : null}
      {emptyNote ? (
        <p data-testid="scratch-empty-photos" className="border-b border-white/10 bg-[#101618] px-4 py-2 text-xs text-gray-300">
          {emptyNote}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <aside className="scrollbar-hide flex w-full shrink-0 flex-col border-b border-white/10 bg-[#0c1214] p-3 lg:w-60 lg:overflow-y-auto lg:border-b-0 lg:border-r">
          {mode === "upload" ? (
            <UploadPrefs
              preference={preference}
              notes={notes}
              busy={busy}
              ready={checked > 0}
              grassReady={grassReady}
              grassNote={grassNote}
              onPreference={setPreference}
              onNotes={setNotes}
              onProcess={() => sendProcess(preferenceSteps(preference, notes), true, "batch")}
            />
          ) : null}
          {mode === "edit" ? (
            <div data-testid="scratch-edit-tools">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Tools</p>
              <div className="mt-3 flex flex-col gap-2">
                {EDIT_TOOLS.map((tool) => (
                  <button
                    key={tool.id}
                    type="button"
                    data-testid={`scratch-edit-tool-${tool.id}`}
                    aria-pressed={editTool === tool.id}
                    onClick={() => { setEditTool(tool.id); setSurface("tool"); }}
                    className={`rounded-xl px-2 py-3 text-[10px] font-black uppercase tracking-widest ${editTool === tool.id && surface === "tool" ? "text-white" : "bg-white/5 text-gray-300"}`}
                    style={editTool === tool.id && surface === "tool" ? { backgroundColor: teal } : undefined}
                  >
                    {tool.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {mode === "studio" ? (
            <div data-testid="scratch-studio-tools">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Studio tools</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {STUDIO_CORE.map((tool) => (
                  <button
                    key={tool.id}
                    type="button"
                    data-testid={`scratch-studio-${tool.id}`}
                    aria-pressed={studioTool === tool.id}
                    disabled={tool.id === "grass" && !grassReady}
                    onClick={() => setStudioTool(tool.id)}
                    className={`rounded-xl px-1 py-3 text-[9px] font-black uppercase leading-tight tracking-wide disabled:opacity-40 ${studioTool === tool.id ? "text-white" : "bg-white/5 text-gray-300"}`}
                    style={studioTool === tool.id ? { backgroundColor: teal } : undefined}
                  >
                    {tool.label}
                  </button>
                ))}
              </div>
              <p className="mt-4 text-[10px] font-black uppercase tracking-widest text-gray-500">Extras</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {STUDIO_EXTRAS.map((tool) => (
                  <button
                    key={tool.id}
                    type="button"
                    data-testid={`scratch-studio-${tool.id}`}
                    aria-pressed={studioTool === tool.id}
                    onClick={() => setStudioTool(tool.id)}
                    className={`rounded-xl px-2 py-3 text-[9px] font-black uppercase leading-tight tracking-wide ${studioTool === tool.id ? "text-white" : "bg-white/5 text-gray-300"}`}
                    style={studioTool === tool.id ? { backgroundColor: teal } : undefined}
                  >
                    {tool.label}
                  </button>
                ))}
              </div>
              <p className="mt-4 text-[11px] leading-snug text-gray-500">Select a tool, tune the options on the right, then apply to the checked frames.</p>
              {!grassReady ? <p data-testid="scratch-grass-note" className="mt-2 text-[11px] text-gray-400">{grassNote}</p> : null}
            </div>
          ) : null}
          {mode === "staging" ? (
            <StagingSetup
              roomId={roomId}
              furnitureId={furnitureId}
              angleId={angleId}
              styleId={stageStyle}
              notes={stageNotes}
              busy={busy}
              ready={checked > 0}
              onRoom={setRoomId}
              onFurniture={setFurnitureId}
              onAngle={setAngleId}
              onStyle={setStageStyle}
              onNotes={setStageNotes}
              onBrowse={() => photoInput.current?.click()}
              onSubmit={() => onStage(stageRequest())}
            />
          ) : null}
        </aside>

        <section
          data-testid="scratch-canvas"
          className="flex min-h-[280px] min-w-0 flex-1 flex-col lg:min-h-0"
          onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            if (mode === "studio" && studioTool === "floorplan") {
              const file = event.dataTransfer.files?.[0];
              if (file) onAddFloorplan(file);
              return;
            }
            takePhotos(event.dataTransfer.files);
          }}
        >
          {mode === "staging" ? (
            <StagingCanvas
              focus={focus}
              styleLabel={stageMeta.styleLabel}
              zoom={zoom}
              compare={compare}
              onZoom={setZoom}
              onCompare={setCompare}
            />
          ) : mode === "upload" ? (
            <div className="flex min-h-0 flex-1 flex-col p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                  Upload workspace
                </p>
                <span className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white" style={{ backgroundColor: teal }}>
                  {preferenceMeta.kicker ? `${preferenceMeta.kicker} · ` : ""}{preferenceMeta.label}
                </span>
              </div>
              <button
                type="button"
                data-testid="scratch-drop"
                onClick={() => photoInput.current?.click()}
                className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-3xl border-2 border-transparent px-6 text-center"
                style={{
                  background: dragOver
                    ? "linear-gradient(#10211f,#10211f) padding-box, linear-gradient(120deg,#0d9488,#5eead4,#14b8a6,#0f766e) border-box"
                    : "linear-gradient(#0c1214,#0c1214) padding-box, linear-gradient(120deg,#0d9488,#5eead4,#14b8a6,#0f766e) border-box",
                }}
              >
                <span className="text-sm font-black uppercase tracking-widest">Drag and drop your files to begin</span>
                <span className="mt-2 text-xs text-gray-400">or click here to upload</span>
                <span className="mt-4 text-[10px] font-black uppercase tracking-widest text-gray-500">JPG · PNG · RAW · TIFF</span>
                <span className="mt-3 max-w-md text-[11px] leading-snug text-gray-500">Photos stay in this browser. Nothing is added to an order or a gallery. JPEG and PNG enter the edit queue. RAW and TIFF wait for a JPEG.</span>
              </button>
              <p className="mt-3 text-right text-[10px] font-bold uppercase tracking-widest text-teal-200">
                {checked > 0 ? `Ready to queue · ${preferenceMeta.label} on ${checked} frame${checked === 1 ? "" : "s"}` : "Add frames, then Process the checked set"}
              </p>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                    {mode === "studio" ? "Studio canvas" : "Edit canvas"}
                    {focus ? ` · ${focus.name}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {mode === "edit" ? (
                    <div className="flex rounded-full bg-black/50 p-1">
                      <button type="button" data-testid="scratch-surface-whole" aria-pressed={surface === "whole"} onClick={() => setSurface("whole")} className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${surface === "whole" ? "text-white" : "text-gray-400"}`} style={surface === "whole" ? { backgroundColor: teal } : undefined}>Whole photo</button>
                      <button type="button" data-testid="scratch-surface-tool" aria-pressed={surface === "tool"} onClick={() => setSurface("tool")} className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${surface === "tool" ? "text-white" : "text-gray-400"}`} style={surface === "tool" ? { backgroundColor: teal } : undefined}>Tool</button>
                    </div>
                  ) : null}
                  {focus?.afterUrl ? (
                    <div data-testid="scratch-compare" className="flex rounded-full bg-black/50 p-1">
                      <button type="button" onClick={() => setShowAfter(false)} className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${showAfter ? "text-gray-400" : "bg-white text-black"}`}>Before</button>
                      <button type="button" onClick={() => setShowAfter(true)} className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${showAfter ? "bg-white text-black" : "text-gray-400"}`}>After</button>
                    </div>
                  ) : null}
                  <div className="flex rounded-full bg-black/50 p-1">
                    {(["fit", "100", "200"] as const).map((value) => (
                      <button key={value} type="button" onClick={() => setZoom(value)} className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-widest ${zoom === value ? "text-white" : "text-gray-400"}`} style={zoom === value ? { backgroundColor: teal } : undefined}>{value === "fit" ? "Fit" : `${value}%`}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div
                data-testid="scratch-viewer"
                className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-2xl bg-[#101618]"
                onPointerDown={mode === "edit" && surface === "tool" ? (event) => onCanvasPointer(event, "stroke") : mode === "studio" && isLocalStudioTool(studioTool) && studioTool !== "floorplan" ? (event) => onCanvasPointer(event, "mark") : undefined}
                onPointerMove={mode === "edit" && surface === "tool" ? (event) => onCanvasPointer(event, "stroke") : undefined}
                onPointerUp={() => { drawing.current = false; }}
                onPointerLeave={() => { drawing.current = false; }}
              >
                {mode === "studio" && studioTool === "floorplan" ? (
                  <FloorplanStage url={brandedFloor || floorplanUrl} branded={Boolean(brandedFloor)} onBrowse={() => floorInput.current?.click()} />
                ) : focus ? (
                  <img
                    src={displayUrl}
                    alt={focus.name}
                    className={zoom === "fit" ? "max-h-full max-w-full object-contain" : "max-w-none object-contain"}
                    style={{
                      filter: mode === "edit" && surface === "whole" ? lookCss(look) : undefined,
                      width: zoom === "100" ? "100%" : zoom === "200" ? "200%" : undefined,
                    }}
                  />
                ) : (
                  <button type="button" onClick={() => photoInput.current?.click()} className="text-sm font-black uppercase tracking-widest text-gray-400">Drop JPEGs here</button>
                )}
                {focus?.status === "failed" && focus.error ? (
                  <p data-testid="scratch-error" className="absolute inset-x-0 bottom-0 bg-red-950/90 px-4 py-2 text-sm text-red-100">{focus.error}</p>
                ) : null}
              </div>
            </div>
          )}
        </section>

        {mode === "edit" || mode === "studio" || mode === "staging" ? (
          <aside data-testid="scratch-options" className="flex w-full shrink-0 flex-col border-t border-white/10 bg-[#0c1214] lg:min-h-0 lg:w-72 lg:overflow-hidden lg:border-l lg:border-t-0">
            {mode === "staging" ? (
              <StagingOptions
                roomLabel={stageMeta.roomLabel}
                styleId={stageStyle}
                styleLabel={stageMeta.styleLabel}
                intensity={stageIntensity}
                density={stageDensity}
                aiNotes={stageAiNotes}
                busy={busy}
                ready={checked > 0}
                onStyle={setStageStyle}
                onIntensity={setStageIntensity}
                onDensity={setStageDensity}
                onAiNotes={setStageAiNotes}
                onApply={() => onStage(stageRequest())}
                onExport={onExport}
                onDownload={onDownload}
              />
            ) : mode === "edit" ? (
              <EditOptions
                look={look}
                instruction={instruction}
                busy={busy}
                canRevert={Boolean(focus?.canRevert)}
                onLook={(key, value) => setLook((current) => ({ ...current, [key]: value }))}
                onReset={() => setLook(NEUTRAL_LOOK)}
                onInstruction={setInstruction}
                onApply={() => { void applyLook(); }}
                onProcess={() => sendProcess(editInstructionSteps(instruction), false, "edit")}
                onRevert={onRevert}
                onExport={onExport}
                onDownload={onDownload}
              />
            ) : (
              <StudioOptions
                tool={studioTool}
                skyPreset={skyPreset}
                intensity={intensity}
                blend={blend}
                instruction={instruction}
                labelText={labelText}
                grassReady={grassReady}
                grassNote={grassNote}
                replaceFooter={replaceFooter}
                logoBar={logoBar}
                autoLabel={autoLabel}
                busy={busy}
                onSkyPreset={setSkyPreset}
                onIntensity={setIntensity}
                onBlend={setBlend}
                onInstruction={setInstruction}
                onLabel={setLabelText}
                onReplaceFooter={setReplaceFooter}
                onLogoBar={setLogoBar}
                onAutoLabel={setAutoLabel}
                onApply={() => { void applyStudio(); }}
                onProcess={() => {
                  const steps = studioSteps(studioTool, { skyPreset, intensity, blend, instruction });
                  sendProcess(steps || editInstructionSteps(instruction), false, studioTool);
                }}
                onExport={onExport}
                onDownload={onDownload}
              />
            )}
          </aside>
        ) : null}
      </div>

      <footer data-testid="scratch-filmstrip" data-position="bottom" className="border-t border-white/10 bg-[#070b0c] px-3 py-2">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Filmstrip · batch queue</p>
            <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">
              Sort
              <select data-testid="scratch-sort" value={sortMode} onChange={(event) => onSort(event.target.value as ScratchSortMode)} className="rounded-lg border border-white/15 bg-black px-2 py-1 text-[10px] text-white">
                {SORTS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
          </div>
          <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest">
            <button type="button" data-testid="scratch-select-all" onClick={onSelectAll} className="text-gray-300">Select all</button>
            <button type="button" data-testid="scratch-clear" onClick={onClearSelection} className="text-gray-500">Clear</button>
          </div>
        </div>
        <div className="scrollbar-hide flex items-center gap-2 overflow-x-auto">
          {frames.map((frame) => (
            <div key={frame.id} className="relative h-16 w-24 shrink-0">
              <button
                type="button"
                data-testid={`scratch-frame-${frame.id}`}
                data-selected={frame.selected ? "true" : "false"}
                data-focused={frame.focused ? "true" : "false"}
                onClick={() => onSelect(frame.id, "replace")}
                className={`h-full w-full overflow-hidden rounded-lg border-2 ${frame.focused ? "border-white" : frame.selected ? "border-[#0d9488]" : "border-transparent"}`}
              >
                <img src={frame.afterUrl || frame.beforeUrl} alt="" className="h-full w-full object-cover" />
                <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-black/75 px-1 py-0.5 text-left text-[8px] font-bold text-white">{frame.name}</span>
              </button>
              <input
                type="checkbox"
                data-testid={`scratch-check-${frame.id}`}
                checked={frame.selected}
                aria-label={`Include ${frame.name}`}
                onChange={() => onSelect(frame.id, "toggle")}
                className="absolute left-1 top-1 h-3.5 w-3.5 accent-[#0d9488]"
              />
              {frame.editable === false ? <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[8px] font-black uppercase text-gray-300">Raw</span> : null}
            </div>
          ))}
          <button type="button" data-testid="scratch-add" onClick={() => photoInput.current?.click()} className="flex h-16 w-20 shrink-0 items-center justify-center rounded-lg border border-dashed border-white/20 text-[10px] font-black uppercase tracking-widest text-gray-400">Add</button>
          {mode === "studio" && studioTool === "floorplan" ? (
            <button type="button" data-testid="scratch-floorplan-add" onClick={() => floorInput.current?.click()} className="flex h-16 w-36 shrink-0 flex-col items-center justify-center rounded-lg border border-dashed border-[#0d9488]/50 text-[10px] font-black uppercase tracking-widest text-teal-200">
              Drop Cubi PDF / PNG
            </button>
          ) : null}
          {focus ? (
            <button type="button" data-testid="scratch-delete" onClick={() => onRemove(focus.id)} className="ml-auto text-[10px] font-black uppercase tracking-widest text-gray-500">Delete</button>
          ) : null}
        </div>
        {grassBlocked ? <p data-testid="scratch-grass-note" className="mt-2 text-[11px] text-gray-400">{grassNote}</p> : null}
      </footer>

      <input ref={photoInput} data-testid="scratch-file" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp,.tif,.tiff,.raw,.cr2,.nef,.arw,.dng" multiple className="hidden" onChange={(event) => { takePhotos(event.target.files); event.target.value = ""; }} />
      <input ref={floorInput} data-testid="scratch-floorplan-file" type="file" accept="image/jpeg,image/png,image/svg+xml,.pdf,.jpg,.png,.svg" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) onAddFloorplan(file); event.target.value = ""; }} />
    </div>
  );
}

function Chip({
  testId,
  active,
  label,
  onClick,
}: {
  testId: string;
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${active ? "text-white" : "bg-white/5 text-gray-300"}`}
      style={active ? { backgroundColor: teal } : undefined}
    >
      {label}
    </button>
  );
}

function StagingSetup({
  roomId,
  furnitureId,
  angleId,
  styleId,
  notes,
  busy,
  ready,
  onRoom,
  onFurniture,
  onAngle,
  onStyle,
  onNotes,
  onBrowse,
  onSubmit,
}: {
  roomId: string;
  furnitureId: string;
  angleId: string;
  styleId: string;
  notes: string;
  busy: boolean;
  ready: boolean;
  onRoom: (id: string) => void;
  onFurniture: (id: string) => void;
  onAngle: (id: string) => void;
  onStyle: (id: string) => void;
  onNotes: (value: string) => void;
  onBrowse: () => void;
  onSubmit: () => void;
}) {
  return (
    <div data-testid="scratch-staging-setup" className="flex min-h-0 flex-1 flex-col">
      <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Staging setup</p>
      <button type="button" data-testid="scratch-staging-drop" onClick={onBrowse} className="mt-3 rounded-2xl border border-dashed border-[#0d9488]/60 px-3 py-4 text-left text-[11px] font-bold text-gray-300">
        Drag empty room photo · JPG PNG WEBP
      </button>
      <p className="mt-4 text-[10px] font-black uppercase tracking-widest text-gray-500">Room type</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {STAGING_ROOMS.map((item) => (
          <Chip key={item.id} testId={`scratch-stage-room-${item.id}`} active={roomId === item.id} label={item.label} onClick={() => onRoom(item.id)} />
        ))}
      </div>
      <p className="mt-4 text-[10px] font-black uppercase tracking-widest text-gray-500">Furniture pack</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {STAGING_FURNITURE.map((item) => (
          <Chip key={item.id} testId={`scratch-stage-pack-${item.id}`} active={furnitureId === item.id} label={item.label} onClick={() => onFurniture(item.id)} />
        ))}
      </div>
      <p className="mt-4 text-[10px] font-black uppercase tracking-widest text-gray-500">Multi-angle</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {STAGING_ANGLES.map((item) => (
          <Chip key={item.id} testId={`scratch-stage-angle-${item.id}`} active={angleId === item.id} label={item.label} onClick={() => onAngle(item.id)} />
        ))}
      </div>
      <p className="mt-4 text-[10px] font-black uppercase tracking-widest text-gray-500">Style preference</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {STAGING_STYLES.map((item) => (
          <Chip key={item.id} testId={`scratch-stage-pref-${item.id}`} active={styleId === item.id} label={item.label} onClick={() => onStyle(item.id)} />
        ))}
      </div>
      <label className="mt-4 block">
        <span className="text-[10px] font-black normal-case tracking-widest text-gray-500">OpenAI / special instructions</span>
        <textarea data-testid="scratch-stage-notes" value={notes} rows={3} maxLength={500} onChange={(event) => onNotes(event.target.value)} placeholder="OpenAI / special instructions. Sent with Submit / Stage." className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white outline-none focus:border-[#0d9488]" />
      </label>
      <button type="button" data-testid="scratch-stage-submit" disabled={busy || !ready} onClick={onSubmit} className="mt-auto rounded-full py-3 text-[11px] font-black uppercase tracking-widest text-white disabled:opacity-40" style={{ backgroundColor: teal }}>
        Submit / Stage
      </button>
    </div>
  );
}

function StagingCanvas({
  focus,
  styleLabel,
  zoom,
  compare,
  onZoom,
  onCompare,
}: {
  focus: ScratchFrameView | null;
  styleLabel: string;
  zoom: "fit" | "100" | "200";
  compare: number;
  onZoom: (zoom: "fit" | "100" | "200") => void;
  onCompare: (value: number) => void;
}) {
  const before = focus?.beforeUrl || "";
  const after = focus?.afterUrl || "";
  const width = zoom === "100" ? "100%" : zoom === "200" ? "200%" : undefined;
  return (
    <div className="flex min-h-0 flex-1 flex-col p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Staging canvas{focus ? ` · ${focus.name}` : ""}</p>
        <div className="flex items-center gap-2">
          <div data-testid="scratch-stage-toggle" className="flex rounded-full bg-black/50 p-1">
            <button type="button" data-testid="scratch-stage-before" onClick={() => onCompare(0)} className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${compare < 50 ? "text-white" : "text-gray-400"}`} style={compare < 50 ? { backgroundColor: teal } : undefined}>Before</button>
            <button type="button" data-testid="scratch-stage-after" onClick={() => onCompare(100)} className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${compare >= 50 ? "text-white" : "text-gray-400"}`} style={compare >= 50 ? { backgroundColor: teal } : undefined}>After</button>
          </div>
          <div className="flex rounded-full bg-black/50 p-1">
            {(["fit", "100", "200"] as const).map((value) => (
              <button key={value} type="button" onClick={() => onZoom(value)} className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-widest ${zoom === value ? "text-white" : "text-gray-400"}`} style={zoom === value ? { backgroundColor: teal } : undefined}>{value === "fit" ? "Fit" : `${value}%`}</button>
            ))}
          </div>
        </div>
      </div>
      <div data-testid="scratch-stage-viewer" className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-2xl bg-[#101618]">
        {focus ? (
          <div className={`relative ${zoom === "fit" ? "h-full w-full" : ""}`} style={{ width }}>
            <img src={compare >= 100 && after ? after : before} alt={focus.name} className={zoom === "fit" ? "h-full w-full object-contain" : "w-full object-contain"} />
            {after && compare > 0 && compare < 100 ? (
              <img src={after} alt="" className="absolute inset-0 h-full w-full object-contain" style={{ clipPath: `inset(0 ${100 - compare}% 0 0)` }} />
            ) : null}
            {after ? (
              <input data-testid="scratch-stage-compare" type="range" min={0} max={100} value={compare} onChange={(event) => onCompare(Number(event.target.value))} className="absolute inset-x-8 bottom-4 accent-[#0d9488]" />
            ) : null}
          </div>
        ) : (
          <p className="text-sm font-black uppercase tracking-widest text-gray-400">Drop an empty room photo</p>
        )}
      </div>
      <p data-testid="scratch-stage-status" className="mt-2 text-[10px] font-bold uppercase tracking-widest text-teal-200">
        {focus ? `${focus.name} · Virtual staging · ${styleLabel}${after ? " · ready to Export" : ""}` : "Virtual staging · add a room photo"}
      </p>
    </div>
  );
}

function StagingOptions({
  roomLabel,
  styleId,
  styleLabel,
  intensity,
  density,
  aiNotes,
  busy,
  ready,
  onStyle,
  onIntensity,
  onDensity,
  onAiNotes,
  onApply,
  onExport,
  onDownload,
}: {
  roomLabel: string;
  styleId: string;
  styleLabel: string;
  intensity: number;
  density: number;
  aiNotes: string;
  busy: boolean;
  ready: boolean;
  onStyle: (id: string) => void;
  onIntensity: (value: number) => void;
  onDensity: (value: number) => void;
  onAiNotes: (value: string) => void;
  onApply: () => void;
  onExport: (destination: ScratchExportDestination) => void;
  onDownload: () => void;
}) {
  return (
    <div data-testid="scratch-staging-options" className="flex flex-col lg:min-h-0 lg:flex-1">
      <div className="p-3 lg:scrollbar-hide lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Tool options</p>
        <p data-testid="scratch-stage-chip" className="mt-3 rounded-xl border border-[#0d9488]/40 bg-[#0d9488]/10 px-3 py-2 text-xs font-black text-white">
          Virtual staging · {styleLabel} {roomLabel}
        </p>
        <label className="mt-4 block text-[10px] font-black uppercase tracking-widest text-gray-500">
          Intensity {intensity}
          <input data-testid="scratch-stage-intensity" type="range" min={0} max={100} value={intensity} onChange={(event) => onIntensity(Number(event.target.value))} className="mt-1 w-full accent-[#0d9488]" />
        </label>
        <label className="mt-3 block text-[10px] font-black uppercase tracking-widest text-gray-500">
          Furniture density {density}
          <input data-testid="scratch-stage-density" type="range" min={0} max={100} value={density} onChange={(event) => onDensity(Number(event.target.value))} className="mt-1 w-full accent-[#0d9488]" />
        </label>
        <p className="mt-4 text-[10px] font-black uppercase tracking-widest text-gray-500">Style presets</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {STAGING_STYLES.map((item) => (
            <button key={item.id} type="button" data-testid={`scratch-stage-style-${item.id}`} aria-pressed={styleId === item.id} onClick={() => onStyle(item.id)} className={`overflow-hidden rounded-xl border text-left ${styleId === item.id ? "border-[#0d9488]" : "border-white/10"}`}>
              <span className="block h-10" style={{ background: styleId === item.id ? "linear-gradient(160deg,#0f766e,#042f2e)" : "linear-gradient(160deg,#1f2937,#111827)" }} />
              <span className="block px-1 py-1 text-[9px] font-black uppercase tracking-wide text-gray-200">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="shrink-0 border-t border-white/10 p-3">
        <label className="block">
          <span className="text-[10px] font-black normal-case tracking-widest text-gray-500">OpenAI notes</span>
          <textarea data-testid="scratch-stage-ai-notes" value={aiNotes} rows={2} maxLength={500} onChange={(event) => onAiNotes(event.target.value)} placeholder="OpenAI notes for the checked photos." className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white outline-none focus:border-[#0d9488]" />
        </label>
        <button type="button" data-testid="scratch-stage-apply" disabled={busy || !ready} onClick={onApply} className="mt-3 w-full rounded-full py-3 text-[11px] font-black uppercase tracking-widest text-white disabled:opacity-40" style={{ backgroundColor: teal }}>Apply</button>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button type="button" data-testid="scratch-stage-process" disabled={busy || !ready} onClick={onApply} className="rounded-full border border-white/15 py-2 text-[10px] font-black uppercase tracking-widest">Process</button>
          <ExportButtons onExport={onExport} onDownload={onDownload} />
        </div>
      </div>
    </div>
  );
}

function UploadPrefs({
  preference,
  notes,
  busy,
  ready,
  grassReady,
  grassNote,
  onPreference,
  onNotes,
  onProcess,
}: {
  preference: ScratchPreference;
  notes: string;
  busy: boolean;
  ready: boolean;
  grassReady: boolean;
  grassNote: string;
  onPreference: (id: ScratchPreference) => void;
  onNotes: (value: string) => void;
  onProcess: () => void;
}) {
  return (
    <div data-testid="scratch-upload-prefs" className="flex min-h-0 flex-1 flex-col">
      <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Edit preferences <span className="float-right normal-case tracking-normal">pick one</span></p>
      <div className="mt-3 space-y-2">
        {PREFERENCES.map((item) => {
          const active = preference === item.id;
          return (
            <button
              key={item.id}
              type="button"
              data-testid={`scratch-pref-${item.id}`}
              aria-pressed={active}
              disabled={item.id === "grass" && !grassReady}
              onClick={() => onPreference(item.id)}
              className={`flex w-full items-center justify-between rounded-full px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest disabled:opacity-40 ${active ? "text-white" : "bg-white/5 text-gray-300"}`}
              style={active ? { backgroundColor: teal } : undefined}
            >
              <span>{item.kicker ? `${item.kicker} · ` : ""}{item.label}</span>
              {active ? <span aria-hidden>✓</span> : null}
            </button>
          );
        })}
      </div>
      {preference === "polish" || preference === "full-iconic" ? (
        <ul data-testid="scratch-polish-rules" className="mt-3 space-y-1">
          {ICONIC_POLISH_TREATMENTS.map((treatment) => (
            <li key={treatment} className="text-[10px] text-gray-400">{treatment}</li>
          ))}
          <li className="text-[10px] leading-snug text-gray-500">Does not add anyone or move the camera. Grass replacement is a separate $25 add-on, included only on classic packages. It is not this polish.</li>
        </ul>
      ) : null}
      {!grassReady ? <p data-testid="scratch-grass-note" className="mt-2 text-[11px] text-gray-400">{grassNote}</p> : null}
      <label className="mt-4 block">
        <span className="text-[10px] font-black normal-case tracking-widest text-gray-500">OpenAI / special instructions</span>
        <textarea
          data-testid="scratch-instruction-upload"
          value={notes}
          maxLength={500}
          rows={5}
          onChange={(event) => onNotes(event.target.value)}
          placeholder="OpenAI / special instructions. Sent with Process."
          className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white outline-none focus:border-[#0d9488]"
        />
        <span className="mt-1 block text-[10px] text-gray-500">{notes.length}/500 · Sent with Process</span>
      </label>
      <button
        type="button"
        data-testid="scratch-process"
        disabled={busy || !ready || (preference === "grass" && !grassReady)}
        onClick={onProcess}
        className="mt-auto rounded-full py-3 text-[11px] font-black uppercase tracking-widest text-white disabled:opacity-40"
        style={{ backgroundColor: teal }}
      >
        Process
      </button>
    </div>
  );
}

function EditOptions({
  look,
  instruction,
  busy,
  canRevert,
  onLook,
  onReset,
  onInstruction,
  onApply,
  onProcess,
  onRevert,
  onExport,
  onDownload,
}: {
  look: ScratchLook;
  instruction: string;
  busy: boolean;
  canRevert: boolean;
  onLook: (key: keyof ScratchLook, value: number) => void;
  onReset: () => void;
  onInstruction: (value: string) => void;
  onApply: () => void;
  onProcess: () => void;
  onRevert: () => void;
  onExport: (destination: ScratchExportDestination) => void;
  onDownload: () => void;
}) {
  return (
    <div data-testid="scratch-adjustments" className="flex flex-col lg:min-h-0 lg:flex-1">
      <div className="p-3 lg:scrollbar-hide lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Adjustments</p>
          <button type="button" onClick={onReset} className="text-[10px] font-black uppercase tracking-widest text-gray-500">Reset all</button>
        </div>
        <div className="mt-3 space-y-3">
          {LOOK_ROWS.map((row) => (
            <label key={row.key} className="block">
              <span className="flex justify-between text-[10px] font-black uppercase tracking-widest text-gray-500">
                {row.label}
                <span>{formatLook(row.key, look[row.key])}</span>
              </span>
              <input
                data-testid={`scratch-look-${row.key}`}
                type="range"
                min={row.min}
                max={row.max}
                value={look[row.key]}
                onChange={(event) => onLook(row.key, Number(event.target.value))}
                className="mt-1 w-full accent-[#0d9488]"
              />
            </label>
          ))}
        </div>
      </div>
      <div className="shrink-0 border-t border-white/10 p-3">
        <label className="block">
          <span className="text-[10px] font-black normal-case tracking-widest text-gray-500">OpenAI / special instructions</span>
          <textarea data-testid="scratch-instruction-edit" value={instruction} rows={2} onChange={(event) => onInstruction(event.target.value)} placeholder="OpenAI / special instructions. Process sends it." className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white outline-none focus:border-[#0d9488]" />
        </label>
        <button type="button" data-testid="scratch-apply" disabled={busy} onClick={onApply} className="mt-3 w-full rounded-full py-3 text-[11px] font-black uppercase tracking-widest text-white disabled:opacity-40" style={{ backgroundColor: teal }}>Apply</button>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button type="button" data-testid="scratch-process-edit" disabled={busy} onClick={onProcess} className="rounded-full border border-white/15 py-2 text-[10px] font-black uppercase tracking-widest">Process</button>
          <ExportButtons onExport={onExport} onDownload={onDownload} />
        </div>
        <button type="button" data-testid="scratch-revert" disabled={busy || !canRevert} onClick={onRevert} className="mt-2 w-full rounded-full border border-white/15 py-2 text-[10px] font-black uppercase tracking-widest text-gray-300 disabled:opacity-40">Revert</button>
      </div>
    </div>
  );
}

function StudioOptions(props: {
  tool: ScratchStudioTool;
  skyPreset: SkyPreset;
  intensity: number;
  blend: number;
  instruction: string;
  labelText: string;
  grassReady: boolean;
  grassNote: string;
  replaceFooter: boolean;
  logoBar: boolean;
  autoLabel: boolean;
  busy: boolean;
  onSkyPreset: (id: SkyPreset) => void;
  onIntensity: (value: number) => void;
  onBlend: (value: number) => void;
  onInstruction: (value: string) => void;
  onLabel: (value: string) => void;
  onReplaceFooter: (value: boolean) => void;
  onLogoBar: (value: boolean) => void;
  onAutoLabel: (value: boolean) => void;
  onApply: () => void;
  onProcess: () => void;
  onExport: (destination: ScratchExportDestination) => void;
  onDownload: () => void;
}) {
  const toolLabel = [...STUDIO_CORE, ...STUDIO_EXTRAS].find((item) => item.id === props.tool)?.label || "Tool";
  return (
    <div data-testid="scratch-studio-options" className="flex flex-col lg:min-h-0 lg:flex-1">
      <div className="p-3 lg:scrollbar-hide lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Tool options</p>
      <p className="mt-2 text-sm font-black">{toolLabel}</p>
      {props.tool === "sky" ? (
        <div className="mt-3">
          <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500">Intensity {props.intensity}</label>
          <input data-testid="scratch-sky-intensity" type="range" min={0} max={100} value={props.intensity} onChange={(event) => props.onIntensity(Number(event.target.value))} className="mt-1 w-full accent-[#0d9488]" />
          <label className="mt-3 block text-[10px] font-black uppercase tracking-widest text-gray-500">Blend / feather {props.blend}</label>
          <input data-testid="scratch-sky-blend" type="range" min={0} max={100} value={props.blend} onChange={(event) => props.onBlend(Number(event.target.value))} className="mt-1 w-full accent-[#0d9488]" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            {SKY_PRESETS.map((preset) => (
              <button key={preset.id} type="button" data-testid={`scratch-sky-${preset.id}`} aria-pressed={props.skyPreset === preset.id} onClick={() => props.onSkyPreset(preset.id)} className={`rounded-lg px-2 py-2 text-[10px] font-black uppercase tracking-widest ${props.skyPreset === preset.id ? "text-white" : "bg-white/5 text-gray-300"}`} style={props.skyPreset === preset.id ? { backgroundColor: teal } : undefined}>{preset.label}</button>
            ))}
          </div>
        </div>
      ) : null}
      {props.tool === "text" ? (
        <label className="mt-3 block">
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Label</span>
          <input data-testid="scratch-markup-text" value={props.labelText} onChange={(event) => props.onLabel(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs" />
        </label>
      ) : null}
      {props.tool === "floorplan" ? (
        <div data-testid="scratch-floorplan-options" className="mt-3 space-y-2 text-[11px] text-gray-300">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Cubi → Iconic</p>
          <p>Drop the Cubi export, then Apply. The footer bar is replaced in this browser.</p>
          <label className="flex items-center justify-between gap-2"><span>Replace Cubi footer</span><input data-testid="scratch-floorplan-footer" type="checkbox" checked={props.replaceFooter} onChange={(event) => props.onReplaceFooter(event.target.checked)} className="accent-[#0d9488]" /></label>
          <label className="flex items-center justify-between gap-2"><span>Iconic logo bar</span><input type="checkbox" checked={props.logoBar} onChange={(event) => props.onLogoBar(event.target.checked)} className="accent-[#0d9488]" /></label>
          <label className="flex items-center justify-between gap-2"><span>Auto-label floorplan</span><input type="checkbox" checked={props.autoLabel} onChange={(event) => props.onAutoLabel(event.target.checked)} className="accent-[#0d9488]" /></label>
          <p className="text-[10px] uppercase tracking-widest text-gray-500">Accepts PDF, PNG, JPG, SVG</p>
        </div>
      ) : null}
      {props.tool === "grass" && !props.grassReady ? <p data-testid="scratch-grass-note" className="mt-2 text-[11px] text-gray-400">{props.grassNote}</p> : null}
      {props.tool === "grass" ? <p className="mt-2 text-[11px] leading-snug text-gray-500">$25 add-on, included only on classic packages. Not Iconic Polish. The lawn file stays on the server.</p> : null}
      </div>
      <div className="shrink-0 border-t border-white/10 p-3">
      <label className="block">
        <span className="text-[10px] font-black normal-case tracking-widest text-gray-500">OpenAI / special instructions</span>
        <textarea data-testid="scratch-instruction-studio" value={props.instruction} rows={2} onChange={(event) => props.onInstruction(event.target.value)} placeholder="OpenAI / special instructions. Process sends it." className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs outline-none focus:border-[#0d9488]" />
      </label>
      <button type="button" data-testid="scratch-apply-studio" disabled={props.busy || (props.tool === "grass" && !props.grassReady)} onClick={props.onApply} className="mt-3 w-full rounded-full py-3 text-[11px] font-black uppercase tracking-widest text-white disabled:opacity-40" style={{ backgroundColor: teal }}>Apply</button>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" data-testid="scratch-process-studio" disabled={props.busy} onClick={props.onProcess} className="rounded-full border border-white/15 py-2 text-[10px] font-black uppercase tracking-widest">Process</button>
        <ExportButtons onExport={props.onExport} onDownload={props.onDownload} />
      </div>
      </div>
    </div>
  );
}

function FloorplanStage({ url, branded, onBrowse }: { url?: string; branded: boolean; onBrowse: () => void }) {
  if (!url) {
    return (
      <button type="button" data-testid="scratch-floorplan-drop" onClick={onBrowse} className="m-6 flex h-64 w-full max-w-xl flex-col items-center justify-center rounded-2xl border border-dashed border-[#0d9488]/60 text-center">
        <span className="text-sm font-black uppercase tracking-widest">Drop Cubi export</span>
        <span className="mt-2 text-[11px] text-gray-400">PNG, JPG, or SVG. Apply replaces the footer with the Iconic bar.</span>
      </button>
    );
  }
  return (
    <div data-testid="scratch-floorplan-preview" className="relative max-h-full max-w-full">
      <img src={url} alt="Floor plan" className="max-h-full max-w-full object-contain" />
      <p className="absolute bottom-3 left-3 rounded-full bg-black/80 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-teal-200">
        {branded ? "Iconic bar applied" : "Cubi footer out · Iconic bar on Apply"}
      </p>
      {branded ? (
        <a data-testid="scratch-floorplan-download" href={url} download="iconic-floorplan.jpg" className="absolute bottom-3 right-3 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white" style={{ backgroundColor: teal }}>
          Download floor plan
        </a>
      ) : null}
    </div>
  );
}

function ExportButtons({
  onExport,
  onDownload,
}: {
  onExport: (destination: ScratchExportDestination) => void;
  onDownload: () => void;
}) {
  return (
    <details data-testid="scratch-export" className="relative">
      <summary className="cursor-pointer list-none rounded-full border border-white/15 py-2 text-center text-[10px] font-black uppercase tracking-widest [&::-webkit-details-marker]:hidden">Export</summary>
      <div className="absolute right-0 z-20 mt-2 w-44 rounded-xl border border-white/10 bg-[#101618] p-1 shadow-xl">
        <button type="button" data-testid="scratch-export-gallery" onClick={() => onExport("gallery")} className="block w-full rounded-lg px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-gray-300">Gallery</button>
        <button type="button" data-testid="scratch-export-dropbox" onClick={() => onExport("dropbox")} className="block w-full rounded-lg px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-gray-300">Dropbox</button>
        <button type="button" data-testid="scratch-export-drive" onClick={() => onExport("drive")} className="block w-full rounded-lg px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-gray-300">Google Drive</button>
        <button type="button" data-testid="scratch-download-zip" onClick={() => onExport("zip")} className="block w-full rounded-lg px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-gray-300">Edited set (.zip)</button>
        <button type="button" data-testid="scratch-download" onClick={onDownload} className="block w-full rounded-lg px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-white">Download</button>
      </div>
    </details>
  );
}
