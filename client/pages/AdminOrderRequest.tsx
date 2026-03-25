import React, { useState, useEffect } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
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
  CheckCircle2,
  AlertCircle,
  Hash,
  Mail,
  Phone,
  Maximize,
  Briefcase
} from "lucide-react";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { toast } from "sonner";

export default function AdminOrderRequest() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [request, setRequest] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRequest() {
      if (!id) return;
      try {
        const docRef = doc(db, "orderRequests", id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setRequest({ id: docSnap.id, ...docSnap.data() });
        } else {
          toast.error("Request not found");
          navigate("/admin/dashboard");
        }
      } catch (error) {
        console.error("Error fetching request:", error);
        toast.error("Failed to load request details");
      } finally {
        setLoading(false);
      }
    }
    fetchRequest();
  }, [id, navigate]);

  const handleStatusUpdate = async (newStatus: string) => {
    if (!id) return;
    try {
      await updateDoc(doc(db, "orderRequests", id), { status: newStatus });
      setRequest((prev: any) => ({ ...prev, status: newStatus }));
      toast.success(`Status updated to ${newStatus}`);
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error("Failed to update status");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafafa]">
        <div className="w-8 h-8 border-4 border-[#0d9488] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!request) return null;

  return (
    <div className="flex flex-col min-h-screen bg-[#fafafa]">
      <Header />
      
      <main className="flex-1 pt-32 pb-24">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="mb-8 flex items-center justify-between">
            <Button asChild variant="ghost" className="text-gray-500 hover:text-black">
              <Link to="/admin/dashboard" className="flex items-center gap-2">
                <ChevronLeft className="w-4 h-4" /> Back to Dashboard
              </Link>
            </Button>
            
            <div className="flex items-center gap-3">
              <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                request.status === 'needs scheduled' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
              }`}>
                {request.status}
              </span>
              {request.status === 'needs scheduled' && (
                <Button 
                  onClick={() => handleStatusUpdate('scheduled')}
                  size="sm" 
                  className="bg-[#0d9488] hover:bg-[#0f766e] text-white font-bold rounded-lg"
                >
                  Mark as Scheduled
                </Button>
              )}
            </div>
          </div>

          <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
            {/* Header Section */}
            <div className="bg-black p-10 text-white">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Hash className="w-4 h-4 text-red-500" />
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Order ID: {request.orderId}</span>
                  </div>
                  <h1 className="text-3xl font-black uppercase tracking-tight mb-2">{request.clientName}</h1>
                  <p className="text-gray-400 font-medium flex items-center gap-2">
                    <MapPin className="w-4 h-4" /> {request.address || "No address provided (Consultation)"}
                  </p>
                </div>
                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/10 min-w-[200px]">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Submitted On</p>
                  <p className="text-lg font-bold">
                    {request.submittedAt?.toDate ? request.submittedAt.toDate().toLocaleDateString() : 'Just now'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {request.submittedAt?.toDate ? request.submittedAt.toDate().toLocaleTimeString() : ''}
                  </p>
                </div>
              </div>
            </div>

            {/* Content Body */}
            <div className="p-10 space-y-12">
              {/* Contact Info */}
              <section>
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                  <User className="w-4 h-4 text-[#0d9488]" /> Contact Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Email</p>
                    <p className="font-bold flex items-center gap-2"><Mail className="w-3.5 h-3.5" /> {request.email}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Phone</p>
                    <p className="font-bold flex items-center gap-2"><Phone className="w-3.5 h-3.5" /> {request.phone}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Square Footage</p>
                    <p className="font-bold flex items-center gap-2"><Maximize className="w-3.5 h-3.5" /> {request.sqft || "N/A"} sqft</p>
                  </div>
                </div>
              </section>

              {/* Service Details */}
              <section>
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                  <Package className="w-4 h-4 text-[#0d9488]" /> Service Selection
                </h3>
                <div className="bg-[#fafafa] rounded-2xl p-8 border border-gray-50 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Primary Service</p>
                      <p className="text-xl font-black text-black uppercase">{request.selectedService || "Custom/Basics"}</p>
                    </div>
                    <div className="space-y-1 text-right">
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Photography Style</p>
                      <p className="text-xl font-black text-[#0d9488] uppercase">{request.specializedPhotography || "Standard"}</p>
                    </div>
                  </div>
                  
                  {request.selectedBasics?.length > 0 && (
                    <div className="pt-6 border-t border-gray-200">
                      <p className="text-[10px] font-bold text-gray-400 uppercase mb-3">Basics Included</p>
                      <div className="flex flex-wrap gap-2">
                        {request.selectedBasics.map((basic: string) => (
                          <span key={basic} className="px-3 py-1 bg-white border border-gray-200 rounded-lg text-[10px] font-bold uppercase">{basic}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {request.selectedAddOns?.length > 0 && (
                    <div className="pt-6 border-t border-gray-200">
                      <p className="text-[10px] font-bold text-gray-400 uppercase mb-3">Add-Ons Selection</p>
                      <div className="flex flex-wrap gap-2">
                        {request.selectedAddOns.map((addon: string) => (
                          <span key={addon} className="px-3 py-1 bg-white border border-gray-200 rounded-lg text-[10px] font-bold uppercase text-[#0d9488]">{addon}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* Scheduling Preferences */}
              <section>
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#0d9488]" /> Scheduling & Access
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Requested Date</p>
                    <p className="font-bold flex items-center gap-2"><Calendar className="w-3.5 h-3.5" /> {request.serviceDate ? new Date(request.serviceDate).toLocaleDateString() : "Flexible"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Preferred Time</p>
                    <p className="font-bold flex items-center gap-2"><Clock className="w-3.5 h-3.5" /> {request.serviceTime}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Access Info</p>
                    <p className="font-bold flex items-center gap-2"><Briefcase className="w-3.5 h-3.5" /> {request.accessInfo}</p>
                  </div>
                </div>
                {(request.lockboxCode || request.supraCode) && (
                  <div className="mt-6 p-4 bg-yellow-50 border border-yellow-100 rounded-xl flex gap-4">
                    <AlertCircle className="w-5 h-5 text-yellow-600 shrink-0" />
                    <div>
                      <p className="text-[10px] font-black text-yellow-800 uppercase tracking-widest mb-1">Access Codes</p>
                      <div className="flex gap-6">
                        {request.lockboxCode && <p className="text-sm font-bold text-yellow-900">Lockbox: {request.lockboxCode}</p>}
                        {request.supraCode && <p className="text-sm font-bold text-yellow-900">Supra: {request.supraCode}</p>}
                      </div>
                    </div>
                  </div>
                )}
              </section>

              {/* Questionnaire Answers */}
              <section>
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-[#0d9488]" /> Questionnaire & Insights
                </h3>
                <div className="grid grid-cols-1 gap-6">
                  {[
                    { q: "What's the vibe of this shoot?", a: request.vibeNote },
                    { q: "What is currently bothering you with marketing results?", a: request.resultsBothering },
                    { q: "Where does your business usually come from?", a: request.businessSource },
                    { q: "What does your perfect business look like?", a: request.perfectBusiness },
                    { q: "How much are you willing to invest in your business?", a: request.investmentWilling },
                    { q: "What is your marketing currently doing?", a: request.marketingDoing }
                  ].map((item, idx) => item.a ? (
                    <div key={idx} className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">{item.q}</p>
                      <p className="text-sm font-bold text-gray-800 leading-relaxed">{item.a}</p>
                    </div>
                  ) : null)}
                </div>
              </section>

              {/* Status & Options */}
              <section className="pt-12 border-t border-gray-100 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
                    <FileText className="w-6 h-6 text-red-500" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Internal Status</p>
                    <p className="text-lg font-black text-black uppercase">{request.status}</p>
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <Button variant="outline" className="rounded-xl font-bold px-8 h-12">Archive Request</Button>
                  <Button asChild className="bg-black hover:bg-gray-800 text-white font-bold rounded-xl px-8 h-12">
                    <Link to={`/admin/listing/${request.orderId}`}>Create/Manage Listing</Link>
                  </Button>
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
