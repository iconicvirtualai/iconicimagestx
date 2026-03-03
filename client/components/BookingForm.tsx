import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { 
  Check, Mail, Phone, MapPin, Maximize, Calendar as CalendarIcon, 
  ArrowRight, ArrowLeft, Sparkles, Wand2, Clock, ChevronDown, 
  ChevronUp, Zap, Video, Camera, Star, Info, MessageSquare, 
  Users, Key, HelpCircle, User, Layout, MessageCircle
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

type Step = 1 | 2 | 3 | 4 | 5 | "success";

interface Service {
  id: string;
  name: string;
  category: "listings" | "branding" | "business" | "growth";
  price: number;
  description: string;
  tagline?: string;
  isPopular?: boolean;
  phase?: 1 | 2;
  highlights?: string;
}

const services: Service[] = [
  // Listings
  { id: "listing-essentials", name: "The Essentials", category: "listings", price: 249, description: "Clean, bright, and ready to post. Perfect for quick turnarounds." },
  { id: "listing-showcase", name: "The Showcase", category: "listings", price: 549, description: "A complete visual deep-dive. We capture the details, the angles, and the atmosphere.", isPopular: true },
  { id: "listing-legacy", name: "The Legacy", category: "listings", price: 899, description: "Our highest level of care. We create a cinematic experience." },
  { id: "listing-market-leader", name: "The Market Leader", category: "listings", price: 1599, description: "Total market saturation strategy. Full-cycle media partner." },
  
  // Branding
  { id: "branding-refresh", name: "The Refresh", category: "branding", price: 349, description: "The Modern Portrait. Approachable, professional, and uniquely you." },
  { id: "branding-content-partner", name: "The Content Partner", category: "branding", price: 999, description: "30 days of content in 2 hours. Never wonder what to post again." },
  { id: "branding-local-legend", name: "The Local Legend", category: "branding", price: 2499, description: "The Market Takeover Campaign. Your Story, Told Cinematically." },
  
  // Business (Social Monopoly)
  { id: "business-baseline", name: "The Baseline", category: "business", price: 500, description: "The Professional Foundation. Establish consistency with 8 edited reels per month.", phase: 1 },
  { id: "business-growth-engine", name: "The Growth Engine", category: "business", price: 850, description: "Turning Views into Conversations. 12 edited reels with high-conversion hooks.", phase: 1 },
  { id: "business-professional-suite", name: "The Professional Suite", category: "business", price: 1500, description: "Total hands-off management for your professional presence.", phase: 2 },
  { id: "business-signature-tier", name: "The Signature Tier", category: "business", price: 2800, description: "The High-Volume Authority. Total hands-off authority.", phase: 2 },
  { id: "business-iconic-partnership", name: "The Iconic Partnership", category: "business", price: 4500, description: "Your Personal Media Agency. A full-scale media agency in your pocket.", phase: 2 },
  { id: "business-connected-core", name: "The Connected Core", category: "business", price: 2000, description: "Social + Database Penetration. Balanced social and direct-to-SOI marketing.", phase: 2, highlights: "Full Stack Email & Database Marketing" },
  { id: "business-authority-stack", name: "The Authority Stack", category: "business", price: 3200, description: "Total Audience Ownership. High-frequency content and deep SOI penetration.", phase: 2, highlights: "Full Stack Email & Database Marketing" },
  
  // Growth / Brand Strategy
  { id: "growth-foundation", name: "The Foundation", category: "growth", price: 0, description: "Essential visual assets and strategic core for a professional presence." },
  { id: "growth-evolution", name: "The Evolution", category: "growth", price: 0, description: "Cutting-edge AI integration to automate your content and reach." },
  { id: "growth-bundle", name: "The Bundle", category: "growth", price: 0, description: "Foundation + Evolution. Total brand immersion and strategic identity design." },
];

const basicsList = [
  { id: "photos-20", name: "20 Photos", price: 99 },
  { id: "photos-35", name: "35 Photos", price: 150 },
  { id: "photos-50", name: "50 Photos", price: 200 },
];

const addOns = [
  { category: "Speed & Social", items: [
    { id: "same-day", name: "Same-Day Delivery", price: 50 },
    { id: "basic-reel", name: "Basic Reel", price: 125 },
  ]},
  { category: "The Space", items: [
    { id: "aerial-drone", name: "Aerial Drone Stills", price: 99 },
    { id: "matterport-3d", name: "Matterport 3D Tour", price: 200 },
    { id: "basic-video", name: "Basic Video", price: 300 },
    { id: "aerial-premium", name: "Aerial Premium Video", price: 550 },
    { id: "floorplan-2d", name: "2D Floor Plan", price: 75 },
    { id: "amenity-addon", name: "Amenity", price: 50 },
  ]},
  { category: "The Brand", items: [
    { id: "agent-intro", name: "Agent Intro/Outro", price: 75 },
  ]}
];

const photographers = [
  "Marcus Johnson",
  "Sarah Chen",
  "Devon Torres",
  "Available (Auto-Assign)",
];

export default function BookingForm() {
  const settings = useSiteSettings();
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState<Step>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [expandedCategories, setExpandedCategories] = useState<string[]>(["listings", "business"]);
  const [showBasics, setShowBasics] = useState(false);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    address: "",
    sqft: "",
    serviceDate: undefined as Date | undefined,
    serviceTime: "9:00 AM",
    preferredPhotographer: "Available (Auto-Assign)",
    selectedService: "" as string,
    selectedBasics: [] as string[],
    selectedAddOns: [] as string[],
    premiumUpgrade: false,
    accessInfo: "Lockbox",
    lockboxCode: "",
    supraCode: "",
    propertyStatus: "Vacant", // Vacant or Occupied
    furnishingStatus: "Unfurnished", // Furnished or Unfurnished
    vibeNote: "",
    teaserMonthContent: false,
    teaserPersonalBrand: false,
    teaserSocialConsult: false,
    socialMarketingPermission: true,
  });

  // Check for pre-filled service from pricing page
  useEffect(() => {
    const serviceParam = searchParams.get("service");
    const itemsParam = searchParams.get("items");
    const premiumParam = searchParams.get("premium") === "true";

    if (serviceParam) {
      setFormData(prev => ({ 
        ...prev, 
        selectedService: serviceParam,
        premiumUpgrade: premiumParam
      }));
    }

    if (itemsParam) {
      const items = itemsParam.split(",");
      setFormData(prev => ({ 
        ...prev, 
        selectedBasics: items,
        premiumUpgrade: premiumParam
      }));
      setShowBasics(true);
    }
  }, [searchParams]);

  const updateFormData = (data: Partial<typeof formData>) => {
    setFormData(prev => ({ ...prev, ...data }));
  };

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => 
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  const toggleService = (id: string) => {
    setFormData(prev => ({
      ...prev,
      selectedService: prev.selectedService === id ? "" : id,
      selectedBasics: [] // Deselect basics if a campaign tier is chosen
    }));
  };

  const toggleAddOn = (id: string) => {
    setFormData(prev => ({
      ...prev,
      selectedAddOns: prev.selectedAddOns.includes(id)
        ? prev.selectedAddOns.filter(a => a !== id)
        : [...prev.selectedAddOns, id]
    }));
  };

  const toggleBasic = (id: string) => {
    // If it's a photo package, only one at a time
    if (id.startsWith("photos-")) {
      setFormData(prev => ({
        ...prev,
        selectedService: "", // Deselect campaign tiers if a basic is chosen
        selectedBasics: prev.selectedBasics.includes(id) 
          ? prev.selectedBasics.filter(b => b !== id) 
          : [id, ...prev.selectedBasics.filter(b => !b.startsWith("photos-"))]
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        selectedService: "",
        selectedBasics: prev.selectedBasics.includes(id)
          ? prev.selectedBasics.filter(b => b !== id)
          : [...prev.selectedBasics, id]
      }));
    }
  };

  const nextStep = () => {
    if (step === 1 && !formData.selectedService && formData.selectedBasics.length === 0) {
      toast.error("Please select a Campaign Tier or Basics package");
      return;
    }
    
    if (typeof step === 'number' && step < 5) {
      setStep((step + 1) as Step);
    }
  };

  const prevStep = () => {
    if (typeof step === 'number' && step > 1) {
      setStep((step - 1) as Step);
    }
  };

  const handleBookNow = async () => {
    setIsSubmitting(true);
    try {
      // Mock API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      setStep("success");
    } catch (error) {
      toast.error("An error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedServiceData = services.find(s => s.id === formData.selectedService);
  
  const calculateTotal = () => {
    let total = 0;
    if (selectedServiceData) total += selectedServiceData.price;
    
    formData.selectedBasics.forEach(id => {
      const b = basicsList.find(x => x.id === id);
      if (b) total += b.price;
    });

    formData.selectedAddOns.forEach(id => {
      addOns.forEach(cat => {
        const a = cat.items.find(x => x.id === id);
        if (a) total += a.price;
      });
    });

    if (formData.premiumUpgrade) total += 65;
    
    return total;
  };

  const renderSummarySidebar = () => (
    <div className="bg-white rounded-[2rem] border border-gray-100 p-6 shadow-xl sticky top-8">
      <h3 className="text-lg font-black text-black uppercase tracking-tight mb-4 pb-3 border-b">Order Summary</h3>
      <div className="space-y-3 mb-6">
        {selectedServiceData && (
          <div className="flex justify-between items-start gap-3">
            <span className="text-xs font-bold text-gray-700">{selectedServiceData.name}</span>
            <span className="text-sm font-black text-black">${selectedServiceData.price}</span>
          </div>
        )}
        {formData.selectedBasics.length > 0 && (
          <div className="space-y-1.5">
            {formData.selectedBasics.map(id => {
              const b = basicsList.find(x => x.id === id);
              return b ? (
                <div key={id} className="flex justify-between items-center text-[11px]">
                  <span className="text-gray-500">{b.name}</span>
                  <span className="font-bold text-black">${b.price}</span>
                </div>
              ) : null;
            })}
          </div>
        )}
        {formData.premiumUpgrade && (
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-gray-500 italic">✨ Iconic Finish (Premium) (Next Day Delivery)</span>
            <span className="font-bold text-black">$65</span>
          </div>
        )}
        {formData.selectedAddOns.length > 0 && (
          <div className="space-y-1.5">
             {formData.selectedAddOns.map(id => {
               let found;
               addOns.forEach(cat => {
                 const a = cat.items.find(x => x.id === id);
                 if (a) found = a;
               });
               return found ? (
                 <div key={id} className="flex justify-between items-center text-[11px]">
                   <span className="text-gray-500">{found.name}</span>
                   <span className="font-bold text-black">${found.price}</span>
                 </div>
               ) : null;
             })}
          </div>
        )}
        {formData.serviceDate && (
          <div className="pt-2 mt-2 border-t border-gray-100 flex justify-between items-center text-[11px]">
             <span className="text-gray-500 italic flex items-center gap-1.5"><CalendarIcon className="w-3 h-3" /> {format(formData.serviceDate, "PPP")}</span>
             <span className="font-bold text-black">{formData.serviceTime}</span>
          </div>
        )}
      </div>
      <div className="pt-4 border-t border-dashed border-gray-200">
        <div className="flex justify-between items-center mb-4">
          <span className="text-[10px] font-black uppercase text-gray-400">Total Estimate</span>
          <span className="text-2xl font-black text-black" style={{ color: settings.global.primaryColor }}>
            ${calculateTotal()}
          </span>
        </div>
        <p className="text-[9px] text-gray-400 font-medium italic text-center">No hidden fees. Instant transparency.</p>
      </div>
    </div>
  );

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <motion.div 
            initial={{ opacity: 0, y: 15 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: -15 }}
            className="space-y-8"
          >
            <div className="text-center space-y-3">
              <h2 className="text-2xl font-black text-black tracking-tight uppercase">Select your Campaign Tier</h2>
              <p className="text-[11px] text-gray-400 font-bold uppercase tracking-widest">Choose the level of impact for your presence</p>
            </div>

            {/* Basics Toggle */}
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-center gap-3 bg-gray-50 p-1.5 rounded-full border border-gray-100">
                 <button 
                  onClick={() => setShowBasics(false)}
                  className={`px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${!showBasics ? 'bg-black text-white' : 'text-gray-400 hover:text-black'}`}
                 >
                   Campaign Tiers
                 </button>
                 <button 
                  onClick={() => setShowBasics(true)}
                  className={`px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${showBasics ? 'bg-black text-white' : 'text-gray-400 hover:text-black'}`}
                 >
                   The Basics (Photos-Only)
                 </button>
              </div>
              <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">
                Looking for the Essentials? <span className="text-primary cursor-pointer hover:underline" style={{ color: settings.global.primaryColor }} onClick={() => setShowBasics(true)}>Click here for The Basics</span>
              </p>
            </div>

            <div className="space-y-4">
              {!showBasics ? (
                // Campaign Tiers View
                (["listings", "branding", "business", "growth"] as const).map((cat) => (
                  <div key={cat} className="space-y-3">
                    <button 
                      onClick={() => toggleCategory(cat)}
                      className="w-full flex items-center justify-between p-4 bg-white border border-gray-100 rounded-2xl hover:bg-gray-50 transition-all shadow-sm"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600">
                           {cat === "listings" && <Camera className="w-4 h-4" />}
                           {cat === "branding" && <Users className="w-4 h-4" />}
                           {cat === "business" && <Zap className="w-4 h-4" />}
                           {cat === "growth" && <Star className="w-4 h-4" />}
                        </div>
                        <h3 className="text-sm font-black uppercase tracking-widest text-black">
                          {cat === "listings" && "Listings & Spaces"}
                          {cat === "branding" && "The Human Brand"}
                          {cat === "business" && "Social Monopoly"}
                          {cat === "growth" && "Brand & Growth"}
                        </h3>
                      </div>
                      {expandedCategories.includes(cat) ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </button>

                    <AnimatePresence>
                      {expandedCategories.includes(cat) && (
                        <motion.div 
                          initial={{ height: 0, opacity: 0 }} 
                          animate={{ height: "auto", opacity: 1 }} 
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className={cat === "listings" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 p-1" : "space-y-2 p-1"}>
                            {cat === "business" && (
                              <div className="w-full">
                                <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-2 px-1">Phase 1: Establishing Foundation</p>
                              </div>
                            )}
                            {services.filter(s => s.category === cat).map((s) => (
                              <React.Fragment key={s.id}>
                                {s.highlights && (
                                  <div className="w-full col-span-full">
                                     <div className="flex items-center gap-3 my-4">
                                       <div className="h-px flex-1 bg-teal-100"></div>
                                       <span className="text-[9px] font-black uppercase tracking-[0.2em] text-teal-500 whitespace-nowrap">{s.highlights}</span>
                                       <div className="h-px flex-1 bg-teal-100"></div>
                                     </div>
                                  </div>
                                )}
                                <button
                                  onClick={() => toggleService(s.id)}
                                  className={`relative p-4 rounded-2xl border-2 transition-all text-left flex flex-col justify-between group h-full ${
                                    formData.selectedService === s.id ? 'border-black bg-white scale-[1.01] shadow-lg' : 'border-gray-100 bg-white hover:border-gray-200'
                                  } ${s.highlights ? 'border-teal-300' : ''}`}
                                >
                                  {s.isPopular && (
                                    <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest whitespace-nowrap shadow-lg">
                                      Best Value
                                    </div>
                                  )}
                                  <div className="flex-1 space-y-1">
                                    <h4 className="font-black text-black uppercase text-[11px] leading-tight">{s.name}</h4>
                                    <p className="text-[10px] text-gray-500 leading-relaxed line-clamp-2">{s.description}</p>
                                  </div>
                                  <div className="mt-3 flex items-end justify-between">
                                     <div className="text-sm font-black text-black">
                                       {s.price > 0 ? `$${s.price}` : "TBD"}
                                     </div>
                                     {formData.selectedService === s.id && (
                                       <div className="w-5 h-5 rounded-full bg-black flex items-center justify-center">
                                         <Check className="w-2.5 h-2.5 text-white stroke-[4]" />
                                       </div>
                                     )}
                                  </div>
                                </button>
                                {s.id === "business-growth-engine" && (
                                  <div className="w-full col-span-full mt-6">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-2 px-1">Phase 2: Scaling Authority</p>
                                  </div>
                                )}
                              </React.Fragment>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))
              ) : (
                // Basics View
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                   {basicsList.map((b) => (
                     <button
                      key={b.id}
                      onClick={() => toggleBasic(b.id)}
                      className={`p-6 rounded-2xl border-2 transition-all text-left flex justify-between items-center bg-white ${
                        formData.selectedBasics.includes(b.id) ? 'border-black bg-white scale-[1.01] shadow-lg' : 'border-gray-100 bg-white hover:border-gray-200'
                      }`}
                     >
                       <div className="space-y-0.5">
                          <h4 className="font-black text-black uppercase text-sm">{b.name}</h4>
                       </div>
                       <div className="flex items-center gap-3">
                          <span className="text-sm font-black text-black">${b.price}</span>
                          {formData.selectedBasics.includes(b.id) && (
                            <div className="w-5 h-5 rounded-full bg-black flex items-center justify-center">
                              <Check className="w-2.5 h-2.5 text-white stroke-[4]" />
                            </div>
                          )}
                       </div>
                     </button>
                   ))}
                </div>
              )}
            </div>
          </motion.div>
        );

      case 2:
        return (
          <motion.div 
            initial={{ opacity: 0, x: 20 }} 
            animate={{ opacity: 1, x: 0 }} 
            className="space-y-10"
          >
            {/* Iconic Upgrade Section */}
            {selectedServiceData && selectedServiceData.id !== "listing-market-leader" && (
              <div className="bg-black rounded-[2rem] p-8 text-white relative overflow-hidden">
                 <div className="absolute top-0 right-0 p-8 opacity-10">
                    <Sparkles className="w-24 h-24" />
                 </div>
                 <div className="relative z-10 space-y-4">
                    <h2 className="text-xl font-black uppercase tracking-tight">✨ Level up to the "Iconic" Finish? (Next Day Delivery)</h2>
                    <div 
                      onClick={() => updateFormData({ premiumUpgrade: !formData.premiumUpgrade })}
                      className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex items-center gap-4 ${formData.premiumUpgrade ? 'border-teal-400 bg-teal-900/20' : 'border-gray-800 bg-gray-900/50 hover:border-gray-600'}`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${formData.premiumUpgrade ? 'bg-teal-400 text-black' : 'bg-gray-800 text-gray-500'}`}>
                         {formData.premiumUpgrade ? <Check className="w-5 h-5 stroke-[3]" /> : <Star className="w-4 h-4" />}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-0.5">
                           <span className="text-[13px] font-black uppercase tracking-widest">Yes, Add Premium Editing (Next Day Delivery)</span>
                           <span className="text-sm font-black text-teal-400">+$65</span>
                        </div>
                        <p className="text-[10px] text-gray-400 leading-relaxed">
                          Includes full digital curb appeal, grass, fire, tvs, clean driveways, and more.
                        </p>
                      </div>
                    </div>
                 </div>
              </div>
            )}

            {/* Strategic Add-ons Section */}
            <div className="space-y-8">
              <div className="text-center space-y-1.5">
                 <h3 className="text-xl font-black uppercase text-black">The Strategic Add-ons</h3>
                 <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Don't forget the details that convert</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {addOns.map((cat) => (
                  <div key={cat.category} className="space-y-4">
                    <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-400 border-b pb-1.5">{cat.category}</h4>
                    <div className="space-y-2">
                      {cat.items.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => toggleAddOn(item.id)}
                          className={`w-full p-3 rounded-xl border-2 text-left transition-all flex justify-between items-center group ${
                            formData.selectedAddOns.includes(item.id) ? 'border-black bg-white shadow-md' : 'border-gray-50 bg-white hover:border-gray-200'
                          }`}
                        >
                          <div className="flex flex-col">
                             <span className="text-[10px] font-black uppercase text-black">{item.name}</span>
                             <span className="text-[9px] font-bold" style={{ color: settings.global.primaryColor }}>+${item.price}</span>
                          </div>
                          {formData.selectedAddOns.includes(item.id) && (
                            <div className="w-3.5 h-3.5 rounded-full bg-black flex items-center justify-center">
                              <Check className="w-2 h-2 text-white stroke-[4]" />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        );

      case 3:
        return (
          <motion.div 
            initial={{ opacity: 0, x: 20 }} 
            animate={{ opacity: 1, x: 0 }} 
            className="space-y-10"
          >
            <div className="text-center space-y-1.5">
               <h3 className="text-2xl font-black uppercase text-black tracking-tight">The "Hassle-Free" Details</h3>
               <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Let's make this production seamless</p>
            </div>

            <div className="space-y-6">
               <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-2">
                    <MapPin className="w-3 h-3" /> Property Address
                  </label>
                  <Input 
                    type="text" 
                    placeholder="123 Luxury Lane, Houston, TX"
                    className="h-14 rounded-xl border-gray-100 focus:border-black text-[15px] px-5"
                    value={formData.address}
                    onChange={(e) => updateFormData({ address: e.target.value })}
                  />
               </div>

               <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-2">
                      <Maximize className="w-3 h-3" /> Square Footage
                    </label>
                    <Input 
                      type="number" 
                      placeholder="2500"
                      className="h-14 rounded-xl border-gray-100 focus:border-black text-[15px] px-5"
                      value={formData.sqft}
                      onChange={(e) => updateFormData({ sqft: e.target.value })}
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-2">
                      <Key className="w-3 h-3" /> Access Method
                    </label>
                    <div className="flex gap-1.5">
                      {["Lockbox", "Supra", "Agent Meets"].map((access) => (
                        <button
                          key={access}
                          onClick={() => updateFormData({ accessInfo: access })}
                          className={`flex-1 py-3.5 rounded-lg text-[9px] font-black uppercase tracking-widest border-2 transition-all ${
                            formData.accessInfo === access ? 'border-black bg-black text-white' : 'border-gray-100 bg-white text-gray-400'
                          }`}
                        >
                          {access}
                        </button>
                      ))}
                    </div>
                  </div>
               </div>

               {/* Conditional Access Fields */}
               <AnimatePresence mode="wait">
                 {formData.accessInfo === "Lockbox" && (
                   <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-3 overflow-hidden">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Lockbox Code</label>
                      <Input 
                        placeholder="Enter Code"
                        className="h-12 rounded-xl border-gray-100 focus:border-black text-sm px-5 bg-gray-50/50"
                        value={formData.lockboxCode}
                        onChange={(e) => updateFormData({ lockboxCode: e.target.value })}
                      />
                   </motion.div>
                 )}
                 {formData.accessInfo === "Supra" && (
                   <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-3 overflow-hidden">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">CBS or Shackle Code?</label>
                      <Input 
                        placeholder="Enter Code or Notes"
                        className="h-12 rounded-xl border-gray-100 focus:border-black text-sm px-5 bg-gray-50/50"
                        value={formData.supraCode}
                        onChange={(e) => updateFormData({ supraCode: e.target.value })}
                      />
                   </motion.div>
                 )}
               </AnimatePresence>

               {/* Property Status Options */}
               <div className="grid grid-cols-2 gap-6 pt-2">
                 <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Property Status</label>
                    <div className="flex gap-1.5">
                      {["Vacant", "Occupied"].map((status) => (
                        <button
                          key={status}
                          onClick={() => updateFormData({ propertyStatus: status })}
                          className={`flex-1 py-3 rounded-lg text-[9px] font-black uppercase tracking-widest border-2 transition-all ${
                            formData.propertyStatus === status ? 'border-black bg-gray-50' : 'border-gray-50 bg-white text-gray-400'
                          }`}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                 </div>
                 <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Furnishing</label>
                    <div className="flex gap-1.5">
                      {["Furnished", "Unfurnished"].map((status) => (
                        <button
                          key={status}
                          onClick={() => updateFormData({ furnishingStatus: status })}
                          className={`flex-1 py-3 rounded-lg text-[9px] font-black uppercase tracking-widest border-2 transition-all ${
                            formData.furnishingStatus === status ? 'border-black bg-gray-50' : 'border-gray-50 bg-white text-gray-400'
                          }`}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                 </div>
               </div>

               <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-2">
                    <MessageSquare className="w-3 h-3" /> The "Vibe" Note
                  </label>
                  <textarea 
                    placeholder="Anything special we should highlight? (The view, the kitchen, the hidden wine cellar?)"
                    className="w-full h-24 rounded-xl border-2 border-gray-100 focus:border-black text-xs p-4 resize-none transition-all outline-none"
                    value={formData.vibeNote}
                    onChange={(e) => updateFormData({ vibeNote: e.target.value })}
                  />
               </div>
            </div>
          </motion.div>
        );

      case 4:
        return (
          <motion.div 
            initial={{ opacity: 0, x: 20 }} 
            animate={{ opacity: 1, x: 0 }} 
            className="space-y-10"
          >
             <div className="text-center space-y-1.5">
               <h3 className="text-2xl font-black uppercase text-black tracking-tight">Scheduling</h3>
               <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Reserve your iconic launch date (CST Timezone)</p>
            </div>

            <div className="space-y-10">
               <div className="bg-white p-10 rounded-[3rem] border border-gray-50 shadow-lg overflow-hidden flex justify-center w-full max-w-2xl mx-auto">
                  <Calendar
                    mode="single"
                    numberOfMonths={1}
                    weekStartsOn={1}
                    selected={formData.serviceDate}
                    onSelect={(date) => updateFormData({ serviceDate: date })}
                    className="w-full"
                    disabled={(date) => date < new Date(new Date().setHours(0,0,0,0))}
                  />
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-2">
                      <Clock className="w-3 h-3" /> Preferred Time (CST)
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {["9:00 AM", "11:00 AM", "1:00 PM", "3:00 PM", "5:00 PM"].map((t) => (
                        <button
                          key={t}
                          onClick={() => updateFormData({ serviceTime: t })}
                          className={`py-3 rounded-lg text-xs font-black border-2 transition-all ${
                            formData.serviceTime === t ? 'border-black bg-black text-white' : 'border-gray-50 bg-white text-gray-400'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-2">
                      <Users className="w-3 h-3" /> Preferred Photographer
                    </label>
                    <div className="space-y-1.5">
                      {photographers.map((p) => (
                        <button
                          key={p}
                          onClick={() => updateFormData({ preferredPhotographer: p })}
                          className={`w-full p-3 rounded-lg text-[10px] font-bold text-left border-2 transition-all flex items-center justify-between ${
                            formData.preferredPhotographer === p ? 'border-black bg-gray-50' : 'border-gray-50 bg-white'
                          }`}
                        >
                          {p}
                          {formData.preferredPhotographer === p && <Check className="w-3.5 h-3.5" />}
                        </button>
                      ))}
                    </div>
                  </div>
               </div>
            </div>
          </motion.div>
        );

      case 5:
        return (
          <motion.div 
            initial={{ opacity: 0, x: 20 }} 
            animate={{ opacity: 1, x: 0 }} 
            className="space-y-10"
          >
            <div className="text-center space-y-1.5">
               <h3 className="text-2xl font-black uppercase text-black tracking-tight">Secure Your Iconic Launch</h3>
               <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Complete your production request</p>
            </div>

            <div className="space-y-8 max-w-lg mx-auto">
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">First Name</label>
                    <Input 
                      placeholder="John"
                      className="h-14 rounded-xl border-2 focus:border-black px-5"
                      value={formData.firstName}
                      onChange={(e) => updateFormData({ firstName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Last Name</label>
                    <Input 
                      placeholder="Doe"
                      className="h-14 rounded-xl border-2 focus:border-black px-5"
                      value={formData.lastName}
                      onChange={(e) => updateFormData({ lastName: e.target.value })}
                    />
                  </div>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Email Address</label>
                    <Input 
                      type="email"
                      placeholder="john@example.com"
                      className="h-14 rounded-xl border-2 focus:border-black px-5"
                      value={formData.email}
                      onChange={(e) => updateFormData({ email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Phone Number</label>
                    <Input 
                      type="tel"
                      placeholder="(555) 000-0000"
                      className="h-14 rounded-xl border-2 focus:border-black px-5"
                      value={formData.phone}
                      onChange={(e) => updateFormData({ phone: e.target.value })}
                    />
                  </div>
               </div>

               {/* Marketing Permission Toggle */}
               <div className="bg-gray-50 p-6 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between">
                     <div className="space-y-0.5">
                        <h4 className="text-[11px] font-black uppercase tracking-widest text-black">Marketing Permission</h4>
                        <p className="text-[9px] text-gray-500 leading-relaxed max-w-[280px]">I give permission for Iconic Images to market my listing via social media and other online channels.</p>
                     </div>
                     <div 
                      onClick={() => updateFormData({ socialMarketingPermission: !formData.socialMarketingPermission })}
                      className={`w-12 h-6 rounded-full relative transition-all cursor-pointer ${formData.socialMarketingPermission ? 'bg-black' : 'bg-gray-200'}`}
                     >
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${formData.socialMarketingPermission ? 'left-7' : 'left-1'}`}></div>
                     </div>
                  </div>
               </div>

               {/* Teaser Section */}
               <div className="space-y-4 pt-6">
                  <div className="space-y-3">
                     {[
                       { id: "teaserMonthContent", label: "I want to turn this listing into a month of content." },
                       { id: "teaserPersonalBrand", label: "I need to update my personal brand. (Add a \"Refresh\" or \"Content Partner\" session to this shoot)" },
                       { id: "teaserSocialConsult", label: "I’m interested in having Iconic manage my social media. (Free consultation)" },
                     ].map((t) => (
                       <label key={t.id} className="flex items-center gap-3 cursor-pointer group">
                          <div 
                            onClick={() => updateFormData({ [t.id]: !formData[t.id as keyof typeof formData] })}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all flex-shrink-0 ${formData[t.id as keyof typeof formData] ? 'border-black bg-black' : 'border-gray-200 bg-white'}`}
                          >
                             {formData[t.id as keyof typeof formData] && <Check className="w-3 h-3 text-white stroke-[4]" />}
                          </div>
                          <span className="text-[10px] font-bold text-gray-600 group-hover:text-black transition-colors">{t.label}</span>
                       </label>
                     ))}
                  </div>
               </div>
            </div>
          </motion.div>
        );

      case "success":
        return (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }} 
            animate={{ opacity: 1, scale: 1 }} 
            className="text-center space-y-8 py-16"
          >
            <div className="relative mx-auto w-28 h-28">
               <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", damping: 12, stiffness: 200 }}
                className="w-full h-full rounded-[2rem] bg-black flex items-center justify-center relative z-10 shadow-xl"
               >
                 <Check className="w-12 h-12 stroke-[3] text-white" />
               </motion.div>
               <motion.div
                animate={{
                  scale: [1, 1.3, 1],
                  opacity: [0.4, 0, 0.4]
                }}
                transition={{ repeat: Infinity, duration: 3 }}
                className="absolute inset-0 rounded-full blur-2xl bg-black/5"
               ></motion.div>
            </div>
            <div className="space-y-3">
              <h2 className="text-4xl font-black tracking-tight uppercase text-black">You're in.</h2>
              <p className="text-gray-500 font-medium max-w-sm mx-auto leading-relaxed text-sm">
                We're sharpening the lenses and checking the weather. Expect a confirmation text shortly.
              </p>
            </div>
            <Button asChild className="bg-black hover:bg-gray-800 text-white font-black px-10 py-6 text-sm rounded-2xl transition-all shadow-xl hover:scale-105 active:scale-95">
              <a href="/">Back to Dashboard</a>
            </Button>
          </motion.div>
        );
    }
  };

  if (step === "success") {
    return (
      <div className="max-w-2xl mx-auto px-4">
        {renderStep()}
      </div>
    );
  }

  return (
    <div className="max-w-[1300px] mx-auto px-4 py-8">
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Main Form Area */}
        <div className="flex-1 space-y-8">
           {/* Progress Steps */}
           <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex-1 h-1.5 rounded-full transition-all duration-700 bg-gray-100 relative overflow-hidden">
                   <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: (step as number) >= i ? "100%" : "0%" }}
                    className="absolute inset-0 bg-black"
                   />
                </div>
              ))}
           </div>

           <div className="min-h-[550px] bg-white rounded-[3rem] border border-gray-50 p-10 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 p-10 opacity-[0.01] pointer-events-none">
                 <Sparkles className="w-80 h-80" />
              </div>
              <AnimatePresence mode="wait">
                {renderStep()}
              </AnimatePresence>
           </div>

           <div className="flex gap-4">
              {step > 1 && (
                <Button 
                  variant="outline" 
                  onClick={prevStep}
                  className="h-16 px-8 rounded-2xl border-gray-100 bg-white text-gray-500 font-black uppercase tracking-widest text-[10px] hover:bg-gray-50 transition-all group"
                >
                  <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform mr-2" /> Back
                </Button>
              )}
              {step < 5 ? (
                <Button 
                  onClick={nextStep}
                  className="flex-1 h-16 bg-black hover:bg-gray-800 text-white font-black uppercase tracking-[0.15em] text-[11px] rounded-2xl shadow-xl transition-all hover:scale-[1.005] group"
                >
                  Next Stage <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform ml-2" />
                </Button>
              ) : (
                <Button 
                  onClick={handleBookNow}
                  disabled={isSubmitting}
                  className="flex-1 h-16 bg-black hover:bg-gray-900 text-white font-black uppercase tracking-[0.15em] text-[11px] rounded-2xl shadow-xl transition-all hover:scale-[1.005] group"
                  style={{ backgroundColor: settings.global.primaryColor }}
                >
                  {isSubmitting ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Processing...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4" /> BOOK MY CAMPAIGN
                    </div>
                  )}
                </Button>
              )}
           </div>
        </div>

        {/* Sidebar Summary Area */}
        <div className="w-full lg:w-[350px]">
           {renderSummarySidebar()}
           <div className="mt-6 p-6 bg-black rounded-[2rem] text-white space-y-4">
              <div className="flex items-center gap-2.5">
                 <HelpCircle className="w-4 h-4 text-teal-400" />
                 <h4 className="font-black uppercase tracking-widest text-[11px]">Need help?</h4>
              </div>
              <p className="text-[10px] text-gray-400 leading-relaxed font-medium">
                Our production team is standing by to help you choose the perfect tier.
              </p>
              <div className="pt-3 border-t border-gray-800 space-y-3">
                 <a 
                  href="https://voice.google.com/u/0/messages" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 group"
                 >
                    <div className="w-8 h-8 rounded-lg bg-teal-400/10 flex items-center justify-center text-teal-400 group-hover:bg-teal-400 group-hover:text-black transition-all">
                       <MessageCircle className="w-4 h-4" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest group-hover:text-teal-400 transition-colors">Chat Support</span>
                 </a>
                 <p className="text-sm font-black text-teal-400">(281) 555-ICON</p>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}
