import * as React from "react";
import AdminLayout from "@/components/AdminLayout";
import { DollarSign, TrendingUp, Clock, AlertTriangle, CheckCircle, FileText, Download, Filter } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot } from "firebase/firestore";
import { toast } from "sonner";

function fmtCurrency(n: number): string { return "$" + (n || 0).toLocaleString("en-US", { minimumFractionDigits: 2 }); }
function fmtAddr(a: any): string {
  if (!a) return "—";
  if (typeof a === "string") return a;
  return [a.street, a.city, a.state, a.zip].filter(Boolean).join(", ") || "—";
}
function fmtDate(ts: any): string {
  if (!ts) return "—";
  if (typeof ts === "string" && ts.includes(",")) return ts;
  if (ts.toDate) return ts.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  try { return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch { return "—"; }
}
function safe(v: any): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
function getTs(ts: any): Date | null {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  try { return new Date(ts); } catch { return null; }
}

const DATE_PRESETS = [
  { label: "Today", days: 0 },
  { label: "Yesterday", days: 1 },
  { label: "Last 3 Days", days: 3 },
  { label: "Last 7 Days", days: 7 },
  { label: "Last 14 Days", days: 14 },
  { label: "Last 30 Days", days: 30 },
  { label: "Last 90 Days", days: 90 },
  { label: "Last 6 Months", days: 180 },
  { label: "Last 12 Months", days: 365 },
  { label: "This Week", days: -1 },
  { label: "This Month", days: -2 },
  { label: "This Year", days: -3 },
  { label: "All Time", days: -99 },
];

const labelCls = "text-[10px] font-black text-gray-400 uppercase tracking-widest";

export default function AdminRevenue() {
  const [orders, setOrders] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [datePreset, setDatePreset] = React.useState("Last 30 Days");
  const [customFrom, setCustomFrom] = React.useState("");
  const [customTo, setCustomTo] = React.useState("");

  // Settings (placeholder values — admin fills these in later)
  const [settings] = React.useState({
    photographerPayRate: 0.35, // 35% of order total
    editingCostPerPhoto: 0.50,
    avgPhotosPerOrder: 25,
    platformFeePercent: 0.029, // Stripe 2.9%
    platformFeeFlat: 0.30,
  });

  React.useEffect(() => {
    const unsub = onSnapshot(collection(db, "orderRequests"), snap => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, err => { console.error(err); setLoading(false); });
    return () => unsub();
  }, []);

  // Date filtering
  const getDateRange = (): { start: Date; end: Date } => {
    const now = new Date();
    const end = new Date(now); end.setHours(23, 59, 59, 999);

    if (customFrom && customTo) return { start: new Date(customFrom), end: new Date(customTo + "T23:59:59") };

    const preset = DATE_PRESETS.find(p => p.label === datePreset);
    if (!preset) return { start: new Date(0), end };

    if (preset.days === -99) return { start: new Date(0), end };
    if (preset.days === -1) { const s = new Date(now); s.setDate(s.getDate() - s.getDay()); s.setHours(0,0,0,0); return { start: s, end }; }
    if (preset.days === -2) { const s = new Date(now.getFullYear(), now.getMonth(), 1); return { start: s, end }; }
    if (preset.days === -3) { const s = new Date(now.getFullYear(), 0, 1); return { start: s, end }; }
    if (preset.days === 0) { const s = new Date(now); s.setHours(0,0,0,0); return { start: s, end }; }
    if (preset.days === 1) { const s = new Date(now); s.setDate(s.getDate()-1); s.setHours(0,0,0,0); const e = new Date(s); e.setHours(23,59,59,999); return { start: s, end: e }; }

    const start = new Date(now);
    start.setDate(start.getDate() - preset.days);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  };

  const filtered = React.useMemo(() => {
    const { start, end } = getDateRange();
    return orders.filter(o => {
      const d = getTs(o.createdAt || o.submittedAt || o.date);
      if (!d) return false;
      return d >= start && d <= end;
    });
  }, [orders, datePreset, customFrom, customTo]);

  // Revenue stages
  const stats = React.useMemo(() => {
    let projected = 0, earned = 0, invoiced = 0, overdue = 0, collected = 0;
    let photographerPayout = 0, editingCost = 0, platformFees = 0;

    filtered.forEach(o => {
      const total = Number(o.total) || Number(o.amount) || Number(o.pricing?.total) || 0;
      const status = (typeof o.status === "string" ? o.status : "").toLowerCase();
      const inv = o.invoice || {};
      const paid = inv.amountPaid || 0;

      // Categorize
      if (["cancelled", "archived"].includes(status) && paid === 0) return;

      projected += total;

      if (["delivered", "paid", "completed", "archived"].includes(status)) {
        earned += total;
      }

      if (inv.status === "sent" || inv.status === "draft" || total > 0) {
        invoiced += total;
      }

      if (inv.status === "overdue" || (inv.dueDate && getTs(inv.dueDate) && getTs(inv.dueDate)! < new Date() && paid < total)) {
        overdue += (total - paid);
      }

      if (paid > 0) {
        collected += paid;
      }

      // Costs
      photographerPayout += total * settings.photographerPayRate;
      editingCost += settings.editingCostPerPhoto * settings.avgPhotosPerOrder;
      if (total > 0) platformFees += (total * settings.platformFeePercent) + settings.platformFeeFlat;
    });

    const totalCosts = photographerPayout + editingCost + platformFees;
    const grossMargin = collected - totalCosts;
    const marginPercent = collected > 0 ? (grossMargin / collected * 100) : 0;

    return { projected, earned, invoiced, overdue, collected, photographerPayout, editingCost, platformFees, totalCosts, grossMargin, marginPercent, count: filtered.length };
  }, [filtered, settings]);

  const inputCls = "h-9 px-3 rounded-xl border border-gray-200 text-xs font-bold bg-white focus:outline-none focus:ring-2 focus:ring-[#0d9488]/30";

  return (
    <AdminLayout title="Revenue">
      {/* Date filters */}
      <div className="flex flex-wrap items-end gap-3 mb-8">
        <div>
          <p className={`${labelCls} mb-1`}>Period</p>
          <select value={datePreset} onChange={e => { setDatePreset(e.target.value); setCustomFrom(""); setCustomTo(""); }} className={inputCls}>
            {DATE_PRESETS.map(p => <option key={p.label} value={p.label}>{p.label}</option>)}
            <option value="custom">Custom Range</option>
          </select>
        </div>
        {datePreset === "custom" && (<>
          <div><p className={`${labelCls} mb-1`}>From</p><input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className={inputCls} /></div>
          <div><p className={`${labelCls} mb-1`}>To</p><input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className={inputCls} /></div>
        </>)}
        <p className="text-xs text-gray-400 ml-2">{stats.count} orders in period</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24"><div className="w-6 h-6 border-2 border-[#0d9488] border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="space-y-8">
          {/* ═══ REVENUE STAGES ═══ */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-2"><TrendingUp className="w-4 h-4 text-blue-500" /><p className={labelCls}>Projected</p></div>
              <p className="text-xl font-black text-black">{fmtCurrency(stats.projected)}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-2"><CheckCircle className="w-4 h-4 text-green-500" /><p className={labelCls}>Earned</p></div>
              <p className="text-xl font-black text-black">{fmtCurrency(stats.earned)}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-2"><FileText className="w-4 h-4 text-purple-500" /><p className={labelCls}>Invoiced</p></div>
              <p className="text-xl font-black text-black">{fmtCurrency(stats.invoiced)}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-2"><AlertTriangle className="w-4 h-4 text-orange-500" /><p className={labelCls}>Overdue</p></div>
              <p className="text-xl font-black text-red-600">{fmtCurrency(stats.overdue)}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-2"><DollarSign className="w-4 h-4 text-teal-500" /><p className={labelCls}>Collected</p></div>
              <p className="text-xl font-black text-[#0d9488]">{fmtCurrency(stats.collected)}</p>
            </div>
          </div>

          {/* ═══ MARGINS & COSTS ═══ */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h3 className={`${labelCls} mb-4`}>Cost Breakdown</h3>
              <div className="space-y-3">
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Photographer Payouts ({(settings.photographerPayRate * 100).toFixed(0)}%)</span>
                  <span className="text-sm font-bold">{fmtCurrency(stats.photographerPayout)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Editing Software (${settings.editingCostPerPhoto}/photo x {settings.avgPhotosPerOrder})</span>
                  <span className="text-sm font-bold">{fmtCurrency(stats.editingCost)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Platform Fees (Stripe {(settings.platformFeePercent * 100).toFixed(1)}% + ${settings.platformFeeFlat})</span>
                  <span className="text-sm font-bold">{fmtCurrency(stats.platformFees)}</span>
                </div>
                <div className="flex justify-between py-2 border-t-2 border-gray-200">
                  <span className="text-sm font-black">Total Costs</span>
                  <span className="text-sm font-black text-red-600">{fmtCurrency(stats.totalCosts)}</span>
                </div>
              </div>
            </div>
            <div className="bg-black rounded-2xl p-6 text-white">
              <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4">Margin Summary</h3>
              <div className="space-y-4">
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest">Collected Revenue</p>
                  <p className="text-2xl font-black">{fmtCurrency(stats.collected)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest">Total Costs</p>
                  <p className="text-lg font-bold text-red-400">-{fmtCurrency(stats.totalCosts)}</p>
                </div>
                <div className="border-t border-gray-700 pt-4">
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest">Gross Margin</p>
                  <p className="text-3xl font-black text-[#0d9488]">{fmtCurrency(stats.grossMargin)}</p>
                  <p className="text-xs text-gray-400">{stats.marginPercent.toFixed(1)}% margin</p>
                </div>
              </div>
            </div>
          </div>

          {/* ═══ PAYOUT SETTINGS ═══ */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 className={`${labelCls} mb-4`}>Payout & Cost Settings</h3>
            <p className="text-xs text-gray-400 mb-4">Configure these values to calculate accurate margins. These are placeholder values — update with your actual numbers.</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className={`${labelCls} mb-1`}>Photographer Pay Rate</p>
                <input type="text" defaultValue="35%" className={inputCls + " w-full"} />
              </div>
              <div>
                <p className={`${labelCls} mb-1`}>Editing Cost / Photo</p>
                <input type="text" defaultValue="$0.50" className={inputCls + " w-full"} />
              </div>
              <div>
                <p className={`${labelCls} mb-1`}>Avg Photos / Order</p>
                <input type="text" defaultValue="25" className={inputCls + " w-full"} />
              </div>
              <div>
                <p className={`${labelCls} mb-1`}>Platform Fee %</p>
                <input type="text" defaultValue="2.9% + $0.30" className={inputCls + " w-full"} />
              </div>
            </div>
          </div>

          {/* ═══ ORDER-LEVEL BREAKDOWN ═══ */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className={labelCls}>Order Revenue Detail</h3>
              <button className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-[10px] font-bold text-gray-500 hover:bg-gray-50">
                <Download className="w-3 h-3" /> Export CSV
              </button>
            </div>
            <table className="w-full min-w-[800px]">
              <thead><tr className="border-b border-gray-200">
                <th className="text-left text-[10px] font-black text-gray-400 uppercase py-3 px-4">#</th>
                <th className="text-left text-[10px] font-black text-gray-400 uppercase py-3 px-4">Date</th>
                <th className="text-left text-[10px] font-black text-gray-400 uppercase py-3 px-4">Client</th>
                <th className="text-left text-[10px] font-black text-gray-400 uppercase py-3 px-4">Address</th>
                <th className="text-right text-[10px] font-black text-gray-400 uppercase py-3 px-4">Total</th>
                <th className="text-right text-[10px] font-black text-gray-400 uppercase py-3 px-4">Paid</th>
                <th className="text-right text-[10px] font-black text-gray-400 uppercase py-3 px-4">Due</th>
                <th className="text-left text-[10px] font-black text-gray-400 uppercase py-3 px-4">Status</th>
              </tr></thead>
              <tbody>
                {filtered.slice(0, 50).map((o, i) => {
                  const total = Number(o.total) || Number(o.pricing?.total) || 0;
                  const paid = o.invoice?.amountPaid || 0;
                  const due = total - paid;
                  return (
                    <tr key={o.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="py-2.5 px-4 text-xs font-bold text-[#0d9488]">#{(o.id || "").substring(0, 6)}</td>
                      <td className="py-2.5 px-4 text-xs text-gray-500">{fmtDate(o.createdAt || o.submittedAt)}</td>
                      <td className="py-2.5 px-4 text-xs font-bold">{safe(o.clientName || o.customerName || o.name)}</td>
                      <td className="py-2.5 px-4 text-xs text-gray-500">{fmtAddr(o.address)}</td>
                      <td className="py-2.5 px-4 text-xs font-bold text-right">{fmtCurrency(total)}</td>
                      <td className="py-2.5 px-4 text-xs text-right text-green-600">{paid > 0 ? fmtCurrency(paid) : "—"}</td>
                      <td className="py-2.5 px-4 text-xs text-right font-bold text-red-500">{due > 0 ? fmtCurrency(due) : "—"}</td>
                      <td className="py-2.5 px-4"><span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                        paid >= total && total > 0 ? "bg-green-100 text-green-700" : due > 0 ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-400"
                      }`}>{paid >= total && total > 0 ? "Collected" : due > 0 ? "Outstanding" : "Pending"}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
