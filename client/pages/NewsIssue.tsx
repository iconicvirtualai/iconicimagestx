import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Layout from "@/components/Layout";
import EmailFrame from "@/components/news/EmailFrame";
import { useAuth } from "@/contexts/AuthContext";
import {
  NEWS_INDEX_PATH,
  type NewsCategory,
  type NewsIssue as NewsIssueData,
  formatNewsDate,
  newsCategoryLabel,
} from "@shared/news";

export default function NewsIssue({ category }: { category: NewsCategory }) {
  const { slug = "" } = useParams();
  const { user } = useAuth();
  const [issue, setIssue] = useState<NewsIssueData | null>(null);
  const [missing, setMissing] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setIssue(null);
    setMissing(false);
    let cancel = false;
    (async () => {
      const token = await user?.getIdToken();
      if (!token) return;
      const response = await fetch(`/api/news/issues/${category}/${encodeURIComponent(slug)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({})) as { issue?: NewsIssueData };
      if (cancel) return;
      if (response.ok && data.issue?.category === category) setIssue(data.issue);
      else setMissing(true);
    })().catch(() => {
      if (!cancel) setMissing(true);
    });
    return () => {
      cancel = true;
    };
  }, [category, slug, user]);

  async function share() {
    const url = window.location.href;
    const title = issue?.title || "Iconic Images";
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Layout>
      <div className="min-h-screen bg-[#f4eee4] text-[#141414]">
        <div className="mx-auto flex max-w-[720px] flex-col px-4 pb-16 pt-28 sm:px-6 sm:pt-32">
          <div className="mb-5 flex items-center justify-between gap-3">
            <Link to={NEWS_INDEX_PATH} className="text-sm font-bold text-[#0f8f80] hover:text-[#0c7468]">
              ← Back to all news
            </Link>
            {issue && (
              <button
                type="button"
                onClick={() => void share()}
                className="rounded-full bg-[#fffdf9] px-4 py-2 text-sm font-bold text-[#141414] ring-1 ring-[#e4dacb]"
              >
                {copied ? "Link copied" : "Share"}
              </button>
            )}
          </div>
          {issue && (
            <>
              <p className="mb-4 text-center text-xs font-bold uppercase tracking-[0.16em] text-[#5b5249]">
                {newsCategoryLabel(issue.category)} · {formatNewsDate(issue.date)}
              </p>
              <h1 className="sr-only">{issue.title}</h1>
              <div className="flex justify-center">
                <EmailFrame html={issue.emailHtml} title={issue.title} />
              </div>
            </>
          )}
          {!issue && missing && (
            <div className="rounded-[1.75rem] bg-[#fffdf9] px-6 py-16 text-center ring-1 ring-[#e4dacb]">
              <h1 className="text-2xl font-black">This issue is not published.</h1>
              <Link to={NEWS_INDEX_PATH} className="mt-4 inline-block font-bold text-[#0f8f80]">
                Back to all news
              </Link>
            </div>
          )}
          {!issue && !missing && <p className="py-16 text-center text-sm text-[#5b5249]">Loading…</p>}
        </div>
      </div>
    </Layout>
  );
}
