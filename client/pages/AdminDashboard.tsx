import * as React from "react";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import {
  Image as ImageIcon,
  LayoutDashboard,
  Settings,
  Search,
  Plus,
  ArrowUpRight,
  Palette,
  Mail,
  ClipboardList,
  AlertCircle
} from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { toast } from "sonner";

export default function AdminDashboard() {
    const navigate = useNavigate();
  const [orderRequests, setOrderRequests] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const q = query(collection(db, "orderRequests"), orderBy("submittedAt", "desc"));
    const unsub = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setOrderRequests(docs);
      setLoading(false);
    }, (error) => {
      console.error("Firestore Error:", error);
      toast.error("Failed to load order requests");
    });

    return () => unsub();
  }, []);

  const stats = [
    { label: "Order Requests", value: orderRequests.length.toString(), icon: <ClipboardList className="w-5 h-5" />, color: "bg-red-500" },
    { label: "Scheduled", value: "8", icon: <LayoutDashboard className="w-5 h-5" />, color: "bg-[#0d9488]" },
    { label: "Active Listings", value: "48", icon: <ImageIcon className="w-5 h-5" />, color: "bg-blue-500" },
    { label: "Revenue", value: "$12,450", icon: <Plus className="w-5 h-5" />, color: "bg-orange-500" }
  ];

  return (
    <AdminLayout title="Dashboard">
      {/* Dashboard Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-12">
        <div>
          <p className="text-gray-400 font-bold text-xs uppercase tracking-widest">Managing the Iconic Ecosystem</p>
        </div>

        <div className="flex items-center gap-4">
          <Button asChild className="bg-[#0d9488] hover:bg-[#0f766e] text-white font-bold rounded-xl px-6">
            <Link to="/book" className="flex items-center gap-2">
              <Plus className="w-4 h-4" /> New Order
            </Link>
          </Button>
        </div>
      </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            {stats.map((stat) => (
              <div key={stat.label} className="bg-white rounded-[2rem] p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-3 rounded-xl text-white ${stat.color} shadow-lg`}>
                    {stat.icon}
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-gray-300" />
                </div>
                <h3 className="text-2xl font-black text-black mb-1">{stat.value}</h3>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{stat.label}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Order Requests Section */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-50 rounded-lg">
                      <AlertCircle className="w-5 h-5 text-red-500" />
                    </div>
                    <h2 className="text-xl font-black text-black uppercase tracking-tight">Order Requests</h2>
                  </div>
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search requests..."
                      className="pl-9 pr-4 py-2 rounded-lg border border-gray-100 bg-[#fafafa] focus:border-[#0d9488] outline-none text-xs font-medium w-48"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-50 text-left">
                        <th className="pb-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Order ID</th>
                        <th className="pb-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Client</th>
                        <th className="pb-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Service</th>
                        <th className="pb-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Date Submitted</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {loading ? (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-gray-400 text-xs font-bold uppercase tracking-widest">Loading requests...</td>
                        </tr>
                      ) : orderRequests.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-gray-400 text-xs font-bold uppercase tracking-widest">No requests found</td>
                        </tr>
                      ) : orderRequests.map((request) => (
                        <tr
                          key={request.id}
                          className="group hover:bg-[#fafafa] transition-colors cursor-pointer"
                          onClick={() => navigate(`/admin/order-request/${request.id}`)}
                        >
                          <td className="py-4 text-sm font-mono text-red-500 font-bold">{request.id.substring(0, 8)}...</td>
                          <td className="py-4">
                            <p className="text-sm font-bold text-black">{request.clientName}</p>
                            <p className="text-[10px] text-gray-400">{request.propertyAddress || "Consultation"}</p>
                          </td>
                          <td className="py-4">
                            <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-[9px] font-bold uppercase tracking-widest">
                              {request.selectedService || "Custom"}
                            </span>
                          </td>
                          <td className="py-4 text-xs text-gray-400 font-medium">
                            {request.submittedAt?.toDate ? request.submittedAt.toDate().toLocaleDateString() : 'Just now'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Quick Actions / System Status */}
            <div className="space-y-8">
              <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm">
                <h2 className="text-xl font-black text-black uppercase tracking-tight mb-6">Quick Actions</h2>
                <div className="grid grid-cols-1 gap-3">
                  <button className="flex items-center gap-3 p-4 bg-[#fafafa] rounded-xl border border-gray-50 hover:border-[#0d9488] group transition-all text-left">
                    <div className="p-2 bg-white rounded-lg border border-gray-100 group-hover:bg-[#0d9488] group-hover:text-white transition-all">
                      <ImageIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-black">Update Gallery</p>
                      <p className="text-[9px] text-gray-400 uppercase tracking-widest">Upload new masterpieces</p>
                    </div>
                  </button>
                  <button
                    onClick={() => navigate("/admin/edit-site")}
                    className="flex items-center gap-3 p-4 bg-[#fafafa] rounded-xl border border-gray-50 hover:border-[#0d9488] group transition-all text-left"
                  >
                    <div className="p-2 bg-white rounded-lg border border-gray-100 group-hover:bg-[#0d9488] group-hover:text-white transition-all">
                      <Settings className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-black">Site Settings</p>
                      <p className="text-[9px] text-gray-400 uppercase tracking-widest">Manage prices & tiers</p>
                    </div>
                  </button>
                  <button
                    onClick={() => navigate("/admin/email-templates")}
                    className="flex items-center gap-3 p-4 bg-[#fafafa] rounded-xl border border-gray-50 hover:border-[#0d9488] group transition-all text-left"
                  >
                    <div className="p-2 bg-white rounded-lg border border-gray-100 group-hover:bg-[#0d9488] group-hover:text-white transition-all">
                      <Mail className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-black">Email Templates</p>
                      <p className="text-[9px] text-gray-400 uppercase tracking-widest">Manage automation</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* System Status */}
              <div className="bg-black rounded-[2.5rem] p-8 text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 p-6 opacity-[0.05] pointer-events-none">
                  <Plus className="w-24 h-24 rotate-45" />
                </div>
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-[#0d9488]">All Systems Operational</span>
                  </div>
                  <h3 className="text-lg font-black tracking-tight mb-2">Iconic Cloud Core</h3>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Last backup: 14 mins ago</p>
                </div>
              </div>
            </div>
        </div>
      </div>

    </AdminLayout>
  );
}
