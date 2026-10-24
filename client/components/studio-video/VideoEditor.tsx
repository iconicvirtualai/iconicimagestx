/**
 * Staff video editor. Template mode uses the five engine templates.
 * Timeline mode is a multi-track reel. The browser preview is approximate.
 * The final file is rendered by the worker, which stays queued until it is connected.
 */

import { useEffect, useMemo, useReducer, useRef, useState, type RefObject } from "react";
import {
  Clapperboard,
  Download,
  Film,
  FolderUp,
  ImagePlus,
  Music,
  Pause,
  Play,
  Square,
  Type,
  Upload,
} from "lucide-react";
import {
  LICENSED_TRACKS,
  fitAnimationPoint,
  isDriveFileUrl,
  isDropboxFileUrl,
  listTemplateSummaries,
  planTemplateTiming,
  templateById,
} from "@shared/studioVideoTemplates";
import {
  EXPORT_FPS,
  EXPORT_PRESETS,
  resolveExport,
  type ExportFps,
  type ExportQuality,
} from "@shared/videoExportPresets";
import {
  GRADE_PRESETS,
  RIGID_TRANSITIONS,
  applyTimelineAction,
  clipPlayLength,
  createEmptyTimeline,
  gradeCss,
  projectDuration,
  type TimelineProject,
  type VideoClip,
} from "@shared/videoTimeline";
import {
  emptyTemplateEditor,
  templateCoverage,
  templateEditorReducer,
  type SlotEdit,
} from "./templateEditorState";

export interface EditorSource {
  id: string;
  name: string;
  url: string;
  kind: "video" | "image" | "audio";
  duration: number;
  origin: "local" | "dropbox" | "drive";
}

type Mode = "template" | "timeline";
type Hit = {
  orderId: string;
  orderNumber: string;
  address: string;
  videoSectionUrl: string | null;
  galleryUrl: string | null;
};

const summaries = listTemplateSummaries();

async function api(token: string | undefined, path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`/api/studio/video${path}`, { ...init, headers });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data: data as Record<string, unknown> };
}

export function VideoEditor({
  listingId = "staff",
  editorEnabled = true,
  templatesEnabled = true,
  getToken,
  initialMode = "template",
  initialTemplateId = null,
  forceExport = false,
  forceGallery = false,
}: {
  listingId?: string;
  editorEnabled?: boolean;
  templatesEnabled?: boolean;
  getToken?: () => Promise<string | undefined>;
  initialMode?: Mode;
  initialTemplateId?: string | null;
  forceExport?: boolean;
  forceGallery?: boolean;
}) {
  const [mode, setMode] = useState<Mode>(templatesEnabled ? initialMode : "timeline");
  const [sources, setSources] = useState<EditorSource[]>([]);
  const [templateState, dispatchTemplate] = useReducer(
    templateEditorReducer,
    initialTemplateId,
    (id) => (id ? templateEditorReducer(emptyTemplateEditor(), { type: "select-template", templateId: id }) : emptyTemplateEditor()),
  );
  const [timeline, dispatchTimeline] = useReducer(applyTimelineAction, undefined, createEmptyTimeline);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [selectedClip, setSelectedClip] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(forceExport);
  const [galleryOpen, setGalleryOpen] = useState(forceGallery);
  const [presetId, setPresetId] = useState("instagram_reel");
  const [fps, setFps] = useState<ExportFps>(30);
  const [quality, setQuality] = useState<ExportQuality>("high");
  const [customSize, setCustomSize] = useState({ width: 1080, height: 1920 });
  const [banner, setBanner] = useState("");
  const [job, setJob] = useState<{ id: string; status: string; message: string; outputUrl?: string } | null>(null);
  const [linkPanel, setLinkPanel] = useState<"dropbox" | "drive" | null>(null);
  const [linkValue, setLinkValue] = useState("");
  const [playing, setPlaying] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const urls = useRef<string[]>([]);

  useEffect(() => () => {
    urls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const template = templateById(templateState.templateId || "");
  const timing = useMemo(() => (template ? planTemplateTiming(template) : null), [template]);
  const coverage = templateCoverage(templateState);
  const duration = mode === "timeline"
    ? projectDuration(timeline)
    : timing?.total ?? 0;
  const size = mode === "template"
    ? templateState.size
    : `${timeline.width}x${timeline.height}`;
  const [frameW, frameH] = size.split("x").map((value) => Number(value));
  const vertical = frameH >= frameW;

  function addFiles(files: FileList | File[], origin: EditorSource["origin"] = "local") {
    const next: EditorSource[] = [];
    for (const file of Array.from(files)) {
      const kind = file.type.startsWith("audio/") ? "audio" : file.type.startsWith("image/") ? "image" : "video";
      const url = URL.createObjectURL(file);
      urls.current.push(url);
      next.push({
        id: `src_${Math.random().toString(36).slice(2, 10)}`,
        name: file.name,
        url,
        kind,
        duration: kind === "image" ? 5 : 8,
        origin,
      });
    }
    setSources((current) => [...current, ...next]);
  }

  function addLink(origin: "dropbox" | "drive") {
    const value = linkValue.trim();
    const ok = origin === "dropbox" ? isDropboxFileUrl(value) : isDriveFileUrl(value);
    if (!ok) {
      setBanner(origin === "dropbox" ? "Paste a Dropbox file link, not a folder." : "Paste a Google Drive file link.");
      return;
    }
    setSources((current) => [...current, {
      id: `src_${Math.random().toString(36).slice(2, 10)}`,
      name: value.split("/").pop() || (origin === "dropbox" ? "Dropbox clip" : "Drive clip"),
      url: value,
      kind: "video",
      duration: 8,
      origin,
    }]);
    setLinkValue("");
    setLinkPanel(null);
  }

  function onMetadata(id: string, durationSec: number) {
    if (!Number.isFinite(durationSec) || durationSec <= 0) return;
    setSources((current) => current.map((source) => (source.id === id ? { ...source, duration: durationSec } : source)));
  }

  const activeSlot = timing?.slots.find((slot) => slot.id === selectedSlot) ?? null;
  const slotEdit = selectedSlot ? templateState.slots[selectedSlot] : undefined;
  const slotSource = sources.find((source) => source.id === slotEdit?.sourceIds[0]);
  const slotWindow = activeSlot && slotEdit && slotSource
    ? fitAnimationPoint({
      inPoint: slotEdit.inPoint,
      outPoint: Math.max(slotEdit.outPoint, slotEdit.inPoint + 0.1),
      relMin: activeSlot.relMin,
      relMax: activeSlot.relMax,
      userPoint: slotEdit.point,
    })
    : null;

  const timelineClip = timeline.tracks.flatMap((track) => track.clips ?? []).find((clip) => clip.id === selectedClip) ?? null;
  const previewSource = mode === "template"
    ? slotSource
    : sources.find((source) => source.id === timelineClip?.sourceId);

  useEffect(() => {
    const node = videoRef.current;
    if (!node || !playing) return;
    const end = mode === "template" && slotWindow ? slotWindow.windowEnd : timelineClip ? timelineClip.outPoint : node.duration;
    const start = mode === "template" && slotWindow ? slotWindow.windowStart : timelineClip ? timelineClip.inPoint : 0;
    node.playbackRate = timelineClip?.speed || 1;
    if (node.currentTime < start || node.currentTime >= end) node.currentTime = start;
    void node.play().catch(() => setPlaying(false));
    const onTime = () => {
      if (node.currentTime >= end) {
        node.pause();
        node.currentTime = start;
        setPlaying(false);
      }
    };
    node.addEventListener("timeupdate", onTime);
    return () => node.removeEventListener("timeupdate", onTime);
  }, [playing, mode, slotWindow, timelineClip]);

  async function renderJob() {
    const token = await getToken?.();
    const exportBody = resolveExport({
      presetId,
      width: customSize.width,
      height: customSize.height,
      fps,
      quality,
      durationSec: duration,
    });
    if ("error" in exportBody) {
      setBanner(exportBody.error);
      return;
    }
    if (mode === "template") {
      if (!template) {
        setBanner("Choose a template first.");
        return;
      }
      const slots: Record<string, string | string[]> = {};
      const points: Record<string, number> = {};
      const trims: Record<string, { in: number; out: number }> = {};
      for (const [slotId, edit] of Object.entries(templateState.slots)) {
        const refs = edit.sourceIds.map((id) => sources.find((source) => source.id === id)?.url || "").filter((url) => url.startsWith("studio-video/") || url.startsWith("https://") || url.startsWith("galleries/"));
        if (!refs.length) continue;
        slots[slotId] = refs.length > 1 ? refs : refs[0];
        if (edit.point != null) points[slotId] = edit.point;
        trims[slotId] = { in: edit.inPoint, out: edit.outPoint };
      }
      if (!Object.keys(slots).length) {
        setBanner("Renderer not connected yet. Clips on this device stay here until they are in studio-video/uploads or imported from Dropbox or Drive.");
        setExportOpen(true);
        return;
      }
      const result = await api(token, "/template-jobs", {
        method: "POST",
        body: JSON.stringify({
          templateId: template.id,
          listingId,
          slots,
          points,
          trims,
          text: templateState.text,
          musicId: templateState.musicId,
          size: vertical ? "1080x1920" : "1920x1080",
        }),
      });
      const created = result.data.job as { id: string; status: string; message: string } | undefined;
      if (!result.ok || !created) {
        setBanner(String(result.data.error || "Could not queue the render."));
        return;
      }
      setJob({ ...created, message: String(result.data.message || created.message) });
      setBanner(String(result.data.message || created.message));
      return;
    }
    const remoteSources = Object.fromEntries(
      sources
        .filter((source) => source.url.startsWith("studio-video/") || source.url.startsWith("galleries/") || source.url.startsWith("https://"))
        .map((source) => [source.id, source.url]),
    );
    const result = await api(token, "/timeline-jobs", {
      method: "POST",
      body: JSON.stringify({
        listingId,
        project: timeline,
        sources: remoteSources,
        export: { presetId, width: customSize.width, height: customSize.height, fps, quality, durationSec: duration },
      }),
    });
    const created = result.data.job as { id: string; status: string; message: string } | undefined;
    if (!result.ok || !created) {
      setBanner(String(result.data.error || "Could not queue the timeline."));
      return;
    }
    setJob({ ...created, message: String(result.data.message || created.message) });
    setBanner(String(result.data.message || created.message));
  }

  function downloadEdit() {
    const payload = mode === "template"
      ? { mode, templateId: templateState.templateId, slots: templateState.slots, text: templateState.text, musicId: templateState.musicId, size: templateState.size }
      : { mode, project: timeline, presetId, fps, quality };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "studio-video-edit.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!editorEnabled) {
    return (
      <div data-testid="studio-video-editor" className="rounded-[2rem] border border-gray-100 bg-white p-8 text-center">
        <p className="text-sm font-black uppercase tracking-widest text-black">Video editor is off in this environment</p>
        <p className="mt-2 text-xs text-gray-500">Turn on VIDEO_EDITOR_ENABLED for this preview. Production stays off until the owner says so.</p>
      </div>
    );
  }

  return (
    <div data-testid="studio-video-editor" className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
      <section className="order-2 min-w-0 lg:order-none">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex rounded-2xl bg-gray-100 p-1" role="tablist" aria-label="Editor mode">
            <button type="button" role="tab" aria-selected={mode === "template"} data-testid="studio-video-mode-template" disabled={!templatesEnabled} onClick={() => setMode("template")} className={`min-h-11 rounded-xl px-4 text-[10px] font-black uppercase tracking-widest ${mode === "template" ? "bg-white text-black shadow-sm" : "text-gray-400"}`}>Template</button>
            <button type="button" role="tab" aria-selected={mode === "timeline"} data-testid="studio-video-mode-timeline" onClick={() => setMode("timeline")} className={`min-h-11 rounded-xl px-4 text-[10px] font-black uppercase tracking-widest ${mode === "timeline" ? "bg-white text-black shadow-sm" : "text-gray-400"}`}>Timeline</button>
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{listingId === "staff" ? "No project selected" : listingId}</p>
        </div>

        <SourceBar
          onFiles={addFiles}
          onBrowse={() => fileRef.current?.click()}
          onCamera={() => cameraRef.current?.click()}
          onDropbox={() => setLinkPanel(linkPanel === "dropbox" ? null : "dropbox")}
          onDrive={() => setLinkPanel(linkPanel === "drive" ? null : "drive")}
          sources={sources}
          linkPanel={linkPanel}
          linkValue={linkValue}
          onLinkValue={setLinkValue}
          onAddLink={addLink}
        />
        <input ref={fileRef} data-testid="studio-video-file" className="hidden" type="file" accept="video/*,image/*,audio/*" multiple onChange={(event) => event.target.files && addFiles(event.target.files)} />
        <input ref={cameraRef} data-testid="studio-video-camera" className="hidden" type="file" accept="video/*" capture="environment" onChange={(event) => event.target.files && addFiles(event.target.files)} />

        {mode === "template" && templatesEnabled && !template && (
          <TemplateGallery onPick={(id) => { dispatchTemplate({ type: "select-template", templateId: id }); setSelectedSlot(null); }} />
        )}
        {mode === "template" && template && timing && (
          <TemplateWorkspace
            templateName={template.name}
            slots={timing.slots}
            edits={templateState.slots}
            sources={sources}
            text={templateState.text}
            musicId={templateState.musicId}
            size={templateState.size}
            logoName={templateState.logoName}
            coverage={coverage.message}
            selectedSlot={selectedSlot}
            onBack={() => dispatchTemplate({ type: "select-template", templateId: "" })}
            onSelect={(id) => {
              setSelectedSlot(id);
              if (!templateState.slots[id]) dispatchTemplate({ type: "trim", slotId: id, inPoint: 0, outPoint: 20 });
            }}
            onAssign={(slotId, sourceId, index) => {
              const source = sources.find((item) => item.id === sourceId);
              if (!source) return;
              dispatchTemplate({ type: "assign", slotId, sourceId, duration: source.duration, index });
              setSelectedSlot(slotId);
            }}
            onImport={() => dispatchTemplate({
              type: "import-all",
              sourceIds: sources.filter((source) => source.kind === "video").map((source) => source.id),
              durations: Object.fromEntries(sources.map((source) => [source.id, source.duration])),
            })}
            onAction={dispatchTemplate}
            onTrim={(slotId, inPoint, outPoint) => dispatchTemplate({ type: "trim", slotId, inPoint, outPoint })}
            onPoint={(slotId, point) => dispatchTemplate({ type: "set-point", slotId, point })}
          />
        )}
        {mode === "timeline" && (
          <TimelineWorkspace
            project={timeline}
            sources={sources}
            selectedClip={selectedClip}
            onSelect={setSelectedClip}
            onAction={dispatchTimeline}
          />
        )}
        {banner && <p data-testid="studio-video-banner" className="mt-3 rounded-2xl bg-black px-4 py-3 text-xs font-bold text-white">{banner}</p>}
      </section>

      <aside className="order-1 lg:sticky lg:top-24">
        <PreviewCard
          vertical={vertical}
          source={previewSource}
          videoRef={videoRef}
          playing={playing}
          onToggle={() => setPlaying((value) => !value)}
          filter={timelineClip ? gradeCss(timelineClip.grade) : undefined}
          playbackRate={timelineClip?.speed || 1}
          text={mode === "template" ? Object.values(templateState.text)[0] || "" : timeline.tracks.find((track) => track.type === "text")?.texts?.[0]?.text || ""}
          onMetadata={(durationSec) => previewSource && onMetadata(previewSource.id, durationSec)}
          windowLabel={slotWindow ? `${slotWindow.windowStart.toFixed(2)}s – ${slotWindow.windowEnd.toFixed(2)}s` : "Browser preview"}
        />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" data-testid="export-open" onClick={() => setExportOpen(true)} className="min-h-11 rounded-2xl bg-[#0d9488] text-[10px] font-black uppercase tracking-widest text-white">Export</button>
          <button type="button" data-testid="gallery-open" onClick={() => setGalleryOpen(true)} className="min-h-11 rounded-2xl border border-gray-200 bg-white text-[10px] font-black uppercase tracking-widest text-black">Add to gallery</button>
        </div>
      </aside>

      {exportOpen && (
        <ExportDialog
          presetId={presetId}
          fps={fps}
          quality={quality}
          customSize={customSize}
          duration={duration}
          jobMessage={job?.message || ""}
          outputUrl={job?.outputUrl}
          onPreset={setPresetId}
          onFps={setFps}
          onQuality={setQuality}
          onCustom={setCustomSize}
          onClose={() => setExportOpen(false)}
          onRender={() => void renderJob()}
          onDownload={downloadEdit}
          onGallery={() => { setExportOpen(false); setGalleryOpen(true); }}
        />
      )}
      {galleryOpen && (
        <GalleryPicker
          getToken={getToken}
          outputUrl={job?.outputUrl}
          presetId={presetId}
          fps={fps}
          width={frameW}
          height={frameH}
          onClose={() => setGalleryOpen(false)}
          onAttached={(message) => { setBanner(message); setGalleryOpen(false); }}
        />
      )}
    </div>
  );
}

function SourceBar({
  onFiles, onBrowse, onCamera, onDropbox, onDrive, sources, linkPanel, linkValue, onLinkValue, onAddLink,
}: {
  onFiles: (files: FileList | File[]) => void;
  onBrowse: () => void;
  onCamera: () => void;
  onDropbox: () => void;
  onDrive: () => void;
  sources: EditorSource[];
  linkPanel: "dropbox" | "drive" | null;
  linkValue: string;
  onLinkValue: (value: string) => void;
  onAddLink: (origin: "dropbox" | "drive") => void;
}) {
  const dropboxKey = import.meta.env.VITE_DROPBOX_APP_KEY;
  const driveKey = import.meta.env.VITE_GOOGLE_PICKER_API_KEY && import.meta.env.VITE_GOOGLE_PICKER_CLIENT_ID;
  return (
    <div
      data-testid="source-dropzone"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        if (event.dataTransfer.files?.length) onFiles(event.dataTransfer.files);
      }}
      className="mb-4 rounded-[2rem] border border-dashed border-[#0d9488]/40 bg-white p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Upload className="h-4 w-4 text-[#0d9488]" />
        <p className="text-[10px] font-black uppercase tracking-widest text-black">Drop clips</p>
        <button type="button" onClick={onBrowse} className="min-h-11 rounded-full bg-black px-4 text-[10px] font-black uppercase tracking-widest text-white">Camera roll</button>
        <button type="button" onClick={onCamera} className="min-h-11 rounded-full border border-gray-200 px-4 text-[10px] font-black uppercase tracking-widest lg:hidden">Record</button>
        <button type="button" data-testid="import-dropbox" onClick={onDropbox} className="min-h-11 rounded-full border border-gray-200 px-4 text-[10px] font-black uppercase tracking-widest">Dropbox</button>
        <button type="button" data-testid="import-drive" onClick={onDrive} className="min-h-11 rounded-full border border-gray-200 px-4 text-[10px] font-black uppercase tracking-widest">Google Drive</button>
      </div>
      <p className="mt-2 text-[11px] text-gray-500">
        {dropboxKey ? "Dropbox Chooser key is set." : "Dropbox Chooser needs VITE_DROPBOX_APP_KEY. Paste a file link instead."}
        {" "}
        {driveKey ? "Google Picker keys are set." : "Google Picker needs VITE_GOOGLE_PICKER_API_KEY and VITE_GOOGLE_PICKER_CLIENT_ID."}
      </p>
      {linkPanel && (
        <div className="mt-3 flex gap-2">
          <input value={linkValue} onChange={(event) => onLinkValue(event.target.value)} placeholder={linkPanel === "dropbox" ? "https://www.dropbox.com/..." : "https://drive.google.com/file/..."} className="min-h-11 min-w-0 flex-1 rounded-full border border-gray-200 px-4 text-sm" />
          <button type="button" onClick={() => onAddLink(linkPanel)} className="min-h-11 rounded-full bg-[#0d9488] px-4 text-[10px] font-black uppercase tracking-widest text-white">Import</button>
        </div>
      )}
      {sources.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {sources.map((source) => (
            <div key={source.id} draggable onDragStart={(event) => event.dataTransfer.setData("application/x-iconic-source", source.id)} data-testid={`source-${source.id}`} className="w-28 shrink-0 rounded-2xl bg-gray-50 p-2">
              <p className="truncate text-[10px] font-black uppercase tracking-widest">{source.name}</p>
              <p className="text-[10px] text-gray-400">{source.origin} · {source.duration.toFixed(1)}s</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateGallery({ onPick }: { onPick: (id: string) => void }) {
  return (
    <div data-testid="template-gallery" className="grid gap-3 sm:grid-cols-2">
      {summaries.map((template) => (
        <button key={template.id} type="button" data-testid={`template-card-${template.id}`} onClick={() => onPick(template.id)} className="rounded-[2rem] border border-gray-100 bg-white p-5 text-left shadow-sm hover:border-[#0d9488]/40">
          <div className="mb-4 aspect-[9/16] max-h-40 w-full rounded-2xl bg-gradient-to-b from-black to-[#134e4a]" />
          <h2 className="text-sm font-black uppercase tracking-tight text-black">{template.name}</h2>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-[#0d9488]">{template.duration.toFixed(1)}s · {template.clipCount} clips · {template.optionalCount} optional</p>
          <p className="mt-2 text-xs leading-relaxed text-gray-500">{template.description}</p>
        </button>
      ))}
    </div>
  );
}

function TemplateWorkspace(props: {
  templateName: string;
  slots: ReturnType<typeof planTemplateTiming>["slots"];
  edits: Record<string, SlotEdit>;
  sources: EditorSource[];
  text: Record<string, string>;
  musicId: string;
  size: "1080x1920" | "1920x1080";
  logoName: string | null;
  coverage: string;
  selectedSlot: string | null;
  onBack: () => void;
  onSelect: (id: string) => void;
  onAssign: (slotId: string, sourceId: string, index?: number) => void;
  onImport: () => void;
  onAction: (action: Parameters<typeof templateEditorReducer>[1]) => void;
  onTrim: (slotId: string, inPoint: number, outPoint: number) => void;
  onPoint: (slotId: string, point: number) => void;
}) {
  const summary = summaries.find((item) => item.name === props.templateName);
  return (
    <div data-testid="template-editor">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={props.onBack} className="min-h-11 text-[10px] font-black uppercase tracking-widest text-gray-400">All templates</button>
        <h2 className="text-sm font-black uppercase tracking-tight">{props.templateName}</h2>
        <button type="button" data-testid="template-import-all" onClick={props.onImport} className="min-h-11 rounded-full border border-gray-200 px-4 text-[10px] font-black uppercase tracking-widest"><FolderUp className="mr-1 inline h-3 w-3" />Import all</button>
      </div>
      <p data-testid="template-coverage" className="mb-3 text-xs text-gray-500">{props.coverage}</p>
      <div className="space-y-2">
        {props.slots.map((slot) => {
          const edit = props.edits[slot.id];
          const names = (edit?.sourceIds || []).map((id) => props.sources.find((source) => source.id === id)?.name).filter(Boolean);
          return (
            <article
              key={slot.id}
              data-testid={`slot-card-${slot.id}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const sourceId = event.dataTransfer.getData("application/x-iconic-source");
                if (sourceId) props.onAssign(slot.id, sourceId, 0);
              }}
              onClick={() => props.onSelect(slot.id)}
              className={`rounded-[1.5rem] border bg-white p-3 ${props.selectedSlot === slot.id ? "border-[#0d9488]" : "border-gray-100"}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#0d9488]">{slot.kind} · {slot.beats} beats · {slot.seconds.toFixed(2)}s · {slot.outType}</p>
                  <h3 className="text-sm font-black text-black">{slot.label}</h3>
                  {slot.optional && <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Optional</span>}
                </div>
                <div className="flex gap-1">
                  <button type="button" aria-label={`Move ${slot.id} up`} className="min-h-11 min-w-11 rounded-xl border text-xs" onClick={(event) => { event.stopPropagation(); props.onAction({ type: "swap", slotId: slot.id, direction: -1 }); }}>↑</button>
                  <button type="button" aria-label={`Move ${slot.id} down`} className="min-h-11 min-w-11 rounded-xl border text-xs" onClick={(event) => { event.stopPropagation(); props.onAction({ type: "swap", slotId: slot.id, direction: 1 }); }}>↓</button>
                  <button type="button" className="min-h-11 rounded-xl border px-3 text-[10px] font-black uppercase" onClick={(event) => { event.stopPropagation(); props.onAction({ type: "clear", slotId: slot.id }); }}>Clear</button>
                </div>
              </div>
              {slot.clips > 1 && (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {["Center", "Top", "Bottom"].map((label, index) => (
                    <div key={label} data-testid={`slot-${slot.id}-pane-${index}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); const sourceId = event.dataTransfer.getData("application/x-iconic-source"); if (sourceId) props.onAssign(slot.id, sourceId, index); }} className="rounded-xl bg-gray-50 px-2 py-3 text-center text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</div>
                  ))}
                </div>
              )}
              <p className="mt-2 truncate text-xs text-gray-500">{names.length ? names.join(" · ") : "Drop a clip or import one"}</p>
              {props.selectedSlot === slot.id && edit && (
                <TrimScrubber
                  duration={Math.max(edit.outPoint, edit.inPoint + 0.2, 8)}
                  inPoint={edit.inPoint}
                  outPoint={edit.outPoint}
                  point={edit.point}
                  relMin={slot.relMin}
                  relMax={slot.relMax}
                  onTrim={(inPoint, outPoint) => props.onTrim(slot.id, inPoint, outPoint)}
                  onPoint={(point) => props.onPoint(slot.id, point)}
                  onAuto={() => props.onAction({ type: "auto-point", slotId: slot.id })}
                />
              )}
            </article>
          );
        })}
      </div>
      <div className="mt-4 grid gap-3 rounded-[2rem] border border-gray-100 bg-white p-4">
        <p className="text-[10px] font-black uppercase tracking-widest">Text, music, size</p>
        {(summary?.layers || []).map((layer) => (
          <label key={layer.id} className="block text-[10px] font-black uppercase tracking-widest text-gray-400">
            {layer.label}
            <input value={props.text[layer.id] ?? layer.text} onChange={(event) => props.onAction({ type: "set-text", layerId: layer.id, text: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border px-3 text-sm font-bold normal-case tracking-normal text-black" />
          </label>
        ))}
        <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400">
          Music
          <select value={props.musicId} onChange={(event) => props.onAction({ type: "set-music", musicId: event.target.value })} className="mt-1 min-h-11 w-full rounded-xl border px-3 text-sm font-bold normal-case tracking-normal text-black">
            {LICENSED_TRACKS.map((track) => <option key={track.id} value={track.id}>{track.title} · {track.bpm} BPM · {track.license}</option>)}
          </select>
        </label>
        <div className="flex gap-2">
          {(["1080x1920", "1920x1080"] as const).map((value) => (
            <button key={value} type="button" onClick={() => props.onAction({ type: "set-size", size: value })} className={`min-h-11 flex-1 rounded-xl text-[10px] font-black uppercase tracking-widest ${props.size === value ? "bg-black text-white" : "border"}`}>{value === "1080x1920" ? "9:16" : "16:9"}</button>
          ))}
        </div>
        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">
          Logo, optional
          <input type="file" accept="image/*" className="mt-1 block w-full text-xs font-medium normal-case" onChange={(event) => props.onAction({ type: "set-logo", name: event.target.files?.[0]?.name || null })} />
          <span className="mt-1 block font-medium normal-case text-gray-400">{props.logoName || "The logo layer stays off until you add one."}</span>
        </label>
      </div>
    </div>
  );
}

function TrimScrubber({
  duration, inPoint, outPoint, point, relMin, relMax, onTrim, onPoint, onAuto,
}: {
  duration: number;
  inPoint: number;
  outPoint: number;
  point: number | null;
  relMin: number;
  relMax: number;
  onTrim: (inPoint: number, outPoint: number) => void;
  onPoint: (point: number) => void;
  onAuto: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const fitted = fitAnimationPoint({ inPoint, outPoint: Math.max(outPoint, inPoint + 0.05), relMin, relMax, userPoint: point });
  function ratio(clientX: number) {
    const box = ref.current?.getBoundingClientRect();
    if (!box || box.width <= 0) return 0;
    return Math.min(1, Math.max(0, (clientX - box.left) / box.width));
  }
  function timeAt(clientX: number) {
    return ratio(clientX) * duration;
  }
  const left = (fitted.windowStart / duration) * 100;
  const width = ((fitted.windowEnd - fitted.windowStart) / duration) * 100;
  return (
    <div className="mt-3" data-testid="trim-scrubber" onClick={(event) => event.stopPropagation()}>
      <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-gray-400">
        <span>In {inPoint.toFixed(2)}s · point {fitted.point.toFixed(2)}s · out {outPoint.toFixed(2)}s</span>
        <button type="button" onClick={onAuto} className="min-h-11 rounded-full bg-gray-100 px-3 text-black">Auto</button>
      </div>
      <div ref={ref} className="relative h-12 rounded-full bg-gray-100">
        <div className="absolute top-2 h-8 rounded-full bg-[#0d9488]/30" style={{ left: `${left}%`, width: `${Math.max(width, 1)}%` }} />
        <Handle label="Trim in" left={(inPoint / duration) * 100} onPointer={(clientX) => onTrim(Math.min(timeAt(clientX), outPoint - 0.1), outPoint)} />
        <Handle label="Animation point" left={(fitted.point / duration) * 100} accent onPointer={(clientX) => onPoint(timeAt(clientX))} />
        <Handle label="Trim out" left={(outPoint / duration) * 100} onPointer={(clientX) => onTrim(inPoint, Math.max(timeAt(clientX), inPoint + 0.1))} />
      </div>
      <p className="mt-1 text-[11px] text-gray-500">The highlighted band is the fixed slot window inside your in and out points. {fitted.note}</p>
    </div>
  );
}

function Handle({ label, left, onPointer, accent = false }: { label: string; left: number; onPointer: (clientX: number) => void; accent?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`absolute top-0 h-12 w-11 -translate-x-1/2 touch-none ${accent ? "z-10" : ""}`}
      style={{ left: `${Math.min(100, Math.max(0, left))}%` }}
      onPointerDown={(event) => {
        event.stopPropagation();
        const move = (pointer: PointerEvent) => onPointer(pointer.clientX);
        const up = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      }}
    >
      <span className={`mx-auto block h-12 w-1.5 rounded-full ${accent ? "bg-black" : "bg-[#0d9488]"}`} />
    </button>
  );
}

function TimelineWorkspace({
  project, sources, selectedClip, onSelect, onAction,
}: {
  project: TimelineProject;
  sources: EditorSource[];
  selectedClip: string | null;
  onSelect: (id: string) => void;
  onAction: (action: Parameters<typeof applyTimelineAction>[1]) => void;
}) {
  const videos = sources.filter((source) => source.kind === "video");
  const images = sources.filter((source) => source.kind === "image");
  const audios = sources.filter((source) => source.kind === "audio");
  const clip = project.tracks.flatMap((track) => track.clips ?? []).find((item) => item.id === selectedClip) ?? null;
  return (
    <div data-testid="timeline-editor" className="space-y-3">
      <p className="text-xs text-gray-500">Trim, split, reorder, swap, speed ramp, reverse, color grade, text, shapes, overlays, and audio. Transitions stay rigid.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="min-h-11 rounded-full bg-black px-4 text-[10px] font-black uppercase tracking-widest text-white" onClick={() => videos[0] && onAction({ type: "add-video", trackId: "v1", sourceId: videos[0].id, name: videos[0].name, duration: videos[0].duration })}><Film className="mr-1 inline h-3 w-3" />Add clip</button>
        <button type="button" className="min-h-11 rounded-full border px-4 text-[10px] font-black uppercase tracking-widest" onClick={() => onAction({ type: "add-text", text: "Just Listed" })}><Type className="mr-1 inline h-3 w-3" />Text</button>
        <button type="button" className="min-h-11 rounded-full border px-4 text-[10px] font-black uppercase tracking-widest" onClick={() => onAction({ type: "add-shape", shape: "rect" })}><Square className="mr-1 inline h-3 w-3" />Shape</button>
        <button type="button" className="min-h-11 rounded-full border px-4 text-[10px] font-black uppercase tracking-widest" onClick={() => images[0] && onAction({ type: "add-overlay", sourceId: images[0].id, name: images[0].name })}><ImagePlus className="mr-1 inline h-3 w-3" />Overlay</button>
        <button type="button" className="min-h-11 rounded-full border px-4 text-[10px] font-black uppercase tracking-widest" onClick={() => onAction({ type: "add-audio", sourceId: audios[0]?.id || "heartbeat_mixkit1000", name: audios[0]?.name || "I Can Hear Your Heartbeat", duration: audios[0]?.duration || 60 })}><Music className="mr-1 inline h-3 w-3" />Audio</button>
      </div>
      <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400">
        Playhead {project.playhead.toFixed(2)}s
        <input type="range" min={0} max={Math.max(projectDuration(project), 1)} step={0.05} value={project.playhead} onChange={(event) => onAction({ type: "set-playhead", time: Number(event.target.value) })} className="mt-1 w-full" />
      </label>
      {project.tracks.map((track) => (
        <div key={track.id} data-testid={`track-${track.id}`} className="rounded-[1.5rem] border border-gray-100 bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-widest">{track.name}</p>
            <div className="flex gap-1">
              <button type="button" aria-label={`Raise ${track.name}`} className="min-h-11 min-w-11 rounded-xl border text-xs" onClick={() => onAction({ type: "move-track", trackId: track.id, direction: -1 })}>↑</button>
              <button type="button" aria-label={`Lower ${track.name}`} className="min-h-11 min-w-11 rounded-xl border text-xs" onClick={() => onAction({ type: "move-track", trackId: track.id, direction: 1 })}>↓</button>
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {(track.clips ?? []).map((item) => (
              <ClipChip key={item.id} clip={item} selected={item.id === selectedClip} onSelect={() => onSelect(item.id)} onDelete={() => onAction({ type: "delete-video", clipId: item.id })} onNudge={(direction) => onAction({ type: "reorder-video", trackId: track.id, clipId: item.id, direction })} />
            ))}
            {(track.texts ?? []).map((item) => (
              <button key={item.id} type="button" className="min-h-11 rounded-xl bg-gray-50 px-3 text-left text-xs font-bold" onClick={() => onAction({ type: "delete-text", id: item.id })}>{item.text}</button>
            ))}
            {(track.shapes ?? []).map((item) => (
              <button key={item.id} type="button" className="min-h-11 rounded-xl px-3 text-xs font-bold text-white" style={{ background: item.color }} onClick={() => onAction({ type: "delete-shape", id: item.id })}>{item.shape}</button>
            ))}
            {(track.overlays ?? []).map((item) => (
              <button key={item.id} type="button" className="min-h-11 rounded-xl bg-gray-50 px-3 text-xs font-bold" onClick={() => onAction({ type: "delete-overlay", id: item.id })}>{item.name}</button>
            ))}
            {(track.audio ?? []).map((item) => (
              <button key={item.id} type="button" className="min-h-11 rounded-xl bg-gray-50 px-3 text-left text-xs" onClick={() => onAction({ type: "delete-audio", id: item.id })}>
                <span className="font-bold">{item.name}</span>
                <span className="block text-[10px] uppercase tracking-widest text-gray-400">Vol {Math.round(item.volume * 100)} · fade {item.fadeIn}/{item.fadeOut}</span>
              </button>
            ))}
            {(track.clips ?? []).length + (track.texts ?? []).length + (track.shapes ?? []).length + (track.overlays ?? []).length + (track.audio ?? []).length === 0 && (
              <p className="text-xs text-gray-400">Empty track. Drop a clip on the bin, then add it here.</p>
            )}
          </div>
        </div>
      ))}
      {clip && <ClipInspector clip={clip} sources={videos} onAction={onAction} />}
    </div>
  );
}

function ClipChip({ clip, selected, onSelect, onDelete, onNudge }: { clip: VideoClip; selected: boolean; onSelect: () => void; onDelete: () => void; onNudge: (direction: -1 | 1) => void }) {
  return (
    <div className={`w-36 shrink-0 rounded-xl border p-2 ${selected ? "border-[#0d9488]" : "border-gray-100"}`} style={{ opacity: clip.opacity }}>
      <button type="button" onClick={onSelect} className="w-full text-left">
        <p className="truncate text-xs font-black">{clip.name}</p>
        <p className="text-[10px] uppercase tracking-widest text-gray-400">{clip.inPoint.toFixed(1)}–{clip.outPoint.toFixed(1)}s · {clip.speed}x {clip.reverse ? "· reverse" : ""}</p>
      </button>
      <div className="mt-1 flex gap-1">
        <button type="button" aria-label="Nudge earlier" className="min-h-11 flex-1 rounded-lg border text-xs" onClick={() => onNudge(-1)}>←</button>
        <button type="button" aria-label="Nudge later" className="min-h-11 flex-1 rounded-lg border text-xs" onClick={() => onNudge(1)}>→</button>
        <button type="button" aria-label="Delete clip" className="min-h-11 rounded-lg border px-2 text-[10px] font-black uppercase" onClick={onDelete}>Del</button>
      </div>
    </div>
  );
}

function ClipInspector({ clip, sources, onAction }: { clip: VideoClip; sources: EditorSource[]; onAction: (action: Parameters<typeof applyTimelineAction>[1]) => void }) {
  return (
    <div data-testid="clip-inspector" className="rounded-[2rem] border border-gray-100 bg-white p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-[#0d9488]">{clip.name}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <NumberField label="In" value={clip.inPoint} onChange={(inPoint) => onAction({ type: "trim-video", clipId: clip.id, inPoint, outPoint: clip.outPoint })} />
        <NumberField label="Out" value={clip.outPoint} onChange={(outPoint) => onAction({ type: "trim-video", clipId: clip.id, inPoint: clip.inPoint, outPoint })} />
        <NumberField label="Speed" value={clip.speed} step={0.1} onChange={(speed) => onAction({ type: "set-speed", clipId: clip.id, speed })} />
        <NumberField label="Opacity" value={clip.opacity} step={0.05} onChange={(opacity) => onAction({ type: "set-opacity", clipId: clip.id, opacity })} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="min-h-11 rounded-full border px-4 text-[10px] font-black uppercase tracking-widest" onClick={() => onAction({ type: "toggle-reverse", clipId: clip.id })}>{clip.reverse ? "Reversed" : "Reverse"}</button>
        <button type="button" className="min-h-11 rounded-full border px-4 text-[10px] font-black uppercase tracking-widest" onClick={() => onAction({ type: "split-video", clipId: clip.id, time: clip.start + clipPlayLength(clip) / 2 })}>Split</button>
        <button type="button" className="min-h-11 rounded-full border px-4 text-[10px] font-black uppercase tracking-widest" onClick={() => onAction({ type: "set-ramp", clipId: clip.id, ramp: [{ at: 0, speed: 1 }, { at: 1, speed: 2.2 }] })}>Speed ramp</button>
        <button type="button" className="min-h-11 rounded-full border px-4 text-[10px] font-black uppercase tracking-widest" onClick={() => onAction({ type: "set-audio-mix", clipId: clip.id, mute: !clip.mute })}>{clip.mute ? "Original muted" : "Mute original"}</button>
      </div>
      <label className="mt-3 block text-[10px] font-black uppercase tracking-widest text-gray-400">
        Swap file
        <select className="mt-1 min-h-11 w-full rounded-xl border px-3 text-sm font-bold normal-case text-black" value={clip.sourceId} onChange={(event) => {
          const source = sources.find((item) => item.id === event.target.value);
          if (source) onAction({ type: "swap-video", clipId: clip.id, sourceId: source.id, name: source.name, duration: source.duration });
        }}>
          <option value={clip.sourceId}>{clip.name}</option>
          {sources.filter((source) => source.id !== clip.sourceId).map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
        </select>
      </label>
      <label className="mt-3 block text-[10px] font-black uppercase tracking-widest text-gray-400">
        Transition
        <select className="mt-1 min-h-11 w-full rounded-xl border px-3 text-sm font-bold normal-case text-black" value={clip.transitionIn} onChange={(event) => onAction({ type: "set-transition", clipId: clip.id, transition: event.target.value as VideoClip["transitionIn"] })}>
          {RIGID_TRANSITIONS.map((transition) => <option key={transition} value={transition}>{transition}</option>)}
        </select>
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        {GRADE_PRESETS.map((preset) => (
          <button key={preset.id} type="button" onClick={() => onAction({ type: "set-grade", clipId: clip.id, grade: { preset: preset.id } })} className={`min-h-11 rounded-full px-3 text-[10px] font-black uppercase tracking-widest ${clip.grade.preset === preset.id ? "bg-black text-white" : "border"}`}>{preset.label}</button>
        ))}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <NumberField label="Exposure" value={clip.grade.exposure} step={0.1} onChange={(exposure) => onAction({ type: "set-grade", clipId: clip.id, grade: { exposure } })} />
        <NumberField label="Contrast" value={clip.grade.contrast} step={0.05} onChange={(contrast) => onAction({ type: "set-grade", clipId: clip.id, grade: { contrast } })} />
        <NumberField label="Saturation" value={clip.grade.saturation} step={0.05} onChange={(saturation) => onAction({ type: "set-grade", clipId: clip.id, grade: { saturation } })} />
        <NumberField label="Temperature" value={clip.grade.temperature} step={0.1} onChange={(temperature) => onAction({ type: "set-grade", clipId: clip.id, grade: { temperature } })} />
        <NumberField label="Tint" value={clip.grade.tint} step={0.1} onChange={(tint) => onAction({ type: "set-grade", clipId: clip.id, grade: { tint } })} />
        <NumberField label="Volume" value={clip.volume} step={0.05} onChange={(volume) => onAction({ type: "set-audio-mix", clipId: clip.id, volume })} />
        <NumberField label="Fade in" value={clip.fadeIn} step={0.1} onChange={(fadeIn) => onAction({ type: "set-audio-mix", clipId: clip.id, fadeIn })} />
        <NumberField label="Fade out" value={clip.fadeOut} step={0.1} onChange={(fadeOut) => onAction({ type: "set-audio-mix", clipId: clip.id, fadeOut })} />
      </div>
    </div>
  );
}

function NumberField({ label, value, onChange, step = 0.1 }: { label: string; value: number; onChange: (value: number) => void; step?: number }) {
  return (
    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">
      {label}
      <input type="number" step={step} value={Number(value.toFixed(2))} onChange={(event) => onChange(Number(event.target.value))} className="mt-1 min-h-11 w-full rounded-xl border px-3 text-sm font-bold normal-case text-black" />
    </label>
  );
}

function PreviewCard({
  vertical, source, videoRef, playing, onToggle, filter, playbackRate, text, onMetadata, windowLabel,
}: {
  vertical: boolean;
  source?: EditorSource;
  videoRef: RefObject<HTMLVideoElement | null>;
  playing: boolean;
  onToggle: () => void;
  filter?: string;
  playbackRate: number;
  text: string;
  onMetadata: (duration: number) => void;
  windowLabel: string;
}) {
  return (
    <div data-testid="preview-stage" className={`relative mx-auto overflow-hidden rounded-[2rem] bg-black ${vertical ? "aspect-[9/16] w-full max-w-[240px] lg:max-w-none" : "aspect-video w-full"}`}>
      {source?.kind === "video" ? (
        <video
          ref={videoRef}
          src={source.url}
          playsInline
          muted
          preload="metadata"
          onLoadedMetadata={(event) => onMetadata(event.currentTarget.duration)}
          className="h-full w-full object-cover"
          style={{ filter }}
        />
      ) : source?.kind === "image" ? (
        <img src={source.url} alt="" className="h-full w-full object-cover" style={{ filter }} />
      ) : (
        <div className="flex h-full items-center justify-center px-6 text-center">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/70">Drop a clip to preview</p>
        </div>
      )}
      {text && <p className="pointer-events-none absolute inset-x-4 top-[38%] text-center text-2xl font-black uppercase tracking-tight text-white drop-shadow">{text}</p>}
      <button type="button" aria-label={playing ? "Pause preview" : "Play preview"} onClick={onToggle} className="absolute bottom-3 left-3 flex min-h-11 items-center gap-2 rounded-full bg-white/90 px-3 text-[10px] font-black uppercase tracking-widest">
        {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
        {windowLabel}
      </button>
      <p className="absolute right-3 top-3 rounded-full bg-black/60 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-white">Approx. preview</p>
    </div>
  );
}

function ExportDialog(props: {
  presetId: string;
  fps: ExportFps;
  quality: ExportQuality;
  customSize: { width: number; height: number };
  duration: number;
  jobMessage: string;
  outputUrl?: string;
  onPreset: (id: string) => void;
  onFps: (fps: ExportFps) => void;
  onQuality: (quality: ExportQuality) => void;
  onCustom: (size: { width: number; height: number }) => void;
  onClose: () => void;
  onRender: () => void;
  onDownload: () => void;
  onGallery: () => void;
}) {
  const resolved = resolveExport({
    presetId: props.presetId,
    width: props.customSize.width,
    height: props.customSize.height,
    fps: props.fps,
    quality: props.quality,
    durationSec: props.duration,
  });
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center" role="dialog" aria-label="Export video">
      <div data-testid="export-dialog" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[2rem] bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-tight">Export</h2>
          <button type="button" onClick={props.onClose} className="min-h-11 px-3 text-[10px] font-black uppercase tracking-widest text-gray-400">Close</button>
        </div>
        <div className="grid gap-2">
          {EXPORT_PRESETS.map((preset) => (
            <button key={preset.id} type="button" data-testid={`export-preset-${preset.id}`} onClick={() => props.onPreset(preset.id)} className={`rounded-2xl border px-3 py-3 text-left ${props.presetId === preset.id ? "border-[#0d9488] bg-[#0d9488]/5" : "border-gray-100"}`}>
              <span className="text-xs font-black uppercase tracking-widest">{preset.label}</span>
              <span className="mt-1 block text-[11px] text-gray-500">{preset.detail}</span>
            </button>
          ))}
        </div>
        {props.presetId === "custom" && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <NumberField label="Width" value={props.customSize.width} step={2} onChange={(width) => props.onCustom({ ...props.customSize, width })} />
            <NumberField label="Height" value={props.customSize.height} step={2} onChange={(height) => props.onCustom({ ...props.customSize, height })} />
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {EXPORT_FPS.map((value) => (
            <button key={value} type="button" onClick={() => props.onFps(value)} className={`min-h-11 rounded-full px-4 text-[10px] font-black uppercase tracking-widest ${props.fps === value ? "bg-black text-white" : "border"}`}>{value} fps</button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {(["standard", "high", "max"] as const).map((value) => (
            <button key={value} type="button" onClick={() => props.onQuality(value)} className={`min-h-11 rounded-full px-4 text-[10px] font-black uppercase tracking-widest ${props.quality === value ? "bg-[#0d9488] text-white" : "border"}`}>{value}</button>
          ))}
        </div>
        {"warnings" in resolved && resolved.warnings.map((warning) => (
          <p key={warning} className="mt-2 text-xs text-amber-700">{warning}</p>
        ))}
        {"error" in resolved && <p className="mt-2 text-xs text-red-600">{resolved.error}</p>}
        <p className="mt-3 text-xs text-gray-500">{props.jobMessage || "The MP4 is rendered by the worker. Until that worker is connected, download the edit file and keep going."}</p>
        <div className="mt-4 grid gap-2">
          <button type="button" data-testid="export-render" onClick={props.onRender} className="min-h-11 rounded-2xl bg-black text-[10px] font-black uppercase tracking-widest text-white"><Clapperboard className="mr-1 inline h-3 w-3" />Render</button>
          {props.outputUrl ? (
            <a href={props.outputUrl} download className="min-h-11 rounded-2xl bg-[#0d9488] text-center text-[10px] font-black uppercase leading-[2.75rem] tracking-widest text-white">Download MP4</a>
          ) : (
            <p className="text-center text-[10px] font-black uppercase tracking-widest text-gray-400">Download MP4 waits for a finished render</p>
          )}
          <button type="button" data-testid="export-download-edit" onClick={props.onDownload} className="min-h-11 rounded-2xl border text-[10px] font-black uppercase tracking-widest"><Download className="mr-1 inline h-3 w-3" />Download edit file</button>
          <button type="button" onClick={props.onGallery} className="min-h-11 rounded-2xl border text-[10px] font-black uppercase tracking-widest">Add to gallery</button>
        </div>
      </div>
    </div>
  );
}

function GalleryPicker({
  getToken, outputUrl, presetId, fps, width, height, onClose, onAttached,
}: {
  getToken?: () => Promise<string | undefined>;
  outputUrl?: string;
  presetId: string;
  fps: number;
  width: number;
  height: number;
  onClose: () => void;
  onAttached: (message: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [picked, setPicked] = useState<Hit | null>(null);
  const [note, setNote] = useState("Search by property address or order number. Adding a video does not email or text the client.");
  async function search() {
    const token = await getToken?.();
    const result = await api(token, `/orders/search?q=${encodeURIComponent(query)}`);
    if (!result.ok) {
      setNote(String(result.data.error || "Order search needs a staff session."));
      setHits([]);
      return;
    }
    const found = (result.data.hits as Hit[]) || [];
    setHits(found);
    setNote(found.length ? "Pick the gallery video section. The client is not notified." : "No orders matched that address or order number.");
  }
  async function attach() {
    if (!picked || !outputUrl) return;
    const token = await getToken?.();
    const result = await api(token, "/gallery", {
      method: "POST",
      body: JSON.stringify({
        orderId: picked.orderId,
        query,
        url: outputUrl,
        storagePath: outputUrl,
        fileName: `${picked.orderNumber || picked.orderId}.mp4`.replace(/[^\w.-]+/g, "_"),
        presetId,
        jobId: picked.orderId,
        width,
        height,
        fps,
        notifyClient: false,
      }),
    });
    if (!result.ok) {
      setNote(String(result.data.error || "Could not add the video."));
      return;
    }
    const link = String(result.data.videoSectionUrl || picked.videoSectionUrl || "");
    onAttached(link ? `Added to the gallery video section. ${link}` : "Added to the gallery. The client was not notified.");
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center" role="dialog" aria-label="Add to gallery">
      <div data-testid="gallery-picker" className="w-full max-w-lg rounded-[2rem] bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-tight">Gallery video section</h2>
          <button type="button" onClick={onClose} className="min-h-11 px-3 text-[10px] font-black uppercase tracking-widest text-gray-400">Close</button>
        </div>
        <p className="text-xs text-gray-500">{note}</p>
        <div className="mt-3 flex gap-2">
          <input data-testid="gallery-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Address or order number" className="min-h-11 min-w-0 flex-1 rounded-full border px-4 text-sm" />
          <button type="button" onClick={() => void search()} className="min-h-11 rounded-full bg-black px-4 text-[10px] font-black uppercase tracking-widest text-white">Search</button>
        </div>
        <div className="mt-3 space-y-2">
          {hits.map((hit) => (
            <button key={hit.orderId} type="button" onClick={() => setPicked(hit)} className={`block w-full rounded-2xl border px-3 py-3 text-left ${picked?.orderId === hit.orderId ? "border-[#0d9488]" : "border-gray-100"}`}>
              <span className="text-sm font-black">{hit.address || "No address"}</span>
              <span className="mt-1 block text-[10px] font-bold uppercase tracking-widest text-gray-400">{hit.orderNumber || hit.orderId}</span>
              {hit.videoSectionUrl && <span className="mt-1 block text-xs text-[#0d9488]">{hit.videoSectionUrl}</span>}
            </button>
          ))}
        </div>
        <button type="button" data-testid="gallery-attach" disabled={!picked || !outputUrl} onClick={() => void attach()} className="mt-4 min-h-11 w-full rounded-2xl bg-[#0d9488] text-[10px] font-black uppercase tracking-widest text-white disabled:bg-gray-200">
          {outputUrl ? "Add video to this gallery" : "Render a file before adding it"}
        </button>
      </div>
    </div>
  );
}
