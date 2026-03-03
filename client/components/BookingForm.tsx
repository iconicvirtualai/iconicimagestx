import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Check, Mail, Phone, MapPin, Maximize, Calendar as CalendarIcon, ArrowRight, ArrowLeft, Sparkles, Wand2, Clock } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

type Step = 1 | 2 | 3 | 4 | 5 | "success";

interface Service {
  id: string;
  name: string;
  category: "listings" | "branding" | "business" | "growth";
  price: number;
  description: string;
}

const services: Service[] = [
  // Listings
  { id: "listing-essentials", name: "The Essentials", category: "listings", price: 249, description: "Clean, bright, and ready to post. Perfect for quick turnarounds." },
  { id: "listing-showcase", name: "The Showcase", category: "listings", price: 549, description: "A complete visual deep-dive. We capture the details, the angles, and the atmosphere." },
  { id: "listing-legacy", name: "The Legacy", category: "listings", price: 899, description: "Our highest level of care. We create a cinematic experience." },
  { id: "listing-market-leader", name: "The Market Leader", category: "listings", price: 1599, description: "Total market saturation strategy. Full-cycle media partner." },
  
  // Branding
  { id: "branding-refresh", name: "The Refresh", category: "branding", price: 349, description: "The Modern Portrait. Approachable, professional, and uniquely you." },
  { id: "branding-content-partner", name: "The Content Partner", category: "branding", price: 999, description: "30 days of content in 2 hours. Never wonder what to post again." },
  { id: "branding-local-legend", name: "The Local Legend", category: "branding", price: 2499, description: "The Market Takeover Campaign. Your Story, Told Cinematically." },
  
  // Business (Social Monopoly)
  { id: "business-baseline", name: "The Baseline", category: "business", price: 500, description: "The Professional Foundation. Establish consistency with 8 edited reels per month." },
  { id: "business-growth-engine", name: "The Growth Engine", category: "business", price: 850, description: "Turning Views into Conversations. 12 edited reels with high-conversion hooks." },
  { id: "business-professional-suite", name: "The Professional Suite", category: "business", price: 1500, description: "Total hands-off management for your professional presence." },
  { id: "business-signature-tier", name: "The Signature Tier", category: "business", price: 2800, description: "The High-Volume Authority. Total hands-off authority." },
  { id: "business-iconic-partnership", name: "The Iconic Partnership", category: "business", price: 4500, description: "Your Personal Media Agency. A full-scale media agency in your pocket." },
  { id: "business-connected-core", name: "The Connected Core", category: "business", price: 2000, description: "Social + Database Penetration. Balanced social and direct-to-SOI marketing." },
  { id: "business-authority-stack", name: "The Authority Stack", category: "business", price: 3200, description: "Total Audience Ownership. High-frequency content and deep SOI penetration." },
  
  // Growth / Brand Strategy
  { id: "growth-foundation", name: "The Foundation", category: "growth", price: 0, description: "Essential visual assets and strategic core for a professional presence." },
  { id: "growth-evolution", name: "The Evolution", category: "growth", price: 0, description: "Cutting-edge AI integration to automate your content and reach." },
  { id: "growth-bundle", name: "The Bundle", category: "growth", price: 0, description: "Foundation + Evolution. Total brand immersion and strategic identity design." },
];

const basicServices = [
  { id: "photos-20", name: "20 Photos", price: 99 },
  { id: "photos-35", name: "35 Photos", price: 150 },
  { id: "photos-50", name: "50 Photos", price: 200 },
  { id: "aerial-addon", name: "Aerial Add-On", price: 99 },
  { id: "reel-addon", name: "Reel Add-On", price: 125 },
  { id: "video-addon", name: "Video Add-On", price: 350 },
  { id: "matterport", name: "3D Matterport", price: 200 },
  { id: "floorplan-addon", name: "2D Floorplan Add-On", price: 99 },
  { id: "amenity-addon", name: "Amenity Add-On", price: 50 },
];

const photographers = [
  "Marcus Johnson",
  "Sarah Chen",
  "Devon Torres",
  "Available (Auto-Assign)",
];

export default function BookingForm() {
  const settings = useSiteSettings();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState<Step>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    address: "",
    sqft: "",
    serviceDate: undefined as Date | undefined,
    serviceTime: "09:00",
    preferredPhotographer: "Available (Auto-Assign)",
    selectedService: "" as string,
    selectedBasics: [] as string[],
    premiumUpgrade: false,
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
      // If service is pre-selected, skip to step 2 (contact info)
      setStep(2);
    }

    if (itemsParam) {
      const items = itemsParam.split(",");
      setFormData(prev => ({ 
        ...prev, 
        selectedBasics: items,
        premiumUpgrade: premiumParam
      }));
      setStep(2);
    }
  }, [searchParams]);

  const updateFormData = (data: Partial<typeof formData>) => {
    setFormData(prev => ({ ...prev, ...data }));
  };

  const toggleBasic = (id: string) => {
    setFormData(prev => ({
      ...prev,
      selectedBasics: prev.selectedBasics.includes(id)
        ? prev.selectedBasics.filter(b => b !== id)
        : [...prev.selectedBasics, b => id]
    }));
  };

  const nextStep = () => {
    // Validation
    if (step === 1 && !formData.selectedService && formData.selectedBasics.length === 0) {
      toast.error("Please select a service");
      return;
    }
    if (step === 2 && (!formData.firstName || !formData.email || !formData.phone)) {
      toast.error("Please fill in all contact details");
      return;
    }
    if (step === 3 && (!formData.address || !formData.sqft)) {
      toast.error("Please fill in property details");
      return;
    }
    if (step === 4 && !formData.serviceDate) {
      toast.error("Please select a date");
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
    if (!formData.selectedService && formData.selectedBasics.length === 0) {
      toast.error("Please select a service");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setStep("success");
      } else {
        toast.error("Failed to submit booking. Please try again.");
      }
    } catch (error) {
      toast.error("An error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedServiceData = services.find(s => s.id === formData.selectedService);
  const categoryServices = (category: string) => services.filter(s => s.category === category);

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <motion.div 
            initial={{ opacity: 0, x: 20 }} 
            animate={{ opacity: 1, x: 0 }} 
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="space-y-4 text-center mb-8">
              <h2 className="text-3xl font-black text-black tracking-tight uppercase">Choose Your Service</h2>
              <p className="text-gray-400 font-bold text-xs uppercase tracking-widest">What brings you here?</p>
            </div>

            <div className="space-y-8">
              {(["listings", "branding", "business", "growth"] as const).map((category) => (
                <div key={category}>
                  <h3 className="text-lg font-black uppercase tracking-widest mb-4 pb-2 border-b border-gray-100" style={{ color: settings.global.primaryColor }}>
                    {category === "listings" && "Listings & Spaces"}
                    {category === "branding" && "The Human Brand"}
                    {category === "business" && "Social Monopoly"}
                    {category === "growth" && "Brand & Growth"}
                  </h3>
                  <div className="grid grid-cols-1 gap-3">
                    {categoryServices(category).map((service) => (
                      <button
                        key={service.id}
                        onClick={() => updateFormData({ selectedService: service.id })}
                        className="p-4 rounded-2xl border-2 transition-all text-left flex justify-between items-start group"
                        style={{
                          borderColor: formData.selectedService === service.id ? settings.global.primaryColor : '#f3f4f6',
                          backgroundColor: formData.selectedService === service.id ? `${settings.global.primaryColor}05` : 'white',
                        }}
                      >
                        <div className="flex-1">
                          <h4 className="font-black text-black uppercase">{service.name}</h4>
                          <p className="text-xs text-gray-500 leading-tight mt-1">{service.description}</p>
                        </div>
                        <div className="text-right ml-4 flex-shrink-0">
                          {service.price > 0 && <div className="font-black text-black">${service.price}</div>}
                          {formData.selectedService === service.id && (
                            <div className="w-5 h-5 rounded-full flex items-center justify-center mt-2" style={{ backgroundColor: settings.global.primaryColor }}>
                              <Check className="w-3 h-3 stroke-[3] text-white" />
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        );

      case 2:
        return (
          <motion.div 
            initial={{ opacity: 0, x: 20 }} 
            animate={{ opacity: 1, x: 0 }} 
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="space-y-4 text-center mb-8">
              <h2 className="text-3xl font-black text-black tracking-tight uppercase">Contact Info</h2>
              <p className="text-gray-400 font-bold text-xs uppercase tracking-widest">How can we reach you?</p>
            </div>
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">First Name</label>
                  <Input 
                    type="text" 
                    placeholder="John"
                    className="h-14 rounded-2xl border-gray-100 bg-gray-50/50 focus:border-primary text-lg px-6"
                    value={formData.firstName}
                    onChange={(e) => updateFormData({ firstName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Last Name</label>
                  <Input 
                    type="text" 
                    placeholder="Doe"
                    className="h-14 rounded-2xl border-gray-100 bg-gray-50/50 focus:border-primary text-lg px-6"
                    value={formData.lastName}
                    onChange={(e) => updateFormData({ lastName: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                  <Mail className="w-3 h-3" /> Email Address
                </label>
                <Input 
                  type="email" 
                  placeholder="name@example.com"
                  className="h-14 rounded-2xl border-gray-100 bg-gray-50/50 focus:border-primary text-lg px-6"
                  value={formData.email}
                  onChange={(e) => updateFormData({ email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                  <Phone className="w-3 h-3" /> Phone Number
                </label>
                <Input 
                  type="tel" 
                  placeholder="(555) 000-0000"
                  className="h-14 rounded-2xl border-gray-100 bg-gray-50/50 focus:border-primary text-lg px-6"
                  value={formData.phone}
                  onChange={(e) => updateFormData({ phone: e.target.value })}
                />
              </div>
            </div>
          </motion.div>
        );

      case 3:
        return (
          <motion.div 
            initial={{ opacity: 0, x: 20 }} 
            animate={{ opacity: 1, x: 0 }} 
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="space-y-4 text-center mb-8">
              <h2 className="text-3xl font-black text-black tracking-tight uppercase">Service Address</h2>
              <p className="text-gray-400 font-bold text-xs uppercase tracking-widest">Where will the shoot take place?</p>
            </div>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                  <MapPin className="w-3 h-3" /> Property Address
                </label>
                <Input 
                  type="text" 
                  placeholder="123 Luxury Lane, The Woodlands, TX"
                  className="h-14 rounded-2xl border-gray-100 bg-gray-50/50 focus:border-primary text-lg px-6"
                  value={formData.address}
                  onChange={(e) => updateFormData({ address: e.target.value })}
                />
                <p className="text-[10px] text-gray-400 italic">Google Maps autocomplete powered</p>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                  <Maximize className="w-3 h-3" /> Square Footage
                </label>
                <Input 
                  type="number" 
                  placeholder="2500"
                  className="h-14 rounded-2xl border-gray-100 bg-gray-50/50 focus:border-primary text-lg px-6"
                  value={formData.sqft}
                  onChange={(e) => updateFormData({ sqft: e.target.value })}
                />
                <p className="text-[10px] text-gray-400 italic">Auto-populated from address lookup</p>
              </div>
            </div>
          </motion.div>
        );

      case 4:
        return (
          <motion.div 
            initial={{ opacity: 0, x: 20 }} 
            animate={{ opacity: 1, x: 0 }} 
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="space-y-4 text-center mb-8">
              <h2 className="text-3xl font-black text-black tracking-tight uppercase">Preferred Date & Time</h2>
              <p className="text-gray-400 font-bold text-xs uppercase tracking-widest">When should we arrive?</p>
            </div>
            <div className="flex flex-col items-center gap-6">
              <div className="bg-white p-4 rounded-[2.5rem] border border-gray-100 shadow-xl w-full">
                <Calendar
                  mode="single"
                  selected={formData.serviceDate}
                  onSelect={(date) => updateFormData({ serviceDate: date })}
                  className="rounded-3xl"
                  disabled={(date) => date < new Date(new Date().setHours(0,0,0,0))}
                />
              </div>
              <div className="w-full space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                  <Clock className="w-3 h-3" /> Preferred Time
                </label>
                <Input 
                  type="time" 
                  className="h-14 rounded-2xl border-gray-100 bg-gray-50/50 focus:border-primary text-lg px-6"
                  value={formData.serviceTime}
                  onChange={(e) => updateFormData({ serviceTime: e.target.value })}
                />
              </div>
              {formData.serviceDate && (
                <p className="text-sm font-bold bg-white px-6 py-2 rounded-full border animate-in zoom-in" style={{ color: settings.global.primaryColor, borderColor: `${settings.global.primaryColor}33`, backgroundColor: `${settings.global.primaryColor}10` }}>
                  Selected: {format(formData.serviceDate, "EEEE, MMMM do, yyyy")} at {formData.serviceTime}
                </p>
              )}
            </div>
          </motion.div>
        );

      case 5:
        return (
          <motion.div 
            initial={{ opacity: 0, x: 20 }} 
            animate={{ opacity: 1, x: 0 }} 
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="space-y-4 text-center mb-8">
              <h2 className="text-3xl font-black text-black tracking-tight uppercase">Final Details</h2>
              <p className="text-gray-400 font-bold text-xs uppercase tracking-widest">Complete your order</p>
            </div>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Preferred Photographer</label>
                <div className="space-y-2">
                  {photographers.map((photographer) => (
                    <button
                      key={photographer}
                      onClick={() => updateFormData({ preferredPhotographer: photographer })}
                      className="w-full p-4 rounded-2xl border-2 transition-all text-left font-bold"
                      style={{
                        borderColor: formData.preferredPhotographer === photographer ? settings.global.primaryColor : '#f3f4f6',
                        backgroundColor: formData.preferredPhotographer === photographer ? `${settings.global.primaryColor}05` : 'white',
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span>{photographer}</span>
                        {formData.preferredPhotographer === photographer && (
                          <Check className="w-4 h-4" style={{ color: settings.global.primaryColor }} />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Service Summary */}
              <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
                <h4 className="font-black text-black uppercase mb-4">Order Summary</h4>
                <div className="space-y-3">
                  {selectedServiceData && (
                    <div className="flex justify-between items-center pb-3 border-b border-gray-200">
                      <span className="font-bold text-gray-700">{selectedServiceData.name}</span>
                      <span className="font-black text-black">${selectedServiceData.price}</span>
                    </div>
                  )}
                  {formData.selectedBasics.length > 0 && (
                    <>
                      {formData.selectedBasics.map(basicId => {
                        const basic = basicServices.find(b => b.id === basicId);
                        return basic ? (
                          <div key={basicId} className="flex justify-between items-center text-sm">
                            <span className="text-gray-700">{basic.name}</span>
                            <span className="font-bold text-black">${basic.price}</span>
                          </div>
                        ) : null;
                      })}
                    </>
                  )}
                  {formData.premiumUpgrade && (
                    <div className="flex justify-between items-center border-t border-gray-200 pt-3">
                      <span className="font-bold text-gray-700">Premium Editing Upgrade</span>
                      <span className="font-black text-black">$65</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        );

      case "success":
        return (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }} 
            animate={{ opacity: 1, scale: 1 }} 
            className="text-center space-y-8 py-12"
          >
            <div className="relative mx-auto w-24 h-24">
               <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", damping: 12, stiffness: 200 }}
                className="w-full h-full rounded-[2rem] border flex items-center justify-center relative z-10"
                style={{ backgroundColor: `${settings.global.primaryColor}10`, borderColor: `${settings.global.primaryColor}20` }}
               >
                 <Check className="w-12 h-12 stroke-[3]" style={{ color: settings.global.primaryColor }} />
               </motion.div>
               <motion.div
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [0.5, 0.2, 0.5]
                }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="absolute inset-0 rounded-full blur-2xl"
                style={{ backgroundColor: `${settings.global.primaryColor}15` }}
               ></motion.div>
            </div>
            <div className="space-y-4">
              <h2 className="text-4xl font-black tracking-tight uppercase" style={{ color: settings.global.primaryColor }}>Order Received!</h2>
              <p className="text-gray-500 font-medium max-w-sm mx-auto leading-relaxed">
                Check your email for your confirmation. Our team will contact you shortly to finalize details and confirm your appointment.
              </p>
            </div>
            <Button asChild className="bg-black hover:bg-gray-800 text-white font-bold px-10 py-6 rounded-2xl transition-all shadow-xl">
              <a href="/">Return Home</a>
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

  const progressSteps = [1, 2, 3, 4, 5];

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Progress Bar */}
      <div className="flex gap-2 mb-12">
        {progressSteps.map((i) => (
          <div
            key={i}
            className="h-1.5 flex-1 rounded-full transition-all duration-500"
            style={{
              backgroundColor: (step as number) >= i ? settings.global.primaryColor : '#f3f4f6',
              boxShadow: (step as number) >= i ? `0 0 10px ${settings.global.primaryColor}33` : 'none'
            }}
          ></div>
        ))}
      </div>

      <div className="min-h-[500px]">
        <AnimatePresence mode="wait">
          {renderStep()}
        </AnimatePresence>
      </div>

      <div className="mt-12 flex gap-4">
        {step > 1 && (
          <Button 
            variant="outline" 
            onClick={prevStep}
            className="flex-1 h-16 rounded-2xl border-gray-100 bg-white text-gray-500 font-bold hover:bg-gray-50 hover:text-black transition-all group"
          >
            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" /> Back
          </Button>
        )}
        {step < 5 ? (
          <Button 
            onClick={nextStep}
            className="flex-[2] h-16 bg-black hover:bg-gray-800 text-white font-bold rounded-2xl shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98] group"
          >
            Next Step <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Button>
        ) : (
          <Button 
            onClick={handleBookNow}
            disabled={isSubmitting}
            className="flex-[2] h-16 bg-primary hover:opacity-90 text-white font-black rounded-2xl shadow-xl shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98] group"
            style={{ backgroundColor: settings.global.primaryColor }}
          >
            {isSubmitting ? (
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Processing...
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5" /> Complete Order
              </div>
            )}
          </Button>
        )}
      </div>

      <div className="mt-8 text-center">
        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em] flex items-center justify-center gap-2">
           <Lock className="w-3 h-3" /> Secure Order System
        </p>
      </div>
    </div>
  );
}

function Lock({ className }: { className?: string }) {
  return (
    <svg 
      className={className}
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
    </svg>
  );
}
