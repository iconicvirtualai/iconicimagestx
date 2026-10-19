import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { InsightsFeed } from "@/components/insights/InsightFrames";
import { fetchPublicInsights } from "@/lib/insightsApi";
import type { PublicInsight } from "@shared/insights";

export default function Insights() {
  const [posts, setPosts] = useState<PublicInsight[] | null>(null);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("ALL");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchPublicInsights()
      .then((next) => {
        if (!cancelled) setPosts(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Insights could not be loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Layout>
      <div className="min-h-screen bg-white text-black">
        <section className="pb-12 pt-28">
          <div className="container mx-auto px-4">
            <h1 className="mb-4 text-4xl font-bold text-black md:text-5xl">Iconic Insights</h1>
            <p className="text-lg text-gray-500">Field notes, guides, and stats from Iconic Images for listing photography and video.</p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <a href="/insights" className="inline-block rounded-lg bg-teal-500 px-6 py-3 text-center font-semibold text-white transition-colors hover:bg-teal-600">
                Insights & Articles
              </a>
              <a href="/insights/prep" className="inline-block rounded-lg border-2 border-teal-500 px-6 py-3 text-center font-semibold text-teal-600 transition-colors hover:bg-teal-50">
                Photoshoot Prep Guide
              </a>
            </div>
          </div>
        </section>
        {error && <p className="container mx-auto px-4 pb-12 text-sm text-red-600">{error}</p>}
        {posts === null && !error && <p className="container mx-auto px-4 pb-24 text-sm text-gray-400">Loading insights…</p>}
        {posts && (
          <InsightsFeed posts={posts} category={category} query={query} onCategory={setCategory} onQuery={setQuery} />
        )}
      </div>
    </Layout>
  );
}
