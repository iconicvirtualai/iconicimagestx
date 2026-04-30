import * as React from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";
import { Search, DollarSign, Send, Eye, Plus, FileText, ChevronDown, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, addDoc, serverTimestamp, updateDoc, doc } from "firebase/firestore";
import { toast } from "sonner";

function fmtCurrency(n: number): string { return "$" + (n || 0).toLocaleString("en-US", { minimumFractionDigits: 2 }); }
function fmtDate(ts: any): string {
  if (!ts) return "—";
  if (typeof ts === "string" && ts.includes(",")) return ts;
  if (ts.toDate) return ts.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  try { return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch { return "—"; }
}
function safe(v: any): string { if (!v) return "—"; if (typeof v === "string") return v; return String(v); }

const INVOICE_STATUS: Record<string, { label: string; color: string }> = {
  draft: { label: "Draft", color: "bg-gray-100 text-gray-500" },
  sent: { label: "Sent", color: "bg-blue-100 text-blue-700" },
  viewed: { label: "Viewed", color: "bg-purple-100 text-purple-700" },
  partial: { label: "Partial", color: "bg-yellow-100 text-yellow-700" },
  paid: { label: "Paid", color: "bg-green-100 text-green-700" },
  overdue: { label: "Overdue", color: "bg-red-100 text-red-600" },
};

const labelCls = "text-[10px] font-black text-gray-400 uppercase tracking-widest";

export default function AdminClientBilling() {
  const navigate = useNavigate();
  const [orders, setOrders] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [showCreate, setShowCreate] = React.useState(false);

  // New invoice form
  const [newInv, setNewInv] = React.useState({ clientName: "", clientEmail: "", items: [{ name: "", price: 0 }], notes: "" });

  React.useEffect(() => {
    const unsub = onSnapshot(collection(db, "orderRequests"), snap => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  // Build invoice list from orders
  const invoices = React.useMemo(() => {
    return orders.map(o => {
      const inv = o.invoice || {};
      const total = Number(o.total) || Number(o.pricing?.total) || 0;
      const paid = Number(inv.amountPaid) || 0;
      const status = inv.status || (paid >= total && total > 0 ? "paid" : total > 0 ? "draft" : "draft");
      return {
        orderId: o.id,
        invoiceNumber: inv.invoiceNumber || `INV-${(o.id || "").substring(0, 6).toUpperCase()}`,
        clientName: safe(o.clientName || o.customerName || `${o.firstName || ""} ${o.lastName || ""}`.trim()),
        clientEmail: o.email || o.clientEmail || "",
        date: o.createdAt || o.submittedAt,
        total,
        paid,
        due: total - paid,
        status,
        lineItems: o.lineItems || [],
      };
    }).filter(inv => inv.total > 0);
  }, [orders]);

  const filtered = React.useMemo(() => {
    let result = invoices;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(inv => inv.clientName.toLowerCase().includes(q) || inv.invoiceNumber.toLowerCase().includes(q) || inv.clientEmail.toLowerCase().includes(q));
    }
    if (statusFilter !== "all") result = result.filter(inv => inv.status === statusFilter);
    return result;
  }, [invoices, search, statusFilter]);

  const stats = React.useMemo(() => ({
    total: invoices.reduce((s, i) => s + i.total, 0),
    collected: invoices.reduce((s, i) => s + i.paid, 0),
    outstanding: invoices.reduce((s, i) => s + i.due, 0),
    overdue: invoices.filter(i => i.status === "overdue").reduce((s, i) => s + i.due, 0),
    count: invoices.length,
  }), [invoices]);

  const handleAddItem = () => setNewInv(f => ({ ...f, items: [...f.items, { name: "", price: 0 }] }));
  const handleRemoveItem = (idx: number) => setNewInv(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  const handleItemChange = (idx: number, field: string, val: any) => setNewInv(f => ({ ...f, items: f.items.map((item, i) => i === idx ? { ...item, [field]: val } : item) }));

  const handleCreateInvoice = async () => {
    if (!newInv.clientName || !newInv.clientEmail) { toast.error("Client name and email required."); return; }
    const total = newInv.items.reduce((s, i) => s + (Number(i.price) || 0), 0);
    try {
      await addDoc(collection(db, "orderRequests"), {
        clientName: newInv.clientName,
        email: newInv.clientEmail,
        lineItems: newInv.items.filter(i => i.name),
        total,
        pricing: { subtotal: total, total },
        invoice: { invoiceNumber: `INV-${Date.now().toString(36).toUpperCase()}`, status: "draft", amountDue: total, amountPaid: 0 },
        status: "new",
        source: "manual_invoice",
        notes: newInv.notes,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast.success("Invoice created!");
      setShowCreate(false);
      setNewInv({ clientName: "", clientEmail: "", items: [{ name: "", price: 0 }], notes: "" });
    } catch (err) { console.error(err); toast.error("Failed."); }
  };

  const inputCls = "w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#0d9488]/30";

  return (
    <AdminLayout title="Client Billing">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className={labelCls}>Total Invoiced</p>
          <p className="text-xl font-black">{fmtCurrency(stats.total)}</p>
          <p className="text-[10px] text-gray-400">{stats.count} invoices</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className={labelCls}>Collected</p>
          <p className="text-xl font-black text-green-600">{fmtCurrency(stats.collected)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className={labelCls}>Outstanding</p>
          <p className="text-xl font-black text-orange-600">{fmtCurrency(stats.outstanding)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className={labelCls}>Overdue</p>
          <p className="text-xl font-black text-red-600">{fmtCurrency(stats.overdue)}</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
        <div className="flex-1 relative max-w-md">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search invoices..." value={search} onChange={e => setSearch(e.target.value)}
            className="h-10 w-full pl-10 pr-4 rounded-xl border border-slate-200 bg-slate-50/50 text-xs font-medium outline-none focus:ring-2 focus:ring-[#0d9488]/20" />
        </div>
        <div className="flex items-center gap-3">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="h-10 px-3 rounded-xl border border-gray-200 text-xs font-bold bg-white">
            <option value="all">All Status</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
          </select>
          <Button onClick={() => setShowCreate(true)} className="bg-[#0d9488] hover:bg-[#0f766e] text-white rounded-xl text-xs font-bold">
            <Plus className="w-3.5 h-3.5 mr-1.5" /> New Invoice
          </Button>
        </div>
      </div>

      {/* Invoice table */}
      {loading ? (
        <div className="flex items-center justify-center py-24"><div className="w-6 h-6 border-2 border-[#0d9488] border-t-transparent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-24"><FileText className="w-12 h-12 text-gray-200 mx-auto mb-4" /><p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No invoices found</p></div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead><tr className="border-b-2 border-gray-200">
              <th className="text-left text-[10px] font-black text-gray-400 uppercase py-3 px-4">Invoice #</th>
              <th className="text-left text-[10px] font-black text-gray-400 uppercase py-3 px-4">Date</th>
              <th className="text-left text-[10px] font-black text-gray-400 uppercase py-3 px-4">Client</th>
              <th className="text-right text-[10px] font-black text-gray-400 uppercase py-3 px-4">Total</th>
              <th className="text-right text-[10px] font-black text-gray-400 uppercase py-3 px-4">Paid</th>
              <th className="text-right text-[10px] font-black text-gray-400 uppercase py-3 px-4">Due</th>
              <th className="text-left text-[10px] font-black text-gray-400 uppercase py-3 px-4">Status</th>
              <th className="text-right text-[10px] font-black text-gray-400 uppercase py-3 px-4">Actions</th>
            </tr></thead>
            <tbody>
              {filtered.map((inv, i) => {
                const st = INVOICE_STATUS[inv.status] || INVOICE_STATUS.draft;
                return (
                  <tr key={inv.orderId} className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
                    onClick={() => navigate(`/admin/order-request/${inv.orderId}`)}>
                    <td className="py-3 px-4 text-xs font-bold text-[#0d9488]">{inv.invoiceNumber}</td>
                    <td className="py-3 px-4 text-xs text-gray-500">{fmtDate(inv.date)}</td>
                    <td className="py-3 px-4">
                      <p className="text-xs font-bold">{inv.clientName}</p>
                      <p className="text-[10px] text-gray-400">{inv.clientEmail}</p>
                    </td>
                    <td className="py-3 px-4 text-xs font-bold text-right">{fmtCurrency(inv.total)}</td>
                    <td className="py-3 px-4 text-xs text-right text-green-600">{inv.paid > 0 ? fmtCurrency(inv.paid) : "—"}</td>
                    <td className="py-3 px-4 text-xs font-bold text-right">{inv.due > 0 ? fmtCurrency(inv.due) : "—"}</td>
                    <td className="py-3 px-4"><span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${st.color}`}>{st.label}</span></td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                        <button className="p-1.5 hover:bg-gray-100 rounded-lg" title="View"><Eye className="w-3.5 h-3.5 text-gray-400" /></button>
                        <button className="p-1.5 hover:bg-gray-100 rounded-lg" title="Send"><Send className="w-3.5 h-3.5 text-gray-400" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Invoice Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full my-8 p-6">
            <h3 className="text-lg font-black mb-4">Create Invoice</h3>
            <div className="space-y-4 mb-6">
              <div className="grid grid-cols-2 gap-3">
                <div><p className={`${labelCls} mb-1`}>Client Name *</p><input value={newInv.clientName} onChange={e => setNewInv(f => ({...f, clientName: e.target.value}))} className={inputCls} /></div>
                <div><p className={`${labelCls} mb-1`}>Client Email *</p><input value={newInv.clientEmail} onChange={e => setNewInv(f => ({...f, clientEmail: e.target.value}))} className={inputCls} /></div>
              </div>
              <div>
                <p className={`${labelCls} mb-2`}>Line Items</p>
                {newInv.items.map((item, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <input value={item.name} onChange={e => handleItemChange(i, "name", e.target.value)} placeholder="Service name" className={`${inputCls} flex-1`} />
                    <input type="number" value={item.price || ""} onChange={e => handleItemChange(i, "price", Number(e.target.value))} placeholder="Price" className={`${inputCls} w-28`} />
                    {newInv.items.length > 1 && <button onClick={() => handleRemoveItem(i)} className="text-red-400 hover:text-red-600 text-xs font-bold px-2">X</button>}
                  </div>
                ))}
                <button onClick={handleAddItem} className="text-xs font-bold text-[#0d9488] mt-1">+ Add Line Item</button>
              </div>
              <div><p className={`${labelCls} mb-1`}>Notes</p><textarea value={newInv.notes} onChange={e => setNewInv(f => ({...f, notes: e.target.value}))} rows={2} className={`${inputCls} resize-none`} /></div>
              <div className="flex justify-between text-lg border-t pt-3">
                <span className="font-black">Total</span>
                <span className="font-black text-[#0d9488]">{fmtCurrency(newInv.items.reduce((s, i) => s + (Number(i.price) || 0), 0))}</span>
              </div>
            </div>
            <div className="flex gap-3">
              <Button onClick={() => setShowCreate(false)} variant="outline" className="flex-1 rounded-xl">Cancel</Button>
              <Button onClick={handleCreateInvoice} className="flex-1 rounded-xl bg-[#0d9488] hover:bg-[#0f766e] text-white font-bold">Create Invoice</Button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
