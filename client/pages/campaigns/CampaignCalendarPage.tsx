import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { marketingApi } from "@/lib/marketingApi";
import type { CalendarItem } from "@shared/channelCampaigns";
import CampaignFrame, { cardCls, ghostCls } from "@/components/campaigns/CampaignFrame";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function buildCells(year: number, monthIndex: number): { day: number; date: string }[] {
  const first = new Date(year, monthIndex, 1);
  const start = first.getDay();
  const count = new Date(year, monthIndex + 1, 0).getDate();
  const cells: { day: number; date: string }[] = [];
  for (let index = 0; index < start; index += 1) cells.push({ day: 0, date: "" });
  for (let day = 1; day <= count; day += 1) {
    const date = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push({ day, date });
  }
  return cells;
}

export default function CampaignCalendarPage() {
  const { user } = useAuth();
  const [cursor, setCursor] = useState(() => new Date());
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [error, setError] = useState("");
  const key = monthKey(cursor);

  useEffect(() => {
    marketingApi<{ items: CalendarItem[] }>(() => user?.getIdToken(), `/api/channel-campaigns/calendar?month=${key}`)
      .then((data) => setItems(data.items))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load the calendar."));
  }, [user, key]);

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of items) {
      const list = map.get(item.date) || [];
      list.push(item);
      map.set(item.date, list);
    }
    return map;
  }, [items]);

  const cells = buildCells(cursor.getFullYear(), cursor.getMonth());
  const title = cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  function shift(amount: number) {
    setCursor((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
  }

  return (
    <CampaignFrame
      title="Calendar"
      subtitle="Every scheduled email, text, and post across campaigns. Times are shown on the Chicago day."
      action={<Link to="/admin/marketing/campaigns" className={ghostCls}>List</Link>}
    >
      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
      <div className={`${cardCls} p-4`} data-testid="campaign-calendar">
        <div className="mb-4 flex items-center justify-between gap-2">
          <button type="button" className={`${ghostCls} px-3 tracking-wide`} onClick={() => shift(-1)}>Prev</button>
          <h2 className="text-lg font-black text-gray-900">{title}</h2>
          <button type="button" className={`${ghostCls} px-3 tracking-wide`} onClick={() => shift(1)}>Next</button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-extrabold uppercase tracking-widest text-gray-400">
          {WEEKDAYS.map((day) => <div key={day} className="py-1">{day}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell, index) => (
            <div key={`${cell.date}-${index}`} className={`min-h-16 rounded-xl p-1 sm:min-h-24 ${cell.day ? "bg-[#f5f2ea]" : ""}`}>
              {cell.day ? <p className="text-xs font-bold text-gray-500">{cell.day}</p> : null}
              {(byDate.get(cell.date) || []).map((item) => (
                <Link
                  key={`${item.campaignId}-${item.channel}-${item.label}`}
                  to={item.kind === "email" ? `/admin/marketing/campaigns/email/${item.campaignId}` : `/admin/marketing/campaigns/${item.campaignId}`}
                  className="mt-1 block truncate rounded-lg bg-[#0d9488] px-1 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white"
                  title={`${item.campaignName} · ${item.label}`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
      </div>
    </CampaignFrame>
  );
}
