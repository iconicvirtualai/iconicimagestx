import { useEffect, useMemo, useRef, useState, type Dispatch, type DragEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type SetStateAction } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  Download,
  Eye,
  EyeOff,
  Film,
  GripVertical,
  Link2,
  Plus,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { DragGhost, DropPlaceholder, SectionDropBar, type DragGhostModel } from "@/components/gallery/DragGhost";
import { recordAddressText } from "@shared/addressText";
import {
  GALLERY_TABS,
  LISTING_KIT_SLOTS,
  ensureNamedSection,
  galleryUploadExtra,
  listingKitRefreshTodo,
  readListingKit,
  videoAspectBucket,
  videoUploadReady,
  type GalleryTabId,
  type ListingKitState,
  type VideoBrand,
} from "@shared/galleryUpload";
import {
  collectArrangementMedia,
  createSection,
  deleteSection,
  flatArrangement,
  moveIntoSection,
  moveSelection,
  placeMedia,
  readMediaArrangement,
  renameSection,
  reorderSections,
  sequenceArrangement,
  setCover,
  setItemsHidden,
  setSectionClientHidden,
  setSectionHidden,
  type MediaArrangement,
  type SequencedArrangementItem,
} from "@shared/mediaArrangement";

const TABS: Array<{ id: GalleryTabId | "audit"; label: string }> = [
  ...GALLERY_TABS,
  { id: "audit", label: "Audit log" },
];

const SCALE_KEY = "iconic-gallery-tile:";
const VIDEO_BRAND_OPTIONS: Array<{ id: VideoBrand; label: string }> = [
  { id: "branded", label: "Branded" },
  { id: "unbranded", label: "Unbranded" },
  { id: "both", label: "Both" },
  { id: "none", label: "None" },
];

const COMING_SOON_SOURCES = [
  "From camera",
  "From Dropbox",
  "From Google Drive",
  "From Google Photos",
  "From OneDrive",
  "Media Uploader",
];

type UploadResult = { id: string };

export function GalleryUploadBoard({
  project,
  userId,
  activeTab,
  onTab,
  saving = false,
  onSaveArrangement,
  onPatch,
  onUpload,
  audit,
}: {
  project: Record<string, unknown>;
  userId: string;
  activeTab: number;
  onTab: (index: number) => void;
  saving?: boolean;
  onSaveArrangement: (arrangement: MediaArrangement) => Promise<void> | void;
  onPatch: (patch: Record<string, unknown>) => Promise<void> | void;
  onUpload?: (file: File, extra: Record<string, unknown>, onProgress: (ratio: number) => void) => Promise<UploadResult | void>;
  audit?: ReactNode;
}) {
  const tab = TABS[activeTab]?.id || "photos";
  const address = recordAddressText(project) || "listing";
  const media = useMemo(() => collectArrangementMedia(project), [project]);
  const savedKey = JSON.stringify(readMediaArrangement(project.mediaArrangement));
  const [baseline, setBaseline] = useState(savedKey);
  const [draft, setDraft] = useState(() => readMediaArrangement(project.mediaArrangement));
  const [selected, setSelected] = useState<string[]>([]);
  const [anchor, setAnchor] = useState("");
  const [scale, setScale] = useState(() => readScale(userId));
  const [showHidden, setShowHidden] = useState(true);
  const [sectionName, setSectionName] = useState("");
  const [ghost, setGhost] = useState<DragGhostModel | null>(null);
  const [dropId, setDropId] = useState("");
  const [dropSection, setDropSection] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [downloadFor, setDownloadFor] = useState("");
  const [bulkDownloadOpen, setBulkDownloadOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [moveTarget, setMoveTarget] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingSection, setPendingSection] = useState("");
  const [videoName, setVideoName] = useState("");
  const [videoBrand, setVideoBrand] = useState<VideoBrand | "">("");
  const [videoUrl, setVideoUrl] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number; ratio: number } | null>(null);
  const [fileHover, setFileHover] = useState("");
  const [tourUrl, setTourUrl] = useState("");
  const [tourBrand, setTourBrand] = useState<"branded" | "unbranded">("branded");
  const [tourOpen, setTourOpen] = useState(false);
  const [floorView, setFloorView] = useState<"list" | "grid">("list");
  const [saveError, setSaveError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const stopDrag = useRef<(() => void) | null>(null);

  if (savedKey !== baseline) {
    setBaseline(savedKey);
    setDraft(readMediaArrangement(project.mediaArrangement));
  }

  useEffect(() => () => stopDrag.current?.(), []);

  const current = readMediaArrangement(draft);
  const dirty = JSON.stringify(current) !== savedKey;
  const sequenced = sequenceArrangement(media, current, address);
  const tabItems = sequenced.filter((item) => inTab(item, tab));
  const counts = {
    photos: sequenced.filter((item) => inTab(item, "photos")).length,
    videos: sequenced.filter((item) => inTab(item, "videos")).length,
    social: sequenced.filter((item) => inTab(item, "social")).length,
    tours: sequenced.filter((item) => inTab(item, "tours")).length,
    floorplans: sequenced.filter((item) => inTab(item, "floorplans")).length,
  };
  const tile = 150 + Math.round((scale / 100) * 110);
  const coverId = current.coverId || sequenced.find((item) => item.kind === "photo" && !item.hiddenFromGallery)?.id || "";
  const visibleIds = tabItems.filter((item) => showHidden || !item.hiddenFromGallery).map((item) => item.id);

  function commit(next: MediaArrangement) {
    setDraft(readMediaArrangement(next));
    setSaveError("");
  }

  async function save(next = current) {
    setSaveError("");
    try {
      await onSaveArrangement(readMediaArrangement(next));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save the gallery order.";
      setSaveError(message);
      toast.error(message);
    }
  }

  function selectAt(id: string, event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) {
    if (event.shiftKey && anchor) {
      const order = visibleIds;
      const start = order.indexOf(anchor);
      const end = order.indexOf(id);
      if (start >= 0 && end >= 0) {
        const [from, to] = start < end ? [start, end] : [end, start];
        setSelected(order.slice(from, to + 1));
        return;
      }
    }
    if (event.metaKey || event.ctrlKey) {
      setSelected((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);
      setAnchor(id);
      return;
    }
    setSelected([id]);
    setAnchor(id);
  }

  function beginPointerDrag(event: ReactPointerEvent<HTMLElement>, model: DragGhostModel & { id: string }) {
    if (event.button !== 0) return;
    const target = event.target;
    if (target instanceof Element && target.closest("button, a, input, select, textarea, label")) return;
    const originX = event.clientX;
    const originY = event.clientY;
    let dragging = false;
    let overItem = "";
    let overSection = "";
    const move = (pointer: PointerEvent) => {
      if (!dragging && Math.hypot(pointer.clientX - originX, pointer.clientY - originY) < 8) return;
      dragging = true;
      setGhost({ ...model, x: pointer.clientX, y: pointer.clientY });
      const element = document.elementFromPoint(pointer.clientX, pointer.clientY);
      overItem = element?.closest("[data-media-id]")?.getAttribute("data-media-id") || "";
      overSection = element?.closest("[data-section-id]")?.getAttribute("data-section-id") || "";
      if (model.kind === "item") setDropId(overItem && overItem !== model.id ? overItem : "");
      if (model.kind === "section") setDropSection(overSection && overSection !== model.id ? overSection : "");
    };
    const up = (pointer: PointerEvent) => {
      stopDrag.current?.();
      stopDrag.current = null;
      setGhost(null);
      setDropId("");
      setDropSection("");
      if (!dragging) {
        if (model.kind === "item") selectAt(model.id, pointer);
        return;
      }
      if (model.kind === "section" && overSection && overSection !== model.id) {
        const ids = current.sections.map((section) => section.id);
        const from = ids.indexOf(model.id);
        const to = ids.indexOf(overSection);
        if (from >= 0 && to >= 0) {
          const next = [...ids];
          const [moved] = next.splice(from, 1);
          next.splice(to, 0, moved);
          commit(reorderSections(current, next));
        }
        return;
      }
      if (model.kind !== "item") return;
      const draggingIds = selected.includes(model.id) ? selected : [model.id];
      if (overItem && !draggingIds.includes(overItem)) {
        const next = moveSelection(flatArrangement(media, current), draggingIds, overItem, "before");
        commit(placeMedia(current, next));
        return;
      }
      if (overSection) {
        const moved = moveIntoSection(media, current, draggingIds, overSection);
        if (moved.ok) commit(moved.arrangement);
        else toast.error(moved.error);
      }
    };
    stopDrag.current?.();
    stopDrag.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  async function uploadFiles(files: File[], sectionId = "") {
    const list = files.filter((file) => file.size > 0);
    if (!list.length) return;
    if (tab === "videos" || list.some((file) => file.type.startsWith("video/") || /\.(mp4|mov|m4v|webm)$/i.test(file.name))) {
      setPendingFiles(list);
      setPendingSection(sectionId);
      setVideoName(list.length === 1 ? list[0].name.replace(/\.[^.]+$/, "") : "");
      setVideoBrand("");
      setVideoUrl("");
      setLinkOpen(false);
      return;
    }
    const extra = tab === "social"
      ? { assetType: "social", type: "social" }
      : tab === "floorplans"
        ? { assetType: "floorplan", type: "floorplan" }
        : tab === "kit"
          ? { assetType: "file", type: "file" }
          : { assetType: "photo", type: "photo" };
    await sendFiles(list, extra, sectionId);
  }

  async function sendFiles(files: File[], extra: Record<string, unknown>, sectionId = "") {
    if (!onUpload) {
      toast.error("Upload is not available in this view.");
      return;
    }
    setProgress({ done: 0, total: files.length, ratio: 0 });
    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const result = await onUpload(file, extra, (ratio) => {
          setProgress({ done: index, total: files.length, ratio });
        });
        const id = result?.id || "";
        if (id && (sectionId || extra.aspectLabel)) {
          let next = readMediaArrangement(draft);
          let target = sectionId;
          if (!target && typeof extra.aspectLabel === "string") {
            const bucket = extra.aspectLabel === "9:16" ? "reels" : extra.aspectLabel === "16:9" ? "listing" : "other";
            const named = ensureNamedSection(next, bucket === "reels" ? "Reels" : bucket === "listing" ? "Listing Video" : "Other sizes");
            next = named.arrangement;
            target = named.sectionId;
          }
          if (target) {
            const moved = moveIntoSection([...media, {
              id,
              kind: extra.assetType === "floorplan" ? "floorplan" : extra.assetType === "file" ? "file" : extra.assetType === "video" ? "video" : "photo",
              name: file.name,
              path: id,
              url: "https://upload.local/pending",
              culled: false,
              bucket: "images",
              index: media.length,
            }], next, [id], target);
            if (moved.ok) {
              commit(moved.arrangement);
              await save(moved.arrangement);
            }
          }
        }
        setProgress({ done: index + 1, total: files.length, ratio: 1 });
      }
      toast.success(files.length === 1 ? "Upload saved." : `${files.length} files uploaded.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setProgress(null);
      setPendingFiles([]);
      setPendingSection("");
    }
  }

  async function confirmVideoUpload() {
    if (!videoUploadReady(videoName, videoBrand)) return;
    const extra = galleryUploadExtra({
      displayName: videoName.trim(),
      brandLabel: videoBrand,
      assetType: "video",
      type: "video",
    });
    if (videoUrl.trim()) {
      const url = videoUrl.trim();
      if (!/^https?:\/\//i.test(url)) {
        toast.error("Paste a full http(s) link.");
        return;
      }
      const videos = Array.isArray(project.videos) ? project.videos : [];
      await onPatch({
        videos: [...videos, {
          id: `video-${Date.now().toString(36)}`,
          url,
          name: videoName.trim(),
          brandLabel: videoBrand,
          assetType: "video",
          type: "video",
          contentType: "video/mp4",
          hiddenFromGallery: false,
        }],
      });
      setPendingFiles([]);
      setVideoUrl("");
      toast.success("Video link saved.");
      return;
    }
    let aspect = "";
    let width = 0;
    let height = 0;
    if (!pendingSection && pendingFiles[0]) {
      const measured = await measureVideo(pendingFiles[0]);
      width = measured.width;
      height = measured.height;
      aspect = videoAspectBucket(width, height).label;
    }
    await sendFiles(pendingFiles, { ...extra, ...(width ? { width, height, aspectLabel: aspect } : {}) }, pendingSection);
  }

  async function removeSelected() {
    const ids = new Set(selected);
    const drop = (rows: unknown) => Array.isArray(rows)
      ? rows.filter((row, index) => {
        if (!row || typeof row !== "object") return true;
        const record = row as Record<string, unknown>;
        const id = String(record.id || record.path || record.url || "");
        return !ids.has(id);
      })
      : undefined;
    const patch: Record<string, unknown> = {};
    for (const key of ["images", "videos", "floorplans", "floorPlans", "files", "socialAssets", "tours"]) {
      const next = drop(project[key]);
      if (next) patch[key] = next;
    }
    if (ids.has("tourUrl") || ids.has(String(project.tourUrl || ""))) patch.tourUrl = null;
    await onPatch(patch);
    setSelected([]);
    setConfirmDelete(false);
    toast.success(`${ids.size} deleted.`);
  }

  function hiddenItems() {
    return tabItems.filter((item) => item.hiddenFromGallery);
  }

  const groups = groupsFor(tab, tabItems, current, showHidden);
  const noun = tab === "videos" ? "clips" : tab === "tours" ? "links" : tab === "kit" ? "files" : "files";
  const count = tab === "audit" ? 0 : tabItems.length;

  return (
    <div data-testid="gallery-upload-board" className="text-[#1a1d1c]">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7a8480]">Real estate project</p>
          <p data-testid="project-address" className="text-sm font-medium text-[#3d4442]">
            <span className="font-semibold text-[#0e8a76]">{address}</span>
            {project.mlsNumber ? ` · MLS# ${String(project.mlsNumber)}` : ""}
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-[#e6e9e7] bg-white px-3 py-1.5 text-xs font-semibold text-[#3d4442]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#2ecc71] shadow-[0_0_0_3px_rgba(46,204,113,.18)]" />
          Draft gallery
        </span>
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto rounded-2xl bg-[#ebeeec] p-1" data-testid="gallery-tabs">
        {TABS.map((item, index) => {
          const badge = item.id === "audit" || item.id === "kit" ? null : counts[item.id];
          const active = activeTab === index;
          return (
            <button
              key={item.id}
              type="button"
              data-testid={`gallery-tab-${item.id}`}
              onClick={() => { setSelected([]); onTab(index); }}
              className={`inline-flex shrink-0 items-center gap-2 rounded-[10px] px-3.5 py-2 text-[13px] font-semibold ${active ? "bg-white text-[#1a1d1c] shadow-sm" : "text-[#3d4442]"}`}
            >
              {item.label}
              {badge != null && (
                <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${active ? "bg-[#e6f6f2] text-[#0e8a76]" : "bg-white/70 text-[#7a8480]"}`}>{badge}</span>
              )}
            </button>
          );
        })}
      </div>

      {tab === "audit" ? (
        <div className="rounded-2xl border border-[#e6e9e7] bg-white p-6">{audit}</div>
      ) : tab === "kit" ? (
        <ListingKitPanel
          project={project}
          showHidden={showHidden}
          onShowHidden={setShowHidden}
          dirty={dirty}
          saving={saving}
          onSave={() => void save()}
          onPatch={onPatch}
          items={tabItems}
          selected={selected}
          onSelect={(id, event) => selectAt(id, event)}
          onToggleHidden={(id) => commit(setItemsHidden(current, [id], !tabItems.find((item) => item.id === id)?.hiddenFromGallery))}
          onDelete={(id) => { setSelected([id]); setConfirmDelete(true); }}
          onUploadFiles={(files) => void uploadFiles(files)}
        />
      ) : (
        <>
          <div className="sticky top-0 z-30 mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-[#e6e9e7]/90 bg-[#f5f6f5]/90 px-3 py-2.5 backdrop-blur">
            <p className="min-w-[120px] text-[13px] font-semibold">
              {TABS.find((item) => item.id === tab)?.label}
              <span className="font-medium text-[#7a8480]"> · {count} {noun}</span>
            </p>
            {tab !== "tours" && (
              <label className="inline-flex items-center gap-2 rounded-full border border-[#e6e9e7] bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#7a8480]">
                Size
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={scale}
                  aria-label="Thumbnail size"
                  data-testid="gallery-size"
                  className="h-1 w-24 accent-[#14a08a]"
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setScale(next);
                    window.localStorage.setItem(`${SCALE_KEY}${userId || "staff"}`, String(next));
                  }}
                />
              </label>
            )}
            {tab === "floorplans" && (
              <>
                <button type="button" className={`rounded-full px-3 py-1.5 text-xs font-semibold ${floorView === "list" ? "bg-[#eef1ef]" : "bg-white"}`} onClick={() => setFloorView("list")}>List</button>
                <button type="button" className={`rounded-full px-3 py-1.5 text-xs font-semibold ${floorView === "grid" ? "bg-[#eef1ef]" : "bg-white"}`} onClick={() => setFloorView("grid")}>Grid</button>
              </>
            )}
            <button type="button" data-testid="gallery-select-all" className="rounded-full border border-[#e6e9e7] bg-white px-3 py-1.5 text-xs font-semibold" onClick={() => setSelected(visibleIds)}>
              Select all
            </button>
            <button
              type="button"
              data-testid="gallery-show-hidden"
              aria-pressed={showHidden}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${showHidden ? "border-[#b7e4da] bg-[#e6f6f2] text-[#0e8a76]" : "border-[#e6e9e7] bg-white text-[#3d4442]"}`}
              onClick={() => setShowHidden((value) => !value)}
            >
              {showHidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              Show hidden
            </button>
            <div className="flex-1" />
            {tab === "videos" && (
              <div className="relative">
                <button type="button" data-testid="gallery-add-media" className="inline-flex items-center gap-1 rounded-full bg-[#14a08a] px-3 py-1.5 text-xs font-semibold text-white" onClick={() => setAddOpen((open) => !open)}>
                  <Plus className="h-3.5 w-3.5" /> Add media
                </button>
                {addOpen && (
                  <div className="absolute right-0 z-40 mt-2 w-64 rounded-2xl border border-[#e6e9e7] bg-white p-2 shadow-xl" data-testid="gallery-add-menu">
                    <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-[#7a8480]">Upload from</p>
                    <button type="button" className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm hover:bg-[#f5f6f5]" onClick={() => { setAddOpen(false); fileRef.current?.click(); }}>From device</button>
                    <button type="button" className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm hover:bg-[#f5f6f5]" onClick={() => { setAddOpen(false); setLinkOpen(true); setPendingFiles([]); setVideoName(""); setVideoBrand(""); }}>From link</button>
                    {COMING_SOON_SOURCES.map((label) => (
                      <button key={label} type="button" disabled className="flex w-full cursor-not-allowed items-center justify-between gap-2 rounded-xl px-2 py-2 text-left text-sm text-[#a3aba8]">
                        {label}
                        <span className="rounded-full bg-[#eef1ef] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">Coming soon</span>
                      </button>
                    ))}
                    <p className="px-2 py-2 text-[11px] text-[#7a8480]">Drag and drop onto the box below. That path is live.</p>
                  </div>
                )}
              </div>
            )}
            {tab === "tours" && (
              <button type="button" className="inline-flex items-center gap-1 rounded-full bg-[#14a08a] px-3 py-1.5 text-xs font-semibold text-white" onClick={() => setTourOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Add tour link
              </button>
            )}
            {dirty && <span data-testid="gallery-unsaved" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#b07a1a] before:h-1.5 before:w-1.5 before:rounded-full before:bg-[#e0a12b] before:shadow-[0_0_0_3px_rgba(224,161,43,.18)] before:content-['']">Unsaved changes</span>}
            <button type="button" data-testid="gallery-save" disabled={!dirty || saving} className="rounded-full bg-[#1a1d1c] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40" onClick={() => void save()}>
              {saving ? "Saving" : "Save order"}
            </button>
          </div>

          <div
            data-testid="gallery-drop"
            onDragOver={(event) => { if (hasFiles(event)) { event.preventDefault(); setFileHover("main"); } }}
            onDragLeave={() => setFileHover("")}
            onDrop={(event) => {
              if (!hasFiles(event)) return;
              event.preventDefault();
              setFileHover("");
              void uploadFiles(Array.from(event.dataTransfer.files));
            }}
            className={`mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-dashed bg-white px-4 py-3 ${fileHover === "main" ? "border-[#14a08a]" : "border-[#c9d5d1]"}`}
          >
            <div className="grid h-9 w-9 place-items-center rounded-[10px] bg-[#e6f6f2] text-[#0e8a76]"><Upload className="h-4 w-4" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold">
                {dropTitle(tab)} <button type="button" className="text-[#0e8a76]" onClick={() => fileRef.current?.click()}>browse</button>
              </p>
              <p className="text-xs text-[#7a8480]">{dropHint(tab)}</p>
            </div>
            {progress && (
              <div className="w-40">
                <div className="mb-1 flex justify-between text-[11px] text-[#7a8480]">
                  <span>Uploading {Math.min(progress.done + 1, progress.total)} of {progress.total}</span>
                  <span>{Math.round(progress.ratio * 100)}%</span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-[#e6e9e7]">
                  <div className="h-full bg-[#14a08a]" style={{ width: `${Math.round(progress.ratio * 100)}%` }} />
                </div>
              </div>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            accept={acceptFor(tab)}
            onChange={(event) => {
              const files = Array.from(event.target.files || []);
              event.target.value = "";
              void uploadFiles(files);
            }}
          />

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[#7a8480]">
            <p>{hintFor(tab)}</p>
            <div className="flex items-center gap-2">
              <input
                value={sectionName}
                data-testid="gallery-section-name"
                placeholder="New section name"
                maxLength={60}
                onChange={(event) => setSectionName(event.target.value)}
                className="h-9 rounded-full border border-[#e6e9e7] bg-white px-3 text-sm text-[#1a1d1c] outline-none"
              />
              <button
                type="button"
                data-testid="gallery-section-create"
                className="h-9 rounded-full bg-[#14a08a] px-3 text-xs font-semibold text-white"
                onClick={() => {
                  const created = createSection(current, sectionName, selected);
                  if (created.ok === false) toast.error(created.error);
                  else {
                    commit(created.arrangement);
                    setSectionName("");
                  }
                }}
              >
                Create section
              </button>
            </div>
          </div>
          {saveError && <p className="mb-3 text-sm font-semibold text-red-600">{saveError}</p>}

          <div className="space-y-6">
            {groups.map((group) => {
              const hiddenSection = group.section?.hideFromClientGallery === true;
              if (!showHidden && hiddenSection) return null;
              const items = group.items.filter((item) => showHidden || !item.hiddenFromGallery);
              if (!showHidden && items.length === 0 && group.id !== "loose") return null;
              return (
                <section
                  key={group.id || "loose"}
                  data-section-id={group.section?.id || ""}
                  data-testid={group.section ? `gallery-section-${group.section.id}` : "gallery-section-loose"}
                  className={hiddenSection ? "opacity-70" : ""}
                  onDragOver={(event) => { if (hasFiles(event)) { event.preventDefault(); setFileHover(group.section?.id || "loose"); } }}
                  onDrop={(event) => {
                    if (!hasFiles(event)) return;
                    event.preventDefault();
                    event.stopPropagation();
                    setFileHover("");
                    void uploadFiles(Array.from(event.dataTransfer.files), group.section?.id || "");
                  }}
                >
                  {ghost?.kind === "section" && dropSection && dropSection === group.section?.id && (
                    <SectionDropBar label={`Drop section here`} />
                  )}
                  <div className="mb-3 flex items-center gap-2 rounded-xl px-1 py-1">
                    {group.section && (
                      <button
                        type="button"
                        aria-label={`Drag ${group.name}`}
                        className="grid h-7 w-7 cursor-grab place-items-center rounded-lg text-[#aab2ae]"
                        onPointerDown={(event) => beginPointerDrag(event, {
                          id: group.section!.id,
                          kind: "section",
                          title: group.name,
                          subtitle: `${group.items.length} files`,
                          x: event.clientX,
                          y: event.clientY,
                        })}
                      >
                        <GripVertical className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button type="button" className="text-[#7a8480]" aria-label={collapsed[group.id] ? "Expand section" : "Collapse section"} onClick={() => setCollapsed((state) => ({ ...state, [group.id]: !state[group.id] }))}>
                      <ChevronDown className={`h-3.5 w-3.5 transition ${collapsed[group.id] ? "-rotate-90" : ""}`} />
                    </button>
                    <span className="inline-flex items-center gap-2 rounded-full border border-[#e6e9e7] bg-white px-3 py-1 text-[13px] font-semibold shadow-sm">
                      <span className={`h-2 w-2 rounded-full ${group.dot}`} />
                      {group.section ? (
                        <input
                          value={group.name}
                          aria-label={`Rename ${group.name}`}
                          maxLength={60}
                          onChange={(event) => {
                            const renamed = renameSection(current, group.section!.id, event.target.value);
                            if (renamed.ok) commit(renamed.arrangement);
                          }}
                          className="w-36 bg-transparent text-[13px] font-semibold outline-none"
                        />
                      ) : group.name}
                      <span className="rounded-full bg-[#f0f2f1] px-1.5 text-[11px] font-semibold text-[#7a8480]">{items.length}</span>
                    </span>
                    {group.section && <span className="text-[11px] text-[#aab2ae]">Drag sections to reorder</span>}
                    <div className="ml-auto flex items-center gap-1">
                      {group.section && (
                        <>
                          <button
                            type="button"
                            title="Hide section from the client gallery"
                            aria-pressed={group.section.hideFromClientGallery}
                            className={`grid h-7 w-7 place-items-center rounded-lg ${group.section.hideFromClientGallery ? "bg-[#e6f6f2] text-[#0e8a76]" : "text-[#7a8480]"}`}
                            onClick={() => {
                              const next = setSectionClientHidden(current, group.section!.id, !group.section!.hideFromClientGallery);
                              if (next.ok) commit(next.arrangement);
                            }}
                          >
                            {group.section.hideFromClientGallery ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                          </button>
                          <button
                            type="button"
                            aria-pressed={group.section.hideFromListingSites}
                            aria-label={group.section.hideFromListingSites ? "Hidden on listing presentation websites" : "Hide from listing presentation websites"}
                            title="Hide from listing presentation websites"
                            className={`rounded-full px-2 py-1 text-[10px] font-semibold ${group.section.hideFromListingSites ? "bg-black text-white" : "text-[#7a8480]"}`}
                            onClick={() => {
                              const next = setSectionHidden(current, group.section!.id, !group.section!.hideFromListingSites);
                              if (next.ok) commit(next.arrangement);
                            }}
                          >
                            Sites
                          </button>
                          <button type="button" className="grid h-7 w-7 place-items-center rounded-lg text-red-500" aria-label={`Delete ${group.name}`} onClick={() => {
                            const next = deleteSection(current, group.section!.id);
                            if (next.ok) commit(next.arrangement);
                            else toast.error(next.error);
                          }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {!collapsed[group.id] && (
                    tab === "tours" ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        {items.map((item) => (
                          <TourCard
                            key={item.id}
                            item={item}
                            selected={selected.includes(item.id)}
                            onPointerDown={(event) => beginPointerDrag(event, ghostModel(item, event))}
                            onCopy={() => { void navigator.clipboard.writeText(item.url); toast.success("Link copied."); }}
                            onHide={() => commit(setItemsHidden(current, [item.id], !item.hiddenFromGallery))}
                            onDelete={() => { setSelected([item.id]); setConfirmDelete(true); }}
                          />
                        ))}
                        {items.length === 0 && <p className="text-xs text-[#7a8480]">No links in this section yet.</p>}
                      </div>
                    ) : tab === "floorplans" && floorView === "list" ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        {items.map((item) => (
                          <FileCard
                            key={item.id}
                            item={item}
                            selected={selected.includes(item.id)}
                            onPointerDown={(event) => beginPointerDrag(event, ghostModel(item, event))}
                            onHide={() => commit(setItemsHidden(current, [item.id], !item.hiddenFromGallery))}
                            onDelete={() => { setSelected([item.id]); setConfirmDelete(true); }}
                            onDownload={(mode) => void downloadItem(item, mode)}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${tab === "videos" && group.name === "Reels" ? Math.round(tile * 0.62) : tile}px, 1fr))` }}>
                        {items.map((item) => (
                          <FragmentTile
                            key={item.id}
                            item={item}
                            portrait={item.aspectLabel === "9:16" || item.kind === "video" && group.name === "Reels"}
                            selected={selected.includes(item.id)}
                            cover={item.id === coverId && item.kind === "photo"}
                            drop={dropId === item.id}
                            downloadOpen={downloadFor === item.id}
                            onPointerDown={(event) => beginPointerDrag(event, ghostModel(item, event))}
                            onCover={() => commit(setCover(current, item.id))}
                            onHide={() => commit(setItemsHidden(current, [item.id], !item.hiddenFromGallery))}
                            onDelete={() => { setSelected([item.id]); setConfirmDelete(true); }}
                            onDownloadOpen={() => setDownloadFor(downloadFor === item.id ? "" : item.id)}
                            onDownload={(mode) => { setDownloadFor(""); void downloadItem(item, mode); }}
                          />
                        ))}
                      </div>
                    )
                  )}
                </section>
              );
            })}
          </div>

          {showHidden && hiddenItems().length > 0 && (
            <div className="mt-4 rounded-2xl border border-dashed border-[#cfd5d2] bg-[#fafbfa] p-4" data-testid="gallery-archived">
              <h3 className="mb-3 text-[13px] font-semibold text-[#7a8480]">Archived / hidden · {hiddenItems().length} · Not shown on client gallery</h3>
              <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${tile}px, 1fr))` }}>
                {hiddenItems().map((item) => (
                  <FragmentTile
                    key={`archived-${item.id}`}
                    item={item}
                    selected={selected.includes(item.id)}
                    cover={false}
                    drop={false}
                    downloadOpen={false}
                    onPointerDown={(event) => beginPointerDrag(event, ghostModel(item, event))}
                    onCover={() => commit(setCover(current, item.id))}
                    onHide={() => commit(setItemsHidden(current, [item.id], false))}
                    onDelete={() => { setSelected([item.id]); setConfirmDelete(true); }}
                    onDownloadOpen={() => undefined}
                    onDownload={(mode) => void downloadItem(item, mode)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {selected.length > 0 && tab !== "audit" && tab !== "kit" && (
        <div data-testid="gallery-bulk" className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#1a1d1c]/95 px-3 py-2 text-white shadow-2xl">
          <span className="grid h-6 min-w-6 place-items-center rounded-full bg-[#14a08a] px-2 text-xs font-bold">{selected.length}</span>
          <span className="text-[13px]">selected</span>
          <select
            aria-label="Move to section"
            value={moveTarget}
            onChange={(event) => {
              const target = event.target.value;
              setMoveTarget(target);
              const moved = moveIntoSection(media, current, selected, target);
              if (moved.ok) commit(moved.arrangement);
              else toast.error(moved.error);
            }}
            className="h-8 rounded-full bg-white/10 px-2 text-xs font-semibold text-white"
          >
            <option value="">Move to section…</option>
            {current.sections.map((section) => <option key={section.id} value={section.id} className="text-black">{section.name}</option>)}
          </select>
          <button type="button" className="h-8 rounded-full bg-[#14a08a] px-3 text-xs font-semibold" onClick={() => {
            const photo = selected.find((id) => sequenced.find((item) => item.id === id)?.kind === "photo");
            if (!photo) { toast.error("Choose a photo to set as the cover."); return; }
            commit(setCover(current, photo));
          }}>Set cover</button>
          <div className="relative">
            <button type="button" className="h-8 rounded-full bg-[#14a08a] px-3 text-xs font-semibold" onClick={() => setBulkDownloadOpen((open) => !open)}>Download · High / Web</button>
            {bulkDownloadOpen && (
              <div className="absolute bottom-10 left-0 w-40 rounded-xl bg-white p-2 text-[#1a1d1c] shadow-xl">
                <button type="button" className="block w-full rounded-lg px-2 py-1.5 text-left text-xs font-semibold" onClick={() => { setBulkDownloadOpen(false); void downloadMany(selectedItems(sequenced, selected), "high"); }}>High res</button>
                <button type="button" className="block w-full rounded-lg px-2 py-1.5 text-left text-xs font-semibold" onClick={() => { setBulkDownloadOpen(false); void downloadMany(selectedItems(sequenced, selected), "web"); }}>Web res</button>
              </div>
            )}
          </div>
          <button type="button" className="h-8 rounded-full bg-white/10 px-3 text-xs font-semibold" onClick={() => commit(setItemsHidden(current, selected, true))}>Hide</button>
          <button type="button" data-testid="gallery-bulk-delete" className="h-8 rounded-full bg-white/10 px-3 text-xs font-semibold text-[#ffb4b4]" onClick={() => setConfirmDelete(true)}>Delete</button>
          <button type="button" aria-label="Clear selection" className="grid h-8 w-8 place-items-center rounded-full bg-white/10" onClick={() => setSelected([])}><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/40 p-4" role="dialog" aria-label="Confirm delete">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold">Delete {selected.length} {selected.length === 1 ? "item" : "items"}?</h3>
            <p className="mt-1 text-sm text-[#7a8480]">This removes the files from the project gallery. The client gallery stops showing them.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-full border border-[#e6e9e7] px-3 py-1.5 text-xs font-semibold" onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button type="button" data-testid="gallery-delete-confirm" className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white" onClick={() => void removeSelected()}>Delete {selected.length}</button>
            </div>
          </div>
        </div>
      )}

      {(pendingFiles.length > 0 || linkOpen) && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/45 p-4" role="dialog" aria-label="Label this video">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold">Label this video</h3>
            <p className="mt-1 text-xs text-[#7a8480]">
              Required before the upload can finish{pendingFiles[0] ? ` · file: ${pendingFiles[0].name}` : ""}
            </p>
            {!videoUploadReady(videoName, videoBrand) && (
              <p data-testid="video-upload-blocked" className="mt-3 text-xs font-semibold text-red-500">Name and a brand label are required</p>
            )}
            <label className="mt-4 block text-[11px] font-semibold text-[#7a8480]">File name</label>
            <input value={videoName} onChange={(event) => setVideoName(event.target.value)} placeholder="e.g. 801-River-Twilight-Reel" className="mt-1 w-full rounded-xl border border-red-100 px-3 py-2 text-sm outline-none focus:border-[#14a08a]" />
            {linkOpen && (
              <>
                <label className="mt-3 block text-[11px] font-semibold text-[#7a8480]">Video link</label>
                <input value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} placeholder="https://" className="mt-1 w-full rounded-xl border border-[#e6e9e7] px-3 py-2 text-sm outline-none" />
              </>
            )}
            <p className="mb-2 mt-3 text-[11px] font-semibold text-[#7a8480]">Brand label</p>
            <div className="flex flex-wrap gap-2">
              {VIDEO_BRAND_OPTIONS.map((option) => (
                <button key={option.id} type="button" onClick={() => setVideoBrand(option.id)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${videoBrand === option.id ? "border-[#14a08a] bg-[#e6f6f2] text-[#0e8a76]" : "border-[#e6e9e7]"}`}>
                  {option.label}
                </button>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="rounded-full border border-[#e6e9e7] px-3 py-1.5 text-xs font-semibold" onClick={() => { setPendingFiles([]); setLinkOpen(false); }}>Cancel upload</button>
              <button
                type="button"
                data-testid="video-upload-go"
                disabled={!videoUploadReady(videoName, videoBrand) || (linkOpen && !videoUrl.trim() && pendingFiles.length === 0)}
                className="rounded-full bg-[#1a1d1c] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                onClick={() => void confirmVideoUpload()}
              >
                {videoUploadReady(videoName, videoBrand) ? "Upload" : "Upload blocked"}
              </button>
            </div>
          </div>
        </div>
      )}

      {tourOpen && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/45 p-4" role="dialog" aria-label="Add tour link">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold">Add a 3D tour link</h3>
            <input value={tourUrl} onChange={(event) => setTourUrl(event.target.value)} placeholder="https://my.matterport.com/show/?m=" className="mt-3 w-full rounded-xl border border-[#e6e9e7] px-3 py-2 text-sm outline-none" />
            <div className="mt-3 flex gap-2">
              <button type="button" className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${tourBrand === "branded" ? "border-[#14a08a] bg-[#e6f6f2]" : "border-[#e6e9e7]"}`} onClick={() => setTourBrand("branded")}>Branded</button>
              <button type="button" className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${tourBrand === "unbranded" ? "border-[#14a08a] bg-[#e6f6f2]" : "border-[#e6e9e7]"}`} onClick={() => setTourBrand("unbranded")}>Unbranded</button>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-full border border-[#e6e9e7] px-3 py-1.5 text-xs font-semibold" onClick={() => setTourOpen(false)}>Cancel</button>
              <button type="button" className="rounded-full bg-[#14a08a] px-3 py-1.5 text-xs font-semibold text-white" onClick={() => void addTour()}>Save link</button>
            </div>
          </div>
        </div>
      )}

      <DragGhost ghost={ghost} />
    </div>
  );

  async function addTour() {
    const url = tourUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      toast.error("Paste a full http(s) tour link.");
      return;
    }
    const tours = Array.isArray(project.tours) ? [...project.tours] : [];
    const id = `tour-${Date.now().toString(36)}`;
    tours.push({
      id,
      url,
      name: tourBrand === "branded" ? "Matterport — Branded" : "Matterport — Unbranded",
      type: "tour",
      brandLabel: tourBrand,
      hiddenFromGallery: false,
    });
    const named = ensureNamedSection(current, tourBrand === "branded" ? "Branded tour links" : "Unbranded tour links");
    const withMedia = [...media, {
      id,
      kind: "tour" as const,
      name: tourBrand,
      path: "",
      url,
      culled: false,
      bucket: "tours",
      index: media.length,
    }];
    const moved = moveIntoSection(withMedia, named.arrangement, [id], named.sectionId);
    await onPatch({ tours });
    if (moved.ok) {
      commit(moved.arrangement);
      await save(moved.arrangement);
    }
    setTourUrl("");
    setTourOpen(false);
    toast.success("Tour link saved.");
  }
}

function FragmentTile({
  item, selected, cover, drop, portrait, downloadOpen, onPointerDown, onCover, onHide, onDelete, onDownloadOpen, onDownload,
}: {
  item: SequencedArrangementItem;
  selected: boolean;
  cover: boolean;
  drop: boolean;
  portrait?: boolean;
  downloadOpen: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onCover: () => void;
  onHide: () => void;
  onDelete: () => void;
  onDownloadOpen: () => void;
  onDownload: (mode: "high" | "web") => void;
}) {
  return (
    <>
      {drop && <DropPlaceholder />}
      <article
        data-testid={`gallery-media-${item.id}`}
        data-media-id={item.id}
        data-selected={selected ? "true" : "false"}
        onPointerDown={onPointerDown}
        className={`group relative cursor-grab overflow-hidden rounded-2xl bg-[#dde3e0] shadow-sm ${portrait ? "aspect-[9/16]" : "aspect-[4/3]"} ${selected ? "outline outline-2 outline-offset-2 outline-[#14a08a]" : ""} ${item.hiddenFromGallery ? "brightness-90 grayscale-[.35]" : ""}`}
        style={{ touchAction: "none" }}
      >
        {item.url && (item.kind === "photo" || item.kind === "floorplan" || item.kind === "video") ? (
          item.kind === "video" && !/\.(jpe?g|png|webp|gif)(\?|#|$)/i.test(item.url) ? (
            <video src={item.url} className="h-full w-full object-cover" muted playsInline />
          ) : (
            <img src={item.url} alt={item.name} draggable={false} className="h-full w-full object-cover" />
          )
        ) : (
          <div className="grid h-full place-items-center text-[10px] font-bold uppercase tracking-widest text-[#7a8480]">{item.kind}</div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/50 opacity-0 group-hover:opacity-100" />
        {item.hiddenFromGallery && <span className="absolute left-2 top-2 z-[2] rounded-full bg-black/80 px-2 py-1 text-[10px] font-bold text-white">Hidden from gallery</span>}
        {(item.brandLabel || item.aspectLabel || item.platform) && (
          <div className={`absolute left-2 z-[2] flex flex-wrap gap-1 ${item.hiddenFromGallery ? "top-9" : "top-2"}`}>
            {item.platform && <span className="rounded-full bg-[#14a08a] px-2 py-0.5 text-[10px] font-bold text-white">{item.platform}</span>}
            {item.aspectLabel && <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-[#1a1d1c]">{item.aspectLabel}</span>}
            {item.brandLabel && <span className="rounded-full bg-[#14a08a] px-2 py-0.5 text-[10px] font-bold text-white">{item.brandLabel}</span>}
          </div>
        )}
        {item.kind === "video" && <span className="pointer-events-none absolute inset-0 m-auto grid h-11 w-11 place-items-center rounded-full bg-white/90 text-[#1a1d1c]"><Film className="h-4 w-4" /></span>}
        <span className={`absolute left-2 top-2 grid h-5 w-5 place-items-center rounded-md border border-white/80 text-white ${selected ? "border-[#14a08a] bg-[#14a08a] opacity-100" : "bg-white/20 opacity-0 group-hover:opacity-100"} ${item.hiddenFromGallery ? "top-9" : ""}`}>
          {selected && <Check className="h-3 w-3" />}
        </span>
        <div className="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100">
          {item.kind === "photo" && (
            <button type="button" title="Cover" className={`grid h-7 w-7 place-items-center rounded-lg bg-white/90 ${cover ? "text-[#0e8a76]" : "text-[#3d4442]"}`} onClick={onCover}><Star className="h-3.5 w-3.5" /></button>
          )}
          <button type="button" title="Download" className="grid h-7 w-7 place-items-center rounded-lg bg-white/90" onClick={onDownloadOpen}><Download className="h-3.5 w-3.5" /></button>
          <button type="button" title="Hide" className="grid h-7 w-7 place-items-center rounded-lg bg-white/90" onClick={onHide}><EyeOff className="h-3.5 w-3.5" /></button>
          <button type="button" title="Remove" className="grid h-7 w-7 place-items-center rounded-lg bg-white/90 text-red-500" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
        {downloadOpen && (
          <div className="absolute right-2 top-11 z-10 w-36 rounded-xl bg-white p-2 text-[#1a1d1c] shadow-xl">
            <p className="px-1 text-[10px] font-bold uppercase tracking-widest text-[#7a8480]">Download</p>
            <button type="button" className="flex w-full justify-between rounded-lg px-1 py-1 text-left text-xs font-semibold" onClick={() => onDownload("high")}>High res <span className="text-[#7a8480]">Full</span></button>
            <button type="button" className="flex w-full justify-between rounded-lg px-1 py-1 text-left text-xs font-semibold" onClick={() => onDownload("web")}>Web res <span className="text-[#7a8480]">{item.webUrl ? "Stored" : "2048px"}</span></button>
          </div>
        )}
        {cover && <span className="absolute bottom-10 left-2 inline-flex items-center gap-1 rounded-full bg-[#14a08a] px-2 py-1 text-[10px] font-bold uppercase text-white"><Star className="h-3 w-3" /> Cover</span>}
        <div className="absolute inset-x-3 bottom-2 translate-y-1 opacity-0 group-hover:translate-y-0 group-hover:opacity-100">
          <p className="truncate text-xs font-semibold text-white">{item.name}</p>
          {item.deliveryName && <p className="truncate text-[11px] text-white/80">{item.deliveryName}</p>}
          {item.caption && <p className="truncate text-[11px] text-white/80">{item.caption}</p>}
        </div>
      </article>
    </>
  );
}

function TourCard({
  item, selected, onPointerDown, onCopy, onHide, onDelete,
}: {
  item: SequencedArrangementItem;
  selected: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onCopy: () => void;
  onHide: () => void;
  onDelete: () => void;
}) {
  const label = `${item.brandLabel || ""} ${item.name || ""}`.toLowerCase();
  const unbranded = label.includes("unbranded");
  const branded = !unbranded && (item.brandLabel === "branded" || label.includes("branded"));
  return (
    <article
      data-media-id={item.id}
      data-selected={selected ? "true" : "false"}
      onPointerDown={onPointerDown}
      className={`flex gap-3 rounded-2xl border bg-white p-4 ${selected ? "border-[#14a08a] outline outline-2 outline-[#14a08a]" : "border-[#e6e9e7]"} ${item.hiddenFromGallery ? "border-dashed opacity-60" : ""}`}
      style={{ touchAction: "none" }}
    >
      <div className="grid h-14 w-[72px] shrink-0 place-items-center rounded-[10px] bg-gradient-to-br from-[#1a1d1c] to-[#14a08a] text-[11px] font-extrabold text-white">3D</div>
      <div className="min-w-0 flex-1">
        <h4 className="text-sm font-semibold">{item.name || (branded ? "Matterport — Branded" : "Matterport — Unbranded")}</h4>
        <p className="text-xs text-[#7a8480]">{branded ? "Branded tour link" : "Unbranded tour link"} · MLS-safe copy</p>
        <div className="mt-2 flex items-center gap-2 rounded-[10px] border border-[#e6e9e7] bg-[#f5f6f5] px-2 py-1.5">
          <Link2 className="h-3.5 w-3.5 shrink-0 text-[#7a8480]" />
          <input readOnly value={item.url} className="min-w-0 flex-1 bg-transparent text-xs outline-none" />
          <button type="button" className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[11px] font-semibold" onClick={onCopy}><Copy className="h-3 w-3" /> Copy</button>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <button type="button" aria-label="Hide tour" onClick={onHide}><EyeOff className="h-3.5 w-3.5 text-[#7a8480]" /></button>
        <button type="button" aria-label="Remove tour" onClick={onDelete}><Trash2 className="h-3.5 w-3.5 text-red-500" /></button>
      </div>
    </article>
  );
}

function FileCard({
  item, selected, onPointerDown, onHide, onDelete, onDownload,
}: {
  item: SequencedArrangementItem;
  selected: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onHide: () => void;
  onDelete: () => void;
  onDownload: (mode: "high" | "web") => void;
}) {
  const pdf = /\.pdf(\?|#|$)/i.test(item.name) || item.assetType === "pdf";
  return (
    <article
      data-media-id={item.id}
      onPointerDown={onPointerDown}
      className={`rounded-2xl border bg-white p-4 ${selected ? "outline outline-2 outline-[#14a08a]" : "border-[#e6e9e7]"} ${item.hiddenFromGallery ? "border-dashed opacity-60" : ""}`}
      style={{ touchAction: "none" }}
    >
      <div className="flex items-start gap-3">
        {item.kind === "floorplan" && !pdf && item.url ? (
          <img src={item.url} alt="" className="h-14 w-[72px] rounded-[10px] object-cover" />
        ) : (
          <div className={`grid h-11 w-11 place-items-center rounded-xl text-[11px] font-extrabold ${pdf ? "bg-red-50 text-red-600" : "bg-[#e6f6f2] text-[#0e8a76]"}`}>{pdf ? "PDF" : "IMG"}</div>
        )}
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-sm font-semibold">{item.name}</h4>
          <p className="text-xs text-[#7a8480]">{item.hiddenFromGallery ? "Hidden from gallery" : "Show on gallery"} · {item.deliveryName || item.kind}</p>
          <div className="mt-2 w-40 rounded-xl border border-[#e6e9e7] bg-white p-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#7a8480]">Download</p>
            <button type="button" className="flex w-full justify-between py-1 text-left text-xs font-semibold" onClick={() => onDownload("high")}>High res <span className="text-[#7a8480]">Full</span></button>
            <button type="button" className="flex w-full justify-between py-1 text-left text-xs font-semibold" onClick={() => onDownload("web")}>Web res <span className="text-[#7a8480]">{item.webUrl ? "Stored" : "2048px"}</span></button>
          </div>
        </div>
        <button type="button" aria-label="Hide file" onClick={onHide}><EyeOff className="h-3.5 w-3.5 text-[#7a8480]" /></button>
        <button type="button" aria-label="Remove file" onClick={onDelete}><Trash2 className="h-3.5 w-3.5 text-red-500" /></button>
      </div>
    </article>
  );
}

function ListingKitPanel({
  project, showHidden, onShowHidden, dirty, saving, onSave, onPatch, items, selected, onSelect, onToggleHidden, onDelete, onUploadFiles,
}: {
  project: Record<string, unknown>;
  showHidden: boolean;
  onShowHidden: (value: boolean) => void;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onPatch: (patch: Record<string, unknown>) => Promise<void> | void;
  items: SequencedArrangementItem[];
  selected: string[];
  onSelect: (id: string, event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => void;
  onToggleHidden: (id: string) => void;
  onDelete: (id: string) => void;
  onUploadFiles: (files: File[]) => void;
}) {
  const stored = readListingKit(project.listingKit);
  const [kit, setKit] = useState<ListingKitState>(stored);
  const [form, setForm] = useState(() => kitForm(project));
  const [kitDirty, setKitDirty] = useState(false);
  const address = recordAddressText(project) || "";

  function updateForm(key: string, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setKitDirty(true);
  }

  async function saveKit() {
    const fields = { ...kit.fields };
    if (fields.specs === false) {
      fields.beds = false;
      fields.baths = false;
      fields.sqft = false;
    } else if (fields.specs === true) {
      fields.beds = true;
      fields.baths = true;
      fields.sqft = true;
    }
    const payload: Record<string, unknown> = {
      listingKit: { ...kit, fields },
      listPrice: form.listPrice,
      mlsNumber: form.mlsNumber,
      bedrooms: form.bedrooms,
      bathrooms: form.bathrooms,
      squareFeet: form.squareFeet,
      city: form.city,
      state: form.state,
      zip: form.zip,
      clientName: form.agentName,
      clientEmail: form.agentEmail,
    };
    if (form.address !== address) payload.address = form.address;
    await onPatch(payload);
    onSave();
    setKitDirty(false);
    toast.success("Listing kit saved.");
  }

  const files = items.filter((item) => showHidden || !item.hiddenFromGallery);

  return (
    <div>
      <div className="sticky top-0 z-30 mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-[#e6e9e7] bg-[#f5f6f5]/90 px-3 py-2.5 backdrop-blur">
        <p className="text-[13px] font-semibold">Listing Kit <span className="font-medium text-[#7a8480]">· auto + editable</span></p>
        <button type="button" aria-pressed={showHidden} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${showHidden ? "border-[#b7e4da] bg-[#e6f6f2] text-[#0e8a76]" : "border-[#e6e9e7] bg-white"}`} onClick={() => onShowHidden(!showHidden)}>
          <Eye className="h-3.5 w-3.5" /> Show hidden
        </button>
        <div className="flex-1" />
        {(dirty || kitDirty) && <span className="text-xs font-semibold text-[#b07a1a]">Unsaved changes</span>}
        <button type="button" className="rounded-full bg-[#1a1d1c] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40" disabled={saving} onClick={() => void saveKit()}>Save listing kit</button>
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e6e9e7] bg-[#f7f3ff] px-4 py-3">
        <div>
          <p className="text-sm font-semibold">Auto-generated from the address when the order is paid</p>
          <p className="text-xs text-[#7a8480]">{address || "No address on this project yet"} · refresh anytime</p>
        </div>
        <span className="rounded-full bg-white px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-[#7a8480]">Not generated</span>
        <button
          type="button"
          className="rounded-full border border-[#e6e9e7] bg-white px-3 py-1.5 text-xs font-semibold"
          onClick={() => {
            const result = listingKitRefreshTodo(address);
            toast.message(result.reason);
          }}
        >
          Refresh
        </button>
      </div>
      <p className="mb-4 text-xs text-[#7a8480]">Neighborhood, crime, and lifestyle slots stay empty until a source is connected. Nothing here is sample data.</p>

      <section className="mb-6">
        <SectionLabel name="Property details" count={3} />
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-[#e6e9e7] bg-white p-4 md:col-span-2">
            <CardHead title="Address and price" on={kit.fields.address !== false} onToggle={() => toggleField(setKit, setKitDirty, "address")} />
            <div className="grid gap-2 md:grid-cols-[2fr_1fr]">
              <Field label="Property Address" value={form.address} onChange={(value) => updateForm("address", value)} />
              <Field label="List price" value={form.listPrice} onChange={(value) => updateForm("listPrice", value)} />
            </div>
            <div className="mt-2 grid gap-2 md:grid-cols-4">
              <Field label="City" value={form.city} onChange={(value) => updateForm("city", value)} />
              <Field label="State" value={form.state} onChange={(value) => updateForm("state", value)} />
              <Field label="ZIP" value={form.zip} onChange={(value) => updateForm("zip", value)} />
              <Field label="MLS #" value={form.mlsNumber} onChange={(value) => updateForm("mlsNumber", value)} />
            </div>
          </div>
          <div className="rounded-2xl border border-[#e6e9e7] bg-white p-4">
            <CardHead title="Specs" on={kit.fields.specs !== false} onToggle={() => toggleField(setKit, setKitDirty, "specs")} />
            <div className="grid grid-cols-3 gap-2">
              <Field label="Beds" value={form.bedrooms} onChange={(value) => updateForm("bedrooms", value)} />
              <Field label="Baths" value={form.bathrooms} onChange={(value) => updateForm("bathrooms", value)} />
              <Field label="Sq ft" value={form.squareFeet} onChange={(value) => updateForm("squareFeet", value)} />
            </div>
          </div>
          <div className="rounded-2xl border border-[#e6e9e7] bg-white p-4">
            <CardHead title="Agent" on={kit.fields.agent !== false} onToggle={() => toggleField(setKit, setKitDirty, "agent")} />
            <Field label="Name" value={form.agentName} onChange={(value) => updateForm("agentName", value)} />
            <div className="mt-2"><Field label="Email" value={form.agentEmail} onChange={(value) => updateForm("agentEmail", value)} /></div>
          </div>
        </div>
      </section>

      <section className="mb-6">
        <SectionLabel name="Marketing and neighborhood" count={LISTING_KIT_SLOTS.filter((slot) => slot.group === "neighborhood").length} />
        <div className="grid gap-3 md:grid-cols-2">
          {kit.slots.filter((slot) => slot.group === "neighborhood").map((slot) => (
            <KitSlot key={slot.id} slot={slot} onChange={(body) => {
              setKit((current) => ({ ...current, slots: current.slots.map((item) => item.id === slot.id ? { ...item, body } : item) }));
              setKitDirty(true);
            }} onToggle={() => {
              setKit((current) => ({ ...current, slots: current.slots.map((item) => item.id === slot.id ? { ...item, showOnGallery: !item.showOnGallery } : item) }));
              setKitDirty(true);
            }} />
          ))}
        </div>
      </section>
      <section className="mb-6">
        <SectionLabel name="Safety" count={1} />
        {kit.slots.filter((slot) => slot.id === "crime").map((slot) => (
          <KitSlot key={slot.id} slot={slot} onChange={(body) => {
            setKit((current) => ({ ...current, slots: current.slots.map((item) => item.id === slot.id ? { ...item, body } : item) }));
            setKitDirty(true);
          }} onToggle={() => {
            setKit((current) => ({ ...current, slots: current.slots.map((item) => item.id === slot.id ? { ...item, showOnGallery: !item.showOnGallery } : item) }));
            setKitDirty(true);
          }} />
        ))}
      </section>

      <section
        onDragOver={(event) => { if (hasFiles(event)) event.preventDefault(); }}
        onDrop={(event) => {
          if (!hasFiles(event)) return;
          event.preventDefault();
          onUploadFiles(Array.from(event.dataTransfer.files));
        }}
      >
        <SectionLabel name="Files" count={files.length} />
        <p className="mb-3 text-xs text-[#7a8480]">Formerly the Files tab. Drop documents here. Floorplans stay on their own tab.</p>
        {files.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[#e6e9e7] bg-white px-4 py-8 text-center text-xs text-[#7a8480]">No files yet.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {files.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={(event) => onSelect(item.id, event)}
                className={`rounded-2xl border bg-white p-4 text-left ${selected.includes(item.id) ? "outline outline-2 outline-[#14a08a]" : "border-[#e6e9e7]"} ${item.hiddenFromGallery ? "border-dashed opacity-60" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#e8f1fd] text-[11px] font-extrabold text-[#2b6cb0]">{extLabel(item.name)}</div>
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate text-sm font-semibold">{item.name}</h4>
                    <p className="text-xs text-[#7a8480]">{item.hiddenFromGallery ? "Hidden from gallery" : "On file"}</p>
                  </div>
                  <a href={item.url} download={item.deliveryName || item.name} aria-label={`Download ${item.name}`} onClick={(event) => event.stopPropagation()}><Download className="h-3.5 w-3.5 text-[#7a8480]" /></a>
                  <span role="button" aria-label={`Hide ${item.name}`} onClick={(event) => { event.stopPropagation(); onToggleHidden(item.id); }}><EyeOff className="h-3.5 w-3.5 text-[#7a8480]" /></span>
                  <span role="button" aria-label={`Remove ${item.name}`} onClick={(event) => { event.stopPropagation(); onDelete(item.id); }}><Trash2 className="h-3.5 w-3.5 text-red-500" /></span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function KitSlot({
  slot, onChange, onToggle,
}: {
  slot: ListingKitState["slots"][number];
  onChange: (body: string) => void;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-2xl border border-[#e6e9e7] bg-white p-4">
      <CardHead title={slot.title} on={slot.showOnGallery} onToggle={onToggle} />
      {slot.body ? (
        <textarea value={slot.body} onChange={(event) => onChange(event.target.value)} className="min-h-[88px] w-full rounded-xl border border-[#e6e9e7] bg-[#fafbfa] px-3 py-2 text-sm outline-none" />
      ) : (
        <div className="rounded-xl border border-dashed border-[#e6e9e7] bg-[#fafbfa] px-3 py-4 text-sm text-[#7a8480]">
          <p className="font-semibold text-[#3d4442]">Not generated yet</p>
          <p className="mt-1">This slot is filled from the property address after the order is paid. No neighborhood, crime, or lifestyle numbers are invented.</p>
          <p className="mt-2 text-[11px] uppercase tracking-wide">TODO: connect the listing-kit source. Do not call a paid enrichment API from this screen.</p>
          <textarea value="" placeholder="Staff can type a note here. It is saved as written." onChange={(event) => onChange(event.target.value)} className="mt-3 min-h-[64px] w-full rounded-xl border border-[#e6e9e7] bg-white px-3 py-2 text-sm outline-none" />
        </div>
      )}
    </div>
  );
}

function SectionLabel({ name, count }: { name: string; count: number }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="inline-flex items-center gap-2 rounded-full border border-[#e6e9e7] bg-white px-3 py-1 text-[13px] font-semibold">
        <span className="h-2 w-2 rounded-full bg-[#14a08a]" />
        {name}
        <span className="rounded-full bg-[#f0f2f1] px-1.5 text-[11px] text-[#7a8480]">{count}</span>
      </span>
    </div>
  );
}

function CardHead({ title, on, onToggle }: { title: string; on: boolean; onToggle: () => void }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <h4 className="text-[11px] font-bold uppercase tracking-wide text-[#7a8480]">{title}</h4>
      <button type="button" aria-pressed={on} onClick={onToggle} className={`ml-auto inline-flex items-center gap-1 text-[11px] font-semibold ${on ? "text-[#0e8a76]" : "text-[#7a8480]"}`}>
        <Eye className="h-3.5 w-3.5" /> {on ? "Show on gallery" : "Hidden"}
      </button>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold text-[#7a8480]">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-[10px] border border-[#e6e9e7] bg-[#fafbfa] px-3 py-2 text-sm outline-none" />
    </label>
  );
}

function inTab(item: SequencedArrangementItem, tab: string): boolean {
  const asset = (item.assetType || "").toLowerCase();
  if (tab === "photos") return item.kind === "photo" && asset !== "social" && item.bucket !== "socialAssets";
  if (tab === "videos") return item.kind === "video";
  if (tab === "social") return asset === "social" || item.bucket === "socialAssets";
  if (tab === "tours") return item.kind === "tour";
  if (tab === "floorplans") return item.kind === "floorplan" || asset === "floorplan";
  if (tab === "kit") return item.kind === "file" || asset === "file";
  return false;
}

function groupsFor(
  tab: string,
  items: SequencedArrangementItem[],
  arrangement: MediaArrangement,
  showHidden: boolean,
) {
  const visible = items.filter((item) => showHidden || !item.hiddenFromGallery);
  if (tab === "tours") {
    return [
      pack("branded", "Branded tour links", "bg-[#14a08a]", arrangement, visible, (item) => /branded/i.test(`${item.brandLabel} ${item.name}`) && !/unbranded/i.test(`${item.brandLabel} ${item.name}`)),
      pack("unbranded", "Unbranded tour links", "bg-[#6b8afd]", arrangement, visible, (item) => /unbranded/i.test(`${item.brandLabel} ${item.name}`) || !/branded/i.test(`${item.brandLabel} ${item.name}`)),
    ].map((group, _index, all) => {
      if (group.id === "unbranded") {
        const brandedIds = new Set(all[0].items.map((item) => item.id));
        return { ...group, items: group.items.filter((item) => !brandedIds.has(item.id)) };
      }
      return group;
    });
  }
  if (tab === "floorplans") {
    const images = visible.filter((item) => !/\.pdf(\?|#|$)/i.test(item.name));
    const pdfs = visible.filter((item) => /\.pdf(\?|#|$)/i.test(item.name));
    return [
      { id: "floor-images", name: "Floorplan images", dot: "bg-[#14a08a]", section: arrangement.sections.find((section) => section.name === "Floorplan images"), items: images },
      { id: "floor-pdfs", name: "Floorplan PDFs", dot: "bg-[#f0a04b]", section: arrangement.sections.find((section) => section.name === "Floorplan PDFs"), items: pdfs },
    ];
  }
  const sections = arrangement.sections.filter((section) => visible.some((item) => item.sectionId === section.id) || (tab === "videos" && ["Listing Video", "Reels", "Other sizes"].includes(section.name)));
  const loose = visible.filter((item) => !item.sectionId || !sections.some((section) => section.id === item.sectionId));
  const dots = ["bg-[#14a08a]", "bg-[#6b8afd]", "bg-[#f0a04b]", "bg-[#9b7bff]", "bg-[#e86aa3]"];
  const grouped = sections.map((section, index) => ({
    id: section.id,
    name: section.name,
    dot: dots[index % dots.length],
    section,
    items: visible.filter((item) => item.sectionId === section.id),
  }));
  if (loose.length || grouped.length === 0) {
    grouped.unshift({
      id: "loose",
      name: loose.length && grouped.length ? "Unsorted" : defaultLooseName(tab),
      dot: "bg-[#7a8480]",
      section: undefined as never,
      items: loose,
    });
  }
  return grouped;
}

function pack(
  id: string,
  name: string,
  dot: string,
  arrangement: MediaArrangement,
  items: SequencedArrangementItem[],
  match: (item: SequencedArrangementItem) => boolean,
) {
  const section = arrangement.sections.find((item) => item.name.toLowerCase() === name.toLowerCase());
  const inSection = section ? items.filter((item) => item.sectionId === section.id) : [];
  const matched = items.filter(match);
  const merged = [...inSection];
  for (const item of matched) if (!merged.some((row) => row.id === item.id)) merged.push(item);
  return { id, name, dot, section, items: merged };
}

function defaultLooseName(tab: string) {
  if (tab === "photos") return "Photos";
  if (tab === "videos") return "Videos";
  if (tab === "social") return "Social";
  return "Files";
}

function ghostModel(item: SequencedArrangementItem, event: ReactPointerEvent): DragGhostModel & { id: string } {
  return {
    id: item.id,
    kind: "item",
    title: item.name,
    subtitle: item.deliveryName || item.kind,
    imageUrl: item.kind === "video" ? "" : item.url,
    x: event.clientX,
    y: event.clientY,
  };
}

function selectedItems(items: SequencedArrangementItem[], ids: string[]) {
  const chosen = new Set(ids);
  return items.filter((item) => chosen.has(item.id));
}

async function downloadItem(item: SequencedArrangementItem, mode: "high" | "web") {
  try {
    await downloadMany([item], mode);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Download failed.");
  }
}

async function downloadMany(items: SequencedArrangementItem[], mode: "high" | "web") {
  for (const item of items) {
    const name = item.deliveryName || item.name || "download";
    if (mode === "high") {
      triggerDownload(item.url, name);
      continue;
    }
    if (item.webUrl) {
      triggerDownload(item.webUrl, name);
      continue;
    }
    if (item.kind !== "photo" && item.kind !== "floorplan") {
      toast.message(`${item.name} has no web copy stored. Downloaded the original.`);
      triggerDownload(item.url, name);
      continue;
    }
    try {
      const blob = await webResize(item.url);
      const url = URL.createObjectURL(blob);
      triggerDownload(url, name.replace(/\.\w+$/, "") + "-web.jpg");
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch {
      toast.message(`${item.name} has no web copy stored.`);
    }
  }
}

function triggerDownload(url: string, name: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.target = "_blank";
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function webResize(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("No web copy stored");
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const edge = 2048;
  const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No web copy stored");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const encoded = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  if (!encoded) throw new Error("No web copy stored");
  return encoded;
}

function measureVideo(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const finish = (width: number, height: number) => {
      URL.revokeObjectURL(url);
      resolve({ width, height });
    };
    video.preload = "metadata";
    video.onloadedmetadata = () => finish(video.videoWidth || 0, video.videoHeight || 0);
    video.onerror = () => finish(0, 0);
    video.src = url;
  });
}

function readScale(userId: string) {
  if (typeof window === "undefined") return 55;
  const raw = window.localStorage.getItem(`${SCALE_KEY}${userId || "staff"}`);
  const value = Number(raw);
  if (!Number.isFinite(value)) return 55;
  return Math.min(100, Math.max(0, value));
}

function hasFiles(event: DragEvent) {
  return Array.from(event.dataTransfer?.types || []).includes("Files");
}

function acceptFor(tab: string) {
  if (tab === "videos") return "video/mp4,video/quicktime,.mp4,.mov,.m4v,.webm";
  if (tab === "floorplans") return "image/png,image/jpeg,.png,.jpg,.jpeg,.pdf";
  if (tab === "kit") return ".pdf,.zip,.doc,.docx,.jpg,.jpeg,.png";
  return "image/jpeg,image/png,image/webp,image/heic,.jpg,.jpeg,.png,.webp,.heic";
}

function dropTitle(tab: string) {
  if (tab === "videos") return "Drop videos here — auto-sorts by aspect · or use";
  if (tab === "social") return "Drop post-ready graphics or clips ·";
  if (tab === "tours") return "Paste a Matterport / 3D tour URL · or";
  if (tab === "floorplans") return "Drop floorplan images or PDFs ·";
  return "Drop photos here or";
}

function dropHint(tab: string) {
  if (tab === "videos") return "MP4, MOV · 9:16 goes to Reels · 16:9 goes to Listing Video · anything else goes to Other sizes. Dropping on a section skips the sort.";
  if (tab === "social") return "JPG, PNG, MP4 · Square, portrait, and story sizes";
  if (tab === "tours") return "Branded and unbranded tour links. Copy is on each card.";
  if (tab === "floorplans") return "PNG, JPG, PDF · Download high res or web res";
  return "JPG, PNG, HEIC · Max 50MB each";
}

function hintFor(tab: string) {
  if (tab === "videos") return "Every clip needs a name and a Branded, Unbranded, Both, or None label before it uploads.";
  if (tab === "social") return "Platform and aspect tags show when they are stored on the file. Download high or web res.";
  if (tab === "tours") return "Floorplans live on their own tab. Copy a link for agents and MLS.";
  if (tab === "floorplans") return "This replaces the Files tab. Other documents live under Listing Kit → Files.";
  return "Drag a photo or a section. A ghost follows the pointer and a dashed slot shows where it will land.";
}

function extLabel(name: string) {
  const match = name.toLowerCase().match(/\.([a-z0-9]{1,4})$/);
  return (match?.[1] || "file").toUpperCase();
}

function kitForm(project: Record<string, unknown>) {
  const text = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value) : "";
  return {
    address: recordAddressText(project),
    listPrice: text(project.listPrice),
    mlsNumber: text(project.mlsNumber),
    bedrooms: text(project.bedrooms),
    bathrooms: text(project.bathrooms),
    squareFeet: text(project.squareFeet),
    city: text(project.city),
    state: text(project.state),
    zip: text(project.zip),
    agentName: text(project.clientName),
    agentEmail: text(project.clientEmail),
  };
}

function toggleField(setKit: Dispatch<SetStateAction<ListingKitState>>, setDirty: (value: boolean) => void, id: string) {
  setKit((current) => ({ ...current, fields: { ...current.fields, [id]: current.fields[id] === false } }));
  setDirty(true);
}
