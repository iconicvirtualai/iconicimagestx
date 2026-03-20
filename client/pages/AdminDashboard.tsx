import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { 
  Users, 
  ShoppingBag, 
  DollarSign, 
  Image as ImageIcon, 
  LayoutDashboard, 
  Settings,
  LogOut,
  Search,
  Plus,
  ArrowUpRight,
  Palette
} from "lucide-react";

const stats = [
  { label: "Active Listings", value: "48", icon: <ImageIcon className="w-5 h-5" />, color: "bg-blue-500" },
  { label: "Pending Orders", value: "12", icon: <ShoppingBag className="w-5 h-5" />, color: "bg-[#0d9488]" },
  { label: "New Leads", value: "156", icon: <Users className="w-5 h-5" />, color: "bg-purple-500" },
  { label: "Monthly Revenue", value: "$12,450", icon: <DollarSign className="w-5 h-5" />, color: "bg-orange-500" }
];

const recentOrders = [
  { id: "#8245", agent: "Sarah Jenkins", property: "1245 Willow Creek Dr", status: "Delivered", date: "2 hrs ago" },
  { id: "#8244", agent: "Mark Thompson", property: "882 High Meadow Ln", status: "Processing", date: "5 hrs ago" },
  { id: "#8243", agent: "Lisa Ray", property: "552 Oak Forest Ct", status: "Scheduled", date: "1 day ago" },
  { id: "#8242", agent: "David Wilson", property: "210 River Walk Way", status: "Delivered", date: "2 days ago" }
];

export default function AdminDashboard() {
  const navigate = useNavigate();

  const handleLogout = () => {
    // In a real app, clear tokens here
    navigate("/admin/login");
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#fafafa]">
      <Header />
      
      <main className="flex-1 pt-32 pb-24">
        <div className="container mx-auto px-4 max-w-6xl">
          {/* Dashboard Header */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-12">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <LayoutDashboard className="w-5 h-5 text-[#0d9488]" />
                <h1 className="text-3xl font-black text-black tracking-tight uppercase">Admin Dashboard</h1>
              </div>
              <p className="text-gray-400 font-bold text-xs uppercase tracking-widest">Managing the Iconic Ecosystem</p>
            </div>
            
            <div className="flex items-center gap-4">
              <Button asChild className="bg-[#0d9488] hover:bg-[#0f766e] text-white font-bold rounded-xl px-6">
                <Link to="/book" className="flex items-center gap-2">
                  <Plus className="w-4 h-4" /> New Order
                </Link>
              </Button>
              <Button onClick={handleLogout} variant="outline" className="border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-100 rounded-xl px-4">
                <LogOut className="w-4 h-4" />
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
            {/* Recent Orders Table */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-xl font-black text-black uppercase tracking-tight">Recent Orders</h2>
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input 
                      type="text" 
                      placeholder="Search orders..." 
                      className="pl-9 pr-4 py-2 rounded-lg border border-gray-100 bg-[#fafafa] focus:border-[#0d9488] outline-none text-xs font-medium w-48"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-50 text-left">
                        <th className="pb-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Order ID</th>
                        <th className="pb-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Agent</th>
                        <th className="pb-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status</th>
                        <th className="pb-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {recentOrders.map((order) => (
                        <tr
                          key={order.id}
                          className="group hover:bg-[#fafafa] transition-colors cursor-pointer"
                          onClick={() => navigate(`/admin/listing/${order.id.replace('#', '')}`)}
                        >
                          <td className="py-4 text-sm font-bold text-black">{order.id}</td>
                          <td className="py-4">
                            <p className="text-sm font-bold text-black">{order.agent}</p>
                            <p className="text-[10px] text-gray-400">{order.property}</p>
                          </td>
                          <td className="py-4">
                            <span className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest ${
                              order.status === 'Delivered' ? 'bg-green-50 text-green-600' : 
                              order.status === 'Processing' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'
                            }`}>
                              {order.status}
                            </span>
                          </td>
                          <td className="py-4 text-xs text-gray-400 font-medium">{order.date}</td>
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
      </main>

      <Footer />
    </div>
  );
}
