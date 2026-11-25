import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "@/components/Layout";
import { useAuth } from "@/contexts/AuthContext";
import {
  type NewsCard,
  formatNewsDate,
  newsCategoryLabel,
} from "@shared/news";

type Filter = "all" | "newsletter" | "promo";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "newsletter", label: "Newsletters" },
  { id: "promo", label: "Promos" },
];

export default function News() {
  const { user } = useAuth();
  const [issues, setIssues] = useState<NewsCard[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancel = false;
    (async () => {
      const token = await user?.getIdToken();
      if (!token) return;
      const response = await fetch("/api/news", { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json().catch(() => ({})) as { issues?: NewsCard[]; error?: string };
      if (cancel) return;
      if (!response.ok) {
        setError(data.error || "News could not be loaded.");
        return;
      }
      setIssues(data.issues || []);
    })().catch(() => {
      if (!cancel) setError("News could not be loaded.");
    });
    return () => {
      cancel = true;
    };
  }, [user]);

  const shown = issues.filter((issue) => filter === "all" || issue.category === filter);

  return (
    <Layout>
      <div className="min-h-screen bg-[#f4eee4] text-[#141414]">
        <section className="mx-auto max-w-3xl px-4 pb-20 pt-28 sm:px-6 sm:pt-32">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#0f8f80]">Iconic Images</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">News</h1>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-[#5b5249] sm:text-lg">
            Newsletters and promos from the studio. Every send lives here as its own page.
          </p>
          <div className="mt-8 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="News filters">
            {FILTERS.map((item) => {
              const active = filter === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(item.id)}
                  className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                    active ? "bg-[#0f8f80] text-white" : "bg-[#fffdf9] text-[#5b5249] ring-1 ring-[#e4dacb]"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          {error && <p className="mt-6 text-sm font-semibold text-[#e8432e]">{error}</p>}
          <div className="mt-6 flex flex-col gap-5">
            {shown.map((issue) => (
              <Link
                key={issue.slug}
                to={issue.path}
                data-testid="news-card"
                className="group rounded-[1.75rem] bg-[#fffdf9] p-3 shadow-[0_12px_40px_rgba(20,20,20,0.05)] ring-1 ring-[#e4dacb] transition-transform hover:-translate-y-0.5 sm:p-4"
              >
                <img
                  src={issue.heroImage}
                  alt=""
                  className="aspect-[16/10] w-full rounded-2xl object-cover"
                />
                <div className="px-2 pb-2 pt-4 sm:px-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.14em]">
                    <span className="rounded-full bg-[#0f8f80]/10 px-2.5 py-1 text-[#0f8f80]">
                      {newsCategoryLabel(issue.category)}
                    </span>
                    <time dateTime={issue.date} className="text-[#5b5249]">
                      {formatNewsDate(issue.date)}
                    </time>
                  </div>
                  <h2 className="mt-3 text-2xl font-black tracking-tight group-hover:text-[#0f8f80]">{issue.title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-[#5b5249] sm:text-base">{issue.summary}</p>
                </div>
              </Link>
            ))}
            {shown.length === 0 && (
              <p className="rounded-[1.75rem] bg-[#fffdf9] px-5 py-10 text-center text-sm text-[#5b5249] ring-1 ring-[#e4dacb]">
                {filter === "promo" ? "No promos yet." : "Nothing in this list yet."}
              </p>
            )}
          </div>
        </section>
      </div>
    </Layout>
  );
}
