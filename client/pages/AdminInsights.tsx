import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";
import { InsightEditor } from "@/components/insights/InsightEditor";
import { SocialQueue } from "@/components/insights/SocialQueue";
import { useAuth } from "@/contexts/AuthContext";
import {
  createInsight,
  deleteInsight,
  downloadSocialPack,
  fetchAdminInsights,
  importInsightLink,
  publishInsight,
  saveInsight,
  unpublishInsight,
  uploadInsightFile,
} from "@/lib/insightsApi";
import { INSIGHT_TEMPLATES, type InsightPost, type InsightTemplate } from "@shared/insights";

export default function AdminInsights() {
  const { user } = useAuth();
  const location = useLocation();
  const queue = location.pathname.endsWith("/social");
  const [posts, setPosts] = useState<InsightPost[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const applied = useRef("");
  const selected = posts.find((post) => post.id === selectedId) || null;

  async function token() {
    if (!user) throw new Error("Sign in again to save.");
    return user.getIdToken();
  }

  async function load() {
    try {
      const next = await fetchAdminInsights(await token());
      setPosts(next);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The insight list could not be loaded.");
    }
  }

  useEffect(() => {
    if (user) void load();
    // Reload when the signed-in admin changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    const requested = new URLSearchParams(location.search).get("post");
    if (!requested || applied.current === requested) return;
    if (posts.some((post) => post.id === requested)) {
      applied.current = requested;
      setSelectedId(requested);
    }
  }, [posts, location.search]);

  function replace(post: InsightPost) {
    setPosts((current) => {
      const exists = current.some((item) => item.id === post.id);
      const next = exists ? current.map((item) => (item.id === post.id ? post : item)) : [post, ...current];
      return next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    });
    setSelectedId(post.id);
  }

  async function start(template: InsightTemplate) {
    setBusy(true);
    setMessage("");
    try {
      const post = await createInsight(await token(), template);
      replace(post);
      setMessage("Draft created.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "The draft could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "That change could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminLayout title={queue ? "Social queue" : "Insights"}>
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[0.2em] text-[#0d9488]">ICONIC INSIGHTS</p>
            <h2 className="text-3xl font-black text-gray-900">{queue ? "Social queue" : "Creator"}</h2>
            <p className="mt-1 max-w-xl text-sm text-gray-500">
              Draft on the site, publish to the public Insights page, and queue packs for Sasha. Nothing auto-posts.
            </p>
          </div>
          <div className="flex gap-2">
            <Link to="/admin/insights" className={`rounded-full px-4 py-2 text-xs font-bold ${queue ? "bg-white text-gray-500" : "bg-gray-900 text-white"}`}>Posts</Link>
            <Link to="/admin/insights/social" className={`rounded-full px-4 py-2 text-xs font-bold ${queue ? "bg-gray-900 text-white" : "bg-white text-gray-500"}`}>
              Social queue ({posts.filter((post) => post.readyForSocial).length})
            </Link>
          </div>
        </div>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        {queue ? (
          <SocialQueue
            posts={posts}
            busyId={busyId}
            message={message}
            onCopy={(post) => {
              const text = [post.socialPack.caption, post.socialPack.hashtags].filter(Boolean).join("\n\n");
              void navigator.clipboard.writeText(text).then(() => setMessage("Caption copied.")).catch(() => setMessage("The caption could not be copied."));
            }}
            onDownload={(post) => {
              setBusyId(post.id);
              setMessage("");
              void token()
                .then((value) => downloadSocialPack(value, post))
                .then(() => setMessage("Pack downloaded."))
                .catch((err: unknown) => setMessage(err instanceof Error ? err.message : "The pack could not be downloaded."))
                .finally(() => setBusyId(null));
            }}
          />
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="space-y-3">
              <div className="rounded-[1.5rem] bg-white p-4 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Start from</p>
                <div className="mt-3 space-y-2">
                  {INSIGHT_TEMPLATES.map((template) => (
                    <button key={template.id} type="button" disabled={busy} onClick={() => void start(template.id)} className="block w-full rounded-2xl border border-gray-100 px-3 py-2 text-left hover:border-[#22d3ee] disabled:opacity-50">
                      <span className="block text-sm font-bold">{template.label}</span>
                      <span className="block text-[11px] text-gray-400">{template.detail}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                {posts.map((post) => (
                  <button
                    key={post.id}
                    type="button"
                    onClick={() => setSelectedId(post.id)}
                    className={`block w-full rounded-2xl border px-3 py-3 text-left ${selectedId === post.id ? "border-[#22d3ee] bg-white" : "border-transparent bg-white/70"}`}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                      {post.status === "published" ? "Live" : "Draft"}
                      {post.readyForSocial ? " · Social" : ""}
                    </span>
                    <span className="mt-1 block text-sm font-bold text-gray-900">{post.title}</span>
                  </button>
                ))}
                {posts.length === 0 && <p className="px-2 text-sm text-gray-400">No insights yet.</p>}
              </div>
            </aside>
            <div>
              {selected ? (
                <InsightEditor
                  post={selected}
                  busy={busy}
                  message={message}
                  onChange={replace}
                  onSave={() => void run(async () => {
                    const saved = await saveInsight(await token(), selected);
                    replace(saved);
                    setMessage("Draft saved.");
                  })}
                  onPublish={() => void run(async () => {
                    const saved = await publishInsight(await token(), selected);
                    replace(saved);
                    setMessage("Published to Iconic Insights.");
                  })}
                  onUnpublish={() => void run(async () => {
                    const saved = await unpublishInsight(await token(), selected.id);
                    replace(saved);
                    setMessage("Unpublished. It is off the public page.");
                  })}
                  onDelete={() => {
                    if (!window.confirm("Delete this insight?")) return;
                    void run(async () => {
                      await deleteInsight(await token(), selected.id);
                      setPosts((current) => current.filter((post) => post.id !== selected.id));
                      setSelectedId(null);
                      setMessage("Deleted.");
                    });
                  }}
                  onUpload={async (file) => {
                    try {
                      return await uploadInsightFile(await token(), file);
                    } catch (err) {
                      setMessage(err instanceof Error ? err.message : "The file could not be uploaded.");
                      throw err;
                    }
                  }}
                  onImportLink={async (url) => {
                    try {
                      return await importInsightLink(await token(), url);
                    } catch (err) {
                      setMessage(err instanceof Error ? err.message : "That Dropbox link could not be imported.");
                      throw err;
                    }
                  }}
                />
              ) : (
                <div className="rounded-[2rem] bg-white p-10 shadow-sm">
                  <h3 className="text-2xl font-black">Start an Iconic Insight</h3>
                  <p className="mt-2 max-w-lg text-sm text-gray-500">Pick a template. Add words and graphics, then publish into the public frames or mark it ready for Sasha.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
