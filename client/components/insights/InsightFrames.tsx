import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import {
  coverOf,
  embedSrc,
  primaryCategory,
  readingMinutes,
  type InsightBlock,
  type PublicInsight,
} from "@shared/insights";

export function insightDateLabel(iso: string | null): string {
  if (!iso) return "Draft";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Draft";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Chicago",
  }).format(date);
}

function isFresh(iso: string | null): boolean {
  if (!iso) return false;
  const then = new Date(iso).getTime();
  return Number.isFinite(then) && Date.now() - then < 21 * 24 * 60 * 60 * 1000;
}

function Frame({
  linked,
  href,
  className,
  children,
  testId,
}: {
  linked: boolean;
  href: string;
  className: string;
  children: ReactNode;
  testId?: string;
}) {
  if (!linked) return <div className={className} data-testid={testId}>{children}</div>;
  return <Link to={href} className={className} data-testid={testId}>{children}</Link>;
}

function Cover({ src, alt, className }: { src: string; alt: string; className: string }) {
  if (!src) return <div className={`absolute inset-0 bg-gradient-to-br from-gray-900 via-teal-900 to-cyan-700 ${className}`} />;
  return <img src={src} alt={alt} className={`absolute inset-0 h-full w-full object-cover ${className}`} />;
}

export function InsightFeatured({ post, linked = true }: { post: PublicInsight; linked?: boolean }) {
  const category = primaryCategory(post.categories);
  const cover = coverOf(post);
  return (
    <Frame
      linked={linked}
      href={`/insights/${post.slug}`}
      testId="insight-featured"
      className="group relative block aspect-[21/9] overflow-hidden rounded-[2.5rem] bg-gray-900"
    >
      <Cover src={cover} alt={post.coverAlt || post.title} className="opacity-60 transition-transform duration-700 group-hover:scale-105" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
      <div className="absolute bottom-0 left-0 max-w-4xl p-8 md:p-16">
        <div className="mb-6 flex gap-2">
          {isFresh(post.publishedAt) && <span className="rounded bg-[#22d3ee] px-3 py-1 text-[10px] font-bold text-white">NEW</span>}
          <span className="rounded border border-white/20 bg-white/20 px-3 py-1 text-[10px] font-bold uppercase text-white backdrop-blur-md">{category}</span>
        </div>
        <h2 className="mb-6 text-3xl font-bold leading-tight text-white md:text-5xl">{post.title}</h2>
        {post.excerpt && <p className="mb-8 line-clamp-2 max-w-3xl text-lg text-gray-300">{post.excerpt}</p>}
        <div className="flex items-center gap-4 text-xs font-medium text-gray-400">
          <span>{insightDateLabel(post.publishedAt)}</span>
          <span className="h-1 w-1 rounded-full bg-gray-600" />
          <span>{readingMinutes(post)} min read</span>
        </div>
      </div>
    </Frame>
  );
}

export function InsightGridCard({ post, linked = true }: { post: PublicInsight; linked?: boolean }) {
  const cover = coverOf(post);
  return (
    <Frame linked={linked} href={`/insights/${post.slug}`} testId="insight-card" className="group block">
      <div className="relative mb-6 aspect-[9/16] overflow-hidden rounded-[2rem] bg-gray-900">
        <Cover src={cover} alt={post.coverAlt || post.title} className="opacity-80 transition-transform duration-500 group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
        <div className="absolute left-4 top-4">
          <span className="rounded bg-[#22d3ee] px-2 py-0.5 text-[8px] font-bold uppercase text-white">{primaryCategory(post.categories)}</span>
        </div>
        <div className="absolute bottom-0 left-0 w-full p-6">
          <h3 className="mb-4 text-xl font-bold leading-tight text-white transition-colors group-hover:text-[#22d3ee]">{post.title}</h3>
          <p className="text-[10px] font-medium text-gray-300">{insightDateLabel(post.publishedAt)}</p>
        </div>
      </div>
    </Frame>
  );
}

export function InsightBlocks({ blocks }: { blocks: InsightBlock[] }) {
  return (
    <div className="space-y-8">
      {blocks.map((block) => {
        if (block.type === "heading") {
          return <h2 key={block.id} className="text-3xl font-bold text-black">{block.text}</h2>;
        }
        if (block.type === "text") {
          return <p key={block.id} className="whitespace-pre-wrap text-lg leading-relaxed text-gray-600">{block.text}</p>;
        }
        if (block.type === "image" && block.url) {
          return <img key={block.id} src={block.url} alt={block.alt || ""} className="w-full rounded-[2rem] object-cover" />;
        }
        if (block.type === "video" && block.url) {
          return <video key={block.id} src={block.url} controls playsInline className="w-full rounded-[2rem] bg-black" />;
        }
        if (block.type === "carousel" && block.urls.length) {
          return (
            <div key={block.id} className="flex gap-4 overflow-x-auto pb-2">
              {block.urls.map((url) => (
                <img key={url} src={url} alt={block.alt || ""} className="h-72 w-56 flex-none rounded-[1.5rem] object-cover" />
              ))}
            </div>
          );
        }
        if (block.type === "quote" && (block.stat || block.text)) {
          return (
            <figure key={block.id} className="rounded-[2rem] border border-cyan-100 bg-cyan-50 px-8 py-10">
              {block.stat && <p className="text-5xl font-black text-[#0d9488]">{block.stat}</p>}
              {block.text && <blockquote className="mt-3 text-xl text-gray-800">{block.text}</blockquote>}
            </figure>
          );
        }
        if (block.type === "embed") {
          const src = embedSrc(block.url);
          if (!src) return null;
          return (
            <div key={block.id} className="aspect-video overflow-hidden rounded-[2rem] bg-black">
              <iframe title={block.alt || "Embedded media"} src={src} className="h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

export function InsightArticle({ post }: { post: PublicInsight }) {
  const cover = coverOf(post);
  return (
    <article data-testid="insight-article" className="pb-24">
      <div className="container mx-auto px-4 pt-28">
        <Link to="/insights" className="text-xs font-bold uppercase tracking-[0.2em] text-[#0d9488]">Iconic Insights</Link>
        <div className="relative mt-6 aspect-[21/9] overflow-hidden rounded-[2.5rem] bg-gray-900">
          <Cover src={cover} alt={post.coverAlt || post.title} className="opacity-80" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
        </div>
        <div className="mx-auto max-w-3xl py-12">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0d9488]">{primaryCategory(post.categories)}</p>
          <h1 className="mt-4 text-4xl font-bold leading-tight text-black md:text-5xl">{post.title}</h1>
          <p className="mt-4 text-sm font-medium text-gray-400">
            {insightDateLabel(post.publishedAt)} · {readingMinutes(post)} min read · {post.authorName}
          </p>
          {post.excerpt && <p className="mt-8 text-xl leading-relaxed text-gray-600">{post.excerpt}</p>}
          <div className="mt-10">
            <InsightBlocks blocks={post.blocks} />
          </div>
        </div>
      </div>
    </article>
  );
}

export function InsightsFeed({
  posts,
  category,
  query,
  onCategory,
  onQuery,
}: {
  posts: PublicInsight[];
  category: string;
  query: string;
  onCategory: (category: string) => void;
  onQuery: (query: string) => void;
}) {
  const categories = ["ALL", ...Array.from(new Set(posts.flatMap((post) => post.categories.map((item) => item.toUpperCase()))))];
  const needle = query.trim().toLowerCase();
  const filtered = posts.filter((post) => {
    const catOk = category === "ALL" || post.categories.some((item) => item.toUpperCase() === category);
    const haystack = `${post.title} ${post.excerpt} ${post.categories.join(" ")}`.toLowerCase();
    return catOk && (!needle || haystack.includes(needle));
  });
  const [featured, ...rest] = filtered;

  return (
    <div data-testid="insights-feed">
      <section className="border-b border-gray-100 pb-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-center">
            <div className="flex flex-1 flex-wrap gap-2">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => onCategory(cat)}
                  className={`rounded-full border px-4 py-1.5 text-[10px] font-bold tracking-wider transition-all ${
                    category === cat ? "border-[#22d3ee] bg-[#22d3ee] text-white" : "border-gray-100 bg-white text-gray-400 hover:border-gray-300"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div className="relative w-full lg:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
              <input
                type="text"
                value={query}
                onChange={(event) => onQuery(event.target.value)}
                placeholder="Search"
                aria-label="Search insights"
                className="w-full rounded-full border border-gray-100 py-2 pl-10 pr-4 text-sm outline-none transition-all focus:border-[#22d3ee] focus:ring-1 focus:ring-[#22d3ee]"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="py-12">
        <div className="container mx-auto px-4">
          {featured ? (
            <InsightFeatured post={featured} />
          ) : (
            <div data-testid="insights-empty" className="flex aspect-[21/9] items-end rounded-[2.5rem] bg-gradient-to-br from-gray-900 via-teal-900 to-cyan-700 p-8 md:p-16">
              <div>
                <span className="rounded bg-[#22d3ee] px-3 py-1 text-[10px] font-bold text-white">ICONIC INSIGHTS</span>
                <h2 className="mt-6 max-w-3xl text-3xl font-bold text-white md:text-5xl">
                  {posts.length ? "Nothing matches that search." : "New field notes publish here."}
                </h2>
              </div>
            </div>
          )}
        </div>
      </section>

      {rest.length > 0 && (
        <section className="pb-24">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
              {rest.map((post) => <InsightGridCard key={post.id} post={post} />)}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
