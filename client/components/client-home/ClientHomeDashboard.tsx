import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Home,
  LayoutGrid,
  LogOut,
  Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadBrandedInvoice } from "@/lib/downloadBrandedInvoice";
import {
  appointmentSummary,
  appointmentTone,
  clientInvoicePdfInput,
  clientListingPath,
  humanStatus,
  sortNewestFirst,
  usd,
  type AppointmentTone,
  type ClientAppointment,
  type ClientInvoiceStatement,
  type ClientListingCard,
} from "@shared/clientHome";
import { ListingPackageCard } from "@/components/listing-card/ListingPackageCard";

export type ClientHomeSection = "listings" | "orders" | "schedule";

const TONE_CLASS: Record<AppointmentTone, string> = {
  past: "bg-gray-200 text-gray-600 border-gray-200",
  submitted: "bg-blue-600 text-white border-blue-600",
  accepted: "bg-green-600 text-white border-green-600",
  change: "bg-orange-500 text-white border-orange-500",
  inactive: "bg-gray-200 text-gray-500 border-gray-200",
  unknown: "bg-white text-gray-700 border-gray-300",
  undated: "bg-white text-gray-700 border-gray-300",
};

const LISTING_BADGE: Record<string, { label: string; badge: string }> = {
  unscheduled: { label: "Unscheduled", badge: "bg-red-100 text-red-700" },
  scheduled: { label: "Scheduled", badge: "bg-green-100 text-green-700" },
  consult_scheduled: { label: "Consult Scheduled", badge: "bg-orange-100 text-orange-700" },
  appt_scheduled: { label: "Appt Scheduled", badge: "bg-green-100 text-green-700" },
  in_progress: { label: "In Progress", badge: "bg-blue-100 text-blue-700" },
  delivered: { label: "Delivered", badge: "bg-sky-100 text-sky-700" },
  paid: { label: "Paid", badge: "bg-teal-100 text-teal-700" },
  delivered_paid: { label: "Delivered · Paid", badge: "bg-teal-500/10 text-teal-700" },
  archived: { label: "Archived", badge: "bg-gray-100 text-gray-400" },
  cancelled: { label: "Cancelled", badge: "bg-red-100 text-red-700" },
  canceled: { label: "Cancelled", badge: "bg-red-100 text-red-700" },
};

const PANELS: { id: ClientHomeSection; label: string; icon: typeof LayoutGrid }[] = [
  { id: "listings", label: "Listings", icon: LayoutGrid },
  { id: "orders", label: "Order history", icon: Receipt },
  { id: "schedule", label: "Schedule", icon: CalendarClock },
];

export function ClientHomeView({
  firstName,
  listings,
  invoices,
  appointments,
  listingsTruncated = false,
  invoicesTruncated = false,
  appointmentsTruncated = false,
  section,
  onSection,
  onSignOut,
  today,
  loading = false,
  error = "",
}: {
  firstName: string;
  listings: ClientListingCard[];
  invoices: ClientInvoiceStatement[];
  appointments: ClientAppointment[];
  listingsTruncated?: boolean;
  invoicesTruncated?: boolean;
  appointmentsTruncated?: boolean;
  section: ClientHomeSection;
  onSection: (section: ClientHomeSection) => void;
  onSignOut: () => void;
  today: string;
  loading?: boolean;
  error?: string;
}) {
  const orderedListings = useMemo(() => sortNewestFirst(listings), [listings]);
  const orderedInvoices = useMemo(() => sortNewestFirst(invoices), [invoices]);

  return (
    <div className="flex-1 bg-[#f6f7f8] text-black flex flex-col">
      <header className="bg-black text-white">
        <div className="px-4 sm:px-6 lg:px-8 py-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500">Iconic Images</p>
            <h1 className="text-2xl sm:text-3xl font-black mt-2">Hello, {firstName}</h1>
          </div>
          <Button
            variant="outline"
            className="border-zinc-700 bg-transparent text-white hover:bg-zinc-900"
            onClick={onSignOut}
          >
            <LogOut className="w-4 h-4 mr-2" /> Sign out
          </Button>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row">
        <aside className="lg:w-72 lg:shrink-0 lg:sticky lg:top-0 lg:self-start lg:max-h-screen lg:overflow-y-auto bg-white border-b lg:border-b-0 lg:border-r border-gray-200">
          <nav aria-label="Client home" className="p-3 flex flex-col gap-2">
            {PANELS.map((panel) => {
              const Icon = panel.icon;
              const active = section === panel.id;
              const count = panel.id === "listings" ? orderedListings.length : panel.id === "orders" ? orderedInvoices.length : appointments.length;
              return (
                <button
                  key={panel.id}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => onSection(panel.id)}
                  className={`w-full flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition-colors ${active ? "bg-black text-white" : "text-gray-600 hover:bg-gray-50"}`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <Icon className={`w-4 h-4 shrink-0 ${active ? "text-white" : "text-[#0d9488]"}`} />
                    <span className="text-xs font-black uppercase tracking-widest truncate">{panel.label}</span>
                  </span>
                  <span className="text-[10px] font-black text-gray-400">{count}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6 lg:py-8" data-section={section}>
          {loading ? (
            <div className="flex justify-center py-24">
              <div className="w-8 h-8 border-4 border-[#0d9488] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
              <p className="font-bold">{error}</p>
            </div>
          ) : section === "listings" ? (
            <ListingGrid listings={orderedListings} truncated={listingsTruncated} />
          ) : section === "orders" ? (
            <OrderHistory invoices={orderedInvoices} truncated={invoicesTruncated} />
          ) : (
            <ScheduleCalendar appointments={appointments} today={today} truncated={appointmentsTruncated} />
          )}
        </main>
      </div>
    </div>
  );
}

function ListingGrid({ listings, truncated }: { listings: ClientListingCard[]; truncated: boolean }) {
  if (listings.length === 0) {
    return (
      <EmptyState
        title="No listings yet"
        body="No listings are tied to this account yet. A project saved for this login shows up here."
      />
    );
  }

  return (
    <div>
      <SectionHeading title="Listings" note={truncated ? "Showing the latest listings stored for this account." : ""} />
      <div className="grid items-start gap-6 [grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),360px))]">
        {listings.map((listing) => (
          <ListingTile key={listing.id} listing={listing} />
        ))}
      </div>
    </div>
  );
}

export function ListingTile({ listing }: { listing: ClientListingCard }) {
  if (listing.look) return <ListingPackageCard listing={listing} />;
  const badge = LISTING_BADGE[listing.status] ?? {
    label: humanStatus(listing.status) || "Status not stored",
    badge: "bg-gray-100 text-gray-500",
  };
  const isBusiness = listing.projectType === "business";
  const dateLabel = listing.appointmentDate
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(utcDate(listing.appointmentDate))
    : "";

  return (
    <Link
      to={clientListingPath(listing.id)}
      className="block min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:shadow-md"
    >
      <div className="relative aspect-video overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200">
        {listing.coverUrl ? (
          <img src={listing.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {isBusiness ? <Building2 className="w-8 h-8 text-gray-300" /> : <Home className="w-8 h-8 text-gray-300" />}
          </div>
        )}
        {listing.projectType ? (
          <div className="absolute top-3 left-3">
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${isBusiness ? "bg-black/80 text-white" : "bg-[#0d9488]/90 text-white"}`}>
              {isBusiness ? "Business" : "Real Estate"}
            </span>
          </div>
        ) : null}
        <div className="absolute top-3 right-3">
          <span className={`px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest ${badge.badge}`}>{badge.label}</span>
        </div>
      </div>
      <div className="p-4">
        <h3 className="font-bold text-sm text-black mb-1 line-clamp-1">{listing.address}</h3>
        <p className="text-xs text-gray-500">
          {listing.imageCount === 0 ? "No photos yet" : `${listing.imageCount} photo${listing.imageCount === 1 ? "" : "s"}`}
        </p>
        {dateLabel ? (
          <p className="text-xs text-gray-500 mt-2 flex items-center gap-1.5">
            <CalendarClock className="w-3 h-3" /> {dateLabel}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

export function OrderHistory({
  invoices,
  truncated = false,
  openId,
  onToggle,
}: {
  invoices: ClientInvoiceStatement[];
  truncated?: boolean;
  openId?: string | null;
  onToggle?: (id: string) => void;
}) {
  const [localOpen, setLocalOpen] = useState<string | null>(null);
  const opened = openId !== undefined ? openId : localOpen;
  const toggle = onToggle || ((id: string) => setLocalOpen((current) => (current === id ? null : id)));

  if (invoices.length === 0) {
    return (
      <EmptyState
        title="No invoices yet"
        body="No invoices are stored on this account yet."
      />
    );
  }

  return (
    <div>
      <SectionHeading title="Order history" note={truncated ? "Showing the latest invoices stored for this account." : "Download the invoice that is already on file."} />
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {invoices.map((invoice) => {
          const open = opened === invoice.id;
          return (
            <div key={invoice.id} className="border-b border-gray-100 last:border-b-0">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => toggle(invoice.id)}
                className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-gray-50"
              >
                <div className="min-w-0">
                  <p className="font-black truncate">{invoice.invoiceNumber}</p>
                  <p className="text-xs text-gray-500 mt-1 uppercase tracking-widest">
                    {[invoice.issuedOn, invoice.status ? humanStatus(invoice.status) : "Status not stored"].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <p className="font-black">{invoice.total == null ? "Total not stored" : usd(invoice.total)}</p>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
                </div>
              </button>
              {open ? <InvoiceDetail invoice={invoice} /> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InvoiceDetail({ invoice }: { invoice: ClientInvoiceStatement }) {
  return (
    <div className="px-5 pb-5 bg-gray-50 border-t border-gray-100">
      <div className="py-4 space-y-2">
        {invoice.clientName ? <p className="text-sm font-bold">{invoice.clientName}</p> : null}
        {invoice.address ? <p className="text-sm text-gray-600">{invoice.address}</p> : null}
        {invoice.lineItems.length === 0 ? (
          <p className="text-sm text-gray-500">No line items are stored on this invoice.</p>
        ) : (
          invoice.lineItems.map((item, index) => (
            <div key={`${item.name}-${index}`} className="flex items-start justify-between gap-4 text-sm">
              <span className="font-bold">
                {item.name}
                {item.qty != null ? <span className="font-medium text-gray-500"> × {item.qty}</span> : null}
              </span>
              <span>{item.amount == null ? "Amount not stored" : usd(item.amount)}</span>
            </div>
          ))
        )}
        <MoneyRow label="Subtotal" value={invoice.subtotal} />
        <MoneyRow label="Tax" value={invoice.tax} />
        <MoneyRow label="Total" value={invoice.total} />
        <MoneyRow label="Amount paid" value={invoice.amountPaid} />
        <MoneyRow label="Amount due" value={invoice.amountDue} />
      </div>
      <button
        type="button"
        onClick={() => downloadInvoicePdf(invoice)}
        className="inline-flex items-center gap-2 rounded-xl bg-black text-white px-4 py-2.5 text-[10px] font-black uppercase tracking-widest hover:bg-zinc-800"
      >
        <Download className="w-3.5 h-3.5" /> Download PDF
      </button>
    </div>
  );
}

function MoneyRow({ label, value }: { label: string; value: number | null }) {
  if (value == null) return null;
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-bold">{usd(value)}</span>
    </div>
  );
}

export function downloadInvoicePdf(invoice: ClientInvoiceStatement) {
  downloadBrandedInvoice(clientInvoicePdfInput(invoice));
}

function ScheduleCalendar({
  appointments,
  today,
  truncated,
}: {
  appointments: ClientAppointment[];
  today: string;
  truncated: boolean;
}) {
  const [month, setMonth] = useState(() => monthKey(today));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const cells = monthCells(month);
  const byDate = new Map<string, ClientAppointment[]>();
  const undated: ClientAppointment[] = [];
  appointments.forEach((appointment) => {
    if (!appointment.date) {
      undated.push(appointment);
      return;
    }
    const list = byDate.get(appointment.date) || [];
    list.push(appointment);
    byDate.set(appointment.date, list);
  });
  const selected = appointments.find((appointment) => appointment.id === selectedId) || null;
  const inMonth = appointments.some((appointment) => appointment.date?.startsWith(month));

  return (
    <div>
      <SectionHeading
        title="Schedule"
        note={truncated ? "Showing the latest appointments stored for this account." : ""}
      />
      <div className="flex flex-wrap gap-2 mb-4">
        <Legend swatch="bg-gray-200 border-gray-200" label="Past" />
        <Legend swatch="bg-blue-600 border-blue-600" label="You submitted" />
        <Legend swatch="bg-green-600 border-green-600" label="Iconic accepted" />
        <Legend swatch="bg-orange-500 border-orange-500" label="Different time, approval still open" />
      </div>

      <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-100">
          <button type="button" aria-label="Previous month" onClick={() => setMonth((current) => shiftMonth(current, -1))} className="p-2 rounded-xl hover:bg-gray-50">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h3 className="text-sm font-black uppercase tracking-widest">{monthTitle(month)}</h3>
          <button type="button" aria-label="Next month" onClick={() => setMonth((current) => shiftMonth(current, 1))} className="p-2 rounded-xl hover:bg-gray-50">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="grid grid-cols-7 border-b border-gray-50">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div key={day} className="py-3 text-center">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">{day}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((cell) => {
            const dayAppointments = byDate.get(cell.key) || [];
            const isToday = cell.key === today;
            return (
              <div
                key={cell.key}
                data-date={cell.key}
                className={`min-h-24 sm:min-h-32 border-r border-b border-gray-50 p-1.5 sm:p-2 ${cell.inMonth ? "" : "bg-gray-50/40"} ${isToday ? "bg-[#0d9488]/5" : ""}`}
              >
                <span className={`inline-flex text-xs font-black ${isToday ? "bg-[#0d9488] text-white w-6 h-6 items-center justify-center rounded-lg" : cell.inMonth ? "text-gray-500" : "text-gray-300"}`}>
                  {cell.label}
                </span>
                <div className="mt-1 space-y-1">
                  {dayAppointments.map((appointment) => {
                    const tone = appointmentTone(appointment, today);
                    const summary = appointmentSummary(appointment, today);
                    return (
                      <button
                        key={appointment.id}
                        type="button"
                        data-tone={tone}
                        title={summary}
                        onClick={() => setSelectedId(appointment.id)}
                        className={`w-full text-left rounded-lg border px-1.5 py-1 ${TONE_CLASS[tone]}`}
                      >
                        <span className="block text-[10px] font-black truncate">{appointment.time || "Time not stored"}</span>
                        <span className="block text-[10px] font-bold truncate opacity-90">{appointment.address}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {appointments.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">No appointments are stored on this account yet.</p>
      ) : !inMonth ? (
        <p className="mt-4 text-sm text-gray-500">No appointments in {monthTitle(month)}. Move between months to see the other stored dates.</p>
      ) : null}

      {selected ? (
        <div className="mt-4 bg-white rounded-2xl border border-gray-100 p-5">
          <p className="font-black">{selected.address}</p>
          <p className="text-sm text-gray-600 mt-1">
            {[formatDay(selected.date), selected.time].filter(Boolean).join(" · ") || "Date not stored"}
          </p>
          <p className="text-sm mt-2">{appointmentSummary(selected, today)}</p>
        </div>
      ) : null}

      {undated.length > 0 ? (
        <div className="mt-6">
          <h3 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3">Not on the calendar</h3>
          <div className="grid gap-3">
            {undated.map((appointment) => (
              <div key={appointment.id} className="bg-white rounded-2xl border border-dashed border-gray-200 p-4">
                <p className="font-black">{appointment.address}</p>
                <p className="text-sm text-gray-500 mt-1">{appointmentSummary(appointment, today)}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-white border border-gray-100 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-gray-600">
      <span className={`w-2.5 h-2.5 rounded-full border ${swatch}`} />
      {label}
    </span>
  );
}

function SectionHeading({ title, note }: { title: string; note?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-xs font-black uppercase tracking-widest text-[#0d9488]">{title}</h2>
      {note ? <p className="text-sm text-gray-500 mt-1">{note}</p> : null}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-8">
      <h2 className="font-black">{title}</h2>
      <p className="text-sm text-gray-500 mt-2">{body}</p>
    </div>
  );
}

function monthKey(today: string): string {
  return /^\d{4}-\d{2}/.test(today) ? today.slice(0, 7) : "2026-01";
}

function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const next = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthTitle(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

function monthCells(month: string): { key: string; label: string; inMonth: boolean }[] {
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const lead = first.getUTCDay();
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const cells: { key: string; label: string; inMonth: boolean }[] = [];
  for (let index = 0; index < lead; index++) {
    const date = new Date(Date.UTC(year, monthNumber - 1, 1 - (lead - index)));
    cells.push({ key: utcKey(date), label: String(date.getUTCDate()), inMonth: false });
  }
  for (let day = 1; day <= days; day++) {
    cells.push({
      key: `${year}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      label: String(day),
      inMonth: true,
    });
  }
  while (cells.length % 7 !== 0) {
    const previous = cells[cells.length - 1].key;
    const [y, m, d] = previous.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d + 1));
    cells.push({ key: utcKey(date), label: String(date.getUTCDate()), inMonth: false });
  }
  return cells;
}

function utcKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function utcDate(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDay(key: string | null): string {
  if (!key) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(utcDate(key));
}
