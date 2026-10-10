import type { PlanColumn, PlanLine } from "@shared/ownerPlan";
import { PLAN_BUSINESSES } from "@shared/planBusinesses";

const SECTIONS: Array<{ key: "calendar" | "social" | "events" | "email" | "todos"; title: string }> = [
  { key: "calendar", title: "Sales & Marketing Calendar" },
  { key: "social", title: "Socials" },
  { key: "events", title: "Events & Promos" },
  { key: "email", title: "Email Rotation" },
  { key: "todos", title: "Cadi's To-dos" },
];

export default function PlanBoard({
  columns,
  stamp,
  preview,
}: {
  columns: PlanColumn[] | undefined;
  stamp: string;
  preview: boolean;
}) {
  const board = columns?.length ? columns : emptyColumns();

  return (
    <div className="mx-auto w-full max-w-[1440px]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9fb0c7]">{stamp}</p>
        {preview ? (
          <span className="rounded-full border border-[#e8c872]/40 px-2 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#e8c872]">
            Preview data
          </span>
        ) : null}
      </div>
      <div
        data-plan-board
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-6 lg:grid lg:grid-cols-6 lg:overflow-visible"
      >
        {board.map((column) => (
          <article
            key={column.business}
            data-plan-column={column.business}
            className="w-[84%] shrink-0 snap-start rounded-[28px] border border-[#e8c872]/30 bg-[#102844] p-4 lg:w-auto lg:min-w-0"
          >
            <h2 className="owners-heading text-lg leading-tight text-[#f4e2b0]">{column.business}</h2>
            <div className="mt-4 space-y-4">
              <section>
                <h3 className="text-[10px] font-black uppercase tracking-[0.14em] text-[#e8c872]">Revenue vs Expenses</h3>
                <MoneyCompare revenue={column.revenue} expenses={column.expenses} />
              </section>
              {SECTIONS.map((section) => (
                <PlanSection key={section.key} title={section.title} lines={column[section.key]} todos={section.key === "todos"} />
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function emptyColumns(): PlanColumn[] {
  return PLAN_BUSINESSES.map((business) => ({
    business,
    revenue: null,
    expenses: null,
    calendar: [],
    social: [],
    events: [],
    email: [],
    todos: [],
  }));
}

function MoneyCompare({ revenue, expenses }: { revenue: number | null; expenses: number | null }) {
  if (revenue == null && expenses == null) return <p className="mt-1 text-xs text-[#9fb0c7]">No plan yet</p>;
  const rev = Math.max(0, revenue ?? 0);
  const exp = Math.max(0, expenses ?? 0);
  const total = rev + exp;
  const revPct = total > 0 ? (rev / total) * 100 : 0;
  return (
    <div className="mt-2">
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#c5d0df]">Revenue</p>
          <p className="owners-heading text-xl leading-none text-[#f7f1e4]">{money(revenue)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#c5d0df]">Expenses</p>
          <p className="owners-heading text-xl leading-none text-[#f4e2b0]">{money(expenses)}</p>
        </div>
      </div>
      <div
        className="mt-2 flex h-2 overflow-hidden rounded-full bg-[#071422]"
        role="img"
        aria-label={`Revenue ${money(revenue)}, expenses ${money(expenses)}`}
      >
        <div className="h-full bg-[#e8c872]" style={{ width: `${revPct}%` }} />
        <div className="h-full bg-[#4c6e96]" style={{ width: `${100 - revPct}%` }} />
      </div>
    </div>
  );
}

function PlanSection({ title, lines, todos }: { title: string; lines: PlanLine[]; todos: boolean }) {
  return (
    <section>
      <h3 className="text-[10px] font-black uppercase tracking-[0.14em] text-[#e8c872]">{title}</h3>
      {lines.length === 0 ? (
        <p className="mt-1 text-xs text-[#9fb0c7]">No plan yet</p>
      ) : (
        <ul className="mt-1.5 space-y-1.5">
          {lines.map((line, index) => (
            <li key={`${line.item}-${line.date}-${index}`} className={todos && line.done ? "line-through decoration-[#9fb0c7] opacity-60" : ""}>
              {line.date ? <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#c5d0df]">{formatPlanDate(line.date)}</p> : null}
              <p className="text-xs font-semibold leading-snug text-[#f7f1e4]">{line.item}</p>
              {line.notes ? <p className="text-[11px] leading-snug text-[#9fb0c7]">{line.notes}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
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

function formatPlanDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[Number(match[2]) - 1];
  if (!month) return iso;
  return `${month} ${Number(match[3])}`;
}
