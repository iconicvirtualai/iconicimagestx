import * as React from "react";
import AdminLayout from "@/components/AdminLayout";
import { HolidayRsvpTable } from "@/components/admin/HolidayRsvpTable";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { HOLIDAY_RSVP_LEAD } from "@shared/holidayCheckout";
import { holidayRsvpBoard, type HolidayRsvpRow } from "@shared/holidayCalendar";

export default function AdminHolidayRsvps() {
  const [rows, setRows] = React.useState<HolidayRsvpRow[]>([]);
  const [totalHeadcount, setTotalHeadcount] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    const list = query(collection(db, "orderRequests"), where("leadSource", "==", HOLIDAY_RSVP_LEAD));
    return onSnapshot(list, (snap) => {
      const board = holidayRsvpBoard(snap.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
      setRows(board.rows);
      setTotalHeadcount(board.totalHeadcount);
      setError("");
      setLoading(false);
    }, (err) => {
      console.error("[Holiday RSVPs] Load failed:", err);
      setError("Could not load holiday RSVPs.");
      setLoading(false);
    });
  }, []);

  return (
    <AdminLayout title="Holiday RSVPs">
      <div className="pb-10">
        <p className="mb-4 max-w-2xl text-sm font-bold text-gray-500">
          Thankful client holiday event RSVPs for Sat, Nov 7. Photo times are on the photos calendar.
        </p>
        {loading ? (
          <div className="flex items-center justify-center py-24"><div className="w-6 h-6 border-2 border-[#0d9488] border-t-transparent rounded-full animate-spin" /></div>
        ) : error ? (
          <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{error}</p>
        ) : (
          <HolidayRsvpTable rows={rows} totalHeadcount={totalHeadcount} />
        )}
      </div>
    </AdminLayout>
  );
}
