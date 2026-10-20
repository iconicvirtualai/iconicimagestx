import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Check, ChevronLeft, ChevronRight, Download, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { galleryHttpUrl } from "@/components/gallery/clientGalleryMedia";
import {
  PHOTO_EDIT_NOTE_LIMIT,
  photoEditStatusLabel,
  type PhotoEditRequest,
} from "@shared/photoEditRequest";
import type { PortalMediaItem, PortalMediaKind, PortalPhotoGroup } from "@shared/portalListingDetail";

const TILE_SCALE_KEY = "iconic-portal-photo-tile-scale";

type MediaChange =
  | { kind: PortalMediaKind; id: string; hidden?: boolean; move?: "earlier" | "later" }
  | { kind: "photo"; layout: Array<{ id: string; groupId: string }> }
  | { kind: "photo"; group: { action: "create"; name: string; photoIds: string[] } | { action: "rename"; id: string; name: string } | { action: "remove"; id: string } };

type Slide = { src: string; alt: string; revised: boolean; downloadName: string };

export function PortalPhotoGallery({
  items,
  groups,
  canEdit,
  saving,
  photoEditRequests,
  onMedia,
  onRequestPhotoEdit,
}: {
  items: PortalMediaItem[];
  groups: PortalPhotoGroup[];
  canEdit: boolean;
  editing: boolean;
  saving: boolean;
  photoEditRequests: PhotoEditRequest[];
  onToggleEditing: () => void;
  onMedia: (change: MediaChange) => void | Promise<void>;
  onRequestPhotoEdit?: (photoId: string, note: string) => Promise<boolean>;
}) {
  const visible = canEdit ? items : items.filter((item) => !item.hidden);
  const hiddenCount = items.filter((item) => item.hidden).length;
  const [selected, setSelected] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [rename, setRename] = useState<{ id: string; name: string } | null>(null);
  const [lightbox, setLightbox] = useState<PhotoEditRequest | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [dropId, setDropId] = useState("");
  const [slides, setSlides] = useState<Record<string, number>>({});
  const [scale, setScale] = useState(0);
  const [scaleReady, setScaleReady] = useState(false);
  const [gridWidth, setGridWidth] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    const saved = Number(window.localStorage.getItem(TILE_SCALE_KEY));
    if (Number.isFinite(saved)) setScale(Math.min(100, Math.max(0, saved)));
    setScaleReady(true);
  }, []);

  useEffect(() => {
    if (!scaleReady) return;
    window.localStorage.setItem(TILE_SCALE_KEY, String(scale));
  }, [scale, scaleReady]);

  useLayoutEffect(() => {
    const node = gridRef.current;
    if (!node) return;
    const read = () => setGridWidth(node.clientWidth);
    read();
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible.length]);

  const orderedGroups = [...groups].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  const sections = [
    { id: "", name: "Photos", items: visible.filter((item) => !item.groupId || !orderedGroups.some((group) => group.id === item.groupId)) },
    ...orderedGroups.map((group) => ({
      id: group.id,
      name: group.name,
      items: visible.filter((item) => item.groupId === group.id),
    })),
  ];
  const flat = sections.flatMap((section) => section.items);
  const selectedItems = flat.filter((item) => selected.includes(item.id));
  const selectedId = selectedItems.length === 1 ? selectedItems[0].id : "";
  const selectedPending = selectedId
    ? photoEditRequests.some((request) => request.photoId === selectedId && request.status !== "received_back")
    : false;
  const tile = tileMinPx(scale, gridWidth);
  const revisions = photoEditRequests.filter((request) => request.replacement);

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    setNoteOpen(false);
  }

  function nudge(id: string, dir: number, count: number) {
    if (count < 2) return;
    setSlides((current) => {
      const index = current[id] || 0;
      return { ...current, [id]: (index + dir + count) % count };
    });
  }

  function openSendBack(id: string) {
    setSelected([id]);
    setNote("");
    setNoteOpen(true);
  }

  function finishDrag(fromId: string, targetId: string) {
    setDropId("");
    if (!fromId || !targetId || fromId === targetId) return;
    const movingIds = selected.includes(fromId) && selected.length > 1 ? selected : [fromId];
    if (movingIds.includes(targetId) && movingIds.length > 1) return;
    const moving = flat.filter((item) => movingIds.includes(item.id));
    const rest = flat.filter((item) => !movingIds.includes(item.id));
    const insertAt = rest.findIndex((item) => item.id === targetId);
    if (moving.length === 0 || insertAt < 0) return;
    const target = flat.find((item) => item.id === targetId);
    const placed = moving.map((item) => ({ ...item, groupId: target?.groupId || "" }));
    rest.splice(insertAt, 0, ...placed);
    const hidden = items.filter((item) => !rest.some((photo) => photo.id === item.id) && !moving.some((photo) => photo.id === item.id));
    void onMedia({
      kind: "photo",
      layout: [...rest, ...hidden].map((item) => ({ id: item.id, groupId: item.groupId || "" })),
    });
  }

  function pointerDown(event: ReactPointerEvent<HTMLButtonElement>, id: string, slideCount: number) {
    if (!canEdit || event.button !== 0) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const pointerId = event.pointerId;
    const touch = event.pointerType === "touch";
    let dragging = false;
    let moved = false;
    let swipe = 0;
    let lastX = startX;
    let lastY = startY;
    const timer = window.setTimeout(() => {
      if (!moved) dragging = true;
    }, 420);

    function move(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      lastX = ev.clientX;
      lastY = ev.clientY;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const distance = Math.hypot(dx, dy);
      if (!dragging && distance > 8) {
        window.clearTimeout(timer);
        if (touch) {
          moved = true;
          if (slideCount > 1 && Math.abs(dx) > 28 && Math.abs(dx) > Math.abs(dy)) swipe = dx < 0 ? 1 : -1;
          return;
        }
        dragging = true;
      }
      if (!dragging) return;
      const hit = document.elementFromPoint(ev.clientX, ev.clientY);
      const card = hit instanceof Element ? hit.closest("[data-photo-id]") : null;
      setDropId(card?.getAttribute("data-photo-id") || "");
    }

    function up(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (swipe) {
        suppressClick.current = true;
        nudge(id, swipe, slideCount);
        return;
      }
      if (!dragging) return;
      const x = ev.clientX || lastX;
      const y = ev.clientY || lastY;
      const hit = document.elementFromPoint(x, y);
      const card = hit instanceof Element ? hit.closest("[data-photo-id]") : null;
      suppressClick.current = true;
      finishDrag(id, card?.getAttribute("data-photo-id") || "");
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  async function hideSelected() {
    const hide = selectedItems.some((item) => !item.hidden);
    for (const item of selectedItems) {
      if (item.hidden === hide) continue;
      await onMedia({ kind: "photo", id: item.id, hidden: hide });
    }
  }

  function renderTile(item: PortalMediaItem, mode: "gallery" | "list") {
    const frames = slidesFor(item, photoEditRequests);
    const index = Math.min(slides[item.id] || 0, frames.length - 1);
    const frame = frames[index];
    const pending = photoEditRequests.find((request) => request.photoId === item.id && request.status !== "received_back");
    const isSelected = mode === "gallery" && selected.includes(item.id);
    return (
      <article
        key={`${mode}-${item.id}`}
        data-photo-id={mode === "gallery" ? item.id : undefined}
        data-testid={mode === "gallery" ? `media-photo-${item.id}` : `revision-card-${item.id}`}
        className={`min-w-0 ${item.hidden ? "opacity-80" : ""} ${mode === "gallery" && dropId === item.id ? "rounded-lg ring-2 ring-[#0d9488]" : ""} ${isSelected ? "rounded-lg ring-2 ring-black" : ""}`}
      >
        <PhotoTile
          item={item}
          frames={frames}
          index={index}
          frame={frame}
          canEdit={canEdit && mode === "gallery"}
          isSelected={isSelected}
          pendingLabel={pending ? photoEditStatusLabel(pending.status) : ""}
          pendingNote={pending?.note || ""}
          onPointerDown={mode === "gallery" ? (event) => pointerDown(event, item.id, frames.length) : undefined}
          onPress={() => {
            if (suppressClick.current) {
              suppressClick.current = false;
              return;
            }
            if (frame.revised) {
              const request = revisions.find((entry) => entry.photoId === item.id && entry.replacement?.url === frame.src);
              if (request) setLightbox(request);
              return;
            }
            if (mode === "gallery" && canEdit) toggle(item.id);
          }}
          onStep={(dir) => nudge(item.id, dir, frames.length)}
          onSendBack={onRequestPhotoEdit ? () => openSendBack(item.id) : undefined}
        />
      </article>
    );
  }

  return (
    <section>
      <div className="mb-3">
        <h2 className="text-xs font-black uppercase tracking-widest text-[#0d9488]">Photos</h2>
        <p className="mt-1 text-xs text-gray-500">
          {canEdit
            ? "Tap a photo to select it. Tap more to add them. Drag a photo, or the selected set, to change the order."
            : "Shown in presentation order."}
          {canEdit && hiddenCount > 0 ? ` ${hiddenCount} hidden from the presentation.` : ""}
        </p>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-gray-400">Size</span>
        <span className="shrink-0 text-[10px] font-bold text-gray-400">Small</span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={scale}
          aria-label="Thumbnail size"
          data-testid="photo-size-slider"
          onChange={(event) => setScale(Number(event.target.value))}
          className="h-11 min-w-0 flex-1 accent-[#0d9488]"
        />
        <span className="shrink-0 text-[10px] font-bold text-gray-400">Large</span>
      </div>

      {canEdit && selectedItems.length > 0 && (
        <div className="sticky top-14 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white p-2 shadow-sm" data-testid="photo-selection-toolbar">
          <p className="text-xs font-black uppercase tracking-widest text-[#0d9488]">{selectedItems.length} selected</p>
          <Button type="button" size="sm" variant="outline" data-testid="photo-clear-selection" onClick={() => { setSelected([]); setNoteOpen(false); }}>
            Clear
          </Button>
          <label className="min-w-0 flex-1 basis-36">
            <span className="sr-only">Group name</span>
            <input
              value={groupName}
              data-testid="photo-group-name"
              maxLength={60}
              placeholder="Group name"
              aria-label="Group name"
              onChange={(event) => setGroupName(event.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold"
            />
          </label>
          <Button
            type="button"
            size="sm"
            data-testid="photo-group-create"
            disabled={saving || !groupName.trim()}
            onClick={() => {
              void onMedia({ kind: "photo", group: { action: "create", name: groupName.trim(), photoIds: selectedItems.map((item) => item.id) } });
              setGroupName("");
              setSelected([]);
            }}
          >
            Group
          </Button>
          <Button type="button" size="sm" variant="outline" data-testid="photo-hide-selected" disabled={saving} onClick={() => void hideSelected()}>
            {selectedItems.every((item) => item.hidden) ? <Eye className="mr-1 h-3.5 w-3.5" /> : <EyeOff className="mr-1 h-3.5 w-3.5" />}
            {selectedItems.every((item) => item.hidden) ? "Show" : "Hide"}
          </Button>
          {onRequestPhotoEdit && selectedId && !selectedPending && (
            <Button type="button" size="sm" variant="outline" data-testid={`photo-edit-open-${selectedId}`} onClick={() => setNoteOpen(true)}>
              Request edit
            </Button>
          )}
          {selectedId && selectedPending && (
            <p className="basis-full text-xs text-gray-600">
              {photoEditRequests.filter((request) => request.photoId === selectedId && request.status !== "received_back").map((request) => request.note).join(" ")}
            </p>
          )}
          {noteOpen && selectedId && onRequestPhotoEdit && !selectedPending && (
            <div className="basis-full">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400" htmlFor={`photo-edit-note-${selectedId}`}>
                Note
              </label>
              <textarea
                id={`photo-edit-note-${selectedId}`}
                data-testid={`photo-edit-note-${selectedId}`}
                value={note}
                maxLength={PHOTO_EDIT_NOTE_LIMIT}
                rows={3}
                placeholder="What should change on this photo?"
                onChange={(event) => setNote(event.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-[10px] text-gray-400">The note is saved on this photo. It does not send a message or create a charge.</p>
              <div className="mt-2 flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => { setNoteOpen(false); setNote(""); }}>Cancel</Button>
                <Button
                  type="button"
                  size="sm"
                  data-testid={`photo-edit-submit-${selectedId}`}
                  disabled={saving || !note.trim()}
                  onClick={() => {
                    void onRequestPhotoEdit(selectedId, note).then((ok) => {
                      if (!ok) return;
                      setNote("");
                      setNoteOpen(false);
                    });
                  }}
                >
                  Send request
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          {items.length === 0 ? "No photos on this listing yet." : "All files are hidden from the presentation."}
        </div>
      ) : (
        <div ref={gridRef} className="space-y-4">
          {sections.filter((section) => section.id || section.items.length > 0).map((section) => (
            <div key={section.id || "ungrouped"} data-testid={section.id ? `photo-group-${section.id}` : "photo-group-none"}>
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-black">{section.name}</h3>
                {canEdit && section.id && (
                  <div className="flex flex-wrap gap-2">
                    {rename?.id === section.id ? (
                      <>
                        <input
                          value={rename.name}
                          aria-label={`Rename ${section.name}`}
                          maxLength={60}
                          onChange={(event) => setRename({ id: section.id, name: event.target.value })}
                          className="w-36 rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold"
                        />
                        <Button type="button" size="sm" variant="outline" disabled={saving || !rename.name.trim()} onClick={() => { void onMedia({ kind: "photo", group: { action: "rename", id: section.id, name: rename.name.trim() } }); setRename(null); }}>
                          Save name
                        </Button>
                      </>
                    ) : (
                      <Button type="button" size="sm" variant="outline" data-testid={`photo-group-rename-${section.id}`} onClick={() => setRename({ id: section.id, name: section.name })}>
                        Rename
                      </Button>
                    )}
                    <Button type="button" size="sm" variant="outline" data-testid={`photo-group-remove-${section.id}`} disabled={saving} onClick={() => void onMedia({ kind: "photo", group: { action: "remove", id: section.id } })}>
                      Remove group
                    </Button>
                  </div>
                )}
              </div>
              {section.items.length === 0 ? (
                <p className="text-xs text-gray-400">No photos in this group.</p>
              ) : (
                <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${tile}px), 1fr))` }}>
                  {section.items.map((item) => renderTile(item, "gallery"))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {revisions.length > 0 && (
        <section className="mt-8" data-testid="gallery-revisions">
          <h2 className="text-xs font-black uppercase tracking-widest text-[#0d9488]">Revisions</h2>
          <p className="mt-1 text-xs text-gray-500">Revised photos for this gallery. Each one is also on its original tile.</p>
          <div className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${tile}px), 1fr))` }}>
            {uniqueRevisionItems(flat, revisions).map((item) => renderTile(item, "list"))}
          </div>
        </section>
      )}

      {lightbox?.replacement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-label="Revised photo" data-testid="revision-lightbox">
          <div className="flex max-h-full w-full max-w-4xl flex-col gap-3">
            <img src={lightbox.replacement.url} alt={lightbox.replacement.name} className="max-h-[70vh] w-full object-contain" />
            <div className="flex flex-wrap justify-end gap-2">
              <a href={lightbox.replacement.url} download={lightbox.replacement.name} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-xs font-black uppercase tracking-widest text-black">
                <Download className="h-4 w-4" /> Download
              </a>
              <button type="button" className="inline-flex min-h-11 items-center rounded-xl border border-white px-4 text-xs font-black uppercase tracking-widest text-white" onClick={() => setLightbox(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function PhotoTile({
  item,
  frames,
  index,
  frame,
  canEdit,
  isSelected,
  pendingLabel,
  pendingNote,
  onPointerDown,
  onPress,
  onStep,
  onSendBack,
}: {
  item: PortalMediaItem;
  frames: Slide[];
  index: number;
  frame: Slide;
  canEdit: boolean;
  isSelected: boolean;
  pendingLabel: string;
  pendingNote: string;
  onPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPress: () => void;
  onStep: (dir: number) => void;
  onSendBack?: () => void;
}) {
  const carousel = frames.length > 1;
  return (
    <div className="min-w-0">
      <div className={`relative aspect-[4/3] overflow-hidden rounded-lg bg-gray-100 ${item.hidden ? "outline outline-1 outline-dashed outline-gray-400" : ""}`}>
        {canEdit ? (
          <button
            type="button"
            data-testid={`photo-select-${item.id}`}
            aria-pressed={isSelected}
            aria-label={frame.revised ? `Open revised ${frame.alt}` : `${isSelected ? "Deselect" : "Select"} ${item.name}`}
            className="absolute inset-0 z-0 block touch-manipulation"
            style={{ touchAction: carousel ? "pan-y" : "manipulation" }}
            onPointerDown={onPointerDown}
            onClick={onPress}
          >
            <TileImage frames={frames} index={index} />
          </button>
        ) : (
          <button
            type="button"
            className="absolute inset-0 z-0 block"
            aria-label={frame.revised ? `Open revised ${frame.alt}` : item.name}
            onClick={onPress}
          >
            <TileImage frames={frames} index={index} />
          </button>
        )}
        {isSelected && (
          <span className="pointer-events-none absolute right-1 top-1 z-10 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-black shadow ring-2 ring-black">
            <Check className="h-3 w-3" />
          </span>
        )}
        {item.hidden && (
          <span className="pointer-events-none absolute left-1 top-1 z-10 rounded-full bg-white/90 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-gray-600">Hidden</span>
        )}
        {pendingLabel && !frame.revised && (
          <span className="pointer-events-none absolute bottom-1 left-1 z-10 rounded-full bg-white/90 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-[#0d9488]">{pendingLabel}</span>
        )}
        {pendingNote && <span className="sr-only" data-testid={`photo-edit-status-${item.id}`}>{pendingNote}</span>}
        {frame.revised && (
          <span className="pointer-events-none absolute left-1 top-1 z-10 rounded-full bg-[#0d9488] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-white">Revised</span>
        )}
        {!frame.revised && (
          <span className="pointer-events-none absolute inset-x-0 bottom-0 z-10 truncate bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-3 text-left text-[10px] font-bold text-white">{item.name}</span>
        )}
        {carousel && (
          <span className="pointer-events-none absolute bottom-1 right-1 z-10 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] font-black text-white" data-testid={`photo-slide-count-${item.id}`}>
            {index + 1}/{frames.length}
          </span>
        )}
        {carousel && (
          <>
            <button
              type="button"
              aria-label={`Previous slide for ${item.name}`}
              data-testid={`photo-slide-prev-${item.id}`}
              className="absolute left-1 top-1/2 z-20 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white text-black shadow"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => { event.stopPropagation(); event.preventDefault(); onStep(-1); }}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label={`Next slide for ${item.name}`}
              data-testid={`photo-slide-next-${item.id}`}
              className="absolute right-1 top-1/2 z-20 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white text-black shadow"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => { event.stopPropagation(); event.preventDefault(); onStep(1); }}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
      {carousel && (
        <div className={frame.revised ? "mt-1 grid grid-cols-1 gap-1" : "hidden"}>
          <a
            href={frames.find((slide) => slide.revised)?.src || frame.src}
            download={frames.find((slide) => slide.revised)?.downloadName || frame.downloadName}
            data-testid={`photo-revised-download-${item.id}`}
            className="inline-flex min-h-8 items-center justify-center gap-1 rounded-lg bg-black px-1 text-[10px] font-black uppercase tracking-wide text-white"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <Download className="h-3 w-3" /> Download
          </a>
          {onSendBack && (
            <button
              type="button"
              data-testid={`photo-revised-send-${item.id}`}
              className="min-h-8 rounded-lg border border-black bg-white px-1 text-[10px] font-black uppercase leading-tight text-black"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => { event.stopPropagation(); event.preventDefault(); onSendBack(); }}
            >
              Send back for revisions
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TileImage({ frames, index }: { frames: Slide[]; index: number }) {
  return (
    <>
      {frames.map((slide, slideIndex) => (
        <img
          key={`${slide.alt}-${slideIndex}`}
          src={slide.src}
          alt={slide.alt}
          draggable={false}
          className={`h-full w-full object-cover ${slideIndex === index ? "block" : "hidden"}`}
        />
      ))}
    </>
  );
}

function slidesFor(item: PortalMediaItem, requests: PhotoEditRequest[]): Slide[] {
  const original = galleryHttpUrl(item.url);
  const frames: Slide[] = original ? [{ src: original, alt: item.name, revised: false, downloadName: item.name }] : [];
  const revisions = requests
    .filter((request) => request.photoId === item.id && request.replacement)
    .sort((a, b) => (a.replacement?.attachedAt || "").localeCompare(b.replacement?.attachedAt || ""));
  for (const request of revisions) {
    const file = request.replacement;
    const src = file ? galleryHttpUrl(file.url) : "";
    if (!file || !src) continue;
    frames.push({ src, alt: file.name, revised: true, downloadName: file.name });
  }
  if (frames.length === 0) frames.push({ src: "", alt: item.name, revised: false, downloadName: item.name });
  return frames;
}

function uniqueRevisionItems(items: PortalMediaItem[], revisions: PhotoEditRequest[]): PortalMediaItem[] {
  const ids = new Set(revisions.map((request) => request.photoId));
  return items.filter((item) => ids.has(item.id));
}

function tileMinPx(scale: number, width: number): number {
  const basis = width > 0 ? width : 960;
  const t = Math.min(100, Math.max(0, scale)) / 100;
  const narrow = basis < 520;
  if (narrow) {
    const three = Math.max(88, (basis - 16) / 3);
    const two = Math.max(three, (basis - 8) / 2);
    const one = Math.max(two, basis);
    if (t <= 0.45) return Math.round(three + (t / 0.45) * (two - three));
    return Math.round(two + ((t - 0.45) / 0.55) * (one - two));
  }
  const many = 150;
  const two = Math.max(many, (basis - 8) / 2);
  const one = Math.min(basis, Math.max(two + 48, two * 1.35));
  if (t <= 0.6) return Math.round(many + (t / 0.6) * (two - many));
  return Math.round(two + ((t - 0.6) / 0.4) * (one - two));
}
