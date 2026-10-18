import * as React from "react";
import AdminLayout from "@/components/AdminLayout";
import { HolidayRsvpTable } from "@/components/admin/HolidayRsvpTable";
import { useAuth } from "@/contexts/AuthContext";
import { requestHolidayCalendarBackfill } from "@/lib/holidayCalendarBackfill";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { HOLIDAY_RSVP_LEAD } from "@shared/holidayCheckout";
import { holidayRsvpBoard, type HolidayBackfillReport, type HolidayRsvpRow } from "@shared/holidayCalendar";

export default function AdminHolidayRsvps() {
  const { user } = useAuth();
  const [rows, setRows] = React.useState<HolidayRsvpRow[]>([]);
  const [totalHeadcount, setTotalHeadcount] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [report, setReport] = React.useState<HolidayBackfillReport | null>(null);
  const [reportError, setReportError] = React.useState("");

  const addMissing = async () => {
    if (!user || adding) return;
    setAdding(true);
    setReportError("");
    try {
      const token = await user.getIdToken();
      setReport(await requestHolidayCalendarBackfill(token));
    } catch (err) {
      setReportError(err instanceof Error ? err.message : "Could not add the missing calendar events.");
    } finally {
      setAdding(false);
    }
  };

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
        ) : (
          <>
            {error ? <p role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{error}</p> : null}
            <HolidayRsvpTable
              rows={rows}
              totalHeadcount={totalHeadcount}
              adding={adding}
              onAddMissing={addMissing}
              report={report}
              reportError={reportError}
            />
          </>
        )}
      </div>
    </AdminLayout>
  );
}
