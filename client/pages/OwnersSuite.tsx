import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { OwnerSuiteData } from "@shared/ownerSuite";
import PlanBoard from "@/components/owners/PlanBoard";
import NotFound from "@/pages/NotFound";
import { useAuth } from "@/contexts/AuthContext";
import { auth } from "@/lib/firebase";

interface OwnerSuitePayload {
  data: OwnerSuiteData;
  source: "sheet" | "fixture" | "empty";
  configured: boolean;
  notice: string | null;
  readerEmail: string | null;
  /** Static owner line from the authenticated suite response. Not a sheet cell. */
  why?: string;
}

type LoadState =
  | { status: "loading" }
  | { status: "denied" }
  | { status: "error" }
  | { status: "ready"; payload: OwnerSuitePayload };

export default function OwnersSuite() {
  const navigate = useNavigate();
  const { isStaff, signOutUser } = useAuth();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const meta = document.querySelector('meta[name="robots"]') || document.createElement("meta");
    meta.setAttribute("name", "robots");
    meta.setAttribute("content", "noindex, nofollow");
    if (!meta.parentElement) document.head.appendChild(meta);
  }, []);

  async function load(fresh = false) {
    const headers: Record<string, string> = {};
    if (auth.currentUser) {
      try {
        headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
      } catch {
        // The httpOnly session cookie can still authorize this request.
      }
    }
    const response = await fetch(fresh ? "/api/owners/suite?fresh=1" : "/api/owners/suite", {
      headers,
      credentials: "include",
      cache: "no-store",
    });
    if (response.status === 404) {
      setState({ status: "denied" });
      return;
    }
    if (!response.ok) {
      setState({ status: "error" });
      return;
    }
    const payload = (await response.json()) as OwnerSuitePayload;
    setState({ status: "ready", payload });
    document.title = "Owners Suite · Iconic";
  }

  useEffect(() => {
    let cancelled = false;
    void load().catch(() => {
      if (!cancelled) setState({ status: "error" });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function refresh() {
    setRefreshing(true);
    try {
      await load(true);
    } catch {
      setState({ status: "error" });
    } finally {
      setRefreshing(false);
    }
  }

  async function signOut() {
    await fetch("/api/owners/logout", { method: "POST", credentials: "include" });
    await signOutUser();
    navigate("/admin/login", { replace: true });
  }

  if (state.status === "denied") return <NotFound />;
  if (state.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="owners-suite flex min-h-screen items-center justify-center bg-[#071422] px-6 text-center" style={suiteFont}>
        <div>
          <p className="text-sm text-[#d5deea]">This page could not be opened.</p>
          <button type="button" onClick={() => void refresh()} className="mt-4 text-xs font-black uppercase tracking-[0.18em] text-[#e8c872]">
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <OwnersSuiteView
      payload={state.payload}
      refreshing={refreshing}
      showOps={isStaff}
      onRefresh={() => void refresh()}
      onSignOut={() => void signOut()}
    />
  );
}

/** Inter is already on the site. Montserrat is requested only while this suite is open. */
const SUITE_SANS = 'Inter, system-ui, sans-serif';
const SUITE_HEADING = '"Montserrat", Inter, system-ui, sans-serif';
const suiteFont = {
  fontFamily: SUITE_SANS,
  fontStyle: "normal" as const,
  ["--owners-heading" as string]: SUITE_HEADING,
};

function OwnersFonts() {
  useEffect(() => {
    const id = "owners-suite-fonts";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800&display=swap";
    document.head.appendChild(link);
  }, []);

  return (
    <style>{`
      .owners-suite, .owners-suite * { font-style: normal; }
      .owners-suite .owners-heading {
        font-family: var(--owners-heading);
        font-weight: 700;
        font-style: normal;
      }
    `}</style>
  );
}

function money(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

export function OwnersSuiteView({
  payload,
  refreshing,
  showOps,
  onRefresh,
  onSignOut,
}: {
  payload: OwnerSuitePayload;
  refreshing: boolean;
  showOps: boolean;
  onRefresh: () => void;
  onSignOut: () => void;
}) {
  const data = payload.data;
  const stamp = suiteStamp(data.generatedAt);
  const [tab, setTab] = useState<"scorecard" | "plan">("scorecard");

  return (
    <div className="owners-suite min-h-screen bg-[#071422] text-[#f7f1e4]" style={suiteFont}>
      <OwnersFonts />
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <img src="/media/decor/arc.svg" alt="" className="absolute -right-24 -top-16 w-[420px] opacity-30" />
        <div className="absolute left-1/2 top-0 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-[#e8c872]/10 blur-3xl" />
      </div>

      <header className="sticky top-0 z-20 border-b border-[#e8c872]/25 bg-[#071422]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:px-8">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-white">Iconic</p>
            <h1 className="owners-heading text-[1.7rem] leading-none text-[#f4e2b0]">Owners Suite</h1>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            {showOps ? (
              <a href="/admin/dashboard" className="text-[10px] font-black uppercase tracking-[0.16em] text-[#9fb0c7]">
                Ops
              </a>
            ) : null}
            <button type="button" onClick={onRefresh} className="text-[10px] font-black uppercase tracking-[0.16em] text-[#e8c872]">
              {refreshing ? "Updating" : "Refresh"}
            </button>
            <button type="button" onClick={onSignOut} className="text-[10px] font-black uppercase tracking-[0.16em] text-[#f7f1e4]">
              Sign out
            </button>
          </div>
        </div>
        <div role="tablist" aria-label="Owners Suite" className="mx-auto flex max-w-6xl gap-1 px-4 md:px-8">
          <SuiteTab active={tab === "scorecard"} onSelect={() => setTab("scorecard")}>Scorecard</SuiteTab>
          <SuiteTab active={tab === "plan"} onSelect={() => setTab("plan")}>Plan Board</SuiteTab>
        </div>
        <div className="h-px bg-gradient-to-r from-transparent via-[#e8c872] to-transparent" />
      </header>

      {tab === "plan" ? (
        <PlanBoard columns={data.planBoard?.columns} stamp={stamp} preview={payload.source === "fixture"} />
      ) : (
      <main className="relative mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 md:px-8 md:py-8">
        {payload.why ? <WhyHero quote={payload.why} /> : null}
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9fb0c7]">{stamp}</p>
          {payload.source === "fixture" ? (
            <span className="rounded-full border border-[#e8c872]/40 px-2 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#e8c872]">
              Preview data
            </span>
          ) : null}
        </div>

        {payload.notice ? (
          <section className="rounded-[28px] border border-[#e8c872]/40 bg-[#102844] px-5 py-4">
            <p className="text-sm text-[#f7f1e4]">{payload.notice}</p>
            {payload.readerEmail ? (
              <p className="mt-2 text-xs leading-relaxed text-[#9fb0c7]">
                Share the scorecard as Viewer with {payload.readerEmail}.
              </p>
            ) : null}
          </section>
        ) : null}

        <section className="rounded-[28px] border border-[#e8c872]/35 bg-[#102844] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#e8c872]">Cash</p>
          <div className="mt-4 space-y-5">
            <Meter label="This week" amount={data.cashWeek.amount} goal={data.cashWeek.goal} />
            <Meter label="This month" amount={data.cashMonth.amount} goal={data.cashMonth.goal} />
          </div>
        </section>

        <ScorecardCard scorecard={data.scorecard} />

        <div className="grid gap-3 md:grid-cols-2">
          <Card kicker="Savings" title={data.savings.note || "Reserve"}>
            {data.savings.amount == null && data.savings.goal == null ? (
              <Empty />
            ) : (
              <Meter label="Saved" amount={data.savings.amount} goal={data.savings.goal} />
            )}
          </Card>
          <Card kicker="Money in" title="By payment">
            {data.moneyIn.length === 0 ? <Empty /> : <MoneyIn rows={data.moneyIn} />}
          </Card>
        </div>

        <Card kicker="Balances" title="AR and owes">
          {data.receivables.length === 0 && data.owes.length === 0 ? (
            <Empty />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <PartyList label="Owed to you" rows={data.receivables} />
              <PartyList label="You owe" rows={data.owes} />
            </div>
          )}
        </Card>

        <Card kicker="Businesses" title="Where things stand">
          {data.businesses.length === 0 ? (
            <Empty />
          ) : (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
              {data.businesses.map((business) => (
                <article key={business.name} className="min-w-0 rounded-2xl bg-[#071422] p-3">
                  <span className={`mb-3 inline-flex rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-[#071422] ${toneClass(business.tone)}`}>
                    {business.label}
                  </span>
                  <h3 className="owners-heading text-[1.35rem] leading-none text-[#f7f1e4]">{business.name}</h3>
                  <p className="mt-2 text-[11px] leading-snug text-[#9fb0c7]">{business.note || "No note"}</p>
                  {business.milestone ? <p className="mt-2 text-[11px] leading-snug text-[#d5deea]">{business.milestone}</p> : null}
                  {business.milestoneDue ? <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#e8c872]">{business.milestoneDue}</p> : null}
                  {business.target ? <p className="mt-1 text-[11px] leading-snug text-[#d5deea]">{business.target}</p> : null}
                  {business.owners ? <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9fb0c7]">{business.owners}</p> : null}
                </article>
              ))}
            </div>
          )}
        </Card>

        <div className="grid gap-3 md:grid-cols-2">
          <Card kicker="Today" title="The plan">
            {data.today.length === 0 ? (
              <Empty />
            ) : (
              <ol className="space-y-3">
                {data.today.map((item) => (
                  <li key={`${item.title}-${item.when}`} className="rounded-2xl bg-[#071422] px-3 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#e8c872]">{item.when || "Today"}</p>
                    <p className="mt-1 text-sm font-semibold text-[#f7f1e4]">{item.title}</p>
                    {item.detail ? <p className="mt-1 text-xs text-[#9fb0c7]">{item.detail}</p> : null}
                  </li>
                ))}
              </ol>
            )}
          </Card>
          <Card kicker="Calendar" title="This week">
            {data.calendar.length === 0 ? <Empty /> : <WeekStrip generatedAt={data.generatedAt} items={data.calendar} />}
          </Card>
        </div>

        <Card kicker="Needs your yes" title="Decisions">
          <p className="mb-3 text-[10px] font-black uppercase tracking-[0.16em] text-[#9fb0c7]">Read only</p>
          {data.decisions.length === 0 ? (
            <Empty />
          ) : (
            <ul className="space-y-2">
              {data.decisions.map((item) => (
                <li key={item.title} className="rounded-2xl border border-[#e8c872]/25 bg-[#071422] px-3 py-3">
                  <p className="text-sm font-semibold text-[#f7f1e4]">{item.title}</p>
                  {item.detail ? <p className="mt-1 text-xs text-[#9fb0c7]">{item.detail}</p> : null}
                  {item.by ? <p className="mt-2 text-[10px] font-black uppercase tracking-[0.14em] text-[#e8c872]">{item.by}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="grid gap-3 md:grid-cols-2">
          <Card kicker="$100k" title="Tracker">
            {data.tracker.current == null && data.tracker.goal == null && data.tracker.rows.length === 0 ? (
              <Empty />
            ) : (
              <div>
                <Meter label="Toward the goal" amount={data.tracker.current} goal={data.tracker.goal} />
                {data.tracker.rows.length > 0 ? (
                  <ul className="mt-4 space-y-2">
                    {data.tracker.rows.map((row) => (
                      <li key={row.label} className="flex items-center justify-between gap-3 text-sm">
                        <span className="min-w-0 text-[#d5deea]">{row.label}</span>
                        <span className="shrink-0 text-[#f4e2b0]">{money(row.amount)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
          </Card>
          <Card kicker="Plan" title="30 · 60 · 90">
            {data.horizons.length === 0 ? (
              <Empty />
            ) : (
              <div className="grid gap-2">
                {data.horizons.map((horizon) => (
                  <article key={horizon.horizon} className="rounded-2xl bg-[#071422] px-3 py-3">
                    <p className="owners-heading text-3xl leading-none text-[#e8c872]">{horizon.horizon === "later" ? "Later" : horizon.horizon}</p>
                    <ul className="mt-2 space-y-1">
                      {horizon.items.map((item) => (
                        <li key={item} className="text-xs leading-snug text-[#d5deea]">{item}</li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            )}
          </Card>
        </div>

        <BotCard state={data.bots.state} entries={data.bots.entries} />
      </main>
      )}
    </div>
  );
}

function SuiteTab({ active, onSelect, children }: { active: boolean; onSelect: () => void; children: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onSelect}
      className={`border-b-2 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] ${active ? "border-[#e8c872] text-[#f4e2b0]" : "border-transparent text-[#9fb0c7]"}`}
    >
      {children}
    </button>
  );
}

function WhyHero({ quote }: { quote: string }) {
  return (
    <section className="relative overflow-hidden rounded-[28px] border border-[#e8c872]/55 bg-gradient-to-br from-[#5a4318] via-[#1c3d66] to-[#102844] px-5 py-6 shadow-[0_0_48px_rgba(232,200,114,0.22)] md:px-8 md:py-8">
      <div className="pointer-events-none absolute -left-10 -top-12 h-40 w-40 rounded-full bg-[#f0d48a]/35 blur-3xl" />
      <div className="pointer-events-none absolute -right-8 bottom-0 h-28 w-48 rounded-full bg-[#e8c872]/25 blur-2xl" />
      <p className="relative text-[10px] font-black uppercase tracking-[0.28em] text-[#f0d48a]">Why</p>
      <blockquote className="relative mt-3 max-w-4xl owners-heading text-[1.65rem] leading-snug text-[#fff8ea] md:text-[2.15rem] md:leading-snug">
        <span aria-hidden="true" className="mr-1 text-[#f0d48a]">“</span>
        {quote}
        <span aria-hidden="true" className="text-[#f0d48a]">”</span>
      </blockquote>
    </section>
  );
}

function Card({ kicker, title, children }: { kicker: string; title: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-[28px] border border-[#e8c872]/30 bg-[#102844] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#e8c872]">{kicker}</p>
      <h2 className="mt-1 owners-heading text-[1.85rem] leading-none text-[#f7f1e4]">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Empty() {
  return <p className="text-sm text-[#9fb0c7]">No data yet</p>;
}

function Meter({ label, amount, goal }: { label: string; amount: number | null; goal: number | null }) {
  if (amount == null && goal == null) return <Empty />;
  const ratio = amount != null && goal != null && goal > 0 ? Math.max(0, Math.min(1, amount / goal)) : null;
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#c5d0df]">{label}</p>
        <p className="owners-heading text-4xl leading-none text-[#f7f1e4]">{money(amount)}</p>
      </div>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={ratio == null ? undefined : Math.round(ratio * 100)}
      >
        <div className="h-full rounded-full bg-gradient-to-r from-[#a67c2d] to-[#f0d48a]" style={{ width: `${(ratio ?? 0) * 100}%` }} />
      </div>
      <p className="mt-2 text-[11px] font-semibold text-[#9fb0c7]">
        {ratio == null ? "No goal on the sheet yet" : `${Math.round(ratio * 100)}% of ${money(goal)}`}
      </p>
    </div>
  );
}

function MoneyIn({ rows }: { rows: OwnerSuitePayload["data"]["moneyIn"] }) {
  const max = Math.max(...rows.map((row) => row.amount || 0), 1);
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.method}>
          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold text-[#f7f1e4]">{row.method}</span>
            <span className="text-[#f4e2b0]">{money(row.amount)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-[#e8c872]" style={{ width: `${((row.amount || 0) / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function PartyList({ label, rows }: { label: string; rows: OwnerSuitePayload["data"]["owes"] }) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#9fb0c7]">{label}</p>
      {rows.length === 0 ? (
        <Empty />
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={`${label}-${row.name}`} className="flex items-start justify-between gap-3 rounded-2xl bg-[#071422] px-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#f7f1e4]">{row.name}</p>
                {row.detail ? <p className="text-[11px] text-[#9fb0c7]">{row.detail}</p> : null}
              </div>
              <p className="shrink-0 text-sm text-[#f4e2b0]">{money(row.amount)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function WeekStrip({ generatedAt, items }: { generatedAt: string; items: OwnerSuiteData["calendar"] }) {
  const days = chicagoWeek(generatedAt);
  const today = chicagoKey(new Date(generatedAt));
  return (
    <div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const count = items.filter((item) => item.dateKey === day.key).length;
          const active = day.key === today;
          return (
            <div key={day.key} className={`rounded-xl px-1 py-2 text-center ${active ? "bg-[#e8c872] text-[#071422]" : "bg-[#071422] text-[#d5deea]"}`}>
              <p className="text-[9px] font-black uppercase tracking-wide">{day.label}</p>
              <p className="mt-1 owners-heading text-xl leading-none">{day.date}</p>
              <p className="mt-1 text-[9px] font-bold">{count || "·"}</p>
            </div>
          );
        })}
      </div>
      <ul className="mt-3 space-y-2">
        {items.slice(0, 4).map((item) => (
          <li key={`${item.dateKey}-${item.title}`} className="text-xs leading-snug text-[#d5deea]">
            <span className="font-black uppercase tracking-[0.12em] text-[#e8c872]">{item.weekday?.slice(0, 3) || "Day"} </span>
            {item.title}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ScorecardCard({ scorecard }: { scorecard: OwnerSuiteData["scorecard"] | undefined }) {
  if (!scorecard) return null;
  const hasRows = scorecard.metrics.length + scorecard.rag.length + scorecard.nextWeek.length + scorecard.payments.length > 0;
  if (!hasRows) return null;
  return (
    <Card kicker="Friday" title="Scorecard">
      {scorecard.metrics.length > 0 ? (
        <ul className="space-y-2">
          {scorecard.metrics.map((metric) => (
            <li key={metric.label} className="flex items-start justify-between gap-3 rounded-2xl bg-[#071422] px-3 py-3">
              <span className="min-w-0 text-sm text-[#d5deea]">{metric.label}</span>
              <span className="shrink-0 text-sm font-semibold text-[#f4e2b0]">{metric.text || (metric.amount == null ? "—" : String(metric.amount))}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {scorecard.rag.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {scorecard.rag.map((row) => (
            <span key={row.name} className="inline-flex items-center gap-2 rounded-full bg-[#071422] px-3 py-1 text-[11px] font-semibold text-[#f7f1e4]">
              <span className={`h-2 w-2 rounded-full ${toneClass(row.tone)}`} />
              {row.name}
            </span>
          ))}
        </div>
      ) : null}
      {scorecard.nextWeek.length > 0 ? (
        <div className="mt-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#9fb0c7]">Next week</p>
          <ul className="mt-2 space-y-2">
            {scorecard.nextWeek.map((row) => (
              <li key={`${row.text}-${row.owner}`} className="rounded-2xl bg-[#071422] px-3 py-3">
                <p className="text-sm text-[#f7f1e4]">{row.text}</p>
                {row.owner ? <p className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#e8c872]">{row.owner}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {scorecard.payments.length > 0 ? (
        <div className="mt-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#9fb0c7]">Week cash detail</p>
          <ul className="mt-2 space-y-2">
            {scorecard.payments.map((row) => (
              <li key={`${row.payment}-${row.date}`} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 text-[#d5deea]">{row.payment}</span>
                <span className="shrink-0 text-[#f4e2b0]">{row.date || "—"}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

function BotCard({ state, entries }: { state: OwnerSuiteData["bots"]["state"]; entries: OwnerSuiteData["bots"]["entries"] }) {
  return (
    <Card kicker="Bots" title="Activity">
      {state !== "ready" || entries.length === 0 ? (
        <p className="text-sm text-[#9fb0c7]">No action log yet</p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li key={`${entry.bot}-${entry.loop}`} className="rounded-2xl bg-[#071422] px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#f7f1e4]">{entry.bot}</p>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#e8c872]">{entry.loop}</p>
                </div>
                <p className="shrink-0 owners-heading text-3xl leading-none text-[#f4e2b0]">
                  {entry.accuracy == null ? "—" : `${entry.accuracy}%`}
                </p>
              </div>
              <p className="mt-2 text-[11px] text-[#9fb0c7]">
                {entry.actionsDone == null ? "No actions yet" : `${entry.actionsDone} actions`}
                {" · "}
                {entry.salesClosed == null ? "No sales yet" : `${entry.salesClosed} sales closed`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function toneClass(tone: OwnerSuiteData["businesses"][number]["tone"]): string {
  if (tone === "green") return "bg-emerald-300";
  if (tone === "yellow") return "bg-amber-300";
  if (tone === "red") return "bg-rose-400";
  return "bg-white/30 text-[#f7f1e4]";
}

function suiteStamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function chicagoKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || "0000";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";
  return `${year}-${month}-${day}`;
}

function chicagoWeek(iso: string): Array<{ key: string; label: string; date: string }> {
  const anchor = new Date(iso);
  const key = chicagoKey(Number.isNaN(anchor.getTime()) ? new Date() : anchor);
  const noon = new Date(`${key}T12:00:00-05:00`);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short" }).format(noon);
  const index = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
  const mondayOffset = index === 0 ? -6 : 1 - index;
  return Array.from({ length: 7 }, (_, offset) => {
    const day = new Date(noon.getTime() + (mondayOffset + offset) * 24 * 60 * 60 * 1000);
    const dayKey = chicagoKey(day);
    return {
      key: dayKey,
      label: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][offset],
      date: dayKey.slice(-2).replace(/^0/, ""),
    };
  });
}
