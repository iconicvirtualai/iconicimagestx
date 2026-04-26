import * as React from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { db } from "@/lib/firebase";
import { collection, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import {
  Home, Building2, Check, ChevronRight, ChevronLeft, Camera,
  Video, Plane, Box, Sparkles, Smartphone, X, Plus, Minus, Info,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ServiceItem {
  id: string;
  name: string;
  category: string;
  type: string;
  price: number;
  duration: number;
  description: string;
  isUpsell: boolean;
  upsellMessage: string;
  isPremium: boolean;
  sortOrder: number;
  isActive: boolean;
}

interface CartItem {
  serviceId: string;
  name: string;
  price: number;
  duration: number;
  qty: number;
}

type Step = "type" | "services" | "details" | "review";

const SERVICE_ICONS: Record<string, any> = {
  photography: Camera, videography: Video, aerial: Plane,
  "3d_tour": Box, staging: Sparkles, social: Smartphone,
  branding: Sparkles, reel: Video,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateOrderNumber(): string {
  const d = new Date();
  const date = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
  const rand = String(Math.floor(Math.random()*999)+1).padStart(3,"0");
  return `ORD-${date}-${rand}`;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Book() {
  const navigate = useNavigate();
  const [step, setStep] = React.useState<Step>("type");
  const [projectType, setProjectType] = React.useState<"real_estate"|"business"|"">("");

  // Services catalog
  const [allServices, setAllServices] = React.useState<ServiceItem[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Cart
  const [cart, setCart] = React.useState<CartItem[]>([]);
  const [showUpsell, setShowUpsell] = React.useState<ServiceItem|null>(null);

  // Client details
  const [isReturning, setIsReturning] = React.useState(false);
  const [clientForm, setClientForm] = React.useState({
    firstName: "", lastName: "", email: "", phone: "", company: "",
  });

  // Appointment
  const [needsAppt, setNeedsAppt] = React.useState(true);
  const [apptForm, setApptForm] = React.useState({
    street: "", city: "", state: "TX", zip: "",
    preferredDate: "", preferredTime: "", notes: "", accessInstructions: "",
  });

  // Submitting
  const [submitting, setSubmitting] = React.useState(false);

  // Load services from Firestore
  React.useEffect(() => {
    getDocs(collection(db, "services")).then(snap => {
      const svc = snap.docs.map(d => ({ id: d.id, ...d.data() } as ServiceItem))
        .filter(s => s.isActive !== false)
        .sort((a,b) => (a.sortOrder||0) - (b.sortOrder||0));
      setAllServices(svc);
      setLoading(false);
    }).catch(() => {
      // Fallback: default services if collection is empty
      setAllServices([
        { id: "photo-basic", name: "Listing Photos", category: "real_estate", type: "photography", price: 199, duration: 60, description: "Up to 25 professional listing photos", isUpsell: false, upsellMessage: "", isPremium: false, sortOrder: 1, isActive: true },
        { id: "photo-premium", name: "Premium Photo Package", category: "real_estate", type: "photography", price: 349, duration: 90, description: "Up to 50 photos + twilight shots", isUpsell: false, upsellMessage: "", isPremium: true, sortOrder: 2, isActive: true },
        { id: "aerial", name: "Aerial Photography", category: "both", type: "aerial", price: 149, duration: 30, description: "Drone photos & video of property", isUpsell: true, upsellMessage: "Add stunning aerial views to make your listing stand out!", isPremium: false, sortOrder: 3, isActive: true },
        { id: "video-tour", name: "Video Tour", category: "both", type: "videography", price: 299, duration: 45, description: "Cinematic property walkthrough video", isUpsell: false, upsellMessage: "", isPremium: false, sortOrder: 4, isActive: true },
        { id: "3d-tour", name: "3D Virtual Tour", category: "real_estate", type: "3d_tour", price: 199, duration: 45, description: "Matterport-style interactive 3D tour", isUpsell: true, upsellMessage: "Buyers spend 3x longer on listings with 3D tours!", isPremium: false, sortOrder: 5, isActive: true },
        { id: "reel", name: "Social Media Reel", category: "both", type: "reel", price: 149, duration: 15, description: "15-30 second Instagram/TikTok reel", isUpsell: true, upsellMessage: "Get 5x more engagement with a custom reel!", isPremium: false, sortOrder: 6, isActive: true },
        { id: "staging", name: "Virtual Staging", category: "real_estate", type: "staging", price: 35, duration: 0, description: "Per room virtual staging", isUpsell: true, upsellMessage: "Staged homes sell 73% faster!", isPremium: false, sortOrder: 7, isActive: true },
        { id: "biz-brand", name: "Brand Photography", category: "business", type: "photography", price: 399, duration: 120, description: "Professional headshots & brand imagery", isUpsell: false, upsellMessage: "", isPremium: false, sortOrder: 10, isActive: true },
        { id: "biz-video", name: "Business Videography", category: "business", type: "videography", price: 599, duration: 120, description: "Company promo video or testimonial", isUpsell: false, upsellMessage: "", isPremium: false, sortOrder: 11, isActive: true },
        { id: "biz-social", name: "Social Media Content Package", category: "business", type: "social", price: 499, duration: 90, description: "Photos + reels for social media", isUpsell: false, upsellMessage: "", isPremium: false, sortOrder: 12, isActive: true },
      ]);
      setLoading(false);
    });
  }, []);

  const filteredServices = allServices.filter(s =>
    s.category === "both" || s.category === projectType
  );

  const addToCart = (svc: ServiceItem) => {
    const existing = cart.find(c => c.serviceId === svc.id);
    if (existing) {
      setCart(cart.map(c => c.serviceId === svc.id ? { ...c, qty: c.qty + 1 } : c));
    } else {
      setCart([...cart, { serviceId: svc.id, name: svc.name, price: svc.price, duration: svc.duration, qty: 1 }]);
      // Check for upsell
      const nextUpsell = filteredServices.find(s => s.isUpsell && !cart.find(c => c.serviceId === s.id) && s.id !== svc.id);
      if (nextUpsell) setShowUpsell(nextUpsell);
    }
  };

  const removeFromCart = (serviceId: string) => {
    setCart(cart.filter(c => c.serviceId !== serviceId));
  };

  const subtotal = cart.reduce((sum, c) => sum + c.price * c.qty, 0);
  const totalDuration = cart.reduce((sum, c) => sum + c.duration * c.qty, 0);
  const tax = Math.round(subtotal * 0.0825 * 100) / 100; // 8.25% TX sales tax
  const total = subtotal + tax;

  const canProceedToDetails = cart.length > 0;
  const canProceedToReview = clientForm.firstName && clientForm.email && clientForm.phone &&
    (!needsAppt || (apptForm.street && apptForm.city && apptForm.preferredDate));

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const orderNumber = generateOrderNumber();
      const formattedAddress = needsAppt
        ? `${apptForm.street}, ${apptForm.city}, ${apptForm.state} ${apptForm.zip}`.trim()
        : "";

      const orderData = {
        orderNumber,
        type: projectType,
        status: "request",
        source: "client_booking",

        // Client
        clientName: `${clientForm.firstName} ${clientForm.lastName}`.trim(),
        clientEmail: clientForm.email.toLowerCase().trim(),
        clientPhone: clientForm.phone,
        clientCompany: clientForm.company || null,
        isReturningClient: isReturning,

        // Address
        address: needsAppt ? {
          street: apptForm.street,
          city: apptForm.city,
          state: apptForm.state,
          zip: apptForm.zip,
          formatted: formattedAddress,
        } : null,

        // Appointment
        requiresAppointment: needsAppt,
        requestedDate: apptForm.preferredDate || null,
        requestedTime: apptForm.preferredTime || null,
        appointmentNotes: apptForm.notes || null,
        accessInstructions: apptForm.accessInstructions || null,
        appointmentDuration: totalDuration,

        // Services
        services: cart.map(c => ({
          serviceId: c.serviceId,
          name: c.name,
          price: c.price,
          duration: c.duration,
          qty: c.qty,
          isCustom: false,
        })),
        subtotal,
        tax,
        discount: 0,
        total,

        // Invoice (born with the order)
        invoice: {
          invoiceNumber: orderNumber.replace("ORD", "INV"),
          status: "draft",
          amountDue: total,
          amountPaid: 0,
          payments: [],
          sentAt: null,
          paidAt: null,
          dueDate: null,
        },

        // Gallery placeholder
        gallery: {
          galleryId: null,
          galleryUrl: null,
          studioToken: crypto.randomUUID(),
          lockDownloads: true,
          deliveredAt: null,
        },

        // Deliverables from services
        deliverables: [...new Set(cart.map(c => {
          const svc = allServices.find(s => s.id === c.serviceId);
          return svc?.type || "photography";
        }))].map(type => ({
          type,
          status: "pending",
          fileCount: 0,
          uploadedAt: null,
          editedAt: null,
          deliveredAt: null,
        })),

        revisions: [],
        history: [{
          action: "Order request submitted",
          by: clientForm.email,
          at: new Date().toISOString(),
          details: `${cart.length} service(s), total $${total.toFixed(2)}`,
        }],

        assignedProviders: [],
        internalNotes: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await addDoc(collection(db, "orderRequests"), orderData);

      // Also create/update client record
      await addDoc(collection(db, "clients"), {
        firstName: clientForm.firstName,
        lastName: clientForm.lastName,
        email: clientForm.email.toLowerCase().trim(),
        phone: clientForm.phone,
        company: clientForm.company || null,
        type: projectType === "real_estate" ? "real_estate_agent" : "business",
        hasAccount: false,
        totalOrders: 1,
        totalSpend: total,
        creditBalance: 0,
        plan: null,
        tags: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      toast.success("Booking request submitted! We'll reach out shortly to confirm.");
      navigate("/");
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = "w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#0d9488]/30 focus:border-[#0d9488]";
  const labelCls = "block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5";

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <Header />

      <div className="max-w-3xl mx-auto px-4 py-12">
        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-10">
          {(["type","services","details","review"] as Step[]).map((s, i) => (
            <React.Fragment key={s}>
              {i > 0 && <div className={`w-8 h-0.5 ${["type","services","details","review"].indexOf(step) >= i ? "bg-[#0d9488]" : "bg-gray-200"}`} />}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black ${
                step === s ? "bg-[#0d9488] text-white" : ["type","services","details","review"].indexOf(step) > i ? "bg-[#0d9488]/20 text-[#0d9488]" : "bg-gray-100 text-gray-400"
              }`}>{i+1}</div>
            </React.Fragment>
          ))}
        </div>

        {/* ─── STEP 1: Project Type ─── */}
        {step === "type" && (
          <div className="text-center">
            <h1 className="text-3xl font-black text-black mb-2">Book Your Session</h1>
            <p className="text-gray-500 mb-10">What type of project are you booking?</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-lg mx-auto">
              <button onClick={() => { setProjectType("real_estate"); setStep("services"); }}
                className="group bg-white rounded-2xl border-2 border-gray-100 hover:border-[#0d9488] p-8 text-center transition-all hover:shadow-lg">
                <Home className="w-10 h-10 text-[#0d9488] mx-auto mb-4" />
                <h3 className="text-lg font-black text-black mb-1">Real Estate</h3>
                <p className="text-xs text-gray-400">Listing photos, aerials, 3D tours, video & more</p>
              </button>
              <button onClick={() => { setProjectType("business"); setStep("services"); }}
                className="group bg-white rounded-2xl border-2 border-gray-100 hover:border-black p-8 text-center transition-all hover:shadow-lg">
                <Building2 className="w-10 h-10 text-black mx-auto mb-4" />
                <h3 className="text-lg font-black text-black mb-1">Business</h3>
                <p className="text-xs text-gray-400">Brand photos, headshots, video, social content</p>
              </button>
            </div>
          </div>
        )}

        {/* ─── STEP 2: Services ─── */}
        {step === "services" && (
          <div>
            <h2 className="text-2xl font-black text-black mb-2">Select Your Services</h2>
            <p className="text-gray-500 mb-8">Choose the services you need for your {projectType === "real_estate" ? "listing" : "brand"}.</p>

            <div className="grid grid-cols-1 gap-4 mb-8">
              {filteredServices.map(svc => {
                const inCart = cart.find(c => c.serviceId === svc.id);
                const Icon = SERVICE_ICONS[svc.type] || Camera;
                return (
                  <div key={svc.id} className={`bg-white rounded-2xl border-2 p-5 flex items-center gap-5 transition-all cursor-pointer ${inCart ? "border-[#0d9488] shadow-md" : "border-gray-100 hover:border-gray-200"}`}
                    onClick={() => !inCart && addToCart(svc)}>
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${inCart ? "bg-[#0d9488] text-white" : "bg-gray-100 text-gray-400"}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm text-black">{svc.name}</h3>
                        {svc.isPremium && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[8px] font-black uppercase rounded-full">Premium</span>}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{svc.description}</p>
                      {svc.duration > 0 && <p className="text-[10px] text-gray-300 mt-1">{svc.duration} min on-site</p>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-lg font-black text-black">${svc.price}</p>
                      {inCart ? (
                        <button onClick={e => { e.stopPropagation(); removeFromCart(svc.id); }}
                          className="text-[10px] font-bold text-red-400 hover:text-red-600 uppercase tracking-widest mt-1">Remove</button>
                      ) : (
                        <p className="text-[10px] font-bold text-[#0d9488] uppercase tracking-widest mt-1">+ Add</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Cart summary */}
            {cart.length > 0 && (
              <div className="bg-black text-white rounded-2xl p-6 mb-6">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-3">Your Order</h4>
                {cart.map(c => (
                  <div key={c.serviceId} className="flex justify-between text-sm mb-2">
                    <span className="font-medium">{c.name} {c.qty > 1 ? `x${c.qty}` : ""}</span>
                    <span className="font-bold">${(c.price * c.qty).toFixed(2)}</span>
                  </div>
                ))}
                <div className="border-t border-gray-700 mt-3 pt-3 flex justify-between">
                  <span className="text-xs text-gray-400">Subtotal</span>
                  <span className="font-bold">${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">Tax (8.25%)</span>
                  <span className="text-sm">${tax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between mt-2 text-lg">
                  <span className="font-black">Total</span>
                  <span className="font-black text-[#0d9488]">${total.toFixed(2)}</span>
                </div>
                {totalDuration > 0 && (
                  <p className="text-[10px] text-gray-500 mt-2">Estimated on-site time: {Math.floor(totalDuration/60)}h {totalDuration%60}m</p>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => { setStep("type"); setCart([]); }}
                className="px-6 py-3 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50">
                <ChevronLeft className="w-4 h-4 inline mr-1" /> Back
              </button>
              <button onClick={() => canProceedToDetails && setStep("details")} disabled={!canProceedToDetails}
                className="flex-1 px-6 py-3 bg-[#0d9488] text-white rounded-xl text-sm font-bold hover:bg-[#0f766e] disabled:opacity-50 disabled:cursor-not-allowed">
                Continue <ChevronRight className="w-4 h-4 inline ml-1" />
              </button>
            </div>
          </div>
        )}

        {/* ─── STEP 3: Details ─── */}
        {step === "details" && (
          <div>
            <h2 className="text-2xl font-black text-black mb-2">Your Details</h2>
            <p className="text-gray-500 mb-8">Tell us about yourself and the appointment.</p>

            {/* Returning client checkbox */}
            <label className="flex items-center gap-3 mb-6 cursor-pointer">
              <div onClick={() => setIsReturning(!isReturning)}
                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors cursor-pointer ${isReturning ? "bg-[#0d9488] border-[#0d9488]" : "border-gray-300"}`}>
                {isReturning && <Check className="w-3 h-3 text-white" />}
              </div>
              <span className="text-sm font-bold text-gray-700">I'm already an Iconic client</span>
            </label>

            {/* Contact info */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Contact Information</h3>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div><label className={labelCls}>First Name *</label><input value={clientForm.firstName} onChange={e => setClientForm(f => ({...f, firstName: e.target.value}))} className={inputCls} /></div>
                <div><label className={labelCls}>Last Name</label><input value={clientForm.lastName} onChange={e => setClientForm(f => ({...f, lastName: e.target.value}))} className={inputCls} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div><label className={labelCls}>Email *</label><input type="email" value={clientForm.email} onChange={e => setClientForm(f => ({...f, email: e.target.value}))} className={inputCls} /></div>
                <div><label className={labelCls}>Phone *</label><input type="tel" value={clientForm.phone} onChange={e => setClientForm(f => ({...f, phone: e.target.value}))} className={inputCls} /></div>
              </div>
              {projectType === "business" && (
                <div><label className={labelCls}>Company / Business Name</label><input value={clientForm.company} onChange={e => setClientForm(f => ({...f, company: e.target.value}))} className={inputCls} /></div>
              )}
            </div>

            {/* Appointment */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Appointment Details</h3>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-xs text-gray-500">Requires appointment</span>
                  <div onClick={() => setNeedsAppt(!needsAppt)}
                    className={`w-10 h-6 rounded-full transition-colors relative cursor-pointer ${needsAppt ? "bg-[#0d9488]" : "bg-gray-200"}`}>
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${needsAppt ? "translate-x-4" : "translate-x-0.5"}`} />
                  </div>
                </label>
              </div>

              {needsAppt && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-2"><label className={labelCls}>Street Address *</label><input value={apptForm.street} onChange={e => setApptForm(f => ({...f, street: e.target.value}))} placeholder="123 Main Street" className={inputCls} /></div>
                    <div><label className={labelCls}>City *</label><input value={apptForm.city} onChange={e => setApptForm(f => ({...f, city: e.target.value}))} placeholder="Houston" className={inputCls} /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div><label className={labelCls}>State</label><input value={apptForm.state} onChange={e => setApptForm(f => ({...f, state: e.target.value}))} className={inputCls} /></div>
                    <div><label className={labelCls}>Zip</label><input value={apptForm.zip} onChange={e => setApptForm(f => ({...f, zip: e.target.value}))} className={inputCls} /></div>
                    <div><label className={labelCls}>Preferred Date *</label><input type="date" value={apptForm.preferredDate} onChange={e => setApptForm(f => ({...f, preferredDate: e.target.value}))} className={inputCls} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className={labelCls}>Preferred Time</label><input type="time" value={apptForm.preferredTime} onChange={e => setApptForm(f => ({...f, preferredTime: e.target.value}))} className={inputCls} /></div>
                    <div><label className={labelCls}>Access Instructions</label><input value={apptForm.accessInstructions} onChange={e => setApptForm(f => ({...f, accessInstructions: e.target.value}))} placeholder="Lockbox code, gate code..." className={inputCls} /></div>
                  </div>
                  <div><label className={labelCls}>Notes</label><textarea value={apptForm.notes} onChange={e => setApptForm(f => ({...f, notes: e.target.value}))} rows={2} placeholder="Any special requests or notes..." className={`${inputCls} resize-none`} /></div>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep("services")} className="px-6 py-3 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50">
                <ChevronLeft className="w-4 h-4 inline mr-1" /> Back
              </button>
              <button onClick={() => canProceedToReview && setStep("review")} disabled={!canProceedToReview}
                className="flex-1 px-6 py-3 bg-[#0d9488] text-white rounded-xl text-sm font-bold hover:bg-[#0f766e] disabled:opacity-50 disabled:cursor-not-allowed">
                Review Order <ChevronRight className="w-4 h-4 inline ml-1" />
              </button>
            </div>
          </div>
        )}

        {/* ─── STEP 4: Review ─── */}
        {step === "review" && (
          <div>
            <h2 className="text-2xl font-black text-black mb-2">Review Your Booking</h2>
            <p className="text-gray-500 mb-8">Please confirm everything looks correct before submitting.</p>

            <div className="space-y-4 mb-8">
              {/* Client info */}
              <div className="bg-white rounded-2xl border border-gray-100 p-6">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Contact</h3>
                <p className="font-bold text-black">{clientForm.firstName} {clientForm.lastName}</p>
                <p className="text-sm text-gray-500">{clientForm.email} &bull; {clientForm.phone}</p>
                {clientForm.company && <p className="text-sm text-gray-500">{clientForm.company}</p>}
              </div>

              {/* Appointment */}
              {needsAppt && (
                <div className="bg-white rounded-2xl border border-gray-100 p-6">
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Appointment</h3>
                  <p className="font-bold text-black">{apptForm.street}, {apptForm.city}, {apptForm.state} {apptForm.zip}</p>
                  <p className="text-sm text-gray-500">
                    {apptForm.preferredDate && new Date(apptForm.preferredDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                    {apptForm.preferredTime && ` at ${apptForm.preferredTime}`}
                  </p>
                  {apptForm.accessInstructions && <p className="text-xs text-gray-400 mt-1">Access: {apptForm.accessInstructions}</p>}
                  {apptForm.notes && <p className="text-xs text-gray-400 mt-1">Notes: {apptForm.notes}</p>}
                </div>
              )}

              {/* Services + total */}
              <div className="bg-black text-white rounded-2xl p-6">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-4">Order Summary</h3>
                {cart.map(c => (
                  <div key={c.serviceId} className="flex justify-between text-sm mb-2">
                    <span>{c.name} {c.qty > 1 ? `x${c.qty}` : ""}</span>
                    <span className="font-bold">${(c.price * c.qty).toFixed(2)}</span>
                  </div>
                ))}
                <div className="border-t border-gray-700 mt-4 pt-3 space-y-1">
                  <div className="flex justify-between text-sm"><span className="text-gray-400">Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-400">Tax</span><span>${tax.toFixed(2)}</span></div>
                  <div className="flex justify-between text-xl mt-2"><span className="font-black">Total</span><span className="font-black text-[#0d9488]">${total.toFixed(2)}</span></div>
                </div>
              </div>
            </div>

            <p className="text-xs text-gray-400 text-center mb-6">
              By submitting, you agree to our terms. This is a booking request — we'll confirm your appointment shortly via email and text.
              {!isReturning && " An Iconic account will be created for you automatically."}
            </p>

            <div className="flex gap-3">
              <button onClick={() => setStep("details")} className="px-6 py-3 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50">
                <ChevronLeft className="w-4 h-4 inline mr-1" /> Back
              </button>
              <button onClick={handleSubmit} disabled={submitting}
                className="flex-1 px-6 py-3 bg-[#0d9488] text-white rounded-xl text-sm font-black hover:bg-[#0f766e] disabled:opacity-50 uppercase tracking-widest">
                {submitting ? "Submitting..." : "Submit Booking Request"}
              </button>
            </div>
          </div>
        )}

        {/* Upsell popup */}
        {showUpsell && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
              <Sparkles className="w-10 h-10 text-[#0d9488] mx-auto mb-3" />
              <h3 className="text-lg font-black text-black mb-2">Add {showUpsell.name}?</h3>
              <p className="text-sm text-gray-500 mb-1">{showUpsell.upsellMessage || showUpsell.description}</p>
              <p className="text-2xl font-black text-[#0d9488] mb-6">+${showUpsell.price}</p>
              <div className="flex gap-3">
                <button onClick={() => setShowUpsell(null)} className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-sm font-bold text-gray-600">No Thanks</button>
                <button onClick={() => { addToCart(showUpsell); setShowUpsell(null); }}
                  className="flex-1 px-4 py-3 bg-[#0d9488] text-white rounded-xl text-sm font-bold">Add to Order</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}