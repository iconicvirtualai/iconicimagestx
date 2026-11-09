import { Link } from "react-router-dom";
import {
  CONTENT_STAGE_LABEL,
  CONTENT_STAGES,
  dueLabel,
  shortName,
  type ContentStage,
  type TaskAssignee,
  type TaskBoardTask,
} from "@shared/taskBoard";
import {
  checklistHref,
  contentCalendar,
  contentTasks,
  monthGrid,
  type CalendarMark,
  type ContentInsight,
} from "@shared/contentPlan";

export type ContentSection = "podcast" | "promo" | "calendar";

export function ContentWorkspace({
  tasks,
  staff,
  insights,
  events = [],
  today,
  month,
  section,
  selectedId,
  sample,
  onSection,
  onMonth,
  onSelect,
  onStage,
  onAssign,
  onPublish,
  onToggle,
  onCreate,
  onTrackInsight,
}: {
  tasks: TaskBoardTask[];
  staff: TaskAssignee[];
  insights: ContentInsight[];
  events?: Array<{ id: string; name: string; date: string; sample: boolean }>;
  today: string;
  month: string;
  section: ContentSection;
  selectedId: string | null;
  sample: boolean;
  onSection: (section: ContentSection) => void;
  onMonth: (month: string) => void;
  onSelect: (id: string) => void;
  onStage: (id: string, stage: ContentStage) => void;
  onAssign: (id: string, assignee: TaskAssignee | null) => void;
  onPublish: (id: string, publishOn: string | null) => void;
  onToggle: (id: string) => void;
  onCreate: (input: { kind: "podcast" | "promo"; title: string; publishOn: string }) => void;
  onTrackInsight: (insight: ContentInsight) => void;
}) {
  const rows = section === "calendar" ? [] : contentTasks(tasks, section);
  const marks = contentCalendar(tasks, insights, month, events);
  const selected = tasks.find((task) => task.id === selectedId) || null;

  return (
    <div data-testid="content-workspace" className="min-w-0 text-slate-900">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          {sample ? (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-800">Sample data</span>
          ) : null}
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Content</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Podcasts have their own section and stay on the checklist as the same item. Marketing and Iconic promo videos live here and on the content calendar. Listing and client videos stay in production on the task board.
          </p>
        </div>
        <Link to={sample ? "/admin/tasks?sample=1" : "/admin/tasks"} className="text-xs font-bold uppercase tracking-widest text-[#0d9488]">Task board</Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Content sections">
        <Tab id="podcast" label="Podcast" active={section === "podcast"} onClick={onSection} />
        <Tab id="promo" label="Marketing & promo" active={section === "promo"} onClick={onSection} />
        <Tab id="calendar" label="Calendar" active={section === "calendar"} onClick={onSection} />
      </div>

      {section === "calendar" ? (
        <Calendar
          month={month}
          today={today}
          marks={marks}
          sample={sample}
          onMonth={onMonth}
          onSelect={onSelect}
          onTrackInsight={onTrackInsight}
          insights={insights}
        />
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <header className="mb-4">
            <h3 className="text-sm font-semibold">{section === "podcast" ? "Podcast" : "Marketing and Iconic promo"}</h3>
            <p className="text-[11px] text-slate-400">
              {section === "podcast"
                ? "Checking an episode here checks the same row on the task board."
                : "These are not listing videos. A calendar date creates or updates one linked task."}
            </p>
          </header>
          <CreateRow kind={section} today={today} onCreate={onCreate} />
          {rows.length === 0 ? <p className="mt-4 text-sm text-slate-500">Nothing in this section yet.</p> : null}
          <ul className="mt-4 divide-y divide-slate-100">
            {rows.map((task) => (
              <li key={task.id} data-testid="content-row" data-task-id={task.id} className={`py-3 ${task.id === selected?.id ? "bg-[#f0fdfa]" : ""}`}>
                <div className="flex flex-wrap items-start gap-3">
                  <input
                    type="checkbox"
                    checked={task.status === "done"}
                    aria-label={task.status === "done" ? `Reopen ${task.title}` : `Complete ${task.title}`}
                    onChange={() => onToggle(task.id)}
                    className="mt-1 h-4 w-4 accent-[#0d9488]"
                  />
                  <div className="min-w-0 flex-1">
                    <button type="button" onClick={() => onSelect(task.id)} className={`text-left text-sm font-medium ${task.status === "done" ? "text-slate-400 line-through" : "text-slate-900"}`}>
                      {task.title}
                    </button>
                    <p className="mt-1 text-[11px] text-slate-400">{task.sourceLine}</p>
                    <div className="mt-1 flex flex-wrap gap-3 text-[11px] font-semibold">
                      <Link to={keepSample(checklistHref(task.id), sample)} className="text-[#0d9488]">Open on checklist</Link>
                      {task.orderHref ? <Link to={task.orderHref} className="text-[#0d9488]">Open order</Link> : null}
                      {task.insightId ? <Link to={`/admin/insights?post=${encodeURIComponent(task.insightId)}`} className="text-[#0d9488]">Open Insights</Link> : null}
                    </div>
                  </div>
                  <select aria-label={`Stage for ${task.title}`} value={task.contentStage || "idea"} onChange={(event) => onStage(task.id, event.target.value as ContentStage)} className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700">
                    {CONTENT_STAGES.map((stage) => <option key={stage} value={stage}>{CONTENT_STAGE_LABEL[stage]}</option>)}
                  </select>
                  <select aria-label={`Assignee for ${task.title}`} value={task.assigneeId || ""} onChange={(event) => onAssign(task.id, staff.find((person) => person.id === event.target.value) || null)} className="rounded-lg px-1 py-1 text-[11px] font-semibold text-slate-600">
                    <option value="">Unassigned</option>
                    {staff.map((person) => <option key={person.id} value={person.id}>{shortName(person.name)}</option>)}
                  </select>
                  <label className="flex basis-full flex-wrap items-center gap-1 pt-1 text-[11px] font-semibold text-slate-500">
                    <span>Publish</span>
                    <input type="date" value={task.publishOn || ""} aria-label={`Publish date for ${task.title}`} onChange={(event) => onPublish(task.id, event.target.value || null)} className="rounded border border-slate-200 px-1 py-0.5" />
                    <span>{dueLabel(task.dueOn, task.status, today)}</span>
                  </label>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Calendar({
  month,
  today,
  marks,
  insights,
  sample,
  onMonth,
  onSelect,
  onTrackInsight,
}: {
  month: string;
  today: string;
  marks: CalendarMark[];
  insights: ContentInsight[];
  sample: boolean;
  onMonth: (month: string) => void;
  onSelect: (id: string) => void;
  onTrackInsight: (insight: ContentInsight) => void;
}) {
  const weeks = monthGrid(month);
  const label = new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <section data-testid="content-calendar" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{label}</h3>
          <p className="text-[11px] text-slate-400">Publish dates, event dates, and Insights posts that are not tracked yet.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold" onClick={() => onMonth(shiftMonth(month, -1))}>Previous</button>
          <button type="button" className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold" onClick={() => onMonth(today.slice(0, 7))}>This month</button>
          <button type="button" className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold" onClick={() => onMonth(shiftMonth(month, 1))}>Next</button>
        </div>
      </header>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div key={day}>{day}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {weeks.flat().map((day) => {
          const inMonth = day.startsWith(month);
          const dayMarks = marks.filter((mark) => mark.date === day);
          return (
            <div key={day} className={`min-h-24 rounded-lg border p-1 ${inMonth ? "border-slate-100 bg-white" : "border-transparent bg-slate-50 text-slate-300"} ${day === today ? "ring-1 ring-[#0d9488]" : ""}`}>
              <p className="text-[10px] font-semibold">{Number(day.slice(-2))}</p>
              {dayMarks.map((mark) => (
                mark.kind === "podcast" || mark.kind === "promo" ? (
                  <button key={mark.id} type="button" onClick={() => mark.taskId && onSelect(mark.taskId)} className={`mt-1 block w-full truncate rounded px-1 text-left text-[10px] font-semibold ${mark.kind === "podcast" ? "bg-sky-50 text-sky-800" : "bg-amber-50 text-amber-800"}`}>
                    {mark.title}
                  </button>
                ) : (
                  <Link key={mark.id} to={keepSample(mark.href, sample)} className={`mt-1 block w-full truncate rounded px-1 text-left text-[10px] font-semibold ${mark.kind === "event" ? "bg-teal-50 text-teal-800" : "bg-slate-100 text-slate-600"}`}>
                    {mark.kind === "event" ? mark.title : `Insights · ${mark.title}`}
                  </Link>
                )
              ))}
            </div>
          );
        })}
      </div>
      <ul className="mt-4 space-y-1 md:hidden">
        {marks.map((mark) => (
          <li key={`list-${mark.id}`} className="text-xs text-slate-700">
            <span className="text-slate-400">{mark.date.slice(5)} · </span>
            {mark.title}
          </li>
        ))}
      </ul>
      <ul className="mt-4 space-y-2">
        {insights.filter((insight) => insight.readyForSocial).map((insight) => (
          <li key={insight.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-slate-600">Insights · {insight.title}</span>
            <button type="button" className="font-semibold text-[#0d9488]" onClick={() => onTrackInsight(insight)}>Track once</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CreateRow({
  kind,
  today,
  onCreate,
}: {
  kind: "podcast" | "promo";
  today: string;
  onCreate: (input: { kind: "podcast" | "promo"; title: string; publishOn: string }) => void;
}) {
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const title = String(data.get("title") || "");
        const publishOn = String(data.get("publishOn") || today);
        if (!title.trim()) return;
        onCreate({ kind, title, publishOn });
        form.reset();
      }}
    >
      <input name="title" aria-label={kind === "podcast" ? "Podcast title" : "Promo title"} placeholder={kind === "podcast" ? "New podcast episode" : "New Iconic promo"} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
      <input name="publishOn" type="date" aria-label="Publish date" defaultValue={today} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
      <button type="submit" className="rounded-lg bg-black px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-white">Add</button>
    </form>
  );
}

function Tab({ id, label, active, onClick }: { id: ContentSection; label: string; active: boolean; onClick: (id: ContentSection) => void }) {
  return (
    <button type="button" role="tab" aria-selected={active} data-testid={`content-tab-${id}`} onClick={() => onClick(id)} className={`rounded-full px-3 py-1 text-[11px] font-semibold ${active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}>
      {label}
    </button>
  );
}

function keepSample(href: string, sample: boolean): string {
  if (!sample) return href;
  const [path, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  params.set("sample", "1");
  return `${path}?${params.toString()}`;
}

function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}
