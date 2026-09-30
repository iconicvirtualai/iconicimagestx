import * as React from "react";
import AdminLayout from "@/components/AdminLayout";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  deleteContentAsset,
  listContentAssets,
  updateContentAsset,
  uploadContentFile,
} from "@/lib/contentAssets";
import {
  CONTENT_PURPOSES,
  type ContentAssetRecord,
  type ContentPurpose,
  type ContentVisibility,
} from "@shared/contentBucket";
import { CheckCircle2, Copy, Film, Image as ImageIcon, Trash2, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";

const PURPOSE_LABEL: Record<ContentPurpose, string> = {
  portfolio: "Portfolio",
  marketing: "Marketing",
  go: "/go",
  general: "General",
};

export default function AdminContentBucket() {
  const { user } = useAuth();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [purpose, setPurpose] = React.useState<ContentPurpose>("portfolio");
  const [visibility, setVisibility] = React.useState<ContentVisibility>("staff");
  const [folder, setFolder] = React.useState("");
  const [tags, setTags] = React.useState("");
  const [alt, setAlt] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);
  const [progress, setProgress] = React.useState<Record<string, number>>({});
  const [uploading, setUploading] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);

  const [purposeFilter, setPurposeFilter] = React.useState<"" | ContentPurpose>("");
  const [tagFilter, setTagFilter] = React.useState("");
  const [folderFilter, setFolderFilter] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [appliedSearch, setAppliedSearch] = React.useState("");
  const [assets, setAssets] = React.useState<ContentAssetRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [listError, setListError] = React.useState("");

  React.useEffect(() => {
    const timer = window.setTimeout(() => setAppliedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const getToken = React.useCallback(async () => {
    if (!user) throw new Error("Sign in again before using the library.");
    return user.getIdToken();
  }, [user]);

  const load = React.useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const next = await listContentAssets({
        purpose: purposeFilter || undefined,
        tag: tagFilter,
        folder: folderFilter,
        search: appliedSearch,
      }, getToken);
      setAssets(next);
      setListError("");
    } catch (err: unknown) {
      setListError(err instanceof Error ? err.message : "Failed to load content.");
    } finally {
      setLoading(false);
    }
  }, [user, purposeFilter, tagFilter, folderFilter, appliedSearch, getToken]);

  React.useEffect(() => {
    load();
  }, [load]);

  const addFiles = (incoming: File[]) => {
    if (incoming.length === 0) return;
    setFiles((current) => [...current, ...incoming]);
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    let saved = 0;
    try {
      for (const file of files) {
        await uploadContentFile({
          file,
          purpose,
          tags,
          folder,
          visibility,
          alt,
          getToken,
          onProgress: (pct) => setProgress((current) => ({ ...current, [file.name]: pct })),
        });
        saved += 1;
      }
      toast.success(`${saved} file${saved === 1 ? "" : "s"} added to the library.`);
      setFiles([]);
      setProgress({});
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
      if (saved > 0) await load();
    } finally {
      setUploading(false);
    }
  };

  const copyUrl = async (asset: ContentAssetRecord) => {
    try {
      await navigator.clipboard.writeText(asset.url);
      toast.success(asset.visibility === "public" ? "Public link copied." : "Staff link copied. It expires in one hour.");
    } catch {
      toast.error("Could not copy the link.");
    }
  };

  const changeVisibility = async (asset: ContentAssetRecord) => {
    const next: ContentVisibility = asset.visibility === "public" ? "staff" : "public";
    if (next === "public" && !window.confirm("Publish this file? Anyone with the link will be able to view it.")) return;
    try {
      await updateContentAsset(asset.id, { visibility: next }, getToken);
      toast.success(next === "public" ? "File is now public." : "File is staff-only. The old public link no longer works.");
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not change visibility.");
    }
  };

  const remove = async (asset: ContentAssetRecord) => {
    if (!window.confirm(`Delete ${asset.fileName} from the library?`)) return;
    try {
      await deleteContentAsset(asset.id, getToken);
      setAssets((current) => current.filter((item) => item.id !== asset.id));
      toast.success("Deleted.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not delete that file.");
    }
  };

  return (
    <AdminLayout title="Content Library">
      <div className="w-full min-w-0 space-y-6">
        <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-6">
          <p className="text-sm text-gray-500 max-w-3xl">
            Drop images and video the site can reuse for portfolio, marketing, and /go.
            Public files keep a stable link. Staff files use a signed link that expires after one hour.
          </p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 mt-5">
            <Field label="Purpose">
              <select value={purpose} onChange={(e) => setPurpose(e.target.value as ContentPurpose)} className={selectClass}>
                {CONTENT_PURPOSES.map((item) => (
                  <option key={item} value={item}>{PURPOSE_LABEL[item]}</option>
                ))}
              </select>
            </Field>
            <Field label="Who can use it">
              <select value={visibility} onChange={(e) => setVisibility(e.target.value as ContentVisibility)} className={selectClass}>
                <option value="staff">Staff only</option>
                <option value="public">Public site</option>
              </select>
            </Field>
            <Field label="Folder">
              <input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="homepage" className={selectClass} />
            </Field>
            <Field label="Tags">
              <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="hero, austin" className={selectClass} />
            </Field>
          </div>
          <Field label="Alt text" className="mt-4">
            <input value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="Twilight exterior on the lake" className={selectClass} />
          </Field>

          <label
            onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(Array.from(e.dataTransfer.files));
            }}
            className={`mt-5 flex cursor-pointer flex-col items-center justify-center rounded-[2rem] border-2 border-dashed px-6 py-12 text-center transition-colors ${
              dragging ? "border-[#0d9488] bg-[#0d9488]/5" : "border-gray-200 hover:border-[#0d9488] hover:bg-[#0d9488]/5"
            }`}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,video/mp4,video/quicktime,video/webm"
              multiple
              className="sr-only"
              onChange={(e) => {
                addFiles(Array.from(e.target.files || []));
                e.target.value = "";
              }}
            />
            <Upload className="mb-3 h-10 w-10 text-gray-300" />
            <span className="text-sm font-black uppercase tracking-widest text-gray-500">Drop images or video here</span>
            <span className="mt-1 text-xs text-gray-400">JPEG, PNG, WebP, GIF, HEIC, MP4, MOV, WebM</span>
          </label>

          {files.length > 0 && (
            <div className="mt-5 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">{files.length} selected</p>
                <button type="button" onClick={() => setFiles([])} className="text-[10px] font-black uppercase tracking-widest text-red-400">
                  Clear
                </button>
              </div>
              {files.map((file, index) => (
                <div key={`${file.name}-${index}`} className="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-2">
                  {file.type.startsWith("video/") ? <Film className="h-4 w-4 text-gray-400" /> : <ImageIcon className="h-4 w-4 text-gray-400" />}
                  <p className="min-w-0 flex-1 truncate text-xs font-bold text-gray-700">{file.name}</p>
                  <span className="text-[10px] font-bold text-gray-400">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                  {progress[file.name] === 100 ? (
                    <CheckCircle2 className="h-4 w-4 text-teal-500" />
                  ) : progress[file.name] != null ? (
                    <span className="text-[10px] font-black text-[#0d9488]">{progress[file.name]}%</span>
                  ) : (
                    <button type="button" onClick={() => setFiles((current) => current.filter((_, item) => item !== index))} aria-label={`Remove ${file.name}`}>
                      <XCircle className="h-4 w-4 text-gray-300 hover:text-red-400" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <Button
            type="button"
            onClick={handleUpload}
            disabled={uploading || files.length === 0}
            className="mt-5 w-full rounded-xl bg-[#0d9488] py-4 text-sm font-black uppercase tracking-widest text-white hover:bg-[#0f766e] disabled:opacity-40"
          >
            {uploading ? "Uploading..." : `Add ${files.length > 0 ? `${files.length} ` : ""}file${files.length === 1 ? "" : "s"}`}
          </Button>
        </div>

        <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-black uppercase tracking-widest text-black">Library</h2>
              <p className="mt-1 text-xs text-gray-400">
                Site code can read public files from <code className="text-gray-600">GET /api/content-assets?purpose=portfolio&amp;tag=hero</code>
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <FilterChip active={purposeFilter === ""} onClick={() => setPurposeFilter("")}>All</FilterChip>
            {CONTENT_PURPOSES.map((item) => (
              <FilterChip key={item} active={purposeFilter === item} onClick={() => setPurposeFilter(item)}>
                {PURPOSE_LABEL[item]}
              </FilterChip>
            ))}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <input value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} placeholder="Filter by tag" className={selectClass} aria-label="Filter by tag" />
            <input value={folderFilter} onChange={(e) => setFolderFilter(e.target.value)} placeholder="Filter by folder" className={selectClass} aria-label="Filter by folder" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search file name" className={selectClass} aria-label="Search file name" />
          </div>

          {listError && <p className="mt-4 text-sm font-bold text-red-500">{listError}</p>}
          {loading ? (
            <p className="mt-8 text-center text-xs font-black uppercase tracking-widest text-gray-400">Loading library...</p>
          ) : assets.length === 0 && !listError ? (
            <p className="mt-8 text-center text-sm text-gray-400">No files in this view yet.</p>
          ) : (
            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {assets.map((asset) => (
                <article key={asset.id} className="overflow-hidden rounded-2xl border border-gray-100 bg-gray-50">
                  <div className="flex aspect-video items-center justify-center bg-black/5">
                    {asset.kind === "video" ? (
                      <video src={asset.url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                    ) : (
                      <img src={asset.url} alt={asset.alt || asset.fileName} className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-bold text-gray-800">{asset.fileName}</p>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${
                        asset.visibility === "public" ? "bg-teal-500/15 text-teal-700" : "bg-gray-200 text-gray-600"
                      }`}>
                        {asset.visibility === "public" ? "Public" : "Staff"}
                      </span>
                    </div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                      {PURPOSE_LABEL[asset.purpose] || asset.purpose}
                      {asset.folder ? ` · ${asset.folder}` : ""}
                      {asset.tags.length > 0 ? ` · ${asset.tags.join(", ")}` : ""}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => copyUrl(asset)} className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-gray-600">
                        <Copy className="h-3 w-3" /> Copy link
                      </button>
                      <button type="button" onClick={() => changeVisibility(asset)} className="rounded-lg bg-white px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-gray-600">
                        {asset.visibility === "public" ? "Make staff" : "Make public"}
                      </button>
                      <button type="button" onClick={() => remove(asset)} className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-red-500">
                        <Trash2 className="h-3 w-3" /> Delete
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-gray-500">{label}</span>
      {children}
    </label>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-widest ${
        active ? "bg-[#0d9488] text-white" : "bg-gray-100 text-gray-500"
      }`}
    >
      {children}
    </button>
  );
}

const selectClass = "w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold text-black focus:outline-none focus:ring-2 focus:ring-[#0d9488]/30";
