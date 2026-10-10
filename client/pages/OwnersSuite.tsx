import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { OwnerSuiteData } from "@shared/ownerSuite";
import NotFound from "@/pages/NotFound";
import { useAuth } from "@/contexts/AuthContext";
import { auth } from "@/lib/firebase";

interface OwnerSuitePayload {
  data: OwnerSuiteData;
  source: "sheet" | "fixture" | "empty";
  configured: boolean;
  notice: string | null;
  readerEmail: string | null;
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
      <div className="flex min-h-screen items-center justify-center bg-[#071422] px-6 text-center">
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

function money(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

function OwnersSuiteView({
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

  return (
    <div className="min-h-screen bg-[#071422] text-[#f7f1e4]">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <img src="/media/decor/arc.svg" alt="" className="absolute -right-24 -top-16 w-[420px] opacity-30" />
        <div className="absolute left-1/2 top-0 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-[#e8c872]/10 blur-3xl" />
      </div>

      <header className="sticky top-0 z-20 border-b border-[#e8c872]/25 bg-[#071422]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:px-8">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-white">Iconic</p>
            <h1 className="font-['Cormorant_Garamond'] text-[1.7rem] leading-none text-[#f4e2b0]">Owners Suite</h1>
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
        <div className="h-px bg-gradient-to-r from-transparent via-[#e8c872] to-transparent" />
      </header>

      <main className="relative mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 md:px-8 md:py-8">
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
                  <h3 className="font-['Cormorant_Garamond'] text-[1.35rem] leading-none text-[#f7f1e4]">{business.name}</h3>
                  <p className="mt-2 text-[11px] leading-snug text-[#9fb0c7]">{business.note || "No note"}</p>
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
                    <p className="font-['Cormorant_Garamond'] text-3xl leading-none text-[#e8c872]">{horizon.horizon}</p>
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
    </div>
  );
}

function Card({ kicker, title, children }: { kicker: string; title: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-[28px] border border-[#e8c872]/30 bg-[#102844] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#e8c872]">{kicker}</p>
      <h2 className="mt-1 font-['Cormorant_Garamond'] text-[1.85rem] leading-none text-[#f7f1e4]">{title}</h2>
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
        <p className="font-['Cormorant_Garamond'] text-4xl leading-none text-[#f7f1e4]">{money(amount)}</p>
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
              <p className="mt-1 font-['Cormorant_Garamond'] text-xl leading-none">{day.date}</p>
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

function BotCard({ state, entries }: { state: OwnerSuiteData["bots"]["state"]; entries: OwnerSuiteData["bots"]["entries"] }) {
  return (
    <Card kicker="Bots" title="Activity">
      {state === "missing" ? (
        <p className="text-sm text-[#9fb0c7]">Coming soon</p>
      ) : state !== "ready" || entries.length === 0 ? (
        <Empty />
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li key={`${entry.bot}-${entry.loop}`} className="rounded-2xl bg-[#071422] px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#f7f1e4]">{entry.bot}</p>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#e8c872]">{entry.loop}</p>
                </div>
                <p className="shrink-0 font-['Cormorant_Garamond'] text-3xl leading-none text-[#f4e2b0]">
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
