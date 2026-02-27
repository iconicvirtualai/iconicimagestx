import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Link, useParams } from "react-router-dom";
import { 
  MapPin, 
  Clock, 
  User, 
  Settings, 
  Download, 
  Send, 
  Plus, 
  Image as ImageIcon, 
  Video, 
  Smartphone, 
  Globe, 
  FileText, 
  GripVertical, 
  Trash2, 
  Archive, 
  EyeOff, 
  Edit3, 
  Sparkles,
  ChevronDown,
  History,
  FilePlus,
  CreditCard,
  UserPlus
} from "lucide-react";
import { useState } from "react";

export default function AdminListingFile() {
  const { id } = useParams();
  const [isAuditLogOpen, setIsAuditLogOpen] = useState(false);

  const listing = {
    address: "1245 Willow Creek Dr, Spring, TX 77380",
    status: "Delivered",
    paymentStatus: "Paid",
    agent: "Sarah Jenkins",
    team: "The Jenkins Group",
    price: "$549,000"
  };

  const auditLogs = [
    { action: "Listing Delivered", user: "System", time: "2 hrs ago" },
    { action: "Media Lock Enabled", user: "Admin (Cadi)", time: "3 hrs ago" },
    { action: "3D Tour Link Added", user: "Admin (Cadi)", time: "4 hrs ago" },
    { action: "Images Uploaded (45 files)", user: "System", time: "5 hrs ago" },
    { action: "Status Changed: Scheduled -> Pending", user: "System", time: "1 day ago" }
  ];

  return (
    <div className="flex flex-col min-h-screen bg-[#fafafa]">
      <Header />
      
      <main className="flex-1 pt-32 pb-24 px-4">
        <div className="container mx-auto max-w-6xl">
          
          {/* Header Section */}
          <div className="flex flex-col md:flex-row justify-between items-start gap-6 mb-12">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-4">
                <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                  listing.status === 'Delivered' ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'
                }`}>
                  {listing.status} — {listing.paymentStatus}
                </div>
                <button className="p-2 rounded-full hover:bg-gray-100 transition-colors">
                  <Settings className="w-5 h-5 text-gray-400" />
                </button>
              </div>
              <h1 className="text-3xl md:text-4xl font-black text-black tracking-tight flex items-center gap-3">
                <MapPin className="w-8 h-8 text-[#0d9488]" />
                {listing.address}
              </h1>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button className="bg-[#0d9488] hover:bg-[#0f766e] text-white font-bold rounded-xl px-6 flex items-center gap-2">
                <Send className="w-4 h-4" /> Deliver Listing
              </Button>
              <Button variant="outline" className="border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl px-6 flex items-center gap-2">
                <Download className="w-4 h-4" /> Download All
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Main Content Area */}
            <div className="lg:col-span-2 space-y-8">
              
              {/* Media Section: Images */}
              <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-50 rounded-lg">
                      <ImageIcon className="w-5 h-5 text-blue-500" />
                    </div>
                    <h2 className="text-xl font-black text-black uppercase">Images</h2>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="rounded-lg text-[10px] font-bold uppercase">Arrange</Button>
                    <Button variant="outline" size="sm" className="rounded-lg text-[10px] font-bold uppercase">Add Photos</Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="group relative aspect-square rounded-2xl overflow-hidden bg-gray-100 border border-gray-100 cursor-move">
                      <img src={`https://images.unsplash.com/photo-${1600585154340 + i}-be6161a56a0c?w=400&q=80`} className="w-full h-full object-cover" alt="listing" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button className="p-2 bg-white rounded-lg text-black hover:text-[#0d9488] transition-colors"><Edit3 className="w-4 h-4" /></button>
                        <button className="p-2 bg-white rounded-lg text-black hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </div>
                      <div className="absolute top-2 left-2 p-1 bg-white/80 backdrop-blur-sm rounded-md opacity-0 group-hover:opacity-100 transition-opacity">
                        <GripVertical className="w-3 h-3 text-gray-500" />
                      </div>
                    </div>
                  ))}
                  <button className="aspect-square rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-[#0d9488] hover:text-[#0d9488] transition-all">
                    <Plus className="w-6 h-6" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Add More</span>
                  </button>
                </div>
              </div>

              {/* Videos & Reels */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm">
                  <h3 className="text-sm font-black text-black uppercase mb-6 flex items-center gap-2">
                    <Video className="w-4 h-4 text-orange-500" /> Videos
                  </h3>
                  <div className="space-y-4">
                    <div className="p-4 bg-[#fafafa] rounded-xl border border-dashed border-gray-200 text-center">
                      <p className="text-[10px] font-bold text-gray-400 uppercase mb-3 tracking-widest">Add Horizontal Video</p>
                      <div className="flex gap-2">
                        <Button variant="outline" className="flex-1 text-[10px] h-8 font-bold">ADD FILE</Button>
                        <Button variant="outline" className="flex-1 text-[10px] h-8 font-bold">ADD LINK</Button>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm">
                  <h3 className="text-sm font-black text-black uppercase mb-6 flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-purple-500" /> Reels
                  </h3>
                  <div className="space-y-4">
                    <div className="p-4 bg-[#fafafa] rounded-xl border border-dashed border-gray-200 text-center">
                      <p className="text-[10px] font-bold text-gray-400 uppercase mb-3 tracking-widest">Add Vertical Content</p>
                      <div className="flex gap-2">
                        <Button variant="outline" className="flex-1 text-[10px] h-8 font-bold">ADD FILE</Button>
                        <Button variant="outline" className="flex-1 text-[10px] h-8 font-bold">ADD LINK</Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3D Content Section */}
              <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm">
                <div className="flex items-center gap-3 mb-8">
                  <div className="p-2 bg-teal-50 rounded-lg">
                    <Globe className="w-5 h-5 text-[#0d9488]" />
                  </div>
                  <h2 className="text-xl font-black text-black uppercase tracking-tight">3D Content</h2>
                </div>
                
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Tour Provider</label>
                      <select className="w-full px-4 py-3 rounded-xl border border-gray-100 bg-[#fafafa] focus:border-[#0d9488] outline-none text-xs font-bold uppercase tracking-tight">
                        <option>Matterport</option>
                        <option>Zillow 3D Home</option>
                        <option>iGuide</option>
                        <option>Other Provider</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Display Type</label>
                      <select className="w-full px-4 py-3 rounded-xl border border-gray-100 bg-[#fafafa] focus:border-[#0d9488] outline-none text-xs font-bold uppercase tracking-tight">
                        <option>Automatically Select</option>
                        <option>Branded</option>
                        <option>Unbranded</option>
                        <option>Both</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Tour Title</label>
                    <input type="text" placeholder="e.g. Matterport 3D Tour" className="w-full px-4 py-3 rounded-xl border border-gray-100 bg-[#fafafa] focus:border-[#0d9488] outline-none text-xs font-medium" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Paste Tour Link</label>
                    <input type="url" placeholder="https://my.matterport.com/show/..." className="w-full px-4 py-3 rounded-xl border border-gray-100 bg-[#fafafa] focus:border-[#0d9488] outline-none text-xs font-medium" />
                  </div>
                </div>
              </div>

              {/* Misc Files */}
              <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm">
                <h3 className="text-sm font-black text-black uppercase mb-6 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-gray-400" /> Attachments & Files
                </h3>
                <div className="border-2 border-dashed border-gray-100 rounded-2xl p-12 text-center hover:border-[#0d9488] transition-colors cursor-pointer group">
                  <FilePlus className="w-8 h-8 text-gray-300 mx-auto mb-4 group-hover:scale-110 transition-transform" />
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Drop PDFs or Misc Files Here</p>
                </div>
              </div>

            </div>

            {/* Sidebar: Customer & Invoice */}
            <div className="space-y-8">
              
              {/* Customer Management */}
              <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-sm font-black text-black uppercase tracking-tight">Customer</h3>
                  <Link to="/admin/customers" className="text-[10px] font-bold text-[#0d9488] uppercase hover:underline">Manage Center</Link>
                </div>
                
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-12 h-12 rounded-full bg-[#166534] flex items-center justify-center text-white font-bold">SJ</div>
                  <div>
                    <p className="font-bold text-black">{listing.agent}</p>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{listing.team}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <Button variant="outline" className="w-full py-5 rounded-xl border-gray-100 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2">
                    <UserPlus className="w-3 h-3" /> Reassign Customer
                  </Button>
                  <Button variant="outline" className="w-full py-5 rounded-xl border-gray-100 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2">
                    <Edit3 className="w-3 h-3" /> Edit Preferences
                  </Button>
                </div>
              </div>

              {/* Invoice Section */}
              <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm">
                <h3 className="text-sm font-black text-black uppercase tracking-tight mb-6 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-[#0d9488]" /> Billing
                </h3>
                <div className="p-4 bg-[#f0fdfa] rounded-2xl border border-[#ccfbf1] mb-6">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Total Invoice</span>
                    <span className="text-lg font-black text-[#0d9488]">$1,249.00</span>
                  </div>
                  <div className="w-full h-1.5 bg-white rounded-full overflow-hidden">
                    <div className="w-full h-full bg-[#0d9488]"></div>
                  </div>
                </div>
                <Button className="w-full py-6 bg-black text-white font-bold rounded-xl flex items-center justify-center gap-2">
                  <FileText className="w-4 h-4" /> View Invoice
                </Button>
              </div>

              {/* System Integration Settings */}
              <div className="bg-black rounded-[2.5rem] p-8 text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 p-6 opacity-[0.05] pointer-events-none">
                  <Settings className="w-24 h-24" />
                </div>
                <h3 className="text-sm font-bold uppercase tracking-widest mb-6 relative z-10">Access Controls</h3>
                <div className="space-y-4 relative z-10">
                  {[
                    { label: "Lock Media Downloads", checked: true },
                    { label: "Lock Studio Access", checked: false },
                    { label: "Lock Marketing Materials", checked: false },
                    { label: "Require Payment for DL", checked: true }
                  ].map((control, idx) => (
                    <div key={idx} className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{control.label}</span>
                      <div className={`w-8 h-4 rounded-full relative transition-colors ${control.checked ? 'bg-[#0d9488]' : 'bg-gray-800'}`}>
                        <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${control.checked ? 'right-0.5' : 'left-0.5'}`}></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>

          {/* Audit Log Section */}
          <div className="mt-12">
            <button 
              onClick={() => setIsAuditLogOpen(!isAuditLogOpen)}
              className="w-full bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex items-center justify-between group"
            >
              <div className="flex items-center gap-3 text-gray-400 group-hover:text-black transition-colors">
                <History className="w-5 h-5" />
                <span className="text-sm font-black uppercase tracking-widest">System Audit Log</span>
              </div>
              <ChevronDown className={`w-5 h-5 text-gray-300 transition-transform ${isAuditLogOpen ? 'rotate-180' : ''}`} />
            </button>
            
            {isAuditLogOpen && (
              <div className="mt-4 bg-white rounded-[2rem] border border-gray-100 p-8 shadow-inner animate-in slide-in-from-top-2 duration-300">
                <div className="space-y-4">
                  {auditLogs.map((log, idx) => (
                    <div key={idx} className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-black">{log.action}</span>
                        <span className="text-[10px] text-gray-400 font-medium tracking-tight">Performed by {log.user}</span>
                      </div>
                      <span className="text-[10px] font-bold text-gray-300 uppercase">{log.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

        </div>
      </main>

      <Footer />
    </div>
  );
}
