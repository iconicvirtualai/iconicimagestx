import * as React from "react";
import { Link } from "react-router-dom";
import { 
  ClipboardList, 
  Calendar, 
  LayoutGrid, 
  DollarSign, 
  ArrowUpRight 
} from "lucide-react";
import { useOperationsMetrics } from "@/hooks/useOperationsMetrics";

const fmtRev = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`;

export default function OperationsStatsGrid() {
  const { metrics, loading } = useOperationsMetrics();

  if (!metrics && loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white rounded-[2rem] h-40 border border-gray-100 shadow-sm animate-pulse" />
        ))}
      </div>
    );
  }

  const stats = [
    { label: "Order Requests", value: metrics?.orderRequestsCount.toString() || "0", icon: <ClipboardList className="w-5 h-5" />, color: "bg-red-500",     href: "/admin/orders" },
    { label: "Active Appointments", value: metrics?.activeAppointmentsCount.toString() || "0", icon: <Calendar className="w-5 h-5" />,      color: "bg-[#0d9488]", href: "/admin/schedule" },
    { label: "Projects in Progress",value: metrics?.listingsInProgressCount.toString() || "0", icon: <LayoutGrid className="w-5 h-5" />,    color: "bg-blue-500",  href: "/admin/listings" },
    { label: "Revenue",        value: fmtRev(metrics?.paidRevenue || 0),              icon: <DollarSign className="w-5 h-5" />,    color: "bg-orange-500",href: "/admin/revenue" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
      {stats.map((s) => (
        <Link
          key={s.label}
          to={s.href}
          className="bg-white rounded-[2rem] p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow group"
        >
          <div className="flex items-center justify-between mb-4">
            <div className={`p-3 rounded-xl text-white ${s.color} shadow-lg`}>{s.icon}</div>
            <ArrowUpRight className="w-4 h-4 text-gray-300 group-hover:text-[#0d9488] transition-colors" />
          </div>
          <h3 className="text-2xl font-black text-black mb-1">{s.value}</h3>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{s.label}</p>
        </Link>
      ))}
    </div>
  );
}
