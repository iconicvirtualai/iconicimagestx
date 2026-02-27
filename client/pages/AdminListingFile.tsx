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
  UserPlus,
  ChevronRight,
  Layout,
  Lock,
  MoreVertical,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { useState } from "react";

export default function AdminListingFile() {
  const { id } = useParams();
  const [activeTab, setActiveTab] = useState("media");
  const [isAuditLogOpen, setIsAuditLogOpen] = useState(false);

  const listing = {
    id: id || "8245",
    address: "1245 Willow Creek Dr",
    city: "Spring, TX 77380",
    status: "Delivered",
    paymentStatus: "Paid",
    agent: "Sarah Jenkins",
    team: "The Jenkins Group",
    price: "$549,000",
    date: "Oct 24, 2024"
  };

  const auditLogs = [
    { action: "Listing Delivered", user: "System", time: "2 hrs ago" },
    { action: "Media Lock Enabled", user: "Admin (Cadi)", time: "3 hrs ago" },
    { action: "3D Tour Link Added", user: "Admin (Cadi)", time: "4 hrs ago" },
    { action: "Images Uploaded (45 files)", user: "System", time: "5 hrs ago" },
    { action: "Status Changed: Scheduled -> Pending", user: "System", time: "1 day ago" }
  ];

  return (
    <div className="flex flex-col min-h-screen bg-[#f8fafc]">
      <Header />
      
      <main className="flex-1 pt-24 pb-12">
        {/* Compact Sub-Header / Breadcrumbs */}
        <div className="bg-white border-b border-slate-200 sticky top-[72px] z-30 px-6 py-3">
          <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-slate-400">
              <Link to="/admin/dashboard" className="hover:text-black transition-colors">
                <Layout className="w-4 h-4" />
              </Link>
              <ChevronRight className="w-3 h-3" />
              <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">Orders</span>
              <ChevronRight className="w-3 h-3" />
              <span className="text-xs font-medium truncate max-w-[150px]">{listing.address}</span>
            </div>
            
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold text-slate-400 italic mr-2">Auto-saved at 2:45 PM</span>
              <Button size="sm" variant="outline" className="h-9 rounded-lg border-slate-200 text-slate-600 font-bold text-xs">
                <Download className="w-3.5 h-3.5 mr-2" /> Download Content
              </Button>
              <Button size="sm" className="h-9 bg-black hover:bg-slate-800 text-white font-bold text-xs rounded-lg px-5">
                <Send className="w-3.5 h-3.5 mr-2" /> Deliver Media
              </Button>
            </div>
          </div>
        </div>

        <div className="max-w-[1600px] mx-auto px-6 mt-8">
          <div className="flex flex-col lg:flex-row gap-8">
            
            {/* Main Workspace (Left) */}
            <div className="flex-1 min-w-0 space-y-6">
              
              {/* Tabs Navigation */}
              <div className="flex items-center gap-1 bg-slate-200/50 p-1 rounded-xl w-fit">
                {["media", "3d content", "files", "audit log"].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-6 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
                      activeTab === tab 
                        ? "bg-white text-black shadow-sm" 
                        : "text-slate-500 hover:text-black"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Media Content Tab */}
              {activeTab === "media" && (
                <div className="space-y-6 animate-in fade-in duration-300">
                  {/* Images Section */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                      <div className="flex items-center gap-3">
                        <ImageIcon className="w-4 h-4 text-blue-500" />
                        <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight">Listing Images (42)</h2>
                      </div>
                      <div className="flex gap-2">
                        <button className="text-[10px] font-bold text-slate-400 hover:text-black uppercase tracking-wider">Arrange</button>
                        <div className="w-[1px] h-3 bg-slate-200 mx-1 self-center" />
                        <button className="text-[10px] font-bold text-[#0d9488] hover:underline uppercase tracking-wider flex items-center gap-1">
                          <Plus className="w-3 h-3" /> Add Batch
                        </button>
                      </div>
                    </div>
                    
                    <div className="p-6">
                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                          <div key={i} className="group relative aspect-square rounded-xl overflow-hidden bg-slate-100 border border-slate-100 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-all">
                            <img 
                              src={`https://images.unsplash.com/photo-${1600585154340 + i}-be6161a56a0c?w=300&q=80`} 
                              className="w-full h-full object-cover" 
                              alt="listing" 
                            />
                            <div className="absolute top-1.5 right-1.5 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button title="Archive" className="p-1.5 bg-white/90 backdrop-blur-sm rounded-md shadow-sm text-slate-400 hover:text-blue-500"><Archive className="w-3.5 h-3.5" /></button>
                              <button title="Hide" className="p-1.5 bg-white/90 backdrop-blur-sm rounded-md shadow-sm text-slate-400 hover:text-orange-500"><EyeOff className="w-3.5 h-3.5" /></button>
                              <button title="Delete" className="p-1.5 bg-white/90 backdrop-blur-sm rounded-md shadow-sm text-slate-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                            <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                              <button className="px-2 py-1 bg-white/20 backdrop-blur-sm hover:bg-white/40 text-white rounded text-[8px] font-black uppercase">Edit</button>
                              <button className="px-2 py-1 bg-white/20 backdrop-blur-sm hover:bg-white/40 text-white rounded text-[8px] font-black uppercase">Staging</button>
                            </div>
                            <div className="absolute top-1.5 left-1.5 p-1 bg-slate-900/40 backdrop-blur-sm rounded text-[8px] text-white font-bold">{i}</div>
                          </div>
                        ))}
                        <button className="aspect-square rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-2 text-slate-400 hover:border-[#0d9488] hover:text-[#0d9488] hover:bg-[#f0fdfa]/50 transition-all group">
                          <Plus className="w-5 h-5 group-hover:scale-110 transition-transform" />
                          <span className="text-[9px] font-bold uppercase tracking-widest">Upload</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Videos & Reels Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                        <div className="flex items-center gap-3">
                          <Video className="w-4 h-4 text-orange-500" />
                          <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight">Horizontal Video</h2>
                        </div>
                        <button className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors"><MoreVertical className="w-4 h-4 text-slate-400" /></button>
                      </div>
                      <div className="p-6">
                        <div className="border-2 border-dashed border-slate-100 rounded-xl p-8 text-center bg-slate-50/30">
                          <Video className="w-8 h-8 text-slate-200 mx-auto mb-3" />
                          <div className="flex gap-2 justify-center">
                            <Button size="sm" variant="outline" className="h-8 text-[10px] font-black uppercase px-4 border-slate-200">Add File</Button>
                            <Button size="sm" variant="outline" className="h-8 text-[10px] font-black uppercase px-4 border-slate-200">Add Link</Button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                        <div className="flex items-center gap-3">
                          <Smartphone className="w-4 h-4 text-purple-500" />
                          <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight">Vertical Reels</h2>
                        </div>
                        <button className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors"><MoreVertical className="w-4 h-4 text-slate-400" /></button>
                      </div>
                      <div className="p-6">
                        <div className="border-2 border-dashed border-slate-100 rounded-xl p-8 text-center bg-slate-50/30">
                          <Smartphone className="w-8 h-8 text-slate-200 mx-auto mb-3" />
                          <div className="flex gap-2 justify-center">
                            <Button size="sm" variant="outline" className="h-8 text-[10px] font-black uppercase px-4 border-slate-200">Add File</Button>
                            <Button size="sm" variant="outline" className="h-8 text-[10px] font-black uppercase px-4 border-slate-200">Add Link</Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 3D Content Tab */}
              {activeTab === "3d content" && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-in slide-in-from-top-2">
                  <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex items-center gap-3">
                      <Globe className="w-4 h-4 text-teal-500" />
                      <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight">Interactive Content</h2>
                    </div>
                  </div>
                  <div className="p-8 max-w-2xl space-y-6">
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Provider</label>
                        <select className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-slate-50/50 text-xs font-bold focus:ring-2 focus:ring-[#0d9488]/20 outline-none">
                          <option>Matterport</option>
                          <option>Zillow 3D Home</option>
                          <option>iGuide</option>
                          <option>Direct Embed</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Visibility</label>
                        <select className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-slate-50/50 text-xs font-bold focus:ring-2 focus:ring-[#0d9488]/20 outline-none">
                          <option>Show Branded</option>
                          <option>Show Unbranded</option>
                          <option>Both (Side-by-side)</option>
                          <option>Auto-detect</option>
                        </select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Tour URL</label>
                      <input type="url" placeholder="https://..." className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-slate-50/50 text-xs font-medium focus:ring-2 focus:ring-[#0d9488]/20 outline-none" />
                    </div>
                    <Button className="bg-[#0d9488] text-white font-black uppercase text-[10px] tracking-widest h-11 px-8 rounded-xl">Save 3D Tour</Button>
                  </div>
                </div>
              )}

              {/* Files Tab */}
              {activeTab === "files" && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-in slide-in-from-top-2">
                  <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex items-center gap-3">
                      <FileText className="w-4 h-4 text-slate-400" />
                      <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight">Attachments</h2>
                    </div>
                  </div>
                  <div className="p-12">
                    <div className="border-2 border-dashed border-slate-100 rounded-[2rem] p-16 text-center hover:border-[#0d9488] hover:bg-[#f0fdfa]/30 transition-all cursor-pointer group">
                      <FilePlus className="w-10 h-10 text-slate-200 mx-auto mb-4 group-hover:text-[#0d9488] transition-colors" />
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Drag and drop files here</p>
                      <p className="text-[10px] text-slate-300 font-medium italic">Support for PDF, PNG, JPG, and DOCX (Max 100MB)</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Audit Log Content (If integrated here) */}
              {activeTab === "audit log" && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-in slide-in-from-top-2">
                  <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex items-center gap-3">
                      <History className="w-4 h-4 text-slate-400" />
                      <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight">Full System Audit</h2>
                    </div>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {auditLogs.map((log, idx) => (
                      <div key={idx} className="px-8 py-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className="w-2 h-2 rounded-full bg-slate-200" />
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-900">{log.action}</span>
                            <span className="text-[10px] text-slate-400 font-medium">By {log.user}</span>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold text-slate-300 uppercase">{log.time}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>

            {/* Sidebar (Right) */}
            <div className="w-full lg:w-[380px] space-y-6">
              
              {/* Listing Card */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-[#f0fdfa] border border-[#ccfbf1]">
                    <CheckCircle2 className="w-3 h-3 text-[#0d9488]" />
                    <span className="text-[10px] font-black text-[#0d9488] uppercase tracking-wider">{listing.status}</span>
                  </div>
                  <button className="p-2 hover:bg-slate-50 rounded-lg transition-colors border border-slate-100"><Settings className="w-4 h-4 text-slate-400" /></button>
                </div>
                
                <h3 className="text-lg font-black text-slate-900 tracking-tight leading-tight mb-1">{listing.address}</h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6">{listing.city}</p>
                
                <div className="grid grid-cols-2 gap-4 py-4 border-y border-slate-50 mb-6">
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">List Price</p>
                    <p className="text-sm font-black text-slate-900">{listing.price}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Created</p>
                    <p className="text-sm font-black text-slate-900">{listing.date}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center text-white text-[10px] font-black">SJ</div>
                      <div>
                        <p className="text-xs font-black text-slate-900 leading-none mb-1">{listing.agent}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">{listing.team}</p>
                      </div>
                    </div>
                    <Link to="/admin/customers" className="p-2 text-[#0d9488] hover:bg-teal-50 rounded-lg transition-all"><UserPlus className="w-4 h-4" /></Link>
                  </div>
                </div>
              </div>

              {/* Billing Compact */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <div className="flex items-center gap-3 mb-6">
                  <CreditCard className="w-4 h-4 text-blue-500" />
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-[0.2em]">Invoicing</h3>
                </div>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Balance Due</p>
                  <p className="text-lg font-black text-slate-900">$0.00</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg text-[10px] font-bold">
                    <span className="text-slate-500">INV-8245-01</span>
                    <span className="text-[#0d9488]">PAID</span>
                  </div>
                  <Button variant="outline" className="w-full h-10 text-[10px] font-black uppercase tracking-widest border-slate-200">View Statement</Button>
                </div>
              </div>

              {/* Access Controls Section */}
              <div className="bg-slate-900 rounded-2xl p-6 text-white overflow-hidden relative">
                <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
                  <Lock className="w-24 h-24" />
                </div>
                <div className="flex items-center gap-3 mb-6 relative z-10">
                  <Lock className="w-4 h-4 text-[#0d9488]" />
                  <h3 className="text-xs font-black uppercase tracking-[0.2em]">Listing Security</h3>
                </div>
                
                <div className="space-y-4 relative z-10">
                  {[
                    { label: "Lock Media Downloads", checked: true },
                    { label: "Lock Studio Access", checked: false },
                    { label: "Lock Marketing Materials", checked: false },
                    { label: "Require Payment for DL", checked: true }
                  ].map((control, idx) => (
                    <div key={idx} className="flex items-center justify-between">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{control.label}</span>
                      <div className={`w-7 h-3.5 rounded-full relative transition-colors ${control.checked ? 'bg-[#0d9488]' : 'bg-slate-700'}`}>
                        <div className={`absolute top-0.5 w-2.5 h-2.5 bg-white rounded-full transition-all ${control.checked ? 'right-0.5' : 'left-0.5'}`}></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Audit Log (Compact Side) */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <div className="flex items-center gap-3 mb-4">
                  <History className="w-4 h-4 text-slate-400" />
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-[0.2em]">Quick Log</h3>
                </div>
                <div className="space-y-3">
                  {auditLogs.slice(0, 3).map((log, idx) => (
                    <div key={idx} className="flex flex-col">
                      <span className="text-[10px] font-bold text-slate-900 truncate">{log.action}</span>
                      <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">{log.time}</span>
                    </div>
                  ))}
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
