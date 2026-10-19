import { Link } from "react-router-dom";
import { SOCIAL_PLATFORMS, type InsightPost } from "@shared/insights";

export function SocialQueue({
  posts,
  busyId,
  message,
  onDownload,
  onCopy,
}: {
  posts: InsightPost[];
  busyId: string | null;
  message: string;
  onDownload: (post: InsightPost) => void;
  onCopy: (post: InsightPost) => void;
}) {
  const queued = posts.filter((post) => post.readyForSocial);
  return (
    <div data-testid="social-queue" className="space-y-4">
      <p className="max-w-2xl text-sm text-gray-500">
        Sasha downloads a pack and posts it on the checked platforms. Nothing is sent to Instagram, Facebook, TikTok, X, Pinterest, or YouTube from this site.
      </p>
      {message && <p className="text-sm font-medium text-gray-600" role="status">{message}</p>}
      {queued.length === 0 && (
        <div className="rounded-[2rem] bg-white p-10 text-center shadow-sm">
          <p className="text-lg font-bold">Nothing is marked ready for social.</p>
          <p className="mt-2 text-sm text-gray-500">Open an insight and turn on Ready for social.</p>
        </div>
      )}
      {queued.map((post) => (
        <article key={post.id} className="rounded-[2rem] bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap gap-2">
                <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase ${post.status === "published" ? "bg-teal-100 text-teal-800" : "bg-gray-100 text-gray-500"}`}>
                  {post.status === "published" ? "Live on Insights" : "Draft"}
                </span>
                {post.socialPack.platforms.map((id) => (
                  <span key={id} className="rounded-full bg-cyan-50 px-3 py-1 text-[10px] font-bold text-teal-800">
                    {SOCIAL_PLATFORMS.find((item) => item.id === id)?.label || id}
                  </span>
                ))}
              </div>
              <h3 className="mt-3 text-2xl font-black">{post.title}</h3>
              <Link to={`/admin/insights?post=${encodeURIComponent(post.id)}`} className="text-xs font-bold text-[#0d9488]">Edit insight</Link>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => onCopy(post)} className="rounded-full border border-gray-200 px-4 py-2 text-xs font-bold">Copy caption</button>
              <button
                type="button"
                data-testid="download-pack"
                disabled={busyId === post.id || post.socialPack.assets.length === 0}
                onClick={() => onDownload(post)}
                className="rounded-full bg-[#0d9488] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                {busyId === post.id ? "Packing…" : "Download pack"}
              </button>
            </div>
          </div>
          {post.socialPack.caption && <p className="mt-4 whitespace-pre-wrap text-sm text-gray-700">{post.socialPack.caption}</p>}
          {post.socialPack.hashtags && <p className="mt-2 text-sm text-[#0d9488]">{post.socialPack.hashtags}</p>}
          <ul className="mt-4 flex flex-wrap gap-3">
            {post.socialPack.assets.map((asset) => (
              <li key={asset.id} className="w-28">
                {asset.kind === "video" ? (
                  <video src={asset.url} className="h-28 w-28 rounded-2xl bg-black object-cover" />
                ) : (
                  <img src={asset.url} alt={asset.name} className="h-28 w-28 rounded-2xl object-cover" />
                )}
                <a href={asset.url} download className="mt-1 block truncate text-[10px] font-bold text-gray-500">{asset.name}</a>
              </li>
            ))}
          </ul>
          {post.socialPack.assets.length === 0 && <p className="mt-4 text-sm text-gray-400">Add a photo, graphic, or video before downloading.</p>}
        </article>
      ))}
    </div>
  );
}
