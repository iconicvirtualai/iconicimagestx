import * as React from "react";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  User,
  MapPin,
  Calendar,
  Clock,
  Package,
  MessageSquare,
  FileText,
  AlertCircle,
  Hash,
  Mail,
  Phone,
  Maximize,
  Briefcase,
  DollarSign,
  ChevronDown,
  Archive,
  ExternalLink,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { doc, onSnapshot, updateDoc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { ORDER_STATUS, StatusBadge } from "./AdminDashboard";

// Status transition map — which statuses can follow the current one
const STATUS_NEXT: Record<string, { value: string; label: string; color: string }[]> = {
  new:                  [
    { value: "pending_confirmation", label: "Mark Pending Confirmation", color: "bg-orange-500 hover:bg-orange-600" },
    { value: "scheduled",            label: "Mark Scheduled",            color: "bg-green-600 hover:bg-green-700" },
  ],
  pending_confirmation: [
    { value: "scheduled",   label: "Confirm & Schedule",    color: "bg-green-600 hover:bg-green-700" },
    { value: "new",         label: "Revert to Unscheduled", color: "bg-gray-500 hover:bg-gray-600" },
  ],
  scheduled: [
    { value: "in_progress",  label: "Mark In Progress",      color: "bg-blue-600 hover:bg-blue-700" },
    { value: "rescheduled",  label: "Mark Rescheduled",      color: "bg-amber-700 hover:bg-amber-800" },
  ],
  in_progress: [
    { value: "delivered",    label: "Mark Delivered",        color: "bg-sky-600 hover:bg-sky-700" },
  ],
  delivered: [
    { value: "delivered_paid", label: "Mark Paid",           color: "bg-teal-600 hover:bg-teal-700" },
  ],
  rescheduled: [
    { value: "pending_confirmation", label: "Reschedule Pending", color: "bg-orange-500 hover:bg-orange-600" },
    { value: "scheduled",            label: "Reschedule Confirmed", color: "bg-green-600 hover:bg-green-700" },
  ],
};

export default function AdminOrderRequest() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [request, setRequest] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [updating, setUpdating] = React.useState(false);

  // Live listener so status updates reflect immediately
  React.useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, "orderRequests", id), (snap) => {
      if (snap.exists()) {
        setRequest({ id: snap.id, ...snap.data() });
      } else {
        toast.error("Request not found");
        navigate("/admin/dashboard");
      }
      setLoading(false);
    }, (err) => {
      console.error(err);
      toast.error("Failed to load request");
      setLoading(false);
    });
    return () => unsub();
  }, [id, navigate]);

  const updateStatus = async (newStatus: string) => {
    if (!id) return;
    setUpdating(true);
    try {
      await updateDoc(doc(db, "orderRequests", id), {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });
      toast.success(`Status → ${ORDER_STATUS[newStatus]?.label ?? newStatus}`);
    } catch {
      toast.error("Failed to update status");
    } finally {
      setUpdating(false);
    }
  };

  const archiveRequest = async () => {
    if (!id) return;
    if (!confirm("Archive this request? It will be hidden from the main queue.")) return;
    setUpdating(true);
    try {
      await updateDoc(doc(db, "orderRequests", id), {
        status: "archived",
        updatedAt: serverTimestamp(),
      });
      toast.success("Request archived.");
      navigate("/admin/dashboard");
    } catch {
      toast.error("Failed to archive.");
    } finally {
      setUpdating(false);
    }
  };

  // ─── Field helpers — handle both old field names and new ones ────────────────────────────────
  const addr          = request?.address || request?.propertyAddress || "";
  const sqft          = request?.squareFootage || request?.sqft || "";
  const schedDate     = request?.scheduledDate || request?.serviceDate || "";
  const schedTime     = request?.scheduledTime || request?.serviceTime || "";
  const access        = request?.accessMethod || request?.accessInfo || "";
  const submittedTs   = request?.createdAt || request?.submittedAt;

  const fmtDate = (v: any) => {
    if (!v) return "—";
    if (v.toDate) return v.toDate().toLocaleDateString();
    return new Date(v).toLocaleDateString();
  };
  const fmtTime = (v: any) => {
    if (!v) return "—";
    if (v.toDate) return v.toDate().toLocaleTimeString();
    return v;
  };

  if (loading) {
    return (
      <AdminLayout title="Order Request">
        <div className="flex items-center justify-center py-32">
          <div className="w-8 h-8 border-4 border-[#0d9488] border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  if (!request) return null;

  const nextActions = STATUS_NEXT[request.status || "new"] ?? [];
  const lineItems: { name: string; price: number }[] = request.lineItems || [];
  const pricing = request.pricing || {};

  return (
    <AdminLayout title="Order Request">
      {/* Back + Status row */}
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <button
          onClick={() => navigate("/admin/dashboard")}
          className="flex items-center gap-1.5 text-gray-400 hover:text-black text-xs font-bold uppercase tracking-widest transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Dashboard
        </button>

        <div className="flex items-center gap-3 flex-wrap">
          <StatusBadge status={request.status || "new"} />

          {/* Next-status action buttons */}
          {nextActions.map((a) => (
            <button
              key={a.value}
              onClick={() => updateStatus(a.value)}
              disabled={updating}
              className={`text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl text-white transition-colors disabled:opacity-50 ${a.color}`}
            >
              {a.label}
            </button>
          ))}

          {/* Archive */}
          {request.status !== "archived" && (
            <button
              onClick={archiveRequest}
              disabled={updating}
              className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl border border-gray-200 text-gray-500 hover:text-red-600 hover:border-red-200 transition-colors"
            >
              <Archive className="w-3.5 h-3.5" /> Archive
            </button>
          )}
        </div>
      </div>

      {/* Hero card */}
      <div className="bg-black rounded-[2rem] p-8 text-white mb-6">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Hash className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest font-mono">{request.id}</span>
            </div>
            <h1 className="text-2xl font-black uppercase tracking-tight mb-1">
              {request.clientName || `${request.firstName || ""} ${request.lastName || ""}`.trim() || "—"}
            </h1>
            {addr && (
              <p className="text-gray-400 flex items-center gap-1.5 text-sm">
                <MapPin className="w-3.5 h-3.5" /> {addr}
              </p>
            )}
            {request.source === "admin" && (
              <span className="mt-2 inline-block text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-white/10 text-gray-400">
                Admin-Created
              </span>
            )}
          </div>
          <div className="bg-white/10 rounded-2xl p-5 border border-white/10 min-w-[180px]">
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Submitted</p>
            <p className="text-lg font-bold">{fmtDate(submittedTs)}</p>
            <p className="text-xs text-gray-500">{fmtTime(submittedTs)}</p>
            {request.total > 0 && (
              <p className="text-xl font-black text-[#0d9488] mt-3">${Number(request.total).toLocaleString()}</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left — main info */}
        <div className="lg:col-span-2 space-y-6">

          {/* Contact */}
          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-7">
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-5 flex items-center gap-2">
              <User className="w-4 h-4 text-[#0d9488]" /> Contact Information
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Email</p>
                <p className="font-bold text-sm flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-gray-400" /> {request.email || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Phone</p>
                <p className="font-bold text-sm flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-gray-400" /> {request.phone || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Sq Ft</p>
                <p className="font-bold text-sm flex items-center gap-1.5"><Maximize className="w-3.5 h-3.5 text-gray-400" /> {sqft ? `${sqft} sqft` : "—"}</p>
              </div>
            </div>
          </div>

          {/* Services / Line Items */}
          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-7">
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-5 flex items-center gap-2">
              <Package className="w-4 h-4 text-[#0d9488]" /> Services Selected
            </h3>

            {lineItems.length > 0 ? (
              <div className="space-y-2 mb-4">
                {lineItems.map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <span className="text-sm font-bold text-black">{item.name}</span>
                    {item.price > 0 && (
                      <span className="text-sm font-black text-[#0d9488]">${item.price.toLocaleString()}</span>
                    )}
                  </div>
                ))}
              </div>
            ) : request.selectedService ? (
              <div className="p-3 bg-gray-50 rounded-xl mb-4">
                <p className="text-sm font-bold text-black">{request.selectedService}</p>
              </div>
            ) : (
              <p className="text-sm text-gray-400 mb-4">No service details recorded.</p>
            )}

            {/* Basics */}
            {request.selectedBasics?.length > 0 && (
              <div className="mb-4">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Basics</p>
                <div className="flex flex-wrap gap-2">
                  {request.selectedBasics.map((b: string) => (
                    <span key={b} className="px-3 py-1 bg-gray-100 rounded-full text-[10px] font-bold uppercase text-gray-600">{b}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Add-ons */}
            {request.selectedAddOns?.length > 0 && (
              <div className="mb-4">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Add-Ons</p>
                <div className="flex flex-wrap gap-2">
                  {request.selectedAddOns.map((a: string) => (
                    <span key={a} className="px-3 py-1 bg-[#0d9488]/10 rounded-full text-[10px] font-bold uppercase text-[#0d9488]">{a}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Totals */}
            {(pricing.subtotal || pricing.total || request.total) && (
              <div className="border-t border-gray-100 pt-4 mt-4 space-y-1.5">
                {pricing.subtotal > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 font-bold">Subtotal</span>
                    <span className="font-bold">${Number(pricing.subtotal).toLocaleString()}</span>
                  </div>
                )}
                {request.promoDiscount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 font-bold">Promo ({request.promoCode})</span>
                    <span className="font-bold text-green-600">−${request.promoDiscount}</span>
                  </div>
                )}
                <div className="flex justify-between text-base border-t border-gray-100 pt-2 mt-2">
                  <span className="font-black text-black">Total</span>
                  <span className="font-black text-[#0d9488]">${Number(request.total || pricing.total || 0).toLocaleString()}</span>
                </div>
              </div>
            )}
          </div>

          {/* Scheduling */}
          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-7">
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-5 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#0d9488]" /> Scheduling & Access
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-4">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Requested Date</p>
                <p className="font-bold text-sm flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-gray-400" />
                  {schedDate ? new Date(schedDate).toLocaleDateString() : "Flexible"}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Preferred Time</p>
                <p className="font-bold text-sm flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-gray-400" /> {schedTime || "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Access Method</p>
                <p className="font-bold text-sm flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-gray-400" /> {access || "—"}
                </p>
              </div>
            </div>
            {request.lockboxCode && (
              <div className="p-4 bg-yellow-50 border border-yellow-100 rounded-xl flex gap-3">
                <AlertCircle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-black text-yellow-800 uppercase tracking-widest mb-1">Access Code</p>
                  <p className="text-sm font-bold text-yellow-900">Lockbox: {request.lockboxCode}</p>
                </div>
              </div>
            )}
            {request.photographerPreference && (
              <div className="mt-3 text-sm">
                <span className="text-[10px] font-bold text-gray-400 uppercase">Photographer Preference: </span>
                <span className="font-bold">{request.photographerPreference}</span>
              </div>
            )}
            {(request.propertyStatus || request.furnishingStatus) && (
              <div className="flex gap-4 mt-3">
                {request.propertyStatus && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Property Status</p>
                    <p className="text-sm font-bold">{request.propertyStatus}</p>
                  </div>
                )}
                {request.furnishingStatus && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Furnishing</p>
                    <p className="text-sm font-bold">{request.furnishingStatus}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Questionnaire */}
          {[
            { q: "What's the vibe of this shoot?",                       a: request.vibeNote },
            { q: "What's bothering you about your marketing results?",   a: request.resultsBothering },
            { q: "Where does your business usually come from?",          a: request.businessSource },
            { q: "What does your perfect business look like?",           a: request.perfectBusiness },
            { q: "How much are you willing to invest?",                  a: request.investmentWilling },
            { q: "What is your marketing currently doing?",              a: request.marketingDoing },
          ].some((x) => x.a) && (
            <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-7">
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-5 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-[#0d9488]" /> Client Insights
              </h3>
              <div className="space-y-4">
                {[
                  { q: "Vibe of this shoot",                   a: request.vibeNote },
                  { q: "Marketing pain points",                a: request.resultsBothering },
                  { q: "Business source",                      a: request.businessSource },
                  { q: "Perfect business vision",              a: request.perfectBusiness },
                  { q: "Investment willingness",               a: request.investmentWilling },
                  { q: "Current marketing activity",           a: request.marketingDoing },
                ].filter((x) => x.a).map((item, i) => (
                  <div key={i} className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">{item.q}</p>
                    <p className="text-sm font-bold text-gray-800 leading-relaxed">{item.a}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-6">
          {/* Status card */}
          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-6">
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#0d9488]" /> Status
            </h3>
            <div className="mb-4">
              <StatusBadge status={request.status || "new"} />
            </div>
            {nextActions.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Move to</p>
                {nextActions.map((a) => (
                  <button
                    key={a.value}
                    onClick={() => updateStatus(a.value)}
                    disabled={updating}
                    className={`w-full text-[10px] font-black uppercase tracking-widest px-3 py-2.5 rounded-xl text-white transition-colors disabled:opacity-50 ${a.color}`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-6 space-y-3">
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Actions</h3>
            <Link
              to={`/admin/listing/${request.id}`}
              className="flex items-center justify-between w-full p-3 bg-black text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-gray-800 transition-colors"
            >
              <span>Create / Manage Listing</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
            <button
              onClick={archiveRequest}
              disabled={updating}
              className="flex items-center gap-2 w-full p-3 border border-gray-200 text-gray-500 rounded-xl text-xs font-black uppercase tracking-widest hover:text-red-600 hover:border-red-200 transition-colors"
            >
              <Archive className="w-3.5 h-3.5" /> Archive Request
            </button>
          </div>

          {/* Lead source */}
          {request.leadSource && (
            <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-6">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Lead Source</p>
              <p className="text-sm font-bold text-black">{request.leadSource}</p>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
