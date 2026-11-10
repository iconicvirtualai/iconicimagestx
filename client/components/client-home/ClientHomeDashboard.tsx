import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  CalendarClock,
  ChevronDown,
  Download,
  Home,
} from "lucide-react";
import { PortalShell, portalHref, type PortalHomeSection } from "@/components/client-hub/PortalShell";
import { MoneyAmount } from "@/components/MoneyAmount";
import { downloadBrandedInvoice } from "@/lib/downloadBrandedInvoice";
import {
  appointmentSummary,
  appointmentTone,
  clientInvoicePdfInput,
  clientListingPath,
  humanStatus,
  mergeListingShoots,
  sortNewestFirst,
  usd,
  type AppointmentTone,
  type ClientAppointment,
  type ClientInvoiceStatement,
  type ClientListingCard,
} from "@shared/clientHome";
import { ListingPackageCard } from "@/components/listing-card/ListingPackageCard";
import { PortalMessages } from "@/components/communications/PortalMessages";
import { PortalListingsHome } from "@/components/client-home/PortalListingsHome";

export type ClientHomeSection = PortalHomeSection;

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

export function ClientHomeView({
  firstName,
  accountName,
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
  example = false,
  messageCount = 0,
}: {
  firstName: string;
  accountName?: string;
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
  example?: boolean;
  messageCount?: number;
}) {
  const orderedListings = useMemo(() => sortNewestFirst(listings), [listings]);
  const calendarAppointments = useMemo(() => mergeListingShoots(appointments, orderedListings), [appointments, orderedListings]);
  const upcoming = calendarAppointments.filter((item) => item.date && item.date >= today).length;

  return (
    <PortalShell
      firstName={firstName}
      accountName={accountName}
      onSignOut={onSignOut}
      active={section}
      example={example}
      onSection={onSection}
      counts={{ listings: orderedListings.length, schedule: upcoming || calendarAppointments.length, messages: messageCount }}
    >
      <div data-section={section}>
        {loading ? (
          <div className="flex justify-center py-24">
            <div className="w-8 h-8 border-4 border-[#0d9488] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
            <p className="font-bold">{error}</p>
          </div>
        ) : section === "listings" ? (
          <>
            {listingsTruncated ? <p className="lede">Showing the latest listings stored for this account.</p> : null}
            <PortalListingsHome
              firstName={firstName}
              listings={orderedListings}
              appointments={calendarAppointments}
              example={example}
              today={today}
              onSection={onSection}
            />
          </>
        ) : section === "orders" ? (
          invoices.length === 0 ? (
            <div className="card">
              <h2>Order history</h2>
              <p>No invoices are stored on this account yet.</p>
              <Link to={portalHref("/portal/settings/billing", example)} className="btn btn-ink btn-md" style={{ marginTop: 16 }}>Open billing</Link>
            </div>
          ) : (
            <OrderHistory invoices={invoices} truncated={invoicesTruncated} filterable exampleOpen={example} />
          )
        ) : section === "messages" ? (
          <div id="messages-jump">
            <PortalMessages example={example} />
          </div>
        ) : (
          <div id="schedule-jump">
            <ScheduleCalendar appointments={calendarAppointments} today={today} truncated={appointmentsTruncated} />
          </div>
        )}
      </div>
    </PortalShell>
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
  filterable = false,
  exampleOpen = false,
}: {
  invoices: ClientInvoiceStatement[];
  truncated?: boolean;
  openId?: string | null;
  onToggle?: (id: string) => void;
  filterable?: boolean;
  exampleOpen?: boolean;
}) {
  const [localOpen, setLocalOpen] = useState<string | null>(exampleOpen ? invoices[0]?.id || null : null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const opened = openId !== undefined ? openId : localOpen;
  const toggle = onToggle || ((id: string) => setLocalOpen((current) => (current === id ? null : id)));
  const needle = query.trim().toLowerCase();
  const shown = filterable
    ? invoices.filter((invoice) => {
      const statusOk = status === "all" || (invoice.status || "").toLowerCase() === status;
      if (!statusOk) return false;
      if (!needle) return true;
      return [invoice.invoiceNumber, invoice.clientName, invoice.address, invoice.status].join(" ").toLowerCase().includes(needle);
    })
    : invoices;

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
      {filterable ? (
        <div className="mb-4 flex flex-col sm:flex-row gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search orders"
            aria-label="Search orders"
            className="h-11 flex-1 rounded-xl border border-gray-200 px-3 text-sm"
          />
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            aria-label="Order status"
            className="h-11 rounded-xl border border-gray-200 px-3 text-sm bg-white"
          >
            <option value="all">All statuses</option>
            {[...new Set(invoices.map((invoice) => (invoice.status || "").toLowerCase()).filter(Boolean))].map((item) => (
              <option key={item} value={item}>{item.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
      ) : null}
      {shown.length === 0 ? <p className="text-sm text-gray-500">No orders match that search.</p> : null}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {shown.map((invoice) => {
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
                  {invoice.total == null ? (
                    <p className="font-black">Total not stored</p>
                  ) : (
                    <MoneyAmount className="font-black">{usd(invoice.total)}</MoneyAmount>
                  )}
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
  const due = invoice.amountDue ?? 0;
  const notes = invoice.notes?.trim() || "No notes on this invoice.";
  return (
    <div className="doc">
      <div className="doc-top">
        <div>
          <div className="kicker">Invoice</div>
          <h2 style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-0.03em" }}>{invoice.invoiceNumber}</h2>
          <p className="ink3">{[invoice.issuedOn, invoice.status ? humanStatus(invoice.status) : ""].filter(Boolean).join(" · ")}</p>
          <p className="kicker" style={{ marginTop: 16 }}>Invoice to</p>
          {invoice.clientName ? <p className="font-bold">{invoice.clientName}</p> : null}
          {invoice.address ? <p className="ink3">{invoice.address}</p> : null}
        </div>
        <img className="doc-logo" src="/media/logos/iconic-graffiti-logo.png" alt="Iconic Images" />
      </div>
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th className="r">Qty</th>
            <th className="r">Price</th>
            <th className="r">Total</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lineItems.length === 0 ? (
            <tr><td colSpan={4}>No line items are stored on this invoice.</td></tr>
          ) : invoice.lineItems.map((item, index) => (
            <tr key={`${item.name}-${index}`}>
              <td>{item.name}</td>
              <td className="r">{item.qty ?? ""}</td>
              <td className="r">{item.amount == null ? "Amount not stored" : <MoneyAmount>{usd(item.amount)}</MoneyAmount>}</td>
              <td className="r">{item.amount == null ? "" : <MoneyAmount>{usd(item.amount)}</MoneyAmount>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="totals">
        <MoneyLine label="Subtotal" value={invoice.subtotal} />
        <MoneyLine label="Processing" value={invoice.processing ?? 0} />
        <MoneyLine label="Promotions" value={invoice.promoDiscount ?? 0} />
        <MoneyLine label="Fees" value={invoice.fees ?? 0} />
        {invoice.tax != null ? <MoneyLine label="Tax" value={invoice.tax} /> : null}
        <MoneyLine label="Total" value={invoice.total} />
        <MoneyLine label="Amount paid" value={invoice.amountPaid} />
        <div className="due"><span>Amount due</span><MoneyAmount>{invoice.amountDue == null ? "Amount not stored" : usd(invoice.amountDue)}</MoneyAmount></div>
      </div>
      <div className="notes-box">
        <div className="kicker">Notes</div>
        <p>{notes}</p>
      </div>
      <p className="ink3" style={{ marginTop: 16 }}>
        Iconic Images Photography, LLC · photos@iconicimagestx.com
      </p>
      <p style={{ marginTop: 8, fontWeight: 800 }}>Thank you for being Iconic.</p>
      <div className="actions-inline">
        {due > 0 ? (
          invoice.payPath ? (
            <Link className="btn btn-teal btn-md" to={invoice.payPath}>Pay {usd(due)}</Link>
          ) : (
            <button type="button" className="btn btn-teal btn-md">Pay {usd(due)}</button>
          )
        ) : null}
        {due > 0 ? <Link className="btn btn-outline btn-md" to="/pay-at-close">Pay at Close</Link> : null}
        {invoice.payPath ? <Link className="btn btn-ghost btn-md" to={invoice.payPath}>View invoice</Link> : <span className="btn btn-ghost btn-md">View invoice</span>}
        <button type="button" className="btn btn-ink btn-md" onClick={() => downloadInvoicePdf(invoice)}>
          <Download className="w-3.5 h-3.5" /> Download PDF
        </button>
      </div>
      <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>$0 due until closing with financing arranged by Titus.</p>
    </div>
  );
}

function MoneyLine({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <span>{label}</span>
      {value == null ? <span>Amount not stored</span> : <MoneyAmount>{usd(value)}</MoneyAmount>}
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
      <div className="page-head">
        <div>
          <div className="kicker">Schedule</div>
          <h1>Your appointments</h1>
          {truncated ? <p className="sub">Showing the latest appointments stored for this account.</p> : <p className="sub">Times are in America/Chicago.</p>}
        </div>
      </div>
      <div className="legend">
        <Legend swatch="dot past" label="Past" />
        <Legend swatch="dot sub" label="You submitted" />
        <Legend swatch="dot acc" label="Iconic accepted" />
        <Legend swatch="dot open" label="Different time, approval still open" />
      </div>

      <div className="cal-wrap">
        <div className="cal-nav">
          <button type="button" className="btn btn-ghost btn-sm" aria-label="Previous month" onClick={() => setMonth((current) => shiftMonth(current, -1))}>Previous</button>
          <h2>{monthTitle(month)}</h2>
          <button type="button" className="btn btn-ghost btn-sm" aria-label="Next month" onClick={() => setMonth((current) => shiftMonth(current, 1))}>Next</button>
        </div>
        <div className="cal">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div key={day} className="dow">{day}</div>
          ))}
          {cells.map((cell) => {
            const dayAppointments = byDate.get(cell.key) || [];
            const isToday = cell.key === today;
            return (
              <div
                key={cell.key}
                data-date={cell.key}
                className={`day${cell.inMonth ? "" : " out"}${isToday ? " today" : ""}`}
              >
                <span className="n">{cell.label}</span>
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
                      className={`ev${tone === "past" ? " past" : ""}${tone === "change" ? " open" : ""} ${TONE_CLASS[tone]}`}
                    >
                      {appointment.address}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {appointments.length > 0 ? (
        <div className="agenda">
          {appointments.map((appointment) => {
            const tone = appointmentTone(appointment, today);
            return (
              <article key={appointment.id} className="ag">
                <div className="when">{[formatDay(appointment.date), appointment.time].filter(Boolean).join(" · ") || "Date not stored"}</div>
                <div>
                  <strong>{appointment.address}</strong>
                  <div className="muted">{appointmentSummary(appointment, today)}</div>
                </div>
                <span className={`tag${tone === "past" ? "" : " ok"}`}>{tone === "past" ? "Past" : tone === "accepted" ? "Iconic accepted" : tone === "submitted" ? "You submitted" : tone === "change" ? "Approval still open" : humanStatus(appointment.status) || "On file"}</span>
              </article>
            );
          })}
        </div>
      ) : null}

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
    <span className="leg">
      <span className={swatch} />
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
