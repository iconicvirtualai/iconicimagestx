import { useRef, useState } from "react";
import { Download, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClientGalleryMediaFrame } from "@/components/gallery/ClientGalleryMedia";
import type { ClientGalleryItem } from "@/components/gallery/clientGalleryMedia";
import {
  PHOTO_EDIT_NOTE_LIMIT,
  photoEditStatusLabel,
  type PhotoEditRequest,
} from "@shared/photoEditRequest";
import type { PortalMediaItem, PortalMediaKind, PortalPhotoGroup, PortalTourItem } from "@shared/portalListingDetail";
import { Eye, EyeOff } from "lucide-react";

export function PortalPhotoGallery({
  items,
  groups,
  canEdit,
  editing,
  saving,
  photoEditRequests,
  onToggleEditing,
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
  onMedia: (change: { kind: PortalMediaKind; id: string; hidden?: boolean; move?: "earlier" | "later" } | { kind: "photo"; layout: Array<{ id: string; groupId: string }> } | { kind: "photo"; group: { action: "create"; name: string; photoIds: string[] } | { action: "rename"; id: string; name: string } | { action: "remove"; id: string } }) => void;
  onRequestPhotoEdit?: (photoId: string, note: string) => Promise<boolean>;
}) {
  const showEditor = canEdit && editing;
  const visible = showEditor ? items : items.filter((item) => !item.hidden);
  const hiddenCount = items.filter((item) => item.hidden).length;
  const [selected, setSelected] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [rename, setRename] = useState<{ id: string; name: string } | null>(null);
  const [lightbox, setLightbox] = useState<PhotoEditRequest | null>(null);
  const dragId = useRef("");
  const [dropId, setDropId] = useState("");

  const orderedGroups = [...groups].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  const sections = [
    { id: "", name: "Photos", items: visible.filter((item) => !item.groupId || !orderedGroups.some((group) => group.id === item.groupId)) },
    ...orderedGroups.map((group) => ({
      id: group.id,
      name: group.name,
      items: visible.filter((item) => item.groupId === group.id),
    })),
  ];

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function finishDrag(targetId: string) {
    const fromId = dragId.current;
    dragId.current = "";
    setDropId("");
    if (!fromId || !targetId || fromId === targetId) return;
    const flat = sections.flatMap((section) => section.items);
    const from = flat.findIndex((item) => item.id === fromId);
    const to = flat.findIndex((item) => item.id === targetId);
    if (from < 0 || to < 0) return;
    const next = flat.slice();
    const [moved] = next.splice(from, 1);
    const target = flat[to];
    next.splice(to, 0, { ...moved, groupId: target.groupId || "" });
    const hidden = items.filter((item) => !next.some((photo) => photo.id === item.id));
    onMedia({
      kind: "photo",
      layout: [...next, ...hidden].map((item) => ({ id: item.id, groupId: item.groupId || "" })),
    });
  }

  const revisions = photoEditRequests.filter((request) => request.replacement);

  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xs font-black uppercase tracking-widest text-[#0d9488]">Photos</h2>
          <p className="mt-1 text-xs text-gray-500">
            {showEditor
              ? "Hidden files stay on the listing. Drag the handle to change the order."
              : canEdit && hiddenCount > 0 ? `${hiddenCount} hidden from the presentation.` : "Shown in presentation order."}
          </p>
        </div>
        {canEdit && (
          <Button type="button" variant="outline" onClick={onToggleEditing} disabled={items.length === 0}>
            {editing ? "Done" : "Edit"}
          </Button>
        )}
      </div>

      {canEdit && visible.length > 0 && (
        <div className="mb-4 flex flex-wrap items-end gap-2" data-testid="photo-select-tools">
          <Button type="button" size="sm" variant="outline" data-testid="photo-select-all" onClick={() => setSelected(visible.map((item) => item.id))}>
            Select all
          </Button>
          <Button type="button" size="sm" variant="outline" data-testid="photo-clear-selection" onClick={() => setSelected([])}>
            Clear
          </Button>
          <label className="min-w-0 flex-1 basis-40">
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
            disabled={saving || !groupName.trim() || selected.length === 0}
            onClick={() => {
              onMedia({ kind: "photo", group: { action: "create", name: groupName.trim(), photoIds: selected } });
              setGroupName("");
              setSelected([]);
            }}
          >
            Group selected
          </Button>
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
                        <Button type="button" size="sm" variant="outline" disabled={saving || !rename.name.trim()} onClick={() => { onMedia({ kind: "photo", group: { action: "rename", id: section.id, name: rename.name.trim() } }); setRename(null); }}>
                          Save name
                        </Button>
                      </>
                    ) : (
                      <Button type="button" size="sm" variant="outline" data-testid={`photo-group-rename-${section.id}`} onClick={() => setRename({ id: section.id, name: section.name })}>
                        Rename
                      </Button>
                    )}
                    <Button type="button" size="sm" variant="outline" data-testid={`photo-group-remove-${section.id}`} disabled={saving} onClick={() => onMedia({ kind: "photo", group: { action: "remove", id: section.id } })}>
                      Remove group
                    </Button>
                  </div>
                )}
              </div>
              {section.items.length === 0 ? (
                <p className="text-xs text-gray-400">No photos in this group.</p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {section.items.map((item, index) => (
                    <article
                      key={item.id}
                      data-photo-id={item.id}
                      data-testid={`media-photo-${item.id}`}
                      className={`min-w-0 rounded-2xl border bg-white p-3 ${item.hidden ? "border-dashed border-gray-300" : "border-gray-100"} ${dropId === item.id ? "ring-2 ring-[#0d9488]" : ""}`}
                    >
                      {canEdit && (
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <label className="inline-flex min-h-11 items-center gap-2 text-xs font-bold">
                            <input
                              type="checkbox"
                              data-testid={`photo-select-${item.id}`}
                              checked={selected.includes(item.id)}
                              onChange={() => toggle(item.id)}
                            />
                            Select
                          </label>
                          <button
                            type="button"
                            data-testid={`photo-drag-${item.id}`}
                            aria-label={`Drag to reorder ${item.name}`}
                            className="inline-flex min-h-11 min-w-11 cursor-grab items-center justify-center rounded-xl border border-gray-200 touch-none"
                            style={{ touchAction: "none" }}
                            onPointerDown={(event) => {
                              if (event.button !== 0) return;
                              dragId.current = item.id;
                              event.currentTarget.setPointerCapture(event.pointerId);
                            }}
                            onPointerMove={(event) => {
                              if (dragId.current !== item.id) return;
                              const hit = document.elementFromPoint(event.clientX, event.clientY);
                              const card = hit instanceof Element ? hit.closest("[data-photo-id]") : null;
                              setDropId(card?.getAttribute("data-photo-id") || "");
                            }}
                            onPointerUp={(event) => {
                              const hit = document.elementFromPoint(event.clientX, event.clientY);
                              const card = hit instanceof Element ? hit.closest("[data-photo-id]") : null;
                              finishDrag(card?.getAttribute("data-photo-id") || dropId);
                            }}
                            onPointerCancel={() => {
                              dragId.current = "";
                              setDropId("");
                            }}
                          >
                            <GripVertical className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                      <button type="button" className="block w-full text-left" onClick={() => canEdit && toggle(item.id)}>
                        <ClientGalleryMediaFrame item={toGalleryItem(item)} />
                      </button>
                      <p className="mt-3 truncate text-sm font-bold">{item.name}</p>
                      {item.hidden && <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Hidden</p>}
                      {showEditor && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => onMedia({ kind: "photo", id: item.id, hidden: !item.hidden })}>
                            {item.hidden ? <Eye className="mr-1 h-3.5 w-3.5" /> : <EyeOff className="mr-1 h-3.5 w-3.5" />}
                            {item.hidden ? "Show" : "Hide"}
                          </Button>
                          <Button type="button" size="sm" variant="outline" disabled={saving || index === 0} onClick={() => onMedia({ kind: "photo", id: item.id, move: "earlier" })}>Earlier</Button>
                          <Button type="button" size="sm" variant="outline" disabled={saving || index === section.items.length - 1} onClick={() => onMedia({ kind: "photo", id: item.id, move: "later" })}>Later</Button>
                        </div>
                      )}
                      <PhotoEditNote
                        item={item}
                        requests={photoEditRequests}
                        saving={saving}
                        onRequest={onRequestPhotoEdit}
                        onOpen={setLightbox}
                      />
                    </article>
                  ))}
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

function PhotoEditNote({
  item,
  requests,
  saving,
  onRequest,
  onOpen,
}: {
  item: PortalMediaItem;
  requests: PhotoEditRequest[];
  saving: boolean;
  onRequest?: (photoId: string, note: string) => Promise<boolean>;
  onOpen: (request: PhotoEditRequest) => void;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const mine = requests.filter((request) => request.photoId === item.id);
  const pending = mine.some((request) => request.status !== "received_back");
  if (!onRequest && mine.length === 0) return null;
  return (
    <div className="mt-3 space-y-2">
      {mine.map((request) => (
        <div key={request.id} data-testid={`photo-edit-status-${request.id}`} className="rounded-xl bg-gray-50 px-3 py-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-[#0d9488]">{photoEditStatusLabel(request.status)}</p>
          <p className="mt-1 text-sm text-gray-700">{request.note}</p>
          <ol className="mt-2 space-y-1">
            {request.timeline.map((entry) => (
              <li key={`${entry.status}-${entry.at}`} className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                {photoEditStatusLabel(entry.status)}
              </li>
            ))}
          </ol>
          {request.replacement && (
            <button type="button" className="mt-2 block w-full overflow-hidden rounded-lg" onClick={() => onOpen(request)} data-testid={`revision-thumb-${request.id}`}>
              <img src={request.replacement.url} alt={request.replacement.name} className="aspect-video w-full object-cover" />
            </button>
          )}
        </div>
      ))}
      {onRequest && !pending && !open && (
        <Button type="button" size="sm" variant="outline" data-testid={`photo-edit-open-${item.id}`} onClick={() => setOpen(true)}>
          Request edit
        </Button>
      )}
      {onRequest && !pending && open && (
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-gray-400" htmlFor={`photo-edit-note-${item.id}`}>
            Note
          </label>
          <textarea
            id={`photo-edit-note-${item.id}`}
            data-testid={`photo-edit-note-${item.id}`}
            value={note}
            maxLength={PHOTO_EDIT_NOTE_LIMIT}
            rows={3}
            placeholder="What should change on this photo?"
            onChange={(event) => setNote(event.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-[10px] text-gray-400">The note is saved on this photo. It does not send a message or create a charge.</p>
          <div className="mt-2 flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => { setOpen(false); setNote(""); }}>Cancel</Button>
            <Button
              type="button"
              size="sm"
              data-testid={`photo-edit-submit-${item.id}`}
              disabled={saving || !note.trim()}
              onClick={() => {
                void onRequest(item.id, note).then((ok) => {
                  if (!ok) return;
                  setNote("");
                  setOpen(false);
                });
              }}
            >
              Send request
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
