import * as React from "react";
import {
  assignListingFiles,
  createListingFolder,
  deleteListingFiles,
  deleteListingFolder,
  moveListingFiles,
  queueListingAiEdit,
  queueListingCubiCasa,
} from "@/lib/listingUpload";
import {
  LISTING_MEDIA_STORAGE,
  canPreviewImage,
  filesInView,
  formatFileSize,
  listingAddressLabel,
  normalizeMediaFiles,
  normalizeMediaFolders,
  sortMediaFiles,
  type MediaFileRecord,
  type MediaSortDir,
  type MediaSortKey,
} from "@shared/mediaLibrary";
import { Download, FolderPlus, Grid3X3, List, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";

export interface MediaLibraryListing {
  id: string;
  images?: unknown;
  mediaFolders?: unknown;
  propertyAddress?: unknown;
  address?: unknown;
  shootLocation?: unknown;
  clientName?: unknown;
  clientId?: unknown;
}

const NO_DESTINATIONS: MediaLibraryListing[] = [];

interface MediaLibraryProps {
  listing: MediaLibraryListing;
  destinations?: MediaLibraryListing[];
  canMove?: boolean;
  canOrganize?: boolean;
  onChanged?: () => Promise<void> | void;
  onUploadClick?: () => void;
}

const labelCls = "text-[10px] font-black text-gray-400 uppercase tracking-widest";

function formatWhen(value: string) {
  const time = Date.parse(value);
  if (!time) return "—";
  return new Date(time).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function downloadFile(file: MediaFileRecord) {
  const link = document.createElement("a");
  link.href = file.url;
  link.target = "_blank";
  link.rel = "noopener";
  link.download = file.name;
  link.click();
}

export default function MediaLibrary({
  listing,
  destinations = NO_DESTINATIONS,
  canMove = false,
  canOrganize = false,
  onChanged,
  onUploadClick,
}: MediaLibraryProps) {
  const files = React.useMemo(() => normalizeMediaFiles(listing.images), [listing.images]);
  const folders = React.useMemo(() => normalizeMediaFolders(listing.mediaFolders), [listing.mediaFolders]);
  const [view, setView] = React.useState("all");
  const [mode, setMode] = React.useState<"grid" | "list">("grid");
  const [sortKey, setSortKey] = React.useState<MediaSortKey>("date");
  const [sortDir, setSortDir] = React.useState<MediaSortDir>("desc");
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [folderName, setFolderName] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const [destinationId, setDestinationId] = React.useState(listing.id);
  const [destinationSlot, setDestinationSlot] = React.useState("photos");

  React.useEffect(() => {
    setSelected([]);
    setDestinationId(listing.id);
    setView("all");
  }, [listing.id]);

  const destination = destinations.find((item) => item.id === destinationId) || listing;
  const destinationFolders = normalizeMediaFolders(destination.mediaFolders);
  const visible = sortMediaFiles(
    filesInView(files, view).filter((file) => file.name.toLowerCase().includes(query.trim().toLowerCase())),
    sortKey,
    sortDir,
  );
  const selectedFiles = files.filter((file) => selected.includes(file.path));

  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(label);
    try {
      await action();
      await onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy("");
    }
  };

  const toggle = (path: string) => {
    setSelected((current) => current.includes(path) ? current.filter((item) => item !== path) : [...current, path]);
  };

  const createFolder = () => run("folder", async () => {
    if (!folderName.trim()) throw new Error("Folder name is required.");
    await createListingFolder(listing.id, folderName);
    setFolderName("");
    toast.success("Folder created on this listing.");
  });

  const removeFolder = (folderId: string) => {
    if (!window.confirm("Delete this folder? Files go back to Photos or RAW.")) return;
    void run("folder", async () => {
      await deleteListingFolder(listing.id, folderId);
      if (view === folderId) setView("all");
      toast.success("Folder deleted.");
    });
  };

  const removeFiles = () => {
    if (!selectedFiles.length) return;
    if (!window.confirm(`Delete ${selectedFiles.length} file(s) from this listing and storage?`)) return;
    void run("delete", async () => {
      await deleteListingFiles(listing.id, selectedFiles.map((file) => file.path));
      setSelected([]);
      toast.success("Files deleted.");
    });
  };

  const putInFolder = (folderId: string | null) => run("move", async () => {
    await assignListingFiles(listing.id, selectedFiles.map((file) => file.path), folderId);
    setSelected([]);
    toast.success(folderId ? "Moved into the folder." : "Moved back to Photos or RAW.");
  });

  const moveToListing = () => run("move", async () => {
    const custom = destinationFolders.find((folder) => folder.id === destinationSlot);
    await moveListingFiles(listing.id, {
      paths: selectedFiles.map((file) => file.path),
      destinationListingId: destinationId,
      destinationStorageFolder: destinationSlot === "raw" ? "raw" : "photos",
      destinationFolderId: custom?.id || null,
    });
    setSelected([]);
    toast.success("Files moved. They now belong to the destination listing.");
  });

  const queueCubi = () => run("cubicasa", async () => {
    const result = await queueListingCubiCasa(listing.id, selectedFiles.map((file) => file.path));
    toast.success("CubiCasa request saved for ops.", {
      description: String(result.nextStep || "Complete the order in CubiCasa, then paste the link in Studio."),
    });
  });

  const queueEdit = () => run("edit", async () => {
    const result = await queueListingAiEdit(listing.id, selectedFiles.map((file) => file.path));
    toast.success("AI edit queued.", {
      description: String(result.nextStep || "The file is on the internal edit queue."),
    });
  });

  const views = [
    { id: "all", name: "All files", count: files.length },
    { id: "photos", name: "Photos", count: filesInView(files, "photos").length },
    { id: "raw", name: "RAW", count: filesInView(files, "raw").length },
    ...folders.map((folder) => ({ id: folder.id, name: folder.name, count: filesInView(files, folder.id).length })),
  ];

  return (
    <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/80">
        <p className={labelCls}>Where these files live</p>
        <p className="text-xs font-bold text-gray-700 mt-1">
          Default bucket <span className="font-mono">{LISTING_MEDIA_STORAGE.defaultBucket}</span>
          {" "}(override with FIREBASE_STORAGE_BUCKET)
        </p>
        <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
          Storage <span className="font-mono">listings/{listing.id}/photos</span> and <span className="font-mono">raw</span>.
          Firestore <span className="font-mono">listings/{listing.id}.images</span> and <span className="font-mono">.mediaFolders</span>.
          {listing.clientName ? ` Client: ${String(listing.clientName)}.` : ""}
          {listing.clientId ? ` Client id ${String(listing.clientId)}.` : ""}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="border-b lg:border-b-0 lg:border-r border-gray-100 p-4 space-y-1">
          {views.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={view === item.id}
              onClick={() => setView(item.id)}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-left text-xs font-bold ${view === item.id ? "bg-[#0d9488]/10 text-[#0f766e]" : "text-gray-600 hover:bg-gray-50"}`}
            >
              <span className="truncate">{item.name}</span>
              <span className="text-[10px] text-gray-400">{item.count}</span>
            </button>
          ))}
          {canOrganize && folders.find((folder) => folder.id === view) && (
            <button type="button" onClick={() => removeFolder(view)} className="w-full px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-500 text-left">
              Delete folder
            </button>
          )}
          {canOrganize && (
            <form
              className="pt-3 space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                void createFolder();
              }}
            >
              <label className={labelCls} htmlFor={`folder-${listing.id}`}>New folder</label>
              <input
                id={`folder-${listing.id}`}
                value={folderName}
                onChange={(event) => setFolderName(event.target.value)}
                placeholder="Selects"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold"
              />
              <button type="submit" disabled={Boolean(busy)} className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-black text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-40">
                <FolderPlus className="w-3.5 h-3.5" /> Create
              </button>
            </form>
          )}
        </aside>

        <div className="p-4 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search files"
              aria-label="Search files"
              className="flex-1 min-w-[140px] bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold"
            />
            <label className="sr-only" htmlFor={`sort-${listing.id}`}>Sort files</label>
            <select
              id={`sort-${listing.id}`}
              value={`${sortKey}:${sortDir}`}
              onChange={(event) => {
                const [key, dir] = event.target.value.split(":");
                setSortKey(key as MediaSortKey);
                setSortDir(dir as MediaSortDir);
              }}
              className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold"
            >
              <option value="name:asc">Name A–Z</option>
              <option value="name:desc">Name Z–A</option>
              <option value="date:desc">Newest</option>
              <option value="date:asc">Oldest</option>
              <option value="size:desc">Largest</option>
              <option value="size:asc">Smallest</option>
            </select>
            <button type="button" aria-pressed={mode === "grid"} onClick={() => setMode("grid")} className={`p-2 rounded-xl border ${mode === "grid" ? "border-[#0d9488] text-[#0d9488]" : "border-gray-200 text-gray-400"}`}>
              <Grid3X3 className="w-4 h-4" />
              <span className="sr-only">Grid</span>
            </button>
            <button type="button" aria-pressed={mode === "list"} onClick={() => setMode("list")} className={`p-2 rounded-xl border ${mode === "list" ? "border-[#0d9488] text-[#0d9488]" : "border-gray-200 text-gray-400"}`}>
              <List className="w-4 h-4" />
              <span className="sr-only">List</span>
            </button>
          </div>

          {selectedFiles.length > 0 && (
            <div className="mb-4 p-3 rounded-2xl bg-gray-50 border border-gray-100 space-y-3">
              <p className="text-xs font-black">{selectedFiles.length} selected</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={Boolean(busy)} onClick={() => selectedFiles.forEach(downloadFile)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-gray-200 text-[10px] font-black uppercase tracking-widest">
                  <Download className="w-3.5 h-3.5" /> Download
                </button>
                {canOrganize && (
                  <button type="button" disabled={Boolean(busy)} onClick={removeFiles} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-red-100 text-red-600 text-[10px] font-black uppercase tracking-widest">
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                )}
                <button type="button" disabled={Boolean(busy)} onClick={() => void queueCubi()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-gray-200 text-[10px] font-black uppercase tracking-widest">
                  CubiCasa
                </button>
                <button type="button" disabled={Boolean(busy)} onClick={() => void queueEdit()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0d9488] text-white text-[10px] font-black uppercase tracking-widest">
                  <Wand2 className="w-3.5 h-3.5" /> AI edit
                </button>
              </div>
              {canOrganize && (
                <div className="flex flex-wrap gap-2 items-center">
                  <label className={labelCls} htmlFor={`into-${listing.id}`}>Folder</label>
                  <select
                    id={`into-${listing.id}`}
                    defaultValue=""
                    onChange={(event) => {
                      if (event.target.value) void putInFolder(event.target.value === "root" ? null : event.target.value);
                      event.target.value = "";
                    }}
                    className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold"
                  >
                    <option value="">Move into folder…</option>
                    <option value="root">Photos / RAW</option>
                    {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                  </select>
                </div>
              )}
              {canMove && (
                <div className="flex flex-wrap gap-2 items-end">
                  <div>
                    <label className={labelCls} htmlFor={`dest-${listing.id}`}>Move to listing</label>
                    <select id={`dest-${listing.id}`} value={destinationId} onChange={(event) => { setDestinationId(event.target.value); setDestinationSlot("photos"); }} className="mt-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold max-w-[240px]">
                      {(destinations.length ? destinations : [listing]).map((item) => (
                        <option key={item.id} value={item.id}>{listingAddressLabel(item)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls} htmlFor={`slot-${listing.id}`}>Place in</label>
                    <select id={`slot-${listing.id}`} value={destinationSlot} onChange={(event) => setDestinationSlot(event.target.value)} className="mt-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold">
                      <option value="photos">Photos</option>
                      <option value="raw">RAW</option>
                      {destinationFolders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                    </select>
                  </div>
                  <button type="button" disabled={Boolean(busy)} onClick={() => void moveToListing()} className="px-3 py-2 rounded-xl bg-black text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-40">
                    Move
                  </button>
                </div>
              )}
              {busy && <p className="text-[10px] font-bold text-[#0d9488] uppercase tracking-widest">{busy}…</p>}
            </div>
          )}

          {visible.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm font-black text-gray-400 uppercase tracking-widest">No files in this folder</p>
              <p className="text-xs text-gray-400 mt-2">Uploads for this job show up here as tiles.</p>
              {onUploadClick && (
                <button type="button" onClick={onUploadClick} className="mt-4 px-4 py-2 rounded-xl bg-[#0d9488] text-white text-[10px] font-black uppercase tracking-widest">
                  Upload
                </button>
              )}
            </div>
          ) : mode === "grid" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {visible.map((file) => (
                <FileTile key={file.path || file.id} file={file} selected={selected.includes(file.path)} onToggle={() => toggle(file.path)} />
              ))}
            </div>
          ) : (
            <div className="divide-y divide-gray-100 border border-gray-100 rounded-2xl overflow-hidden">
              {visible.map((file) => (
                <div key={file.path || file.id} className="flex items-center gap-3 px-3 py-2 bg-white">
                  <input type="checkbox" checked={selected.includes(file.path)} onChange={() => toggle(file.path)} aria-label={`Select ${file.name}`} />
                  <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
                    {canPreviewImage(file) && file.url ? (
                      <img src={file.url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[8px] font-black text-gray-400">FILE</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold truncate">{file.name}</p>
                    <p className="text-[10px] text-gray-400">{formatWhen(file.uploadedAt)} · {formatFileSize(file.size)}</p>
                  </div>
                  <button type="button" onClick={() => downloadFile(file)} className="p-2 text-gray-400 hover:text-black" aria-label={`Download ${file.name}`}>
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FileTile({ file, selected, onToggle }: { file: MediaFileRecord; selected: boolean; onToggle: () => void }) {
  return (
    <div className={`rounded-2xl border overflow-hidden ${selected ? "border-[#0d9488] ring-2 ring-[#0d9488]/30" : "border-gray-100"}`}>
      <button type="button" onClick={onToggle} className="block w-full text-left">
        <div className="aspect-square bg-gray-100">
          {canPreviewImage(file) && file.url ? (
            <img src={file.url} alt={file.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">No preview</p>
              <p className="text-[10px] font-bold text-gray-500 mt-1 break-all">{file.name}</p>
            </div>
          )}
        </div>
        <div className="p-2">
          <p className="text-[11px] font-bold truncate">{file.name}</p>
          <p className="text-[10px] text-gray-400">{formatFileSize(file.size)}</p>
        </div>
      </button>
    </div>
  );
}
