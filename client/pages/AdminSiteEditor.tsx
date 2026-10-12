import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { SITE_DRAFT_KEY } from "@/content/siteContent";
import { defaultPage } from "@shared/siteEditorDefaults";
import { samePage } from "@shared/siteEditorMerge";
import type { ContentBlock, ContentField, ContentItem, ContentPage, SiteEditorAccess, SiteRevision } from "@shared/siteEditor";

type Workspace = {
  access: SiteEditorAccess;
  pages: ContentPage[];
  published: Record<string, ContentPage | null>;
  history: Record<string, SiteRevision[]>;
  draftIds: string[];
};

function chicago(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

async function fileToBase64(file: File): Promise<string> {
  const prepared = file.type.startsWith("image/") ? await toWebp(file) : file;
  const buffer = await prepared.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function toWebp(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / bitmap.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, ".webp"), { type: "image/webp" });
  } catch {
    return file;
  }
}

export default function AdminSiteEditor() {
  const { user } = useAuth();
  const frame = useRef<HTMLIFrameElement>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [pages, setPages] = useState<ContentPage[]>([]);
  const [pageId, setPageId] = useState("home");
  const [blockId, setBlockId] = useState("hero");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [drawer, setDrawer] = useState<"sections" | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [dropboxUrl, setDropboxUrl] = useState("");

  useEffect(() => {
    const media = window.matchMedia("(max-width: 720px)");
    const apply = () => setNarrow(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  const authHeaders = async () => {
    const token = user ? await user.getIdToken() : "";
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  };

  const load = async () => {
    const headers = await authHeaders();
    const response = await fetch("/api/site-content/workspace", { headers });
    if (!response.ok) {
      setMessage(response.status === 403 ? "You do not have view access to the site editor." : "The editor could not be opened.");
      return;
    }
    const data = (await response.json()) as Workspace;
    setWorkspace(data);
    setPages(data.pages);
    sessionStorage.setItem(SITE_DRAFT_KEY, JSON.stringify(data.pages));
  };

  useEffect(() => {
    if (user) void load();
  }, [user]);

  useEffect(() => {
    frame.current?.contentWindow?.postMessage({ type: "site-draft-pages", pages }, window.location.origin);
  }, [pages]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "site-editor-update" && Array.isArray(event.data.pages)) {
        setPages(event.data.pages);
        sessionStorage.setItem(SITE_DRAFT_KEY, JSON.stringify(event.data.pages));
      }
      if (event.data?.type === "site-select") {
        if (event.data.page) setPageId(event.data.page);
        if (event.data.block) setBlockId(event.data.block);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const pushFrame = (next: ContentPage[]) => {
    setPages(next);
    sessionStorage.setItem(SITE_DRAFT_KEY, JSON.stringify(next));
    frame.current?.contentWindow?.postMessage({ type: "site-draft-pages", pages: next }, window.location.origin);
  };

  const page = pages.find((item) => item.id === pageId) || pages[0];
  const block = page?.blocks.find((item) => item.id === blockId) || page?.blocks[0];

  const dirtyIds = useMemo(() => {
    if (!workspace) return [];
    return pages.filter((item) => !samePage(item, workspace.published[item.id] || defaultPage(item.id))).map((item) => item.id);
  }, [pages, workspace]);

  const updatePage = (nextPage: ContentPage) => {
    pushFrame(pages.map((item) => (item.id === nextPage.id ? nextPage : item)));
  };

  const updateField = (fieldId: string, value: string, href?: string) => {
    if (!page || !block) return;
    updatePage({
      ...page,
      blocks: page.blocks.map((item) => item.id === block.id ? {
        ...item,
        fields: item.fields.map((field) => field.id === fieldId ? { ...field, value, ...(href != null ? { href } : {}) } : field),
      } : item),
    });
  };

  const moveBlock = (id: string, direction: -1 | 1) => {
    if (!page) return;
    const index = page.blocks.findIndex((item) => item.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= page.blocks.length) return;
    const blocks = [...page.blocks];
    const [row] = blocks.splice(index, 1);
    blocks.splice(target, 0, row);
    updatePage({ ...page, blocks });
  };

  const saveDraft = async () => {
    if (!page) return;
    setBusy(true);
    const response = await fetch(`/api/site-content/${page.id}`, {
      method: "PUT",
      headers: await authHeaders(),
      body: JSON.stringify(page),
    });
    setBusy(false);
    setMessage(response.ok ? "Draft saved. The public site is unchanged." : "Draft could not be saved.");
    if (response.ok) {
      const data = await response.json();
      setWorkspace((current) => current ? { ...current, draftIds: Array.from(new Set([...current.draftIds, page.id])) } : current);
      updatePage(data.page);
    }
  };

  const publish = async () => {
    if (!page || !workspace?.access.publish) return;
    setBusy(true);
    await fetch(`/api/site-content/${page.id}`, { method: "PUT", headers: await authHeaders(), body: JSON.stringify(page) });
    const response = await fetch(`/api/site-content/${page.id}/release`, { method: "POST", headers: await authHeaders(), body: "{}" });
    setBusy(false);
    if (!response.ok) {
      setMessage("Publish was refused.");
      return;
    }
    setMessage("Published. The public site now uses this page.");
    await load();
  };

  const discard = async () => {
    if (!page) return;
    setBusy(true);
    const response = await fetch(`/api/site-content/${page.id}/discard`, { method: "POST", headers: await authHeaders(), body: "{}" });
    setBusy(false);
    if (response.ok) await load();
  };

  const revert = async (revisionId: string) => {
    if (!page) return;
    const response = await fetch(`/api/site-content/${page.id}/revert`, {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({ revisionId }),
    });
    setMessage(response.ok ? "Reverted the published page." : "That version could not be restored.");
    if (response.ok) await load();
  };

  const upload = async (file: File, field: ContentField) => {
    if (!page) return;
    setBusy(true);
    const dataBase64 = await fileToBase64(file);
    const response = await fetch("/api/site-content/media", {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({ pageId: page.id, fileName: file.name, dataBase64 }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok || !data.url) {
      setMessage(data.error || "Upload failed.");
      return;
    }
    updateField(field.id, data.url);
    setMessage("File added to the draft.");
  };

  const importDropbox = async (field: ContentField) => {
    if (!page || !dropboxUrl.trim()) return;
    setBusy(true);
    const response = await fetch("/api/site-content/dropbox", {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({ pageId: page.id, url: dropboxUrl.trim() }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok || !data.url) {
      setMessage(data.error || "Dropbox import failed.");
      return;
    }
    updateField(field.id, data.url);
    setDropboxUrl("");
  };

  const preview = () => {
    if (!page) return;
    sessionStorage.setItem(SITE_DRAFT_KEY, JSON.stringify(pages));
    const path = page.path || "/";
    window.open(`${path}?draft=1`, "_blank", "noopener");
  };

  if (!workspace) {
    return <div className="grid min-h-screen place-items-center bg-[#e7ebef] font-[Inter,ui-sans-serif,system-ui,sans-serif] text-sm">{message || "Opening the site editor…"}</div>;
  }

  const history = workspace.history[page?.id || ""] || [];
  const canPublish = workspace.access.publish;

  return (
    <div className="flex h-screen flex-col bg-[#e7ebef] font-[Inter,ui-sans-serif,system-ui,sans-serif] text-neutral-950">
      <header className="flex flex-wrap items-center gap-2 border-b border-black/10 bg-white px-3 py-2">
        <Link to="/admin/dashboard" className="min-h-11 px-2 text-sm font-semibold text-neutral-500">Settings</Link>
        <span className="text-neutral-300">/</span>
        <span className="text-sm font-semibold">Site Editor</span>
        <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">Draft</span>
        <span className="text-sm">Unpublished changes ({dirtyIds.length})</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {narrow ? (
            <button type="button" className="min-h-11 rounded-lg border px-3 text-sm font-semibold" onClick={() => setDrawer("sections")}>Sections</button>
          ) : null}
          <button type="button" className="min-h-11 rounded-lg border px-3 text-sm font-semibold" onClick={preview}>Preview</button>
          <button type="button" className="min-h-11 rounded-lg border px-3 text-sm font-semibold" onClick={() => setMenuOpen((open) => !open)}>More</button>
          <button
            type="button"
            title={canPublish ? "Publish this page" : "Only owner/admin can publish"}
            disabled={!canPublish || busy}
            className="min-h-11 rounded-lg bg-neutral-950 px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
            onClick={() => void publish()}
          >
            Publish
          </button>
        </div>
        {menuOpen ? (
          <div className="flex w-full gap-2 pb-1">
            <button type="button" className="min-h-11 rounded-lg border px-3 text-sm" onClick={() => void saveDraft()}>Save draft</button>
            <button type="button" className="min-h-11 rounded-lg border px-3 text-sm" onClick={() => void discard()}>Discard</button>
            <button type="button" className="min-h-11 rounded-lg border px-3 text-sm" onClick={() => setHistoryOpen(true)}>Version history</button>
            <Link to="/admin/team" className="inline-flex min-h-11 items-center rounded-lg border px-3 text-sm">Permissions</Link>
          </div>
        ) : null}
      </header>
      {message ? <p className="bg-amber-50 px-4 py-2 text-sm">{message}</p> : null}
      <div className="flex min-h-0 flex-1">
        {!narrow ? (
          <aside className="w-52 overflow-auto border-r border-black/10 bg-white p-2">
            {pages.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`flex min-h-11 w-full items-center justify-between rounded-lg px-3 text-left text-sm ${item.id === page?.id ? "bg-neutral-950 text-white" : ""}`}
                onClick={() => { setPageId(item.id); setBlockId(item.blocks[0]?.id || ""); }}
              >
                {item.label}
                {dirtyIds.includes(item.id) ? <span className="h-2 w-2 rounded-full bg-amber-400" /> : null}
              </button>
            ))}
          </aside>
        ) : null}
        {!narrow ? (
          <aside className="w-60 overflow-auto border-r border-black/10 bg-white p-2">
            <SectionList page={page} blockId={block?.id} onPick={setBlockId} onMove={moveBlock} onToggle={(id) => page && updatePage({ ...page, blocks: page.blocks.map((item) => item.id === id ? { ...item, hidden: !item.hidden } : item) })} />
          </aside>
        ) : null}
        <main className="min-w-0 flex-1 overflow-hidden bg-neutral-200">
          {page ? (
            <iframe
              ref={frame}
              title={`${page.label} draft`}
              src={`${page.path || "/"}?editor=1`}
              className="h-full w-full border-0 bg-white"
              onLoad={() => frame.current?.contentWindow?.postMessage({ type: "site-draft-pages", pages }, window.location.origin)}
            />
          ) : null}
        </main>
        {!narrow && block ? (
          <aside className="w-80 overflow-auto border-l border-black/10 bg-white p-4">
            <FieldEditor
              block={block}
              dropboxUrl={dropboxUrl}
              onDropbox={setDropboxUrl}
              onField={updateField}
              onUpload={(file, field) => void upload(file, field)}
              onImport={(field) => void importDropbox(field)}
              onItems={(items) => page && updatePage({ ...page, blocks: page.blocks.map((item) => item.id === block.id ? { ...item, items } : item) })}
              onSeo={(key, value) => page && updatePage({ ...page, [key]: value })}
              seoTitle={page?.seoTitle || ""}
              seoDescription={page?.seoDescription || ""}
            />
          </aside>
        ) : null}
      </div>
      {drawer && narrow ? (
        <div className="absolute inset-0 z-20 bg-black/40" onClick={() => setDrawer(null)}>
          <div className="h-full w-[86%] overflow-auto bg-white p-3" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="mb-3 min-h-11 rounded-lg border px-3 text-sm" onClick={() => setDrawer(null)}>Close sections</button>
            <div className="mb-4">
              {pages.map((item) => (
                <button key={item.id} type="button" className="flex min-h-11 w-full items-center text-left text-sm" onClick={() => { setPageId(item.id); setBlockId(item.blocks[0]?.id || ""); }}>{item.label}</button>
              ))}
            </div>
            <SectionList page={page} blockId={block?.id} onPick={(id) => { setBlockId(id); setDrawer(null); }} onMove={moveBlock} onToggle={(id) => page && updatePage({ ...page, blocks: page.blocks.map((item) => item.id === id ? { ...item, hidden: !item.hidden } : item) })} />
            {block ? (
              <FieldEditor
                block={block}
                dropboxUrl={dropboxUrl}
                onDropbox={setDropboxUrl}
                onField={updateField}
                onUpload={(file, field) => void upload(file, field)}
                onImport={(field) => void importDropbox(field)}
                onItems={(items) => page && updatePage({ ...page, blocks: page.blocks.map((item) => item.id === block.id ? { ...item, items } : item) })}
                onSeo={(key, value) => page && updatePage({ ...page, [key]: value })}
                seoTitle={page?.seoTitle || ""}
                seoDescription={page?.seoDescription || ""}
              />
            ) : null}
          </div>
        </div>
      ) : null}
      {historyOpen ? (
        <div className="absolute inset-y-0 right-0 z-30 w-full max-w-md overflow-auto border-l border-black/10 bg-white p-4 shadow-xl">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Version history</h2>
            <button type="button" className="min-h-11 px-3 text-sm" onClick={() => setHistoryOpen(false)}>Close</button>
          </div>
          {history.length === 0 ? <p className="text-sm text-neutral-500">No published versions yet.</p> : null}
          {history.map((revision, index) => (
            <div key={revision.id} className="mb-3 rounded-xl border border-black/10 p-3">
              <p className="text-sm font-semibold">{index === 0 ? "Previous published" : "Published"}</p>
              <p className="text-xs text-neutral-500">Published by {revision.byName} · {chicago(revision.at)} CT</p>
              <button type="button" className="mt-2 min-h-11 rounded-lg border px-3 text-sm" disabled={!canPublish} title={canPublish ? "Revert" : "Only owner/admin can publish"} onClick={() => void revert(revision.id)}>Revert</button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SectionList({
  page,
  blockId,
  onPick,
  onMove,
  onToggle,
}: {
  page?: ContentPage;
  blockId?: string;
  onPick: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onToggle: (id: string) => void;
}) {
  if (!page) return null;
  return (
    <div>
      {page.blocks.map((item) => (
        <div key={item.id} className={`mb-1 flex min-h-11 items-center gap-1 rounded-lg px-2 ${item.id === blockId ? "bg-neutral-100" : ""}`}>
          <button type="button" className="min-h-11 flex-1 text-left text-sm" onClick={() => onPick(item.id)}>
            {item.label}{item.hidden ? " · Hidden" : ""}
          </button>
          <button type="button" className="min-h-11 px-2 text-xs" onClick={() => onMove(item.id, -1)} aria-label={`Move ${item.label} up`}>↑</button>
          <button type="button" className="min-h-11 px-2 text-xs" onClick={() => onMove(item.id, 1)} aria-label={`Move ${item.label} down`}>↓</button>
          <button type="button" className="min-h-11 px-2 text-xs" onClick={() => onToggle(item.id)}>{item.hidden ? "Show" : "Hide"}</button>
        </div>
      ))}
    </div>
  );
}

function FieldEditor({
  block,
  seoTitle,
  seoDescription,
  dropboxUrl,
  onDropbox,
  onField,
  onSeo,
  onUpload,
  onImport,
  onItems,
}: {
  block: ContentBlock;
  seoTitle: string;
  seoDescription: string;
  dropboxUrl: string;
  onDropbox: (value: string) => void;
  onField: (id: string, value: string, href?: string) => void;
  onSeo: (key: "seoTitle" | "seoDescription", value: string) => void;
  onUpload: (file: File, field: ContentField) => void;
  onImport: (field: ContentField) => void;
  onItems: (items: ContentItem[]) => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold">{block.label}</h2>
      <label className="block text-xs font-semibold">SEO title
        <input className="mt-1 min-h-11 w-full rounded-lg border px-2 text-sm" value={seoTitle} onChange={(event) => onSeo("seoTitle", event.target.value)} />
      </label>
      <label className="block text-xs font-semibold">SEO description
        <textarea className="mt-1 w-full rounded-lg border px-2 py-2 text-sm" rows={3} value={seoDescription} onChange={(event) => onSeo("seoDescription", event.target.value)} />
      </label>
      {block.fields.map((field) => (
        <label key={field.id} className="block text-xs font-semibold">{field.label}
          {field.kind === "image" || field.kind === "video" ? (
            <div
              className="mt-1 rounded-xl border border-dashed border-neutral-300 p-3"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const file = event.dataTransfer.files?.[0];
                if (file) onUpload(file, field);
              }}
            >
              {field.value ? <img src={field.kind === "image" ? field.value : ""} alt="" className="mb-2 max-h-24 rounded" /> : null}
              <p className="text-sm">Replace · drop a photo or video here</p>
              <input className="mt-2 block text-sm" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onUpload(file, field);
              }} />
              <input className="mt-2 min-h-11 w-full rounded-lg border px-2 text-sm font-normal" placeholder="Paste a Dropbox file link" value={dropboxUrl} onChange={(event) => onDropbox(event.target.value)} />
              <p className="mt-1 font-normal text-neutral-500">Paste a shared file link. Full Dropbox connect is coming later.</p>
              <button type="button" className="mt-2 min-h-11 rounded-lg border px-3 text-sm" onClick={() => onImport(field)}>Import from Dropbox</button>
              <button type="button" className="mt-2 block min-h-11 text-sm text-red-700" onClick={() => onField(field.id, "")}>Remove</button>
            </div>
          ) : field.kind === "textarea" ? (
            <textarea className="mt-1 w-full rounded-lg border px-2 py-2 text-sm font-normal" rows={4} value={field.value} onChange={(event) => onField(field.id, event.target.value)} />
          ) : (
            <input className="mt-1 min-h-11 w-full rounded-lg border px-2 text-sm font-normal" value={field.value} onChange={(event) => onField(field.id, event.target.value, field.href)} />
          )}
          {field.kind === "link" ? (
            <input className="mt-1 min-h-11 w-full rounded-lg border px-2 text-sm font-normal" value={field.href || ""} onChange={(event) => onField(field.id, field.value, event.target.value)} />
          ) : null}
        </label>
      ))}
      {(block.items || []).map((item, index) => (
        <div key={item.id} className="rounded-xl border border-black/10 p-2">
          <p className="text-xs font-semibold">Item {index + 1}</p>
          {item.fields.map((field) => (
            <input key={field.id} className="mt-1 min-h-11 w-full rounded-lg border px-2 text-sm" value={field.value} onChange={(event) => {
              onItems((block.items || []).map((row) => row.id === item.id ? { ...row, fields: row.fields.map((entry) => entry.id === field.id ? { ...entry, value: event.target.value } : entry) } : row));
            }} />
          ))}
        </div>
      ))}
    </div>
  );
}
