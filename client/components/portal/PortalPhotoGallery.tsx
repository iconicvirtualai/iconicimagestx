import { useRef, useState, type PointerEvent } from "react";
import { Check, Download, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClientGalleryMediaFrame } from "@/components/gallery/ClientGalleryMedia";
import type { ClientGalleryItem } from "@/components/gallery/clientGalleryMedia";
import {
  PHOTO_EDIT_NOTE_LIMIT,
  photoEditStatusLabel,
  type PhotoEditRequest,
} from "@shared/photoEditRequest";
import type { PortalMediaItem, PortalMediaKind, PortalPhotoGroup, PortalTourItem } from "@shared/portalListingDetail";

type MediaChange =
  | { kind: PortalMediaKind; id: string; hidden?: boolean; move?: "earlier" | "later" }
  | { kind: "photo"; layout: Array<{ id: string; groupId: string }> }
  | { kind: "photo"; group: { action: "create"; name: string; photoIds: string[] } | { action: "rename"; id: string; name: string } | { action: "remove"; id: string } };

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
  const suppressClick = useRef(false);

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

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    setNoteOpen(false);
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

  function pointerDown(event: PointerEvent<HTMLButtonElement>, id: string) {
    if (!canEdit || event.button !== 0) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const pointerId = event.pointerId;
    const touch = event.pointerType === "touch";
    let dragging = false;
    let moved = false;
    let lastX = startX;
    let lastY = startY;
    const timer = window.setTimeout(() => {
      if (!moved) dragging = true;
    }, 420);

    function move(ev: globalThis.PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      lastX = ev.clientX;
      lastY = ev.clientY;
      const distance = Math.hypot(ev.clientX - startX, ev.clientY - startY);
      if (!dragging && distance > 8) {
        window.clearTimeout(timer);
        if (touch) {
          moved = true;
          return;
        }
        dragging = true;
      }
      if (!dragging) return;
      const hit = document.elementFromPoint(ev.clientX, ev.clientY);
      const card = hit instanceof Element ? hit.closest("[data-photo-id]") : null;
      setDropId(card?.getAttribute("data-photo-id") || "");
    }

    function up(ev: globalThis.PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
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

  const revisions = photoEditRequests.filter((request) => request.replacement);

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-xs font-black uppercase tracking-widest text-[#0d9488]">Photos</h2>
        <p className="mt-1 text-xs text-gray-500">
          {canEdit
            ? "Tap a photo to select it. Tap more to add them. Drag a photo, or the selected set, to change the order."
            : "Shown in presentation order."}
          {canEdit && hiddenCount > 0 ? ` ${hiddenCount} hidden from the presentation.` : ""}
        </p>
      </div>

      {canEdit && selectedItems.length > 0 && (
        <div className="sticky top-14 z-20 mb-4 flex flex-wrap items-end gap-2 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm" data-testid="photo-selection-toolbar">
          <p className="mr-1 pb-2 text-xs font-black uppercase tracking-widest text-[#0d9488]">{selectedItems.length} selected</p>
          <Button type="button" size="sm" variant="outline" data-testid="photo-clear-selection" onClick={() => { setSelected([]); setNoteOpen(false); }}>
            Clear
          </Button>
          <label className="min-w-0 flex-1 basis-36">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Group name</span>
            <input
              value={groupName}
              data-testid="photo-group-name"
              maxLength={60}
              placeholder="Kitchen"
              onChange={(event) => setGroupName(event.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold"
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
          {noteOpen && selectedId && onRequestPhotoEdit && (
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
        <div className="space-y-6">
          {sections.filter((section) => section.id || section.items.length > 0).map((section) => (
            <div key={section.id || "ungrouped"} data-testid={section.id ? `photo-group-${section.id}` : "photo-group-none"}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
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
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {section.items.map((item) => {
                    const isSelected = selected.includes(item.id);
                    return (
                      <article
                        key={item.id}
                        data-photo-id={item.id}
                        data-testid={`media-photo-${item.id}`}
                        className={`min-w-0 rounded-2xl border bg-white p-3 ${item.hidden ? "border-dashed border-gray-300" : "border-gray-100"} ${dropId === item.id ? "ring-2 ring-[#0d9488]" : ""} ${isSelected ? "ring-2 ring-black" : ""}`}
                      >
                        {canEdit ? (
                          <button
                            type="button"
                            data-testid={`photo-select-${item.id}`}
                            aria-pressed={isSelected}
                            aria-label={`${isSelected ? "Deselect" : "Select"} ${item.name}`}
                            className="relative block w-full touch-manipulation text-left"
                            onPointerDown={(event) => pointerDown(event, item.id)}
                            onClick={() => {
                              if (suppressClick.current) {
                                suppressClick.current = false;
                                return;
                              }
                              toggle(item.id);
                            }}
                          >
                            <ClientGalleryMediaFrame item={toGalleryItem(item)} />
                            {isSelected && (
                              <span className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white text-black shadow-md ring-2 ring-black" aria-hidden="true">
                                <Check className="h-4 w-4" />
                              </span>
                            )}
                          </button>
                        ) : (
                          <ClientGalleryMediaFrame item={toGalleryItem(item)} />
                        )}
                        <p className="mt-3 truncate text-sm font-bold">{item.name}</p>
                        {item.hidden && <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Hidden</p>}
                        <PhotoStatus item={item} requests={photoEditRequests} onOpen={setLightbox} />
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {revisions.length > 0 && (
        <section className="mt-10" data-testid="gallery-revisions">
          <h2 className="text-xs font-black uppercase tracking-widest text-[#0d9488]">Revisions</h2>
          <p className="mt-1 text-xs text-gray-500">Revised photos returned for this gallery.</p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {revisions.map((request) => (
              <RevisionCard key={request.id} request={request} onOpen={() => setLightbox(request)} />
            ))}
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

function RevisionCard({ request, onOpen }: { request: PhotoEditRequest; onOpen: () => void }) {
  const file = request.replacement;
  if (!file) return null;
  return (
    <article className="min-w-0 rounded-2xl border border-gray-100 bg-white p-3" data-testid={`revision-card-${request.id}`}>
      <button type="button" className="block w-full overflow-hidden rounded-xl bg-gray-100" onClick={onOpen}>
        <img src={file.url} alt={file.name} className="aspect-[4/3] w-full object-cover" />
      </button>
      <p className="mt-2 truncate text-sm font-bold">{file.name}</p>
      <p className="text-xs text-gray-500">{request.note}</p>
      <a href={file.url} download={file.name} className="mt-2 inline-flex min-h-11 items-center gap-2 text-xs font-black uppercase tracking-widest text-[#0d9488]">
        <Download className="h-3.5 w-3.5" /> Download
      </a>
    </article>
  );
}

function toGalleryItem(item: PortalMediaItem): ClientGalleryItem {
  const tour = item.kind === "tour" ? item as PortalTourItem : null;
  return {
    id: item.id,
    fileName: item.name,
    title: item.name,
    type: item.kind,
    url: item.url,
    shareUrl: item.url,
    embedUrl: tour?.embedUrl ?? null,
    contentType: item.contentType,
    provider: tour?.provider ?? null,
    canDownload: false,
    locked: false,
  };
}

function PhotoStatus({
  item,
  requests,
  onOpen,
}: {
  item: PortalMediaItem;
  requests: PhotoEditRequest[];
  onOpen: (request: PhotoEditRequest) => void;
}) {
  const mine = requests.filter((request) => request.photoId === item.id);
  if (mine.length === 0) return null;
  return (
    <div className="mt-3 space-y-2">
      {mine.map((request) => (
        <div key={request.id} data-testid={`photo-edit-status-${request.id}`} className="rounded-xl bg-gray-50 px-3 py-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-[#0d9488]">{photoEditStatusLabel(request.status)}</p>
          <p className="mt-1 text-sm text-gray-700">{request.note}</p>
          {request.replacement && (
            <button type="button" className="mt-2 block w-full overflow-hidden rounded-lg" onClick={() => onOpen(request)} data-testid={`revision-thumb-${request.id}`}>
              <img src={request.replacement.url} alt={request.replacement.name} className="aspect-video w-full object-cover" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
