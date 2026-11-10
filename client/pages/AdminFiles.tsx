import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  Folder,
  FolderClosed,
  FolderPlus,
  Grid2x2,
  List,
  Loader2,
  RotateCcw,
  Search,
  Settings,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import AdminLayout from "@/components/AdminLayout";
import { useAuth } from "@/contexts/AuthContext";
import {
  downloadLibraryFiles,
  filesFromDataTransfer,
  filesFromList,
  filesRequest,
  filesSend,
  uploadOne,
  type LibraryList,
  type UploadInput,
} from "@/lib/filesApi";
import {
  ORDER_MEDIA_KINDS,
  compareBySort,
  formatBytes,
  type LibraryFileView,
  type LibraryFolderView,
  type LibrarySort,
  type OrderMediaKind,
  type OrderTarget,
} from "@shared/mediaLibrary";
import "./filesDesk.css";

type Dialog =
  | null
  | { type: "folder" }
  | { type: "rename"; kind: "file" | "folder"; id: string; name: string }
  | { type: "delete" }
  | { type: "destroy" }
  | { type: "move" }
  | { type: "access" }
  | { type: "order" };

interface QueueItem {
  id: string;
  name: string;
  progress: number;
  status: "uploading" | "done" | "error";
  error?: string;
}

interface Filing {
  order: OrderTarget;
  kind: OrderMediaKind;
  folder: string;
}

const VIEW_KEY = "iconic-files-view";

export default function AdminFiles() {
  const { user } = useAuth();
  const [folder, setFolder] = useState("");
  const [trash, setTrash] = useState(false);
  const [view, setView] = useState<"grid" | "list">(() => {
    try { return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid"; }
    catch { return "grid"; }
  });
  const [sort, setSort] = useState<LibrarySort>("name");
  const [list, setList] = useState<LibraryList | null>(null);
  const [tree, setTree] = useState<LibraryFolderView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<{ files: LibraryFileView[]; folders: LibraryFolderView[] } | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<LibraryFileView | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dropOver, setDropOver] = useState(false);
  const [treeOpen, setTreeOpen] = useState(true);
  const [filing, setFiling] = useState<Filing | null>(null);
  const [orders, setOrders] = useState<OrderTarget[]>([]);
  const [accessRows, setAccessRows] = useState<{ path: string; access: "all_staff" | "owners_coordinators"; system: boolean }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);
  const anchor = useRef<string | null>(null);
  const dragDepth = useRef(0);

  const refresh = () => setVersion((value) => value + 1);

  useEffect(() => {
    if (!user) return undefined;
    let cancel = false;
    setLoading(true);
    void (async () => {
      try {
        const token = await user.getIdToken();
        const path = `/api/files?folder=${encodeURIComponent(trash ? "" : folder)}${trash ? "&trash=1" : ""}`;
        const [nextList, nextTree] = await Promise.all([
          filesRequest<LibraryList>(token, path),
          filesRequest<{ folders: LibraryFolderView[] }>(token, "/api/files/tree"),
        ]);
        if (cancel) return;
        setList(nextList);
        setTree(nextTree.folders);
        setError("");
      } catch (err) {
        if (!cancel) setError(err instanceof Error ? err.message : "Could not load files.");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [user, folder, trash, version]);

  useEffect(() => {
    if (!user) return undefined;
    const text = query.trim();
    if (text.length < 2) {
      setResults(null);
      setSearching(false);
      return undefined;
    }
    let cancel = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const token = await user.getIdToken();
          const found = await filesRequest<{ files: LibraryFileView[]; folders: LibraryFolderView[] }>(
            token,
            `/api/files/search?q=${encodeURIComponent(text)}${trash ? "&trash=1" : ""}`,
          );
          if (!cancel) setResults(found);
        } catch (err) {
          if (!cancel) setError(err instanceof Error ? err.message : "Search failed.");
        } finally {
          if (!cancel) setSearching(false);
        }
      })();
    }, 250);
    return () => { cancel = true; window.clearTimeout(timer); };
  }, [user, query, trash, version]);

  const sourceFiles = results ? results.files : list?.files || [];
  const sourceFolders = results ? results.folders : list?.folders || [];
  const files = useMemo(
    () => sourceFiles.slice().sort((a, b) => compareBySort(sort, a, b)),
    [sourceFiles, sort],
  );
  const folders = useMemo(
    () => sourceFolders.slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })),
    [sourceFolders],
  );
  const preview = files.find((file) => file.id === previewId) || null;
  const rows = [...folders.map((item) => `f:${item.id}`), ...files.map((item) => `m:${item.id}`)];

  const openFolder = (path: string) => {
    setTrash(false);
    setFolder(path);
    setQuery("");
    setResults(null);
    setSelection(new Set());
    setPreviewId(null);
  };

  const chooseView = (next: "grid" | "list") => {
    setView(next);
    try { localStorage.setItem(VIEW_KEY, next); } catch { /* The choice still applies to this visit. */ }
  };

  const selectOnly = (id: string) => {
    anchor.current = id;
    setSelection(new Set([id]));
  };

  const toggle = (id: string, shift: boolean) => {
    if (shift && anchor.current) {
      const start = rows.indexOf(anchor.current);
      const end = rows.indexOf(id);
      if (start >= 0 && end >= 0) {
        const [from, to] = start < end ? [start, end] : [end, start];
        setSelection(new Set(rows.slice(from, to + 1)));
        return;
      }
    }
    anchor.current = id;
    setSelection((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedFiles = files.filter((file) => selection.has(`m:${file.id}`)).map((file) => file.id);
  const selectedFolders = folders.filter((item) => selection.has(`f:${item.id}`)).map((item) => item.id);

  const run = async (work: (token: string) => Promise<void>, done: string) => {
    if (!user) return;
    setBusy(true);
    try {
      await work(await user.getIdToken());
      toast.success(done);
      setDialog(null);
      setSelection(new Set());
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That change did not save.");
    } finally {
      setBusy(false);
    }
  };

  const beginUpload = async (items: UploadInput[], destination = filing?.folder || (trash ? "Inbox" : folder)) => {
    if (!user || items.length === 0) return;
    const meta: Record<string, string> = filing ? {
      orderId: filing.order.id,
      clientId: filing.order.clientId,
      clientName: filing.order.clientName,
      orderNumber: filing.order.orderNumber,
      listingAddress: filing.order.address,
    } : {};
    const jobs = items.filter((item) => item.file.size > 0).map((item) => ({
      ...item,
      queueId: `${item.relativePath}:${item.file.size}:${Math.random().toString(36).slice(2, 7)}`,
    }));
    if (jobs.length === 0) {
      toast.error("Those files are empty.");
      return;
    }
    setQueue((current) => [
      ...jobs.map((job) => ({ id: job.queueId, name: job.file.name, progress: 0, status: "uploading" as const })),
      ...current,
    ].slice(0, 40));
    let cursor = 0;
    const worker = async () => {
      while (cursor < jobs.length) {
        const index = cursor;
        cursor += 1;
        const job = jobs[index];
        try {
          const token = await user.getIdToken();
          await uploadOne(token, job, destination, meta, (fraction) => {
            setQueue((current) => current.map((item) => item.id === job.queueId ? { ...item, progress: fraction } : item));
          });
          setQueue((current) => current.map((item) => item.id === job.queueId ? { ...item, progress: 1, status: "done" } : item));
        } catch (err) {
          const message = err instanceof Error ? err.message : "Upload failed.";
          setQueue((current) => current.map((item) => item.id === job.queueId ? { ...item, status: "error", error: message } : item));
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(2, jobs.length) }, () => worker()));
    refresh();
  };

  const onDrop = async (event: React.DragEvent, destination?: string) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDropOver(false);
    const kind = event.dataTransfer.getData("application/x-iconic-kind");
    const id = event.dataTransfer.getData("application/x-iconic-id");
    if (kind && id && destination !== undefined && user) {
      const fileIds = kind === "file" ? selectedFiles.includes(id) ? selectedFiles : [id] : [];
      const folderIds = kind === "folder" ? selectedFolders.includes(id) ? selectedFolders : [id] : [];
      await run(async (token) => {
        await filesRequest(token, "/api/files/move", { fileIds, folderIds, destination });
      }, "Moved.");
      return;
    }
    const items = await filesFromDataTransfer(event.dataTransfer);
    await beginUpload(items, destination);
  };

  const openOrder = async () => {
    if (!user) return;
    setDialog({ type: "order" });
    setDraft("");
    try {
      const token = await user.getIdToken();
      const data = await filesRequest<{ orders: OrderTarget[] }>(token, "/api/files/order-targets");
      setOrders(data.orders);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load orders.");
    }
  };

  const chooseOrder = async (order: OrderTarget, kind: OrderMediaKind) => {
    if (!user) return;
    setBusy(true);
    try {
      const token = await user.getIdToken();
      const data = await filesRequest<{ folder: string }>(token, "/api/files/order-folder", { orderId: order.id, kind });
      setFiling({ order, kind, folder: data.folder });
      setDialog(null);
      toast.success(`New uploads file to ${data.folder}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open that order folder.");
    } finally {
      setBusy(false);
    }
  };

  const openAccess = async () => {
    if (!user) return;
    setDialog({ type: "access" });
    try {
      const token = await user.getIdToken();
      const data = await filesRequest<{ folders: { path: string; access: "all_staff" | "owners_coordinators"; system: boolean }[] }>(token, "/api/files/access");
      setAccessRows(data.folders);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load folder access.");
    }
  };

  return (
    <AdminLayout plain mainClassName="bg-[#f4f6f5]">
      <div className="files-desk px-4 py-5 lg:px-6">
        <div className="files-top">
          <div>
            <h1>Files</h1>
            <p className="sub">Library on Backblaze · unsorted drops land in Inbox</p>
          </div>
          <div className="files-actions">
            <button type="button" className="files-btn lg:hidden" onClick={() => setTreeOpen((open) => !open)}>Folders</button>
            <button type="button" className="files-btn" onClick={() => { setDialog({ type: "folder" }); setDraft(""); }}><FolderPlus className="h-4 w-4" /> New folder</button>
            <button type="button" className="files-btn" onClick={() => dirRef.current?.click()}>Upload folder</button>
            <button type="button" className="files-btn teal" data-testid="files-upload" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Upload</button>
            <button type="button" className="files-btn" onClick={() => { void openOrder(); }}>File to order</button>
            {list?.canManageAccess && <button type="button" className="files-btn" aria-label="Folder access" onClick={() => { void openAccess(); }}><Settings className="h-4 w-4" /></button>}
          </div>
        </div>
        <input ref={fileRef} data-testid="files-upload-input" className="hidden" type="file" multiple onChange={(event) => { if (event.target.files) void beginUpload(filesFromList(event.target.files)); event.target.value = ""; }} />
        <input ref={dirRef} data-testid="files-folder-input" className="hidden" type="file" multiple onChange={(event) => { if (event.target.files) void beginUpload(filesFromList(event.target.files)); event.target.value = ""; }} {...{ webkitdirectory: "", directory: "" }} />

        <div className={`files-shell ${preview ? "with-preview" : ""}`}>
          <aside className={`files-card files-side ${treeOpen ? "" : "closed"}`} aria-label="Folders">
            <div className="files-side-head" style={{ justifyContent: "space-between", marginBottom: 8 }}>
              <strong>Folders</strong>
            </div>
            <div className="files-tree">
              <button type="button" className={!trash && folder === "" && !results ? "on" : ""} onClick={() => openFolder("")}><FolderClosed className="h-4 w-4" /> All files</button>
              <FolderTree
                folders={tree}
                parent=""
                current={trash || results ? "" : folder}
                onOpen={openFolder}
                onDrop={(event, path) => { void onDrop(event, path); }}
              />
              <button type="button" className={trash ? "on" : ""} data-testid="files-trash" onClick={() => { setTrash(true); setFolder(""); setQuery(""); setResults(null); setSelection(new Set()); }}>
                <Trash2 className="h-4 w-4" /> Trash
              </button>
            </div>
          </aside>

          <section
            className={`files-card files-main ${dropOver ? "files-drop" : ""}`}
            data-testid={view === "grid" ? "files-grid" : "files-list"}
            onDragEnter={(event) => { event.preventDefault(); dragDepth.current += 1; setDropOver(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => { dragDepth.current -= 1; if (dragDepth.current <= 0) { dragDepth.current = 0; setDropOver(false); } }}
            onDrop={(event) => { void onDrop(event, filing?.folder || (trash ? "Inbox" : folder || "Inbox")); }}
          >
            <div className="files-toolbar">
              <div className="files-search">
                <Search className="h-4 w-4" />
                <input aria-label="Search files" data-testid="files-search" placeholder="Search name, client, order, address" value={query} onChange={(event) => setQuery(event.target.value)} />
                {query && <button type="button" aria-label="Clear search" onClick={() => setQuery("")}><X className="h-3.5 w-3.5" /></button>}
              </div>
              <div className="files-tools">
                <label className="files-muted" htmlFor="files-sort">Sort</label>
                <select id="files-sort" value={sort} onChange={(event) => setSort(event.target.value as LibrarySort)} aria-label="Sort files">
                  <option value="name">Name</option>
                  <option value="date">Date</option>
                  <option value="size">Size</option>
                  <option value="type">Type</option>
                </select>
                <div className="files-view" role="group" aria-label="Layout">
                  <button type="button" className={view === "grid" ? "active" : ""} data-testid="files-view-grid" aria-pressed={view === "grid"} onClick={() => chooseView("grid")}><Grid2x2 className="h-4 w-4" /></button>
                  <button type="button" className={view === "list" ? "active" : ""} data-testid="files-view-list" aria-pressed={view === "list"} onClick={() => chooseView("list")}><List className="h-4 w-4" /></button>
                </div>
              </div>
            </div>
            {filing && (
              <div className="chip" style={{ marginTop: 10 }}>
                Filing to {filing.folder}
                <button type="button" aria-label="Stop filing to this order" onClick={() => setFiling(null)}><X className="h-3 w-3" /></button>
              </div>
            )}
            <nav className="files-crumbs" aria-label="Breadcrumb" data-testid="files-breadcrumb">
              {results ? <strong>Search results</strong> : (list?.breadcrumbs || [{ name: "Files", path: "" }]).map((crumb, index, all) => (
                <span key={`${crumb.path}-${index}`}>
                  {index > 0 && <span aria-hidden="true"> / </span>}
                  {index === all.length - 1 ? <strong>{crumb.name}</strong> : <button type="button" onClick={() => openFolder(crumb.path)}>{crumb.name}</button>}
                </span>
              ))}
              {searching && <Loader2 className="h-4 w-4 animate-spin" />}
            </nav>
            {error && <div className="files-error" role="alert">{error}</div>}
            {loading && !list ? (
              <div className="files-empty"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>
            ) : folders.length + files.length === 0 ? (
              <div className="files-empty">
                <Folder className="mx-auto mb-3 h-8 w-8" />
                <p>{trash ? "Trash is empty. Deleted files stay here for 30 days." : results ? "Nothing matched that search." : "This folder is empty. Drop files here or upload a folder."}</p>
              </div>
            ) : view === "grid" ? (
              <div className="files-grid">
                {folders.map((item) => (
                  <Tile key={item.id} selected={selection.has(`f:${item.id}`)} title={item.name} subtitle="Folder" onOpen={() => openFolder(item.path)} onSelect={(shift) => toggle(`f:${item.id}`, shift)} onCheck={() => toggle(`f:${item.id}`, false)} kind="folder" dragId={item.id}>
                    <Folder className="h-8 w-8" />
                  </Tile>
                ))}
                {files.map((file) => (
                  <Tile key={file.id} selected={selection.has(`m:${file.id}`)} title={file.name} subtitle={formatBytes(file.size)} onOpen={() => { selectOnly(`m:${file.id}`); setPreviewId(file.id); if (file.previewUrl) setLightbox(file); }} onSelect={(shift) => { toggle(`m:${file.id}`, shift); setPreviewId(file.id); }} onCheck={() => toggle(`m:${file.id}`, false)} kind="file" dragId={file.id}>
                    <Thumb file={file} />
                  </Tile>
                ))}
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="files-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Name</th>
                      <th>Size</th>
                      <th>Type</th>
                      <th>Uploaded</th>
                      <th>By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {folders.map((item) => (
                      <tr key={item.id} className={selection.has(`f:${item.id}`) ? "selected" : ""} draggable onDragStart={(event) => { event.dataTransfer.setData("application/x-iconic-kind", "folder"); event.dataTransfer.setData("application/x-iconic-id", item.id); }} onClick={(event) => toggle(`f:${item.id}`, event.shiftKey)} onDoubleClick={() => openFolder(item.path)}>
                        <td><input type="checkbox" aria-label={`Select ${item.name}`} checked={selection.has(`f:${item.id}`)} onChange={() => toggle(`f:${item.id}`, false)} onClick={(event) => event.stopPropagation()} /></td>
                        <td><button type="button" className="link" onClick={(event) => { event.stopPropagation(); openFolder(item.path); }}>{item.name}</button></td>
                        <td>—</td>
                        <td>Folder</td>
                        <td>{when(item.createdAt)}</td>
                        <td></td>
                      </tr>
                    ))}
                    {files.map((file) => (
                      <tr key={file.id} className={selection.has(`m:${file.id}`) ? "selected" : ""} data-testid="files-list-row" draggable onDragStart={(event) => { event.dataTransfer.setData("application/x-iconic-kind", "file"); event.dataTransfer.setData("application/x-iconic-id", file.id); }} onClick={(event) => { toggle(`m:${file.id}`, event.shiftKey); setPreviewId(file.id); }}>
                        <td><input type="checkbox" aria-label={`Select ${file.name}`} checked={selection.has(`m:${file.id}`)} onChange={() => toggle(`m:${file.id}`, false)} onClick={(event) => event.stopPropagation()} /></td>
                        <td>
                          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                            <Thumb file={file} small />
                            <button type="button" className="link" onClick={(event) => { event.stopPropagation(); setPreviewId(file.id); if (file.previewUrl) setLightbox(file); }}>{file.name}</button>
                          </span>
                        </td>
                        <td>{formatBytes(file.size)}</td>
                        <td>{typeLabel(file.contentType)}</td>
                        <td>{when(file.createdAt)}</td>
                        <td>{file.uploadedByName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {list?.truncated && <p className="files-muted" style={{ marginTop: 12 }}>Showing the first batch. Search to narrow it down.</p>}
            {queue.length > 0 && (
              <div className="files-queue" data-testid="files-queue" aria-live="polite">
                {queue.slice(0, 6).map((item) => (
                  <article key={item.id}>
                    <div>
                      <strong className="files-name">{item.name}</strong>
                      <div className="files-bar" aria-valuenow={Math.round(item.progress * 100)} aria-valuemin={0} aria-valuemax={100} role="progressbar"><span style={{ width: `${Math.round(item.progress * 100)}%` }} /></div>
                    </div>
                    <span className="files-muted">{item.status === "error" ? item.error : item.status === "done" ? "Saved" : `${Math.round(item.progress * 100)}%`}</span>
                  </article>
                ))}
              </div>
            )}
          </section>

          {preview && (
            <aside className="files-card files-preview" data-testid="files-preview">
              <div className="files-preview-head" style={{ justifyContent: "space-between" }}>
                <span className="files-muted">Details</span>
                <button type="button" className="files-btn" aria-label="Close details" onClick={() => setPreviewId(null)}><X className="h-3.5 w-3.5" /></button>
              </div>
              <div className="stage">
                {preview.previewUrl && preview.contentType.startsWith("image/") && <img src={preview.previewUrl} alt={preview.name} />}
                {preview.previewUrl && preview.contentType.startsWith("video/") && <video src={`${preview.previewUrl}#t=0.1`} controls playsInline preload="metadata" />}
                {!preview.previewUrl && <Folder className="h-8 w-8 text-white" />}
              </div>
              <h2>{preview.name}</h2>
              <p className="files-muted">{preview.path}</p>
              <dl>
                <dt>Size</dt><dd>{formatBytes(preview.size)}</dd>
                <dt>Type</dt><dd>{preview.contentType}</dd>
                <dt>Uploaded</dt><dd>{when(preview.createdAt)}</dd>
                <dt>By</dt><dd>{preview.uploadedByName || "Staff"}</dd>
                {preview.clientName && <><dt>Client</dt><dd>{preview.clientName}</dd></>}
                {preview.orderNumber && <><dt>Order</dt><dd>{preview.orderNumber}</dd></>}
                {preview.listingAddress && <><dt>Address</dt><dd>{preview.listingAddress}</dd></>}
              </dl>
              <Tags file={preview} onSave={(tags, notes) => run(async (token) => { await filesSend(token, `/api/files/${preview.id}`, "PATCH", { tags, notes }); }, "Details saved.")} />
              <div className="files-actions" style={{ marginTop: 12 }}>
                <button type="button" className="files-btn" onClick={() => run(async (token) => { await downloadLibraryFiles(token, [preview.id]); }, "Download started.")}><Download className="h-4 w-4" /> Download</button>
                <button type="button" className="files-btn" onClick={() => { setDraft(preview.name); setDialog({ type: "rename", kind: "file", id: preview.id, name: preview.name }); }}>Rename</button>
              </div>
            </aside>
          )}
        </div>
      </div>

      {selection.size > 0 && (
        <div className="files-bulk">
          <div className="files-bulk-inner">
            <span className="files-count">{selection.size}</span>
            <span>Selected</span>
            {selectedFiles.length > 0 && <button type="button" onClick={() => run(async (token) => { const mode = await downloadLibraryFiles(token, selectedFiles); if (mode === "each") toast.message("Downloaded one at a time. The set is too large to zip in the browser."); }, "Download started.")}>Download</button>}
            {!trash && <button type="button" onClick={() => setDialog({ type: "move" })}>Move</button>}
            {!trash && selectedFiles.length + selectedFolders.length === 1 && (
              <button type="button" onClick={() => {
                const file = files.find((item) => item.id === selectedFiles[0]);
                const item = folders.find((entry) => entry.id === selectedFolders[0]);
                const name = file?.name || item?.name || "";
                setDraft(name);
                setDialog({ type: "rename", kind: file ? "file" : "folder", id: file?.id || item?.id || "", name });
              }}>Rename</button>
            )}
            {trash ? (
              <>
                <button type="button" onClick={() => run(async (token) => { await filesRequest(token, "/api/files/restore", { fileIds: selectedFiles, folderIds: selectedFolders }); }, "Restored.")}><RotateCcw className="inline h-3.5 w-3.5" /> Restore</button>
                <button type="button" onClick={() => setDialog({ type: "destroy" })}>Delete forever</button>
              </>
            ) : (
              <button type="button" onClick={() => setDialog({ type: "delete" })}>Delete</button>
            )}
            <button type="button" aria-label="Clear selection" onClick={() => setSelection(new Set())}><X className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      {dialog?.type === "folder" && (
        <Modal title="New folder" text="It is created in the folder you are viewing." onClose={() => setDialog(null)}>
          <Field label="Name" value={draft} onChange={setDraft} />
          <div className="row"><button type="button" className="files-btn" onClick={() => setDialog(null)}>Cancel</button><button type="button" className="files-btn teal" disabled={busy} onClick={() => run(async (token) => { await filesRequest(token, "/api/files/folders", { parent: trash ? "Inbox" : folder, name: draft }); }, "Folder created.")}>Create</button></div>
        </Modal>
      )}
      {dialog?.type === "rename" && (
        <Modal title="Rename" text="The file stays in the same folder." onClose={() => setDialog(null)}>
          <Field label="Name" value={draft} onChange={setDraft} />
          <div className="row"><button type="button" className="files-btn" onClick={() => setDialog(null)}>Cancel</button><button type="button" className="files-btn teal" disabled={busy} onClick={() => run(async (token) => { await filesRequest(token, "/api/files/rename", { kind: dialog.kind, id: dialog.id, name: draft }); }, "Renamed.")}>Save</button></div>
        </Modal>
      )}
      {dialog?.type === "delete" && (
        <Modal title={`Delete ${selection.size} item${selection.size === 1 ? "" : "s"}?`} text="They move to Trash for 30 days. You can restore them until then." onClose={() => setDialog(null)}>
          <div className="row"><button type="button" className="files-btn" onClick={() => setDialog(null)}>Cancel</button><button type="button" className="files-btn dark" disabled={busy} data-testid="files-confirm-delete" onClick={() => run(async (token) => { await filesRequest(token, "/api/files/delete", { fileIds: selectedFiles, folderIds: selectedFolders }); }, "Moved to Trash.")}>Delete</button></div>
        </Modal>
      )}
      {dialog?.type === "destroy" && (
        <Modal title="Delete forever?" text="This removes the files from Backblaze. They cannot be restored." onClose={() => setDialog(null)}>
          <div className="row"><button type="button" className="files-btn" onClick={() => setDialog(null)}>Cancel</button><button type="button" className="files-btn danger" disabled={busy} onClick={() => run(async (token) => { await filesRequest(token, "/api/files/destroy", { fileIds: selectedFiles, folderIds: selectedFolders }); }, "Deleted forever.")}>Delete forever</button></div>
        </Modal>
      )}
      {dialog?.type === "move" && (
        <Modal title="Move to" text="Choose a folder. Dragging onto a folder in the list does the same thing." onClose={() => setDialog(null)}>
          <div className="files-tree" style={{ maxHeight: 280, overflow: "auto" }}>
            {tree.map((item) => (
              <button key={item.id} type="button" onClick={() => run(async (token) => { await filesRequest(token, "/api/files/move", { fileIds: selectedFiles, folderIds: selectedFolders, destination: item.path }); }, "Moved.")}>{item.path}</button>
            ))}
          </div>
        </Modal>
      )}
      {dialog?.type === "order" && (
        <Modal title="File with an order" text="Creates Clients / client / address / Photos, Video, 3D, Floorplans, and Raw. The next uploads go in the folder you pick." onClose={() => setDialog(null)}>
          <Field label="Find an order" value={draft} onChange={(value) => {
            setDraft(value);
            if (!user) return;
            void user.getIdToken().then((token) => filesRequest<{ orders: OrderTarget[] }>(token, `/api/files/order-targets?q=${encodeURIComponent(value)}`).then((data) => setOrders(data.orders))).catch(() => undefined);
          }} />
          <div className="files-tree" style={{ maxHeight: 240, overflow: "auto", margin: "10px 0" }}>
            {orders.map((order) => (
              <div key={order.id} style={{ padding: "8px 0", borderTop: "1px solid var(--line)" }}>
                <strong>{order.clientName || "Client"}</strong>
                <div className="files-muted">{order.address || order.orderNumber}</div>
                <div className="files-actions" style={{ marginTop: 6 }}>
                  {ORDER_MEDIA_KINDS.map((kind) => (
                    <button key={kind} type="button" className="files-btn" disabled={busy} onClick={() => { void chooseOrder(order, kind); }}>{kind}</button>
                  ))}
                </div>
              </div>
            ))}
            {orders.length === 0 && <p className="files-muted">No orders matched.</p>}
          </div>
        </Modal>
      )}
      {dialog?.type === "access" && (
        <Modal title="Folder access" text="Owners and coordinators can open every folder. Other staff only open folders set to all staff." onClose={() => setDialog(null)}>
          {accessRows.map((row) => (
            <label key={row.path} className="files-row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
              <span>{row.path}</span>
              <select aria-label={`${row.path} access`} value={row.access} onChange={(event) => {
                const access = event.target.value === "owners_coordinators" ? "owners_coordinators" : "all_staff";
                setAccessRows((current) => current.map((item) => item.path === row.path ? { ...item, access } : item));
                if (!user) return;
                void user.getIdToken().then((token) => filesSend(token, "/api/files/access", "PUT", { path: row.path, access })).then(() => toast.success("Access saved.")).catch((err) => toast.error(err instanceof Error ? err.message : "Could not save access."));
              }}>
                <option value="all_staff">All staff</option>
                <option value="owners_coordinators">Owners and coordinators</option>
              </select>
            </label>
          ))}
        </Modal>
      )}
      {lightbox?.previewUrl && (
        <div className="files-lightbox" role="dialog" aria-modal="true" aria-label={lightbox.name} onClick={() => setLightbox(null)}>
          {lightbox.contentType.startsWith("video/")
            ? <video src={lightbox.previewUrl} controls autoPlay playsInline onClick={(event) => event.stopPropagation()} />
            : <img src={lightbox.previewUrl} alt={lightbox.name} onClick={(event) => event.stopPropagation()} />}
        </div>
      )}
    </AdminLayout>
  );
}

function FolderTree({
  folders, parent, current, depth = 0, onOpen, onDrop,
}: {
  folders: LibraryFolderView[];
  parent: string;
  current: string;
  depth?: number;
  onOpen: (path: string) => void;
  onDrop: (event: React.DragEvent, path: string) => void;
}) {
  const children = folders.filter((folder) => folder.parent === parent);
  if (children.length === 0) return null;
  return (
    <div className={depth ? "nest" : ""}>
      {children.map((folder) => (
        <div key={folder.id}>
          <button
            type="button"
            className={current === folder.path ? "on" : ""}
            onClick={() => onOpen(folder.path)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); event.stopPropagation(); onDrop(event, folder.path); }}
          >
            <Folder className="h-4 w-4" /> {folder.name}
          </button>
          <FolderTree folders={folders} parent={folder.path} current={current} depth={depth + 1} onOpen={onOpen} onDrop={onDrop} />
        </div>
      ))}
    </div>
  );
}

function Tile({
  selected, title, subtitle, children, onOpen, onSelect, onCheck, kind, dragId,
}: {
  selected: boolean;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  onOpen: () => void;
  onSelect: (shift: boolean) => void;
  onCheck: () => void;
  kind: "file" | "folder";
  dragId: string;
}) {
  return (
    <article
      className={`files-tile ${selected ? "selected" : ""}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("application/x-iconic-kind", kind);
        event.dataTransfer.setData("application/x-iconic-id", dragId);
        event.dataTransfer.effectAllowed = "move";
      }}
      onClick={(event) => onSelect(event.shiftKey)}
      onDoubleClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter") onOpen();
      }}
      tabIndex={0}
      role="group"
      aria-label={title}
    >
      <input className="files-check" type="checkbox" aria-label={`Select ${title}`} checked={selected} onChange={onCheck} onClick={(event) => event.stopPropagation()} />
      <div className="thumb">{children}</div>
      <div className="meta"><strong title={title}>{title}</strong><span>{subtitle}</span></div>
    </article>
  );
}

function Thumb({ file, small = false }: { file: LibraryFileView; small?: boolean }) {
  if (file.previewUrl && file.contentType.startsWith("image/")) {
    return <img src={file.previewUrl} alt="" className={small ? "files-thumb-sm" : ""} />;
  }
  if (file.previewUrl && file.contentType.startsWith("video/")) {
    return <video className={small ? "files-thumb-sm" : ""} src={`${file.previewUrl}#t=0.1`} muted playsInline preload="metadata" />;
  }
  return <span className="files-muted">{typeLabel(file.contentType)}</span>;
}

function Tags({ file, onSave }: { file: LibraryFileView; onSave: (tags: string[], notes: string) => void }) {
  const [tags, setTags] = useState(file.tags);
  const [notes, setNotes] = useState(file.notes);
  const [tag, setTag] = useState("");
  useEffect(() => { setTags(file.tags); setNotes(file.notes); }, [file.id, file.tags, file.notes]);
  return (
    <div>
      <div className="files-tags">
        {tags.map((item) => <span key={item}>{item}<button type="button" aria-label={`Remove ${item}`} onClick={() => setTags(tags.filter((entry) => entry !== item))}><X className="h-3 w-3" /></button></span>)}
      </div>
      <div className="files-field">
        <input aria-label="Add a tag" placeholder="Add a tag" value={tag} onChange={(event) => setTag(event.target.value)} onKeyDown={(event) => {
          if (event.key === "Enter" && tag.trim()) {
            event.preventDefault();
            setTags([...tags, tag.trim()]);
            setTag("");
          }
        }} />
      </div>
      <label className="files-muted" htmlFor="file-notes">Notes</label>
      <textarea id="file-notes" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
      <button type="button" className="files-btn" style={{ marginTop: 8 }} onClick={() => onSave(tags, notes)}>Save details</button>
    </div>
  );
}

function Modal({ title, text, onClose, children }: { title: string; text: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="files-modal" role="presentation" onMouseDown={onClose}>
      <div className="files-dialog" role="dialog" aria-modal="true" aria-labelledby="files-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
        <h3 id="files-dialog-title">{title}</h3>
        <p>{text}</p>
        {children}
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="files-field" style={{ display: "block", marginBottom: 12 }}>
      <span className="files-muted">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function when(value: number) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(value);
}

function typeLabel(contentType: string) {
  if (contentType.startsWith("image/")) return "Image";
  if (contentType.startsWith("video/")) return "Video";
  if (contentType === "application/pdf") return "PDF";
  return contentType.split("/")[1] || "File";
}
