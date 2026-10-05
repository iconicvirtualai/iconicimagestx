import { useRef, useState } from "react";
import { orderExteriorTwilightPrompt } from "@shared/orderEditPlan";
import { GRASS_REFERENCE_PUBLIC_PATH, type ScratchAction } from "@shared/studioScratch";

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

const labelCls = "text-[10px] font-black uppercase tracking-widest text-gray-400";

function actionLabel(action?: string) {
  if (action === "twilight") return "Twilight";
  if (action === "grass") return "Grass";
  if (action === "revise") return "Revision";
  if (action === "edit") return "Edit";
  return "";
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
  onSelectAll,
  onRun,
  onDownload,
  onDownloadZip,
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
  onSelectAll: () => void;
  onRun: (action: ScratchAction) => void;
  onDownload: () => void;
  onDownloadZip: () => void;
  onRemove: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const focus = frames.find((frame) => frame.focused) || frames.find((frame) => frame.selected) || null;
  const selectedCount = frames.filter((frame) => frame.selected).length;
  const selectedDone = frames.filter((frame) => frame.selected && frame.afterUrl).length;
  const twilightPrompt = orderExteriorTwilightPrompt();

  const takeFiles = (list: FileList | File[] | null) => {
    const files = Array.from(list || []);
    if (files.length) onAddFiles(files);
  };

  return (
    <div
      className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_14rem]"
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
      <section className="min-w-0 space-y-4">
        <div>
          <p className="text-sm text-gray-600">
            Drop JPEGs, describe the edit, and download the results. Photos stay in this browser. Nothing is added to an order or a gallery.
          </p>
          <p className="mt-1 text-xs text-gray-400">JPEG only. RAW and HDR brackets are the next pass.</p>
        </div>

        {frames.length === 0 ? (
          <button
            type="button"
            data-testid="scratch-drop"
            onClick={() => inputRef.current?.click()}
            className={`flex min-h-[320px] w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 text-center ${
              dragOver ? "border-[#0d9488] bg-teal-50" : "border-slate-300 bg-white"
            }`}
          >
            <span className="text-sm font-black uppercase tracking-widest text-gray-900">Drop JPEGs here</span>
            <span className="mt-2 text-xs text-gray-500">or choose files. Shift-click the filmstrip to select a range.</span>
          </button>
        ) : (
          <div data-testid="scratch-viewer" className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-gray-900">{focus?.name || "No photo selected"}</p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  {selectedCount} selected{progress ? ` · ${progress}` : ""}
                  {focus?.lastAction ? ` · ${actionLabel(focus.lastAction)}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={() => inputRef.current?.click()} className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gray-600">
                  Add JPEGs
                </button>
                {focus ? (
                  <button type="button" onClick={() => onRemove(focus.id)} className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gray-600">
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
            {focus?.afterUrl ? (
              <div data-testid="scratch-compare" className="grid gap-px bg-slate-200 sm:grid-cols-2">
                <figure className="bg-neutral-950">
                  <img src={focus.beforeUrl} alt="" className="mx-auto max-h-[52vh] w-full object-contain" />
                  <figcaption className="bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gray-400">Before</figcaption>
                </figure>
                <figure className="bg-neutral-950">
                  <img src={focus.afterUrl} alt="" className="mx-auto max-h-[52vh] w-full object-contain" />
                  <figcaption className="bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gray-400">After</figcaption>
                </figure>
              </div>
            ) : (
              <figure className="bg-neutral-950">
                {focus ? <img src={focus.beforeUrl} alt="" className="mx-auto max-h-[52vh] w-full object-contain" /> : null}
                <figcaption className="bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gray-400">
                  {focus ? "No edit yet" : "Select a photo"}
                </figcaption>
              </figure>
            )}
            {focus?.status === "failed" && focus.error ? (
              <p data-testid="scratch-error" className="px-4 py-3 text-sm text-red-700">{focus.error}</p>
            ) : null}
          </div>
        )}

        <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4">
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
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="scratch-run"
              disabled={busy || selectedCount === 0}
              onClick={() => onRun("edit")}
              className="rounded-lg bg-[#0d9488] px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-40"
            >
              Run edit
            </button>
            <button
              type="button"
              data-testid="scratch-download"
              disabled={!focus?.afterUrl}
              onClick={onDownload}
              className="rounded-lg border border-slate-200 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-700 disabled:opacity-40"
            >
              Download
            </button>
            <button
              type="button"
              data-testid="scratch-download-zip"
              disabled={selectedDone === 0}
              onClick={onDownloadZip}
              className="rounded-lg border border-slate-200 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-700 disabled:opacity-40"
            >
              Download zip
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
          <p className="text-xs text-gray-500">Applies to the current result of each selected photo that already has an edit.</p>
          <button
            type="button"
            data-testid="scratch-revise"
            disabled={busy || selectedDone === 0}
            onClick={() => onRun("revise")}
            className="w-fit rounded-lg border border-slate-200 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-700 disabled:opacity-40"
          >
            Apply revision
          </button>

          <div className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
            <div>
              <button
                type="button"
                data-testid="scratch-twilight"
                disabled={busy || selectedCount === 0}
                onClick={() => onRun("twilight")}
                className="rounded-lg bg-slate-900 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-40"
              >
                Twilight
              </button>
              <p data-testid="scratch-twilight-prompt" className="mt-2 text-xs leading-relaxed text-gray-500">{twilightPrompt}</p>
            </div>
            <div>
              <button
                type="button"
                data-testid="scratch-grass"
                disabled={busy || !grassReady || selectedCount === 0}
                onClick={() => onRun("grass")}
                className="rounded-lg bg-slate-900 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-40"
              >
                Replace grass
              </button>
              {grassReady ? (
                <img
                  src={GRASS_REFERENCE_PUBLIC_PATH}
                  alt="Grass reference lawn"
                  data-testid="scratch-grass-preview"
                  className="mt-2 h-16 w-28 rounded-lg object-cover"
                />
              ) : null}
              <p data-testid="scratch-grass-note" className="mt-2 text-xs leading-relaxed text-gray-500">{grassNote}</p>
            </div>
          </div>
        </div>
      </section>

      <aside data-testid="scratch-filmstrip" className="rounded-2xl border border-slate-200 bg-white p-3 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className={labelCls}>Filmstrip</p>
          <button type="button" onClick={onSelectAll} disabled={frames.length === 0} className="text-[10px] font-black uppercase tracking-widest text-[#0d9488] disabled:opacity-40">
            All
          </button>
        </div>
        <p className="mb-3 text-[10px] leading-relaxed text-gray-400">Click to view. Shift-click a range. Ctrl-click to add.</p>
        {frames.length === 0 ? (
          <p className="text-xs text-gray-400">Dropped photos show up here. Click one to view it. Ctrl-click to multi-select.</p>
        ) : (
          <div className="grid grid-cols-4 gap-2 lg:grid-cols-1">
            {frames.map((frame) => (
              <button
                key={frame.id}
                type="button"
                data-testid={`scratch-frame-${frame.id}`}
                data-selected={frame.selected ? "true" : "false"}
                data-focused={frame.focused ? "true" : "false"}
                onClick={(event) => {
                  const mode = event.shiftKey ? "range" : event.metaKey || event.ctrlKey ? "toggle" : "replace";
                  onSelect(frame.id, mode);
                }}
                className={`overflow-hidden rounded-xl border text-left ${
                  frame.focused ? "border-black ring-2 ring-black" : frame.selected ? "border-[#0d9488] ring-2 ring-[#0d9488]" : "border-slate-200"
                }`}
              >
                <img src={frame.afterUrl || frame.beforeUrl} alt="" className="aspect-[4/3] w-full object-cover" />
                <span className="block truncate px-2 py-1 text-[10px] font-bold text-gray-600">
                  {frame.status === "editing" ? "Editing…" : frame.status === "failed" ? "Failed" : frame.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </aside>

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
