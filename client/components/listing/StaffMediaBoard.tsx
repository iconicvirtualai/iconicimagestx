import { useEffect, useRef, useState } from "react";
import {
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
  setSectionHidden,
  type ArrangementMedia,
  type MediaArrangement,
} from "@shared/mediaArrangement";

const SCALE_KEY_PREFIX = "iconic-staff-media-tile:";

function readScale(userId: string): number {
  if (typeof window === "undefined") return 40;
  const raw = window.localStorage.getItem(`${SCALE_KEY_PREFIX}${userId || "staff"}`);
  const value = Number(raw);
  if (!Number.isFinite(value)) return 40;
  return Math.min(100, Math.max(0, value));
}

export function StaffMediaBoard({
  userId,
  address,
  media,
  arrangement,
  saving = false,
  onSave,
  onRemove,
}: {
  userId: string;
  address: string;
  media: ArrangementMedia[];
  arrangement: MediaArrangement;
  saving?: boolean;
  onSave: (arrangement: MediaArrangement) => Promise<void> | void;
  onRemove?: (id: string) => void;
}) {
  const savedKey = JSON.stringify(readMediaArrangement(arrangement));
  const [baseline, setBaseline] = useState(savedKey);
  const [draft, setDraft] = useState(() => readMediaArrangement(arrangement));
  const [selected, setSelected] = useState<string[]>([]);
  const [anchor, setAnchor] = useState("");
  const [scale, setScale] = useState(() => readScale(userId));
  const [dropId, setDropId] = useState("");
  const [sectionName, setSectionName] = useState("");
  const [moveTarget, setMoveTarget] = useState("");
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const stopDrag = useRef<(() => void) | null>(null);

  if (savedKey !== baseline) {
    setBaseline(savedKey);
    setDraft(readMediaArrangement(arrangement));
  }

  useEffect(() => () => stopDrag.current?.(), []);

  const current = readMediaArrangement(draft);
  const dirty = JSON.stringify(current) !== savedKey;
  const sequenced = sequenceArrangement(media, current, address || "listing");
  const flat = flatArrangement(media, current);
  const tile = 96 + Math.round((scale / 100) * 160);
  const groups = [
    { id: "", name: "No section", hide: false, items: sequenced.filter((item) => !item.sectionId) },
    ...current.sections.map((section) => ({
      id: section.id,
      name: section.name,
      hide: section.hideFromListingSites,
      items: sequenced.filter((item) => item.sectionId === section.id),
    })),
  ];
  const firstPhoto = sequenced.find((item) => item.kind === "photo" && item.deliveryName);

  function commit(next: MediaArrangement) {
    setDraft(readMediaArrangement(next));
    setError("");
  }

  function selectAt(id: string, event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) {
    const order = flat.map((row) => row.id);
    if (event.shiftKey && anchor) {
      const start = order.indexOf(anchor);
      const end = order.indexOf(id);
      if (start >= 0 && end >= 0) {
        const [from, to] = start < end ? [start, end] : [end, start];
        setSelected(order.slice(from, to + 1));
        return;
      }
    }
    if (event.metaKey || event.ctrlKey) {
      setSelected((currentIds) => currentIds.includes(id) ? currentIds.filter((item) => item !== id) : [...currentIds, id]);
      setAnchor(id);
      return;
    }
    setSelected([id]);
    setAnchor(id);
  }

  function onPointerDown(event: React.PointerEvent<HTMLElement>, id: string) {
    if (event.button !== 0) return;
    const target = event.target;
    if (target instanceof Element && target.closest("button, a, input, select, textarea, label")) return;
    const draggingIds = selected.includes(id) ? selected : [id];
    const originX = event.clientX;
    const originY = event.clientY;
    let dragging = false;
    let over = "";
    const move = (pointer: PointerEvent) => {
      if (!dragging && Math.hypot(pointer.clientX - originX, pointer.clientY - originY) < 8) return;
      dragging = true;
      const element = pointer.target instanceof Element ? pointer.target.closest("[data-media-id]") : null;
      const next = element?.getAttribute("data-media-id") || "";
      if (next && !draggingIds.includes(next)) over = next;
      setDropId(over);
    };
    const up = (pointer: PointerEvent) => {
      stopDrag.current?.();
      stopDrag.current = null;
      setDropId("");
      if (!dragging) {
        selectAt(id, pointer);
        return;
      }
      if (!over) return;
      const next = moveSelection(flatArrangement(media, current), draggingIds, over, "before");
      commit(placeMedia(current, next));
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

  async function save() {
    setSaveError("");
    try {
      await onSave(current);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save the media order.");
    }
  }

  return (
    <div data-testid="staff-media-board" className="mt-6">
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-3">
        <label className="flex min-w-[180px] flex-1 items-center gap-3 text-[10px] font-black uppercase tracking-widest text-gray-500">
          Size
          <input
            type="range"
            min={0}
            max={100}
            value={scale}
            aria-label="Thumbnail size"
            data-testid="staff-media-scale"
            onChange={(event) => {
              const next = Number(event.target.value);
              setScale(next);
              if (typeof window !== "undefined") {
                window.localStorage.setItem(`${SCALE_KEY_PREFIX}${userId || "staff"}`, String(next));
              }
            }}
          />
        </label>
        <button
          type="button"
          data-testid="staff-media-select-all"
          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest"
          onClick={() => setSelected(flat.map((row) => row.id))}
        >
          Select all
        </button>
        {selected.length > 0 && (
          <button
            type="button"
            data-testid="staff-media-clear"
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest"
            onClick={() => setSelected([])}
          >
            Clear
          </button>
        )}
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-500" data-testid="staff-media-save-state">
          {saving ? "Saving" : dirty ? "Unsaved changes" : "Saved"}
        </p>
        <button
          type="button"
          data-testid="staff-media-save"
          disabled={!dirty || saving}
          className="rounded-xl bg-black px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-40"
          onClick={() => void save()}
        >
          Save order
        </button>
      </div>
      <p className="mb-4 text-xs text-gray-500">
        Click to select. Shift-click selects a range. Command-click or Control-click adds a file. Drag one file or the selection to reorder. Touch works the same way.
      </p>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">
          New section
          <input
            value={sectionName}
            data-testid="staff-section-name"
            maxLength={60}
            onChange={(event) => setSectionName(event.target.value)}
            className="mt-1 block rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-black"
          />
        </label>
        <button
          type="button"
          data-testid="staff-section-create"
          className="rounded-xl bg-[#0d9488] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white"
          onClick={() => {
            const result = createSection(current, sectionName, selected);
            if (result.ok === false) setError(result.error);
            else {
              commit(result.arrangement);
              setSectionName("");
            }
          }}
        >
          Create section
        </button>
        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">
          Move selected
          <select
            value={moveTarget}
            data-testid="staff-section-move-target"
            onChange={(event) => setMoveTarget(event.target.value)}
            className="mt-1 block rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-black"
          >
            <option value="">No section</option>
            {current.sections.map((section) => (
              <option key={section.id} value={section.id}>{section.name}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          data-testid="staff-section-move"
          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest"
          onClick={() => {
            const result = moveIntoSection(media, current, selected, moveTarget);
            if (result.ok === false) setError(result.error);
            else commit(result.arrangement);
          }}
        >
          Move
        </button>
      </div>
      {error && <p className="mb-3 text-sm font-bold text-red-600">{error}</p>}
      {saveError && <p className="mb-3 text-sm font-bold text-red-600">{saveError}</p>}
      <div className="space-y-6">
        {groups.map((group) => (
          <section key={group.id || "loose"} data-testid={group.id ? `staff-section-${group.id}` : "staff-section-loose"}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {group.id ? (
                <input
                  value={group.name}
                  aria-label={`Rename ${group.name}`}
                  data-testid={`staff-section-rename-${group.id}`}
                  maxLength={60}
                  onChange={(event) => {
                    const result = renameSection(current, group.id, event.target.value);
                    if (result.ok) commit(result.arrangement);
                  }}
                  className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-black"
                />
              ) : (
                <h4 className="text-sm font-black">{group.name}</h4>
              )}
              {group.id && (
                <>
                  <button
                    type="button"
                    aria-pressed={group.hide}
                    data-testid={`staff-section-hide-${group.id}`}
                    className={`rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest ${group.hide ? "bg-black text-white" : "border border-gray-200 bg-white"}`}
                    onClick={() => {
                      const result = setSectionHidden(current, group.id, !group.hide);
                      if (result.ok) commit(result.arrangement);
                    }}
                  >
                    Hide from listing presentation websites
                  </button>
                  <button type="button" data-testid={`staff-section-up-${group.id}`} className="rounded-xl border border-gray-200 px-2 py-2 text-[10px] font-black" onClick={() => {
                    const ids = current.sections.map((section) => section.id);
                    const index = ids.indexOf(group.id);
                    if (index <= 0) return;
                    const next = [...ids];
                    const [item] = next.splice(index, 1);
                    next.splice(index - 1, 0, item);
                    commit(reorderSections(current, next));
                  }}>Up</button>
                  <button type="button" data-testid={`staff-section-down-${group.id}`} className="rounded-xl border border-gray-200 px-2 py-2 text-[10px] font-black" onClick={() => {
                    const ids = current.sections.map((section) => section.id);
                    const index = ids.indexOf(group.id);
                    if (index < 0 || index >= ids.length - 1) return;
                    const next = [...ids];
                    const [item] = next.splice(index, 1);
                    next.splice(index + 1, 0, item);
                    commit(reorderSections(current, next));
                  }}>Down</button>
                  <button type="button" data-testid={`staff-section-delete-${group.id}`} className="rounded-xl border border-gray-200 px-2 py-2 text-[10px] font-black text-red-600" onClick={() => {
                    const result = deleteSection(current, group.id);
                    if (result.ok) commit(result.arrangement);
                    else setError(result.error);
                  }}>Delete</button>
                </>
              )}
            </div>
            {group.items.length === 0 ? (
              <p className="text-xs text-gray-400">Nothing in this section.</p>
            ) : (
              <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${tile}px, 1fr))` }}>
                {group.items.map((item) => {
                  const isSelected = selected.includes(item.id);
                  return (
                    <article
                      key={item.id}
                      data-testid={`staff-media-${item.id}`}
                      data-media-id={item.id}
                      data-selected={isSelected ? "true" : "false"}
                      data-drop={dropId === item.id ? "true" : "false"}
                      className={`overflow-hidden rounded-2xl border bg-white ${isSelected ? "border-black ring-2 ring-black" : "border-gray-100"} ${dropId === item.id ? "border-[#0d9488]" : ""}`}
                      style={{ touchAction: "none" }}
                      onPointerDown={(event) => onPointerDown(event, item.id)}
                    >
                      <div className="flex aspect-square items-center justify-center bg-gray-100 text-[10px] font-black uppercase tracking-widest text-gray-400">
                        {item.kind}
                      </div>
                      <div className="space-y-1 p-2">
                        <p className="truncate text-xs font-bold">{item.name}</p>
                        {item.deliveryName && (
                          <p className="truncate text-[10px] font-bold text-gray-500" data-testid={`staff-file-name-${item.id}`}>{item.deliveryName}</p>
                        )}
                        {firstPhoto?.id === item.id && (
                          <span className="inline-block rounded-full bg-[#0d9488] px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-white">Cover</span>
                        )}
                        {onRemove && item.kind === "photo" && item.bucket === "images" && (
                          <button type="button" className="text-[10px] font-black uppercase tracking-widest text-red-500" onClick={() => onRemove(item.id)}>
                            Remove
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        ))}
      </div>
      <ol className="mt-6 space-y-1" data-testid="staff-sequence-names">
        {sequenced.filter((item) => item.deliveryName).map((item) => (
          <li key={item.id} data-testid={`staff-sequence-${item.id}`} className="text-xs font-bold text-gray-600">{item.deliveryName}</li>
        ))}
      </ol>
    </div>
  );
}
