import { useState } from "react";
import {
  BLOCK_TYPES,
  INSIGHT_CATEGORIES,
  SOCIAL_PLATFORMS,
  emptyBlock,
  insightId,
  moveItem,
  slugify,
  toPublicInsight,
  type InsightBlock,
  type InsightPost,
  type SocialAsset,
  type SocialPlatform,
} from "@shared/insights";
import { InsightBlocks, InsightFeatured, InsightGridCard } from "./InsightFrames";

type UploadResult = { url: string; kind: "image" | "video" };

export function InsightEditor({
  post,
  busy,
  message,
  onChange,
  onSave,
  onPublish,
  onUnpublish,
  onDelete,
  onUpload,
  onImportLink,
}: {
  post: InsightPost;
  busy: boolean;
  message: string;
  onChange: (post: InsightPost) => void;
  onSave: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  onDelete: () => void;
  onUpload: (file: File) => Promise<UploadResult>;
  onImportLink: (url: string) => Promise<UploadResult>;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [uploading, setUploading] = useState("");
  const [dropboxUrl, setDropboxUrl] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const publicPost = toPublicInsight(post);
  const locked = busy || Boolean(uploading);

  function setTitle(title: string) {
    const follow = slugify(post.title) === post.slug;
    const marker = " | Iconic Insights";
    const next: InsightPost = { ...post, title, slug: follow ? slugify(title) : post.slug };
    if (post.seoTitle.endsWith(marker)) next.seoTitle = `${title}${marker}`.slice(0, 70);
    if (post.coverAlt === post.title) next.coverAlt = title;
    onChange(next);
  }

  function patchBlock(id: string, patch: Partial<InsightBlock>) {
    onChange({ ...post, blocks: post.blocks.map((block) => (block.id === id ? { ...block, ...patch } : block)) });
  }

  async function runUpload(key: string, file: File, apply: (result: UploadResult, file: File) => void) {
    setUploading(key);
    try {
      apply(await onUpload(file), file);
    } catch {
      // The page surfaces the error.
    } finally {
      setUploading("");
    }
  }

  function addAsset(result: UploadResult, fileName: string, preferred: "image" | "graphic") {
    const asset: SocialAsset = {
      id: insightId("asset"),
      url: result.url,
      name: fileName,
      kind: result.kind === "video" ? "video" : preferred,
    };
    onChange({ ...post, socialPack: { ...post.socialPack, assets: [...post.socialPack.assets, asset] } });
  }

  function togglePlatform(id: SocialPlatform) {
    const platforms = post.socialPack.platforms.includes(id)
      ? post.socialPack.platforms.filter((item) => item !== id)
      : [...post.socialPack.platforms, id];
    onChange({ ...post, socialPack: { ...post.socialPack, platforms } });
  }

  function toggleCategory(label: string) {
    const exists = post.categories.some((item) => item.toLowerCase() === label.toLowerCase());
    const categories = exists
      ? post.categories.filter((item) => item.toLowerCase() !== label.toLowerCase())
      : [...post.categories, label];
    onChange({ ...post, categories });
  }

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-6">
        <div className="rounded-[2rem] bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${post.status === "published" ? "bg-teal-100 text-teal-800" : "bg-gray-100 text-gray-500"}`}>
              {post.status === "published" ? "Live" : "Draft"}
            </span>
            <p className="text-xs text-gray-400">/insights/{post.slug}</p>
          </div>
          <label className="mt-4 block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Title</span>
            <input
              data-testid="insight-title"
              value={post.title}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-1 w-full border-b border-gray-100 py-2 text-3xl font-black text-black outline-none focus:border-[#22d3ee]"
            />
          </label>
          <label className="mt-4 block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Slug</span>
            <input
              value={post.slug}
              onChange={(event) => onChange({ ...post, slug: slugify(event.target.value) })}
              className="mt-1 w-full rounded-2xl border border-gray-100 px-4 py-2 text-sm outline-none focus:border-[#22d3ee]"
            />
          </label>
          <label className="mt-4 block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Excerpt</span>
            <textarea
              value={post.excerpt}
              onChange={(event) => {
                const excerpt = event.target.value;
                const follow = post.seoDescription === post.excerpt.slice(0, 160);
                onChange({ ...post, excerpt, seoDescription: follow ? excerpt.slice(0, 160) : post.seoDescription });
              }}
              rows={3}
              className="mt-1 w-full rounded-2xl border border-gray-100 px-4 py-3 text-sm outline-none focus:border-[#22d3ee]"
            />
          </label>
          <div className="mt-4 flex flex-wrap gap-2">
            {INSIGHT_CATEGORIES.map((label) => {
              const on = post.categories.some((item) => item.toUpperCase() === label);
              return (
                <button key={label} type="button" onClick={() => toggleCategory(label)} className={`rounded-full border px-3 py-1 text-[10px] font-bold tracking-wider ${on ? "border-[#22d3ee] bg-[#22d3ee] text-white" : "border-gray-100 text-gray-400"}`}>
                  {label}
                </button>
              );
            })}
          </div>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const label = customCategory.trim();
              if (!label) return;
              toggleCategory(label);
              setCustomCategory("");
            }}
          >
            <input value={customCategory} onChange={(event) => setCustomCategory(event.target.value)} placeholder="Add a tag" className="w-40 rounded-full border border-gray-100 px-3 py-1 text-xs outline-none focus:border-[#22d3ee]" />
            <button type="submit" className="text-xs font-bold text-[#0d9488]">Add</button>
          </form>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-black uppercase tracking-wider">Cover</h3>
            <FileButton label={uploading === "cover" ? "Uploading…" : "Upload cover"} accept="image/*" disabled={locked} onFile={(file) => void runUpload("cover", file, (result) => onChange({ ...post, coverUrl: result.url, coverAlt: post.coverAlt || file.name }))} />
          </div>
          {post.coverUrl && <img src={post.coverUrl} alt={post.coverAlt} className="mt-4 aspect-[21/9] w-full rounded-[1.5rem] object-cover" />}
          <label className="mt-3 block text-xs text-gray-500">
            Alt text
            <input value={post.coverAlt} onChange={(event) => onChange({ ...post, coverAlt: event.target.value })} className="mt-1 w-full rounded-2xl border border-gray-100 px-3 py-2 text-sm text-black outline-none focus:border-[#22d3ee]" />
          </label>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const url = dropboxUrl.trim();
              if (!url) return;
              setUploading("dropbox");
              void onImportLink(url)
                .then((result) => onChange({ ...post, coverUrl: result.url }))
                .catch(() => undefined)
                .finally(() => {
                  setUploading("");
                  setDropboxUrl("");
                });
            }}
          >
            <input value={dropboxUrl} onChange={(event) => setDropboxUrl(event.target.value)} placeholder="Or paste a Dropbox file link" className="min-w-0 flex-1 rounded-full border border-gray-100 px-4 py-2 text-sm outline-none focus:border-[#22d3ee]" />
            <button type="submit" disabled={locked} className="rounded-full bg-gray-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Import</button>
          </form>
        </div>

        <div className="space-y-3">
          {post.blocks.map((block, index) => (
            <article
              key={block.id}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (dragIndex == null) return;
                onChange({ ...post, blocks: reorder(post.blocks, dragIndex, index) });
                setDragIndex(null);
              }}
              className="rounded-[2rem] bg-white p-5 shadow-sm"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  <span
                    draggable
                    onDragStart={() => setDragIndex(index)}
                    className="mr-2 cursor-grab text-gray-300"
                    aria-label="Drag to reorder"
                  >
                    ::
                  </span>
                  {BLOCK_TYPES.find((item) => item.id === block.type)?.label}
                </p>
                <div className="flex gap-2">
                  <button type="button" aria-label="Move block up" onClick={() => onChange({ ...post, blocks: moveItem(post.blocks, index, -1) })} className="text-xs font-bold text-gray-400">Up</button>
                  <button type="button" aria-label="Move block down" onClick={() => onChange({ ...post, blocks: moveItem(post.blocks, index, 1) })} className="text-xs font-bold text-gray-400">Down</button>
                  <button type="button" onClick={() => onChange({ ...post, blocks: post.blocks.filter((item) => item.id !== block.id) })} className="text-xs font-bold text-red-400">Remove</button>
                </div>
              </div>
              <BlockFields
                block={block}
                busy={locked}
                uploading={uploading === block.id}
                onChange={(patch) => patchBlock(block.id, patch)}
                onFile={(file) => void runUpload(block.id, file, (result) => {
                  if (block.type === "carousel") patchBlock(block.id, { urls: [...block.urls, result.url] });
                  else patchBlock(block.id, { url: result.url, alt: block.alt || file.name });
                })}
              />
            </article>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {BLOCK_TYPES.map((item) => (
            <button key={item.id} type="button" onClick={() => onChange({ ...post, blocks: [...post.blocks, emptyBlock(item.id)] })} className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-600 hover:border-[#22d3ee]">
              Add {item.label}
            </button>
          ))}
        </div>

        <details className="rounded-[2rem] bg-white p-6 shadow-sm">
          <summary className="cursor-pointer text-sm font-black uppercase tracking-wider">Search title and description</summary>
          <label className="mt-4 block text-xs text-gray-500">
            SEO title
            <input value={post.seoTitle} onChange={(event) => onChange({ ...post, seoTitle: event.target.value })} className="mt-1 w-full rounded-2xl border border-gray-100 px-3 py-2 text-sm text-black outline-none focus:border-[#22d3ee]" />
          </label>
          <label className="mt-3 block text-xs text-gray-500">
            SEO description
            <textarea value={post.seoDescription} onChange={(event) => onChange({ ...post, seoDescription: event.target.value })} rows={3} className="mt-1 w-full rounded-2xl border border-gray-100 px-3 py-2 text-sm text-black outline-none focus:border-[#22d3ee]" />
          </label>
          <p className="mt-2 text-xs text-gray-400">The public page uses this title, description, and the cover as the share image.</p>
        </details>

        <section className="rounded-[2rem] border border-cyan-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider">Ready for social</h3>
              <p className="mt-1 text-xs text-gray-500">Sasha downloads the pack and posts it. This site does not auto-post.</p>
            </div>
            <button
              type="button"
              data-testid="ready-for-social"
              onClick={() => onChange({ ...post, readyForSocial: !post.readyForSocial })}
              className={`rounded-full px-4 py-2 text-xs font-bold ${post.readyForSocial ? "bg-[#0d9488] text-white" : "bg-gray-100 text-gray-500"}`}
            >
              {post.readyForSocial ? "In the queue" : "Not queued"}
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {SOCIAL_PLATFORMS.map((platform) => {
              const on = post.socialPack.platforms.includes(platform.id);
              return (
                <button key={platform.id} type="button" onClick={() => togglePlatform(platform.id)} className={`rounded-full border px-3 py-1 text-[10px] font-bold ${on ? "border-[#0d9488] bg-teal-50 text-teal-800" : "border-gray-100 text-gray-400"}`}>
                  {platform.label}
                </button>
              );
            })}
          </div>
          <label className="mt-4 block text-xs text-gray-500">
            Caption
            <textarea value={post.socialPack.caption} onChange={(event) => onChange({ ...post, socialPack: { ...post.socialPack, caption: event.target.value } })} rows={4} className="mt-1 w-full rounded-2xl border border-gray-100 px-3 py-2 text-sm text-black outline-none focus:border-[#22d3ee]" />
          </label>
          <label className="mt-3 block text-xs text-gray-500">
            Hashtags
            <input value={post.socialPack.hashtags} onChange={(event) => onChange({ ...post, socialPack: { ...post.socialPack, hashtags: event.target.value } })} className="mt-1 w-full rounded-2xl border border-gray-100 px-3 py-2 text-sm text-black outline-none focus:border-[#22d3ee]" />
          </label>
          <div className="mt-4 flex flex-wrap gap-2">
            <FileButton label="Add photo" accept="image/*" disabled={locked} onFile={(file) => void runUpload(`asset-${file.name}`, file, (result) => addAsset(result, file.name, "image"))} />
            <FileButton label="Add graphic" accept="image/*" disabled={locked} onFile={(file) => void runUpload(`graphic-${file.name}`, file, (result) => addAsset(result, file.name, "graphic"))} />
            <FileButton label="Add video" accept="video/mp4,video/quicktime" disabled={locked} onFile={(file) => void runUpload(`video-${file.name}`, file, (result) => addAsset(result, file.name, "image"))} />
          </div>
          <ul className="mt-4 space-y-2">
            {post.socialPack.assets.map((asset) => (
              <li key={asset.id} className="flex items-center justify-between gap-3 rounded-2xl bg-gray-50 px-3 py-2 text-sm">
                <span className="truncate">{asset.name} · {asset.kind}</span>
                <button type="button" onClick={() => onChange({ ...post, socialPack: { ...post.socialPack, assets: post.socialPack.assets.filter((item) => item.id !== asset.id) } })} className="text-xs font-bold text-red-400">Remove</button>
              </li>
            ))}
          </ul>
        </section>

        {message && <p className="text-sm font-medium text-gray-600" role="status">{message}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" data-testid="save-draft" disabled={locked} onClick={onSave} className="rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-bold disabled:opacity-50">Save draft</button>
          <button type="button" data-testid="publish-insight" disabled={locked} onClick={onPublish} className="rounded-full bg-[#22d3ee] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">Publish</button>
          {post.status === "published" && <button type="button" disabled={locked} onClick={onUnpublish} className="rounded-full border border-gray-200 px-5 py-2.5 text-sm font-bold">Unpublish</button>}
          <button type="button" disabled={locked} onClick={onDelete} className="rounded-full px-5 py-2.5 text-sm font-bold text-red-500">Delete</button>
        </div>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">Public frame</p>
        <div className="rounded-[2rem] bg-white p-3 shadow-sm">
          <InsightFeatured post={publicPost} linked={false} />
          <div className="mt-4 w-40">
            <InsightGridCard post={publicPost} linked={false} />
          </div>
          <div className="mt-4 max-h-[480px] overflow-auto px-2 pb-4">
            <InsightBlocks blocks={post.blocks} />
          </div>
        </div>
      </aside>
    </div>
  );
}

function BlockFields({
  block,
  busy,
  uploading,
  onChange,
  onFile,
}: {
  block: InsightBlock;
  busy: boolean;
  uploading: boolean;
  onChange: (patch: Partial<InsightBlock>) => void;
  onFile: (file: File) => void;
}) {
  if (block.type === "heading" || block.type === "text" || block.type === "quote") {
    return (
      <div className="space-y-3">
        {block.type === "quote" && (
          <input value={block.stat} onChange={(event) => onChange({ stat: event.target.value })} placeholder="Stat" className="w-full rounded-2xl border border-gray-100 px-3 py-2 text-2xl font-black outline-none focus:border-[#22d3ee]" />
        )}
        <textarea value={block.text} onChange={(event) => onChange({ text: event.target.value })} rows={block.type === "heading" ? 2 : 5} className="w-full rounded-2xl border border-gray-100 px-3 py-2 text-sm outline-none focus:border-[#22d3ee]" />
      </div>
    );
  }
  if (block.type === "carousel") {
    return (
      <div>
        <div className="flex gap-2 overflow-x-auto">
          {block.urls.map((url) => <img key={url} src={url} alt="" className="h-24 w-20 flex-none rounded-xl object-cover" />)}
        </div>
        <div className="mt-3">
          <FileButton label={uploading ? "Uploading…" : "Add image"} accept="image/*" disabled={busy} onFile={onFile} />
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {block.url && block.type === "image" && <img src={block.url} alt={block.alt} className="max-h-48 rounded-2xl object-cover" />}
      {block.url && block.type === "video" && <video src={block.url} controls className="max-h-48 w-full rounded-2xl bg-black" />}
      <FileButton
        label={uploading ? "Uploading…" : block.type === "video" ? "Upload video" : "Upload"}
        accept={block.type === "video" ? "video/mp4,video/quicktime" : "image/*"}
        disabled={busy}
        onFile={onFile}
      />
      {block.type === "embed" && (
        <input value={block.url} onChange={(event) => onChange({ url: event.target.value })} placeholder="YouTube, Vimeo, TikTok, or Instagram link" className="w-full rounded-2xl border border-gray-100 px-3 py-2 text-sm outline-none focus:border-[#22d3ee]" />
      )}
      {block.type !== "video" && (
        <input value={block.alt} onChange={(event) => onChange({ alt: event.target.value })} placeholder="Alt text" className="w-full rounded-2xl border border-gray-100 px-3 py-2 text-sm outline-none focus:border-[#22d3ee]" />
      )}
    </div>
  );
}

function FileButton({
  label,
  accept,
  disabled,
  multiple,
  onFile,
}: {
  label: string;
  accept: string;
  disabled?: boolean;
  multiple?: boolean;
  onFile: (file: File) => void;
}) {
  return (
    <label className={`inline-flex cursor-pointer items-center rounded-full border border-gray-200 px-3 py-1.5 text-xs font-bold ${disabled ? "opacity-50" : "hover:border-[#22d3ee]"}`}>
      {label}
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="sr-only"
        onChange={(event) => {
          const files = [...(event.target.files || [])];
          event.target.value = "";
          files.forEach(onFile);
        }}
      />
    </label>
  );
}

function reorder<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = items.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
