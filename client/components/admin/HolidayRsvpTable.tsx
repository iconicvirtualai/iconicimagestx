import { Link } from "react-router-dom";
import type { HolidayRsvpRow } from "@shared/holidayCalendar";

export function HolidayRsvpTable({
  rows,
  totalHeadcount,
}: {
  rows: HolidayRsvpRow[];
  totalHeadcount: number;
}) {
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Thankful RSVPs</p>
          <p className="mt-1 text-3xl font-black text-gray-900" data-total-headcount={totalHeadcount}>{totalHeadcount}</p>
          <p className="text-sm font-bold text-gray-500">Total headcount, not counting test or cancelled RSVPs.</p>
        </div>
        <p className="text-sm font-bold text-gray-500">{rows.length} {rows.length === 1 ? "RSVP" : "RSVPs"}</p>
      </div>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
