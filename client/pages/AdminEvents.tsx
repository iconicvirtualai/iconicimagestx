/**
 * Events planning. Thankful RSVPs stay on the built-in holiday event.
 * Checklist lines are the task board records. Does not email or text.
 */

import { useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import AdminLayout from "@/components/AdminLayout";
import { HolidayRsvpPanel } from "@/pages/AdminHolidayRsvps";
import { useOfficeEvents } from "@/lib/useOfficeEvents";
import { useTaskBoardData } from "@/lib/useTaskBoardData";
import {
  EVENT_STATUSES,
  EVENT_STATUS_LABEL,
  EVENT_TYPES,
  EVENT_TYPE_LABEL,
  THANKFUL_EVENT_ID,
  addOfficeEventTask,
  eventTasks,
  splitOfficeEvents,
  type EventStatus,
  type EventType,
  type OfficeEvent,
} from "@shared/officeEvents";
import { withToggled } from "@shared/taskBoard";

export default function AdminEvents() {
  const { eventId } = useParams();
  const data = useTaskBoardData();
  const office = useOfficeEvents(data.sample, data.today);
  const [params] = useSearchParams();
  const sampleQuery = params.get("sample") === "1" ? "?sample=1" : "";

  return (
    <AdminLayout title="Events">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-xs text-slate-500">
          {data.sample
            ? "Sample events are labeled. Thankful is the real holiday event. Nothing here sends email or texts."
            : "Plan headshot days, spring events, and pop-ups. Thankful RSVPs stay on the holiday event."}
        </p>
        <Link to={data.sample ? "/admin/events" : "/admin/events?sample=1"} className="text-xs font-bold uppercase tracking-widest text-[#0d9488]">
          {data.sample ? "Live events" : "View sample"}
        </Link>
      </div>
      {eventId ? (
        <EventDetail
          eventId={eventId}
          events={office.events}
          tasks={data.tasks}
          sampleQuery={sampleQuery}
          onToggle={(id) => data.commit(withToggled(data.tasks, id, new Date().toISOString()))}
          onAdd={(title) => {
            const event = office.events.find((item) => item.id === eventId);
            if (!event) return;
            const added = addOfficeEventTask(data.tasks, event, title, new Date().toISOString());
            if (added.ok === false) {
              toast.error(added.error);
              return;
            }
            if (added.tasks.length === data.tasks.length) {
              toast("That planning task is already on this event.");
              return;
            }
            data.commit(added.tasks);
            toast("Added to this event and the task board.");
          }}
        />
      ) : (
        <EventList
          events={office.events}
          today={data.today}
          sampleQuery={sampleQuery}
          error={office.error}
          onCreate={async (input) => {
            const created = await office.create(input);
            if (created.ok === false) {
              toast.error(created.error);
              return;
            }
            toast(data.sample ? "Sample event added in this tab." : "Event saved.");
          }}
        />
      )}
    </AdminLayout>
  );
}

export function HolidayRsvpsRedirect() {
  const [params] = useSearchParams();
  const next = new URLSearchParams(params);
  return <Navigate to={`/admin/events/${THANKFUL_EVENT_ID}${next.toString() ? `?${next}` : ""}`} replace />;
}

function EventList({
  events,
  today,
  sampleQuery,
  error,
  onCreate,
}: {
  events: OfficeEvent[];
  today: string;
  sampleQuery: string;
  error: string;
  onCreate: (input: {
    name: string;
    type: EventType;
    date: string;
    time: string;
    location: string;
    status: EventStatus;
    notes: string;
  }) => Promise<void>;
}) {
  const { upcoming, past } = splitOfficeEvents(events, today);
  const [open, setOpen] = useState(false);
  return (
    <div data-testid="events-list">
      {error ? <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{error}</p> : null}
      <div className="mb-4 flex justify-end">
        <button type="button" onClick={() => setOpen((value) => !value)} className="rounded-xl bg-black px-4 py-2 text-xs font-bold text-white">
          {open ? "Close" : "New event"}
        </button>
      </div>
      {open ? <NewEventForm today={today} onCreate={onCreate} onDone={() => setOpen(false)} /> : null}
      <EventGroup title="Upcoming" events={upcoming} sampleQuery={sampleQuery} empty="No upcoming events yet." />
      <EventGroup title="Past" events={past} sampleQuery={sampleQuery} empty="No past events." />
    </div>
  );
}

function EventGroup({ title, events, sampleQuery, empty }: { title: string; events: OfficeEvent[]; sampleQuery: string; empty: string }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">{title}</h2>
      {events.length === 0 ? <p className="text-sm text-slate-500">{empty}</p> : null}
      <ul className="grid gap-3">
        {events.map((event) => (
          <li key={event.id}>
            <Link to={`/admin/events/${event.id}${sampleQuery}`} data-testid="event-card" className="block rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm hover:border-[#0d9488]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-slate-900">{event.name}</span>
                {event.sample ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-800">Sample</span> : null}
                {event.builtin ? <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-teal-800">Holiday RSVPs</span> : null}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {EVENT_TYPE_LABEL[event.type]} · {EVENT_STATUS_LABEL[event.status]} · {event.date}{event.time ? ` · ${event.time}` : ""}
              </p>
              {event.location ? <p className="text-xs text-slate-400">{event.location}</p> : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function NewEventForm({
  today,
  onCreate,
  onDone,
}: {
  today: string;
  onCreate: (input: {
    name: string;
    type: EventType;
    date: string;
    time: string;
    location: string;
    status: EventStatus;
    notes: string;
  }) => Promise<void>;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<EventType>("headshot");
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState<EventStatus>("planning");
  const [notes, setNotes] = useState("");
  return (
    <form
      className="mb-6 grid gap-2 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        void onCreate({ name, type, date, time, location, status, notes }).then(onDone);
      }}
    >
      <input aria-label="Event name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Event name" className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm md:col-span-2" />
      <select aria-label="Event type" value={type} onChange={(event) => setType(event.target.value as EventType)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
        {EVENT_TYPES.map((item) => <option key={item} value={item}>{EVENT_TYPE_LABEL[item]}</option>)}
      </select>
      <select aria-label="Event status" value={status} onChange={(event) => setStatus(event.target.value as EventStatus)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
        {EVENT_STATUSES.map((item) => <option key={item} value={item}>{EVENT_STATUS_LABEL[item]}</option>)}
      </select>
      <input aria-label="Event date" type="date" value={date} onChange={(event) => setDate(event.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
      <input aria-label="Event time" value={time} onChange={(event) => setTime(event.target.value)} placeholder="Time" className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
      <input aria-label="Event location" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Location" className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm md:col-span-2" />
      <textarea aria-label="Event notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notes" className="min-h-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm md:col-span-2" />
      <button type="submit" className="rounded-lg bg-[#0d9488] px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-white">Save event</button>
    </form>
  );
}

function EventDetail({
  eventId,
  events,
  tasks,
  sampleQuery,
  onToggle,
  onAdd,
}: {
  eventId: string;
  events: OfficeEvent[];
  tasks: ReturnType<typeof useTaskBoardData>["tasks"];
  sampleQuery: string;
  onToggle: (id: string) => void;
  onAdd: (title: string) => void;
}) {
  const event = events.find((item) => item.id === eventId);
  const [title, setTitle] = useState("");
  if (!event) {
    return (
      <div>
        <Link to={`/admin/events${sampleQuery}`} className="text-xs font-bold uppercase tracking-widest text-[#0d9488]">All events</Link>
        <p className="mt-4 text-sm text-slate-500">That event is not on the list.</p>
      </div>
    );
  }
  const plan = eventTasks(tasks, event.id);
  return (
    <div data-testid="event-detail">
      <Link to={`/admin/events${sampleQuery}`} className="text-xs font-bold uppercase tracking-widest text-[#0d9488]">All events</Link>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <h2 className="text-2xl font-semibold text-slate-950">{event.name}</h2>
        {event.sample ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-800">Sample</span> : null}
      </div>
      <p className="mt-1 text-sm text-slate-500">
        {EVENT_TYPE_LABEL[event.type]} · {EVENT_STATUS_LABEL[event.status]} · {event.date}{event.time ? ` · ${event.time}` : ""}
      </p>
      {event.location ? <p className="text-sm text-slate-500">{event.location}</p> : null}
      {event.notes ? <p className="mt-2 max-w-2xl text-sm text-slate-600">{event.notes}</p> : null}

      {event.id === THANKFUL_EVENT_ID ? (
        <div className="mt-6" data-testid="holiday-rsvps">
          <HolidayRsvpPanel />
        </div>
      ) : null}

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold">Planning checklist</h3>
        <p className="text-[11px] text-slate-400">Checking a line here checks the same task on the task board.</p>
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row"
          onSubmit={(submit) => {
            submit.preventDefault();
            if (!title.trim()) return;
            onAdd(title);
            setTitle("");
          }}
        >
          <input aria-label="Planning task" value={title} onChange={(input) => setTitle(input.target.value)} placeholder="Add a planning task" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
          <button type="submit" className="rounded-lg bg-black px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-white">Add</button>
        </form>
        {plan.length === 0 ? <p className="mt-3 text-sm text-slate-500">No planning tasks yet.</p> : null}
        <ul className="mt-3 divide-y divide-slate-100">
          {plan.map((task) => (
            <li key={task.id} data-testid="event-task" className="flex items-start gap-3 py-2">
              <input type="checkbox" checked={task.status === "done"} aria-label={`Complete ${task.title}`} onChange={() => onToggle(task.id)} className="mt-1 h-4 w-4 accent-[#0d9488]" />
              <div>
                <p className={`text-sm font-medium ${task.status === "done" ? "text-slate-400 line-through" : "text-slate-900"}`}>{task.title}</p>
                <Link to={`/admin/tasks?task=${encodeURIComponent(task.id)}${sampleQuery ? "&sample=1" : ""}`} className="text-[11px] font-semibold text-[#0d9488]">Open on checklist</Link>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
