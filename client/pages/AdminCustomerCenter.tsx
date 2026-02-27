import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Users, Search, Plus, Mail, Phone, MapPin, Filter, MoreHorizontal, UserCheck } from "lucide-react";

const customers = [
  { id: 1, name: "Sarah Jenkins", team: "The Jenkins Group", email: "sarah@jenkinsgroup.com", phone: "281-555-0123", orders: 12, status: "Active" },
  { id: 2, name: "Mark Thompson", team: "Thompson Realty", email: "mark@thompson.com", phone: "713-555-0456", orders: 8, status: "Active" },
  { id: 3, name: "Lisa Ray", team: "Luxury Houston", email: "lisa@luxhouston.com", phone: "832-555-0789", orders: 24, status: "VIP" },
  { id: 4, name: "David Wilson", team: "Wilson & Co", email: "david@wilsonre.com", phone: "281-555-0999", orders: 5, status: "Active" }
];

export default function AdminCustomerCenter() {
  return (
    <div className="flex flex-col min-h-screen bg-[#fafafa]">
      <Header />
      
      <main className="flex-1 pt-32 pb-24 px-4">
        <div className="container mx-auto max-w-6xl">
          
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-12">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-5 h-5 text-[#0d9488]" />
                <h1 className="text-3xl font-black text-black tracking-tight uppercase">Customer Center</h1>
              </div>
              <p className="text-gray-400 font-bold text-xs uppercase tracking-widest">Manage Agent Relationships & Preferences</p>
            </div>
            
            <Button className="bg-black hover:bg-[#0d9488] text-white font-bold rounded-xl px-6 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add New Customer
            </Button>
          </div>

          <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-50 flex flex-wrap gap-4 items-center justify-between bg-[#fafafa]/50">
              <div className="relative flex-1 min-w-[300px]">
                <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="Search by name, team, or email..." 
                  className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-100 bg-white focus:border-[#0d9488] outline-none text-xs font-medium"
                />
              </div>
              <Button variant="outline" className="rounded-xl border-gray-100 text-gray-400 font-bold text-[10px] uppercase tracking-widest flex items-center gap-2">
                <Filter className="w-3.5 h-3.5" /> Filter
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left bg-gray-50/50">
                    <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Customer</th>
                    <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Contact</th>
                    <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Team</th>
                    <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Orders</th>
                    <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                    <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {customers.map((customer) => (
                    <tr key={customer.id} className="group hover:bg-[#f0fdfa]/30 transition-colors">
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 font-bold text-xs group-hover:bg-[#0d9488] group-hover:text-white transition-colors">
                            {customer.name.split(' ').map(n => n[0]).join('')}
                          </div>
                          <span className="font-bold text-black">{customer.name}</span>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <Mail className="w-3 h-3" /> {customer.email}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <Phone className="w-3 h-3" /> {customer.phone}
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-tight">{customer.team}</span>
                      </td>
                      <td className="px-8 py-6 text-center">
                        <span className="text-sm font-black text-black">{customer.orders}</span>
                      </td>
                      <td className="px-8 py-6">
                        <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                          customer.status === 'VIP' ? 'bg-purple-50 text-purple-600' : 'bg-green-50 text-green-600'
                        }`}>
                          {customer.status}
                        </span>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <button className="p-2 text-gray-300 hover:text-black transition-colors">
                          <MoreHorizontal className="w-5 h-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-black rounded-[2.5rem] p-8 text-white relative overflow-hidden">
              <div className="absolute top-0 right-0 p-6 opacity-[0.05]">
                <UserCheck className="w-24 h-24" />
              </div>
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] mb-4 text-[#0d9488]">Delivery Preferences</h3>
              <p className="text-sm text-gray-400 mb-6">Global override for agent delivery methods and auto-lock settings.</p>
              <Button variant="outline" className="w-full border-gray-800 text-white hover:bg-[#0d9488] hover:border-[#0d9488] rounded-xl text-[10px] font-black uppercase tracking-widest py-5">Configure Rules</Button>
            </div>
          </div>

        </div>
      </main>

      <Footer />
    </div>
  );
}
