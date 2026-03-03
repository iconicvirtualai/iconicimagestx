import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Check, Mail, Phone, MapPin, Maximize, Calendar as CalendarIcon, ArrowRight, ArrowLeft, Sparkles, Wand2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

type Step = 1 | 2 | 3 | 4 | "success";

const packages = [
  { id: "essentials", name: "The Essentials", price: 249, description: "Clean, bright, and ready to post. Perfect for quick turnarounds." },
  { id: "showcase", name: "The Showcase", price: 549, description: "A complete visual deep-dive. We capture the details, the angles, and the atmosphere." },
  { id: "legacy", name: "The Legacy", price: 899, description: "Our highest level of care. We create a cinematic experience that tells people why your brand is the one." },
  { id: "market-leader", name: "The Market Leader", price: 1599, description: "Total market saturation strategy. We handle the narrative from Coming Soon to Sold success story." },
  { id: "refresh", name: "The Refresh", price: 349, description: "The Modern Portrait. Approachable, professional, and uniquely you." },
  { id: "content-partner", name: "The Content Partner", price: 999, description: "30 days of content in 2 hours. Never wonder what to post again." },
  { id: "local-legend", name: "The Local Legend", price: 2499, description: "The Market Takeover Campaign. Your Story, Told Cinematically." }
];

export default function BookingForm() {
  const settings = useSiteSettings();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState<Step>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    email: "",
    phone: "",
    address: "",
    sqft: "",
    packageId: "essentials",
    premiumEditing: false,
    date: undefined as Date | undefined,
  });

  useEffect(() => {
    const pkg = searchParams.get("package");
    const premium = searchParams.get("premium") === "true";
    if (pkg && packages.find(p => p.id === pkg)) {
      setFormData(prev => ({ ...prev, packageId: pkg, premiumEditing: premium }));
      setStep(3); // Skip to package selection if pre-selected? Or just stay at 1. Usually stay at 1 for contact info.
    }
  }, [searchParams]);

  const updateFormData = (data: Partial<typeof formData>) => {
    setFormData(prev => ({ ...prev, ...data }));
  };

  const nextStep = () => {
    if (step === 1 && (!formData.email || !formData.phone)) {
      toast.error("Please fill in all contact details");
      return;
    }
    if (step === 2 && (!formData.address || !formData.sqft)) {
      toast.error("Please fill in property details");
      return;
    }
    if (step === 4 && !formData.date) {
      toast.error("Please select a date");
      return;
    }
    
    if (typeof step === 'number') {
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
              <h2 className="text-3xl font-black text-black tracking-tight uppercase">Contact Info</h2>
              <p className="text-gray-400 font-bold text-xs uppercase tracking-widest">How can we reach you?</p>
            </div>
            <div className="space-y-6">
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
      case 2:
        return (
          <motion.div 
            initial={{ opacity: 0, x: 20 }} 
            animate={{ opacity: 1, x: 0 }} 
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="space-y-4 text-center mb-8">
              <h2 className="text-3xl font-black text-black tracking-tight uppercase">Property Info</h2>
              <p className="text-gray-400 font-bold text-xs uppercase tracking-widest">Where is the shoot?</p>
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
              <h2 className="text-3xl font-black text-black tracking-tight uppercase">Package Selection</h2>
              <p className="text-gray-400 font-bold text-xs uppercase tracking-widest">Choose your production level</p>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {packages.map((pkg) => (
                <button
                  key={pkg.id}
                  onClick={() => updateFormData({ packageId: pkg.id })}
                  className="p-6 rounded-3xl border-2 transition-all text-left flex justify-between items-center group bg-white"
                  style={{
                    borderColor: formData.packageId === pkg.id ? settings.global.primaryColor : '#f3f4f6',
                    backgroundColor: formData.packageId === pkg.id ? `${settings.global.primaryColor}05` : 'white',
                    boxShadow: formData.packageId === pkg.id ? `0 10px 30px -10px ${settings.global.primaryColor}33` : 'none'
                  }}
                >
                  <div className="space-y-1">
                    <h4 className="text-lg font-black text-black uppercase tracking-tight">{pkg.name}</h4>
                    <p className="text-xs text-gray-500 max-w-[200px] leading-relaxed">{pkg.description}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-black mb-1" style={{ color: formData.packageId === pkg.id ? settings.global.primaryColor : 'black' }}>
                      ${pkg.price}
                    </div>
                    {formData.packageId === pkg.id && (
                      <div className="p-1 rounded-full w-5 h-5 flex items-center justify-center ml-auto" style={{ backgroundColor: settings.global.primaryColor }}>
                        <Check className="w-3 h-3 stroke-[3] text-white" />
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Premium Editing Toggle */}
            <div
              className="mt-8 p-6 rounded-[2.5rem] border-2 border-dashed transition-all cursor-pointer flex items-center justify-between group"
              style={{
                borderColor: formData.premiumEditing ? settings.global.primaryColor : '#e5e7eb',
                backgroundColor: formData.premiumEditing ? `${settings.global.primaryColor}05` : 'transparent'
              }}
              onClick={() => updateFormData({ premiumEditing: !formData.premiumEditing })}
            >
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${formData.premiumEditing ? 'text-white' : 'text-gray-400 bg-gray-50'}`} style={{ backgroundColor: formData.premiumEditing ? settings.global.primaryColor : undefined }}>
                  <Wand2 className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-black">Premium Editing Upgrade</h4>
                  <p className="text-xs text-gray-500">Expert retouching, sky replacements & more (Next Day Delivery)</p>
                </div>
              </div>
              <div className={`w-12 h-6 rounded-full relative transition-all ${formData.premiumEditing ? '' : 'bg-gray-200'}`} style={{ backgroundColor: formData.premiumEditing ? settings.global.primaryColor : undefined }}>
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${formData.premiumEditing ? 'left-7' : 'left-1'}`}></div>
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
              <h2 className="text-3xl font-black text-black tracking-tight uppercase">Preferred Date</h2>
              <p className="text-gray-400 font-bold text-xs uppercase tracking-widest">When should we arrive?</p>
            </div>
            <div className="flex flex-col items-center">
              <div className="bg-white p-4 rounded-[2.5rem] border border-gray-100 shadow-xl">
                <Calendar
                  mode="single"
                  selected={formData.date}
                  onSelect={(date) => updateFormData({ date })}
                  className="rounded-3xl"
                  disabled={(date) => date < new Date() || date < new Date(new Date().setHours(0,0,0,0))}
                />
              </div>
              {formData.date && (
                <p className="mt-6 text-sm font-bold bg-white px-6 py-2 rounded-full border animate-in zoom-in" style={{ color: settings.global.primaryColor, borderColor: `${settings.global.primaryColor}33`, backgroundColor: `${settings.global.primaryColor}10` }}>
                  Selected: {format(formData.date, "EEEE, MMMM do, yyyy")}
                </p>
              )}
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
                Check your email for your confirmation. Our team will contact you shortly to finalize details.
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

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      {/* Progress Bar */}
      <div className="flex gap-2 mb-12">
        {[1, 2, 3, 4].map((i) => (
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

      <div className="min-h-[450px]">
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
        {step < 4 ? (
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
                <Sparkles className="w-5 h-5" /> Book Now
              </div>
            )}
          </Button>
        )}
      </div>

      <div className="mt-8 text-center">
        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em] flex items-center justify-center gap-2">
           <Lock className="w-3 h-3" /> Secure Ghost Booking System
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
