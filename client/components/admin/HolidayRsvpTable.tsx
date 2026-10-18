import { Link } from "react-router-dom";
import type { HolidayBackfillReport, HolidayCalendarStatus, HolidayRsvpRow } from "@shared/holidayCalendar";

const CALENDAR_STATUS_CLASS: Record<HolidayCalendarStatus, string> = {
  "on calendar": "bg-teal-50 text-teal-700",
  failed: "bg-red-50 text-red-700",
  none: "bg-gray-100 text-gray-500",
};

export function HolidayRsvpTable({
  rows,
  totalHeadcount,
  adding = false,
  onAddMissing,
  report = null,
  reportError = "",
}: {
  rows: HolidayRsvpRow[];
  totalHeadcount: number;
  adding?: boolean;
  onAddMissing?: () => void;
  report?: HolidayBackfillReport | null;
  reportError?: string;
}) {
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Thankful RSVPs</p>
          <p className="mt-1 text-3xl font-black text-gray-900" data-total-headcount={totalHeadcount}>{totalHeadcount}</p>
          <p className="text-sm font-bold text-gray-500">Total headcount, not counting test or cancelled RSVPs.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-bold text-gray-500">{rows.length} {rows.length === 1 ? "RSVP" : "RSVPs"}</p>
          {onAddMissing ? (
            <button
              type="button"
              onClick={onAddMissing}
              disabled={adding}
              className="rounded-xl bg-[#0d9488] px-4 py-2 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50"
            >
              {adding ? "Adding…" : "Add missing to calendar"}
            </button>
          ) : null}
        </div>
      </div>
      {reportError ? (
        <p role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{reportError}</p>
      ) : null}
      {report ? <HolidayBackfillResult report={report} /> : null}
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-200 bg-white px-5 py-10 text-center text-sm font-bold text-gray-500">No Thankful RSVPs yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-gray-100 text-[10px] font-black uppercase tracking-widest text-gray-400">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Headcount</th>
                <th className="px-4 py-3">Menu vote</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Calendar</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-gray-50 last:border-0" data-rsvp-id={row.id}>
                  <td className="px-4 py-3 font-bold text-gray-900">
                    <Link className="underline decoration-gray-300 underline-offset-4 hover:text-[#0d9488]" to={`/admin/order-request/${row.id}`}>{row.name}</Link>
                    {row.orderNumber ? <div className="text-xs font-bold text-gray-400">{row.orderNumber}</div> : null}
                    {row.test ? <div className="text-[10px] font-black uppercase tracking-widest text-amber-600">Test</div> : null}
                  </td>
                  <td className="px-4 py-3 font-bold text-gray-700">{row.time}</td>
                  <td className="px-4 py-3 font-bold text-gray-700">{row.headcount}</td>
                  <td className="px-4 py-3 font-bold text-gray-700">{row.menuVote}</td>
                  <td className="px-4 py-3 font-bold uppercase tracking-wide text-gray-700">{row.status}</td>
                  <td className="px-4 py-3">
                    <span data-calendar-status={row.calendarStatus} className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${CALENDAR_STATUS_CLASS[row.calendarStatus]}`}>{row.calendarStatus}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function HolidayBackfillResult({ report }: { report: HolidayBackfillReport }) {
  const skipped = report.skipped;
  return (
    <div data-backfill-report className="mb-6 rounded-2xl border border-gray-200 bg-white px-5 py-4 text-sm">
      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Calendar backfill</p>
      <p className="mt-2 font-bold text-gray-800">Orders already on the calendar are left alone.</p>
      <dl className="mt-3 grid gap-2 sm:grid-cols-4">
        <div><dt className="text-[10px] font-black uppercase tracking-widest text-gray-400">Created</dt><dd className="font-black text-gray-900" data-created={report.created}>{report.created}</dd></div>
        <div><dt className="text-[10px] font-black uppercase tracking-widest text-gray-400">Skipped</dt><dd className="font-bold text-gray-700">{skipped.test} test, {skipped.cancelled} cancelled, {skipped.alreadyScheduled} already on calendar, {skipped.notASlot} not a slot</dd></div>
        <div><dt className="text-[10px] font-black uppercase tracking-widest text-gray-400">Failed</dt><dd className="font-black text-gray-900" data-failed={report.failed.length}>{report.failed.length}</dd></div>
        <div><dt className="text-[10px] font-black uppercase tracking-widest text-gray-400">Moved</dt><dd className="font-black text-gray-900" data-moved={report.moved.length}>{report.moved.length}</dd></div>
      </dl>
      {report.failed.length > 0 ? (
        <ul className="mt-3 space-y-1 text-red-800">
          {report.failed.map((item) => (
            <li key={item.id}>{item.name}{item.orderNumber ? ` (${item.orderNumber})` : ""}: {item.error}</li>
          ))}
        </ul>
      ) : null}
      {report.moved.length > 0 ? (
        <ul className="mt-3 space-y-1 text-gray-700">
          {report.moved.map((item) => (
            <li key={item.id}>{item.name}{item.orderNumber ? ` (${item.orderNumber})` : ""}: {item.fromDate} {item.fromTime} → {item.toDate} {item.toTime}{item.error ? ` (${item.error})` : ""}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
