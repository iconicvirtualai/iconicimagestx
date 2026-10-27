import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Layout from "@/components/Layout";
import { applyMetaPlan } from "@/components/SiteMeta";
import { InsightArticle } from "@/components/insights/InsightFrames";
import { fetchPublicInsight } from "@/lib/insightsApi";
import { absoluteInsightImage, coverOf, type PublicInsight } from "@shared/insights";
import { canonicalUrl, originForHost } from "@shared/siteSeo";

export default function InsightPost() {
  const { slug = "" } = useParams();
  const [post, setPost] = useState<PublicInsight | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setPost(null);
    setMissing(false);
    setError("");
    fetchPublicInsight(slug)
      .then((next) => {
        if (cancelled) return;
        if (!next) setMissing(true);
        else setPost(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "This insight could not be opened.");
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!post) return;
    const origin = originForHost(window.location.host);
    applyMetaPlan(document, {
      kind: "public",
      title: post.seoTitle || `${post.title} | Iconic Insights`,
      description: post.seoDescription || post.excerpt,
      canonical: canonicalUrl(`/insights/${post.slug}`, origin),
      image: absoluteInsightImage(coverOf(post), origin),
    });
  }, [post]);

  return (
    <Layout>
      <div className="min-h-screen bg-white text-black">
        {post && <InsightArticle post={post} />}
        {!post && (missing || error) && (
          <div className="px-4 py-40 text-center">
            <h1 className="text-3xl font-bold">{error || "This insight is not published."}</h1>
            <Link to="/insights" className="mt-6 inline-block font-bold text-[#0d9488]">Back to Iconic Insights</Link>
          </div>
        )}
        {!post && !missing && !error && <p className="px-4 py-40 text-center text-sm text-gray-400">Loading insight…</p>}
      </div>
    </Layout>
  );
}
