import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { useIsMobile } from "@/hooks/use-mobile";
import { createOrder } from "@/lib/createOrder";
import { bookingFollowUp } from "@/lib/bookingFollowUp";
import { Link, useSearchParams } from "react-router-dom";
import ChatWidget from "@/components/ChatWidget";
import { MoneyAmount } from "@/components/MoneyAmount";
import { SmsConsentField } from "@/components/SmsConsentField";
import { BUSINESS_CONTACT } from "@shared/businessContact";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import {
  APPRENTICESHIP_BRIDGE_COPY,
  APPRENTICESHIP_OVERAGE_LABEL,
  APPRENTICESHIP_PROGRAM_NAME,
  APPRENTICESHIP_RULES,
  bookingOffer,
  isApprenticeshipPackage,
  isExclusivePhotoPackage,
  packagesForStaffEditor,
  promoDiscountFor,
  type StaffCatalogPackage,
} from "@shared/bookingCatalog";
import {
  buildSubmittedLineItems,
  calculateSidebarTotal,
  hasBookingSelection,
  sumLineItemPrices,
  type BookingPriceInput,
} from "@shared/bookingPricing";
import {
  assessTravel,
  travelCustomerLine,
  travelFeeDollars,
  type TravelAssessment,
} from "@shared/travelZones";
import {
  LIFE_OF_THE_LISTING_CARE_BLURB,
  LIFE_OF_THE_LISTING_CARE_CHECKBOX_LABEL,
  LIFE_OF_THE_LISTING_CARE_PRICE_LABEL,
  LIFE_OF_THE_LISTING_CARE_SUMMARY_LABEL,
} from "@shared/lifeOfTheListingCare";
import ServiceLocationField from "@/components/ServiceLocationField";
import type { PickedServiceLocation } from "@shared/serviceLocation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Check, Mail, Phone, MapPin, Maximize, Calendar as CalendarIcon,
  ArrowRight, ArrowLeft, Sparkles, Wand2, Clock, ChevronDown,
  ChevronUp, Zap, Video, Camera, Star, Info, MessageSquare,
  Users, Key, HelpCircle, User, Layout, MessageCircle,
  Plus, Minus, Boxes
} from "lucide-react";
import { format, addMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay } from "date-fns";
import { toast } from "sonner";

type Step = 1 | 2 | 3 | 4 | 5 | 6 | "success";

/**
 * Public pages sit inside Layout's `text-white`. Form controls inherit that
 * color, so light fields need an explicit dark text color and placeholder.
 */
const lightControlText = "text-neutral-950 placeholder:text-neutral-500 caret-neutral-950";

const photographers = [
  "Marcus Johnson",
  "Sarah Chen",
  "Devon Torres",
  "Available (Auto-Assign)",
];

const consultQuestions = [
  {
    id: "marketingDoing",
    question: "What kind of marketing are you doing?",
    options: ["Posting", "Boosting", "Ads & Targeting", "Strategizing & Consistency", "Throwin Darts & Hopin' for the best"]
  },
  {
    id: "resultsBothering",
    question: "What's bothering you about your results?",
    options: ["Not growing fast enough", "Not enough business", "Not as many followers as I want", "Not as much engagement as I want", "Everything"]
  },
  {
    id: "perfectBusiness",
    question: "In a perfect world, what does your perfect business look like?",
    options: ["Consistent flow of random revenue", "Solid sphere of clientele", "Revolving revenue of repeat clients", "Lots of little deals", "Little bit of Big deals"]
  },
  {
    id: "businessSource",
    question: "Where does business usually come from?",
    options: ["Streets", "Friends & Family", "Social Media", "Signage/Advertisements", "Couldn't Tell Ya."]
  },
  {
    id: "investmentWilling",
    question: "How much are you willing to invest in yourself and your business with?",
    options: ["0-$500/mo", "$500-$1000/mo", "$1000-$2500/mo", "$2500-5000/mo", "$5000+"]
  }
];

interface BookingFormProps {
  initialServiceId?: string;
  initialCategoryId?: string;
}

function TravelFeeLine({ travel }: { travel: TravelAssessment }) {
  const line = travelCustomerLine(travel);
  return (
    <div data-testid="travel-fee-line" className="flex items-baseline justify-between gap-3 text-[11px]">
      <span className="min-w-0 text-gray-500">{line.label}</span>
      {line.amount ? (
        <MoneyAmount data-testid="travel-fee-amount" className="font-bold text-black">{line.amount}</MoneyAmount>
      ) : null}
    </div>
  );
}

export default function BookingForm({ initialServiceId, initialCategoryId }: BookingFormProps = {}) {
  const settings = useSiteSettings();
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState<Step>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitNote, setSubmitNote] = useState("");
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [selectedDetailItem, setSelectedDetailItem] = useState<any>(null);
  const [showIconicPopup, setShowIconicPopup] = useState(false);
  const [showVirtualStagingPopup, setShowVirtualStagingPopup] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; discount: number } | null>(null);

  const [expandedCategories, setExpandedCategories] = useState<string[]>(initialCategoryId ? [initialCategoryId] : ["listings"]);
  const [showBasics, setShowBasics] = useState(false);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    address: "",
    servicePlace: null as PickedServiceLocation | null,
    sqft: "",
    serviceDate: undefined as Date | undefined,
    serviceTime: "9:00 AM",
    preferredPhotographer: "Available (Auto-Assign)",
    selectedService: initialServiceId || "" as string,
    selectedBasics: [] as string[],
    selectedAddOns: [] as string[],
    lifeOfTheListingCare: false,
    premiumUpgrade: false,
    accessInfo: "Lockbox",
    lockboxCode: "",
    supraCode: "",
    propertyStatus: "Vacant", // Vacant or Occupied
    furnishingStatus: "Furnished", // Furnished or Unfurnished
    virtualStagingCredits: 0,
    vibeNote: "",
    teaserMonthContent: false,
    teaserPersonalBrand: false,
    teaserSocialConsult: false,
    socialMarketingPermission: true,
    smsConsent: false,
    marketingDoing: "",
    resultsBothering: "",
    perfectBusiness: "",
    businessSource: "",
    investmentWilling: "",
    leadSource: "", // UTM tracking
    specializedPhotography: "mls" as "mls" | "social" | "both",
  });

  const [catalog, setCatalog] = useState<StaffCatalogPackage[]>(() => packagesForStaffEditor([]));
  const offer = useMemo(() => bookingOffer(catalog), [catalog]);
  const services = offer.services;
  const addOns = offer.addOns;
  const photoOnlyPackages = offer.photoOnlyPackages;
  const apprenticeshipPackages = offer.apprenticeshipPackages;
  const basicsList = offer.basics;
  const iconicFinishPrice = offer.iconicFinish?.price ?? 0;
  const virtualStagingUnitPrice = offer.virtualStaging?.price ?? 0;
  const specializedSocialPrice = offer.specializedSocial?.price ?? 0;
  const specializedBothPrice = offer.specializedBoth?.price ?? 0;

  // Booking prices come from the packages catalog. A failed read keeps the seed.
  useEffect(() => {
    let cancelled = false;
    getDocs(collection(db, "packages"))
      .then((snap) => {
        if (cancelled) return;
        setCatalog(packagesForStaffEditor(snap.docs.map((entry) => ({ id: entry.id, ...entry.data() }))));
      })
      .catch((err) => {
        console.warn("[Booking] Catalog read failed — using the seeded catalog", err);
        if (!cancelled) setCatalog(packagesForStaffEditor([]));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Check for pre-filled service from pricing page or props
  useEffect(() => {
    const serviceParam = searchParams.get("service") || initialServiceId;
    const itemsParam = searchParams.get("items");
    const premiumParam = searchParams.get("premium") === "true";
    const utmSource = searchParams.get("utm_source");

    if (utmSource) {
      setFormData(prev => ({ ...prev, leadSource: utmSource }));
    }

    if (serviceParam) {
      setFormData(prev => ({
        ...prev,
        selectedService: serviceParam,
        premiumUpgrade: premiumParam
      }));
      // Expand only the category of the selected service
      const service = services.find(s => s.id === serviceParam);
      if (service) {
        setExpandedCategories([service.category]);
      }
    }

    if (itemsParam) {
      const items = itemsParam.split(",");
      const specializedSocial = items.includes("specialized-social");
      const specializedBoth = items.includes("specialized-both");
      const apprenticePick = items.find((id) => isApprenticeshipPackage(id));

      setFormData(prev => ({
        ...prev,
        selectedBasics: apprenticePick
          ? [apprenticePick]
          : items.filter(i => i !== "specialized-social" && i !== "specialized-both"),
        selectedAddOns: apprenticePick ? [] : prev.selectedAddOns,
        premiumUpgrade: apprenticePick ? false : premiumParam,
        virtualStagingCredits: apprenticePick ? 0 : prev.virtualStagingCredits,
        specializedPhotography: apprenticePick
          ? "mls"
          : specializedBoth ? "both" : specializedSocial ? "social" : prev.specializedPhotography
      }));
      setShowBasics(true);
    }
  }, [searchParams, initialServiceId, services]);

  const updateFormData = (data: Partial<typeof formData>) => {
    setFormData(prev => ({ ...prev, ...data }));
  };

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => 
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  const toggleService = (id: string) => {
    const isSelecting = formData.selectedService !== id;
    setFormData(prev => ({
      ...prev,
      selectedService: prev.selectedService === id ? "" : id,
      selectedBasics: [] // Deselect basics if a campaign tier is chosen
    }));

    if (isSelecting) {
      const service = services.find(s => s.id === id);
      if (service) setSelectedDetailItem(service);
    }
  };

  const toggleAddOn = (id: string) => {
    const isSelecting = !formData.selectedAddOns.includes(id);
    setFormData(prev => ({
      ...prev,
      selectedAddOns: prev.selectedAddOns.includes(id)
        ? prev.selectedAddOns.filter(a => a !== id)
        : [...prev.selectedAddOns, id]
    }));

    if (isSelecting) {
      addOns.forEach(cat => {
        const item = cat.items.find(x => x.id === id);
        if (item) setSelectedDetailItem(item);
      });
    }
  };

  const toggleBasic = (id: string) => {
    const isSelecting = !formData.selectedBasics.includes(id);
    const apprenticePick = isSelecting && isApprenticeshipPackage(id);
    // Photo-count packages are one choice: standard photos-only or apprenticeship.
    if (isExclusivePhotoPackage(id)) {
      setFormData(prev => ({
        ...prev,
        selectedService: "", // Deselect campaign tiers if a basic is chosen
        selectedBasics: prev.selectedBasics.includes(id)
          ? prev.selectedBasics.filter(b => b !== id)
          : [id, ...prev.selectedBasics.filter(b => !isExclusivePhotoPackage(b))],
        ...(apprenticePick
          ? {
              selectedAddOns: [],
              premiumUpgrade: false,
              virtualStagingCredits: 0,
              specializedPhotography: "mls" as const,
            }
          : {}),
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

    if (isSelecting) {
      const basic = basicsList.find(b => b.id === id);
      if (basic) setSelectedDetailItem(basic);
    }
  };

  const togglePremium = () => {
    const isSelecting = !formData.premiumUpgrade;
    updateFormData({ premiumUpgrade: isSelecting });
    if (isSelecting) {
      setSelectedDetailItem({
        name: "✨ Iconic Finish (Premium)",
        description: "The ultimate digital polish for your listing. We touch up every detail to ensure it stands out in the crowd.",
        price: iconicFinishPrice,
        features: [
          "Remove Dirt & Debris",
          "Remove Reflections and Harsh Shadows",
          "Remove Cords & Powerlines",
          "Clean Driveways",
          "Clean Roads & Sidewalks",
          "Add Grass",
          "Add Curb Appeal",
          "Add Landscaping",
          "Add TVs & Screens",
          "Add Fire to Pits and Places"
        ]
      });
    }
  };

  const apprenticeshipSelected = formData.selectedBasics.some((id) => isApprenticeshipPackage(id));
  const apprenticeshipOnly = apprenticeshipSelected && !formData.selectedService;

  const nextStep = () => {
    if (step === 1 && !formData.selectedService && formData.selectedBasics.length === 0) {
      toast.error("Please select a Campaign Tier or Basics package");
      return;
    }
    if (step === 3 && !formData.servicePlace) {
      toast.error("Choose the service location from the address list.");
      return;
    }

    // Check if we should show the Iconic Finish popup
      if (step === 1) {
      if (isStudioPath) {
        setStep(4);
        return;
      }
      if (isConsultationPath) {
        setStep(4); // Jump to scheduling
        return;
      }

      // Apprentice photos stay photos-only: no polish upsell, no add-on step.
      if (apprenticeshipOnly) {
        setStep(3);
        return;
      }

      const selectedService = services.find(s => s.id === formData.selectedService);
      const isListing = selectedService?.category === "listings";
      const isMarketLeader = formData.selectedService === "listing-market-leader";
      const isBasics = formData.selectedBasics.length > 0;

      if (offer.iconicFinish && ((isListing && !isMarketLeader) || isBasics)) {
        if (!formData.premiumUpgrade) {
          setShowIconicPopup(true);
          return;
        }
      }
    }

    if (step === 4) {
      if (isStudioPath) {
        setStep(6);
        return;
      }
      if (isConsultationPath) {
        setStep(5); // Questionnaire
      } else {
        setStep(6); // Final Form
      }
      return;
    }

    if (step === 5) {
      // Validate questionnaire
      const unanswered = consultQuestions.find(q => !formData[q.id as keyof typeof formData]);
      if (unanswered) {
        toast.error("Please answer all questions before proceeding");
        return;
      }
      setStep(6);
      return;
    }

    if (typeof step === 'number' && step < 6) {
      setStep((step + 1) as Step);
    }
  };

  const prevStep = () => {
    if (step === 3 && apprenticeshipOnly) {
      setStep(1);
      return;
    }
    if (step === 4 && (isConsultationPath || isStudioPath)) {
      setStep(1);
      return;
    }
    if (step === 6) {
      if (isStudioPath) {
        setStep(4);
        return;
      }
      if (isConsultationPath) {
        setStep(5);
      } else {
        setStep(4);
      }
      return;
    }
    if (typeof step === 'number' && step > 1) {
      setStep((step - 1) as Step);
    }
  };

  const bookingPriceInput = (): BookingPriceInput => ({
    selectedService: formData.selectedService,
    selectedBasics: formData.selectedBasics,
    selectedAddOns: formData.selectedAddOns,
    premiumUpgrade: formData.premiumUpgrade,
    virtualStagingCredits: formData.virtualStagingCredits,
    specializedPhotography: formData.specializedPhotography,
    promo: appliedPromo,
    lifeOfTheListingCare: formData.lifeOfTheListingCare,
    catalog,
  });

  const handleBookNow = async (e?: React.FormEvent) => {
  if (e) e.preventDefault();
  if (!formData.smsConsent) {
    toast.error("Check the box to agree to Iconic Images booking and appointment text messages.");
    return;
  }
  const bookedService = services.find((item) => item.id === formData.selectedService);
  const skipsServiceLocation = Boolean(
    bookedService && ["branding", "business", "growth", "studio"].includes(bookedService.category),
  );
  if (!skipsServiceLocation && !formData.servicePlace) {
    toast.error("Choose the service location from the address list.");
    return;
  }
  console.log("STEP 1: submit clicked");
  setIsSubmitting(true);
  const lineItems = buildSubmittedLineItems(bookingPriceInput());
  const total = sumLineItemPrices(lineItems);

  try {
    const result = await createOrder({
      ...formData,
      lineItems,
      total,
      promoCode: appliedPromo?.code || null,
      promoDiscount: appliedPromo?.discount || 0,
    });
    setSubmitNote(bookingFollowUp(result));

    setStep("success");

  } catch (error: any) {
    console.error("ORDER ERROR:", error);
    const message = error?.message || "Something went wrong. Please try again.";
    toast.error(message);
  } finally {
    setIsSubmitting(false);
  }
};
  const selectedServiceData = services.find(s => s.id === formData.selectedService);
  const isConsultationPath = selectedServiceData && ["branding", "business", "growth"].includes(selectedServiceData.category);
  const isStudioPath = selectedServiceData?.category === "studio";

  const travel = assessTravel(formData.servicePlace ?? formData.address);
  const showTravelLine = Boolean(formData.servicePlace) || formData.address.trim().length > 0;
  const calculateTotal = () => Math.round((calculateSidebarTotal(bookingPriceInput()) + travelFeeDollars(travel)) * 100) / 100;

  const handleApplyPromo = () => {
    const promo = promoDiscountFor(promoInput);
    if (promo?.code === "ICONICAI") {
      setAppliedPromo(promo); // $35 off (1 free virtual staging)
      toast.success("Promo code 'ICONICAI' applied! ($35 discount)");
    } else if (promo?.code === "NEWYEAR") {
      setAppliedPromo(promo);
      toast.success("Promo code applied!");
    } else {
      toast.error("Invalid promo code");
    }
  };

  const renderSummarySidebar = () => (
    <div data-testid="booking-estimator" className="bg-white text-neutral-950 rounded-[2rem] border border-gray-100 p-6 shadow-xl sticky top-8">
      <h3 className="text-lg font-black text-black uppercase tracking-tight mb-4 pb-3 border-b">Order Summary</h3>
      <div className="space-y-3 mb-6">
        {selectedServiceData && (
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 text-xs font-bold text-gray-700">{selectedServiceData.name}</span>
            <MoneyAmount className="text-sm font-black text-black">${selectedServiceData.price}</MoneyAmount>
          </div>
        )}
        {formData.selectedBasics.length > 0 && (
          <div className="space-y-1.5">
            {formData.selectedBasics.map(id => {
              const b = basicsList.find(x => x.id === id);
              return b ? (
                <div key={id} className="flex items-baseline justify-between gap-3 text-[11px]">
                  <span className="min-w-0 text-gray-500">
                    {b.name}
                    {b.appointmentLimit && (
                      <span className="mt-0.5 block text-[10px] font-medium leading-snug text-gray-400">
                        {b.appointmentLimit}
                      </span>
                    )}
                  </span>
                  <MoneyAmount className="font-bold text-black">${b.price}</MoneyAmount>
                </div>
              ) : null;
            })}
            {apprenticeshipSelected && (
              <p className="text-[10px] font-bold leading-relaxed text-gray-400">
                Run long and it adds up: {APPRENTICESHIP_OVERAGE_LABEL}. That overage is not in this estimate.
              </p>
            )}
          </div>
        )}
        {formData.premiumUpgrade && (
          <div className="flex items-baseline justify-between gap-3 text-[11px]">
            <span className="min-w-0 text-gray-500 italic">✨ Iconic Finish (Premium) (Next Day Delivery)</span>
            <MoneyAmount className="font-bold text-black">${iconicFinishPrice}</MoneyAmount>
          </div>
        )}
        {formData.specializedPhotography !== "mls" && (
          <div className="flex items-baseline justify-between gap-3 text-[11px]">
            <span className="min-w-0 text-gray-500 italic">📸 Specialized: {formData.specializedPhotography === "social" ? (offer.specializedSocial?.name || "Social Media Optimized") : (offer.specializedBoth?.name || "MLS + Social Media Optimized")}</span>
            <MoneyAmount className="font-bold text-black">${formData.specializedPhotography === "social" ? specializedSocialPrice : specializedBothPrice}</MoneyAmount>
          </div>
        )}
        {formData.virtualStagingCredits > 0 && (
          <div className="flex items-baseline justify-between gap-3 text-[11px]">
            <span className="min-w-0 text-gray-500 italic">🏠 {offer.virtualStaging?.name || "Virtual Staging"} ({formData.virtualStagingCredits} credits)</span>
            <MoneyAmount className="font-bold text-black">${formData.virtualStagingCredits * virtualStagingUnitPrice}</MoneyAmount>
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
                 <div key={id} className="flex items-baseline justify-between gap-3 text-[11px]">
                   <span className="min-w-0 text-gray-500">{found.name}</span>
                   <MoneyAmount className="font-bold text-black">${found.price}</MoneyAmount>
                 </div>
               ) : null;
             })}
          </div>
        )}
        {formData.lifeOfTheListingCare && (
          <div className="flex justify-between items-start gap-3 text-[11px]">
            <span className="text-gray-500">{LIFE_OF_THE_LISTING_CARE_SUMMARY_LABEL}</span>
            <span className="font-bold text-neutral-950 shrink-0">{LIFE_OF_THE_LISTING_CARE_PRICE_LABEL}</span>
          </div>
        )}
        {formData.serviceDate && (
          <div className="pt-2 mt-2 border-t border-gray-100 flex justify-between items-center text-[11px]">
             <span className="text-gray-500 italic flex items-center gap-1.5"><CalendarIcon className="w-3 h-3" /> {format(formData.serviceDate, "PPP")}</span>
             <span className="font-bold text-black">{formData.serviceTime}</span>
          </div>
        )}

        {/* Applied Promo Display */}
        {appliedPromo && (
          <div className="pt-2 mt-2 border-t border-dashed border-teal-100 flex items-baseline justify-between gap-3 text-[11px]">
             <span className="min-w-0 text-teal-600 font-bold flex items-center gap-1.5"><Sparkles className="w-3 h-3" /> PROMO: {appliedPromo.code}</span>
             <MoneyAmount className="font-black text-teal-600">-${appliedPromo.discount}</MoneyAmount>
          </div>
        )}
      </div>

      {/* Promo Code Input Section */}
      <div className="mb-6">
        <div className="flex gap-2">
          <Input
            placeholder="PROMO CODE"
            className={`h-10 text-[10px] font-black uppercase tracking-widest border-gray-100 rounded-xl px-4 bg-white ${lightControlText}`}
            value={promoInput}
            onChange={(e) => setPromoInput(e.target.value)}
          />
          <Button
            onClick={handleApplyPromo}
            className="h-10 px-4 bg-gray-100 hover:bg-black hover:text-white text-black font-black text-[10px] uppercase tracking-widest rounded-xl transition-all"
          >
            Apply
          </Button>
        </div>
      </div>

      <div className="pt-4 border-t border-dashed border-gray-200">
        {showTravelLine && (
          <div className="mb-4">
            <TravelFeeLine travel={travel} />
          </div>
        )}
        <div className="flex justify-between items-center mb-4">
          <span className="text-[10px] font-black uppercase text-gray-400">Total Estimate</span>
          {hasBookingSelection(bookingPriceInput()) ? (
            <MoneyAmount data-testid="booking-total" className="text-2xl font-black text-black" style={{ color: settings.global.primaryColor }}>
              ${calculateTotal()}
            </MoneyAmount>
          ) : (
            <span data-testid="booking-total" className="text-sm font-bold uppercase tracking-widest text-gray-400">
              Select a package
            </span>
          )}
        </div>
      </div>
    </div>
  );

  // Scheduling helpers (used in the Scheduling step)
  const currentMonth = formData.serviceDate ? startOfMonth(formData.serviceDate) : startOfMonth(new Date());
  const months = Array.from({ length: 12 }, (_, i) => addMonths(startOfMonth(new Date()), i));
  const daysInMonth = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth)
  }).filter(date => date >= new Date(new Date().setHours(0,0,0,0)));

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
                (["listings", "branding", "business", "growth", "studio"] as const).map((cat) => (
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
                           {cat === "studio" && <Boxes className="w-4 h-4" />}
                        </div>
                        <h3 className="text-sm font-black uppercase tracking-widest text-black">
                          {cat === "listings" && "Listings & Spaces"}
                          {cat === "branding" && "The Human Brand"}
                          {cat === "business" && "Social Monopoly"}
                          {cat === "growth" && "Brand & Growth"}
                          {cat === "studio" && "Studio 105"}
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
                                       {s.price > 0 ? `$${s.price}` : ""}
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
                // Basics View — photos-only beside the apprenticeship program
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                  <div data-testid="basics-photos" className="space-y-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Photos-Only</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-3">
                      {photoOnlyPackages.map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => toggleBasic(b.id)}
                          aria-pressed={formData.selectedBasics.includes(b.id)}
                          className={`p-6 rounded-2xl border-2 transition-all text-left bg-white relative ${
                            formData.selectedBasics.includes(b.id) ? 'border-black bg-white scale-[1.01] shadow-lg' : 'border-gray-100 bg-white hover:border-gray-200'
                          }`}
                        >
                          <div className="space-y-1 pr-6">
                            <h4 className="font-black text-black uppercase text-sm">{b.name}</h4>
                            <span className="text-sm font-black text-black block">${b.price}</span>
                          </div>
                          {formData.selectedBasics.includes(b.id) && (
                            <div className="absolute top-4 right-4 w-5 h-5 rounded-full bg-black flex items-center justify-center">
                              <Check className="w-2.5 h-2.5 text-white stroke-[4]" />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div data-testid="apprenticeship-program" className="space-y-4 rounded-[1.75rem] border border-dashed border-gray-200 bg-[#fafafa] p-5">
                    <div className="space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: settings.global.primaryColor }}>
                        {APPRENTICESHIP_PROGRAM_NAME}
                      </p>
                      <p className="text-sm font-bold leading-relaxed text-gray-700">{APPRENTICESHIP_BRIDGE_COPY}</p>
                      <p className="text-[11px] font-medium leading-relaxed text-gray-500">
                        The packages beside this are the real Iconic shoot. This rate is lower on purpose — photos only, with a hard clock.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      {apprenticeshipPackages.map((b) => {
                        const selected = formData.selectedBasics.includes(b.id);
                        return (
                          <button
                            key={b.id}
                            type="button"
                            data-testid={b.id}
                            onClick={() => toggleBasic(b.id)}
                            aria-pressed={selected}
                            className={`p-5 rounded-2xl border-2 transition-all text-left bg-white relative ${
                              selected ? 'border-black shadow-lg' : 'border-gray-100 hover:border-gray-300'
                            }`}
                          >
                            <div className="space-y-1.5 pr-6">
                              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{b.kicker}</p>
                              <h4 className="text-2xl font-black leading-none text-black">{b.cardTitle || b.name}</h4>
                              <span className="text-xl font-black text-black block">${b.price}</span>
                              {b.appointmentLimit && (
                                <p className="text-[10px] font-medium leading-snug text-gray-400">{b.appointmentLimit}</p>
                              )}
                              <p className="pt-1 text-[11px] font-medium leading-relaxed text-gray-500">{b.aside}</p>
                            </div>
                            {selected && (
                              <div className="absolute top-4 right-4 w-5 h-5 rounded-full bg-black flex items-center justify-center">
                                <Check className="w-2.5 h-2.5 text-white stroke-[4]" />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[11px] font-bold leading-relaxed text-gray-600">
                      Overages: {APPRENTICESHIP_OVERAGE_LABEL}.
                    </p>
                    {apprenticeshipSelected && (
                      <div data-testid="apprenticeship-rules" className="rounded-2xl border border-black bg-white p-4 space-y-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-black">The rules. Read them.</p>
                        <ul className="list-disc space-y-2 pl-4">
                          {APPRENTICESHIP_RULES.map((rule) => (
                            <li key={rule} className="text-[12px] font-medium leading-relaxed text-gray-700">
                              {rule}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
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
            {!apprenticeshipOnly && offer.iconicFinish && ((selectedServiceData && selectedServiceData.id !== "listing-market-leader") || formData.selectedBasics.length > 0) && (
              <div className="bg-black rounded-[2rem] p-8 text-white relative overflow-hidden">
                 <div className="absolute top-0 right-0 p-8 opacity-10">
                    <Sparkles className="w-24 h-24" />
                 </div>
                 <div className="relative z-10 space-y-4">
                    <div className="flex items-center gap-3">
                      <Sparkles className="w-5 h-5 text-teal-400" />
                      <h2 className="text-xl font-black uppercase tracking-tight">Make it "Magazine Ready"</h2>
                    </div>
                    <div
                      onClick={togglePremium}
                      className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex items-center gap-4 ${formData.premiumUpgrade ? 'border-teal-400 bg-teal-900/20' : 'border-gray-800 bg-gray-900/50 hover:border-gray-600'}`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${formData.premiumUpgrade ? 'bg-teal-400 text-black' : 'bg-gray-800 text-gray-500'}`}>
                         {formData.premiumUpgrade ? <Check className="w-5 h-5 stroke-[3]" /> : <Star className="w-4 h-4" />}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center gap-2 mb-0.5">
                           <span className="text-[11px] md:text-[13px] font-black uppercase tracking-widest leading-tight">Yes, Add Premium Editing (Next Day Delivery)</span>
                           <span className="text-sm font-black text-teal-400 whitespace-nowrap">+${iconicFinishPrice}</span>
                        </div>
                        <p className="text-[10px] text-gray-400 leading-relaxed">
                          The ultimate digital polish. Remove dirt, debris, reflections, and add flawless landscaping.
                        </p>
                      </div>
                    </div>
                 </div>
              </div>
            )}

            {/* Specialized Photography Section */}
            {(selectedServiceData?.category === "listings" || formData.selectedBasics.some(b => b.startsWith("photos-"))) && (
              <div className="space-y-6">
                <div className="text-center space-y-1.5">
                  <h3 className="text-xl font-black uppercase text-black">Specialized Photography Style</h3>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Choose the aesthetic for your shoot</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { id: "mls", name: "Standard MLS", price: 0, description: "Optimized for MLS (Free/Standard)" },
                    offer.specializedSocial
                      ? { id: "social", name: offer.specializedSocial.name, price: specializedSocialPrice, description: offer.specializedSocial.description }
                      : null,
                    offer.specializedBoth
                      ? { id: "both", name: offer.specializedBoth.name, price: specializedBothPrice, description: offer.specializedBoth.description }
                      : null,
                  ].filter((style): style is { id: string; name: string; price: number; description: string } => Boolean(style)).map((style) => (
                    <button
                      key={style.id}
                      onClick={() => updateFormData({ specializedPhotography: style.id as any })}
                      className={`p-4 rounded-xl border-2 text-left transition-all relative flex flex-col justify-between h-full ${
                        formData.specializedPhotography === style.id ? 'border-black bg-white shadow-lg scale-[1.02]' : 'border-gray-100 bg-white hover:border-gray-200'
                      }`}
                    >
                      <div>
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-[11px] font-black uppercase text-black">{style.name}</span>
                          {style.price > 0 && <span className="text-[10px] font-black text-teal-500">+${style.price}</span>}
                        </div>
                        <p className="text-[9px] text-gray-500 leading-tight">{style.description}</p>
                      </div>
                      {formData.specializedPhotography === style.id && (
                        <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-black flex items-center justify-center">
                          <Check className="w-2.5 h-2.5 text-white stroke-[4]" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Strategic Add-ons Section — not offered on apprenticeship (photos only). */}
            {!apprenticeshipOnly && <div className="space-y-8">
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
            </div>}
            {apprenticeshipOnly && (
              <div className="rounded-[1.75rem] border border-black bg-white p-6 space-y-3">
                <p className="text-[10px] font-black uppercase tracking-[0.2em]">Photos only. The rules still apply.</p>
                <p className="text-sm font-medium leading-relaxed text-gray-600">
                  No aerials, video, floor plans, or extra edits. Overages stay {APPRENTICESHIP_OVERAGE_LABEL}.
                </p>
                <ul className="list-disc space-y-2 pl-4">
                  {APPRENTICESHIP_RULES.map((rule) => (
                    <li key={rule} className="text-[12px] font-medium leading-relaxed text-gray-700">{rule}</li>
                  ))}
                </ul>
              </div>
            )}
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
                  <label htmlFor="service-location" className="text-[10px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-2">
                    <MapPin className="w-3 h-3" /> Property Address
                  </label>
                  <ServiceLocationField
                    query={formData.address}
                    picked={formData.servicePlace}
                    placeholder="123 Luxury Lane, Houston, TX"
                    className={`h-14 rounded-xl border-gray-100 focus:border-black text-[15px] px-5 w-full bg-white ${lightControlText}`}
                    onChange={({ query, picked }) => updateFormData({ address: query, servicePlace: picked })}
                  />
               </div>

               <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-2">
                      <Maximize className="w-3 h-3" /> Square Footage
                    </label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      placeholder="2500"
                      className={`h-14 rounded-xl border-gray-100 focus:border-black text-[15px] px-5 bg-white ${lightControlText}`}
                      value={formData.sqft}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "");
                        updateFormData({ sqft: val });
                      }}
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
                            formData.accessInfo === access ? 'border-black bg-black text-white' : 'border-gray-100 bg-white text-neutral-700'
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
                        className={`h-12 rounded-xl border-gray-100 focus:border-black text-sm px-5 bg-gray-50 ${lightControlText}`}
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
                        className={`h-12 rounded-xl border-gray-100 focus:border-black text-sm px-5 bg-gray-50 ${lightControlText}`}
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
                            formData.propertyStatus === status ? 'border-black bg-gray-50 text-neutral-950' : 'border-gray-50 bg-white text-neutral-700'
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
                          onClick={() => {
                            updateFormData({ furnishingStatus: status });
                            if (status === "Unfurnished" && !apprenticeshipSelected && offer.virtualStaging) {
                              setShowVirtualStagingPopup(true);
                            }
                          }}
                          className={`flex-1 py-3 rounded-lg text-[9px] font-black uppercase tracking-widest border-2 transition-all ${
                            formData.furnishingStatus === status ? 'border-black bg-gray-50 text-neutral-950' : 'border-gray-50 bg-white text-neutral-700'
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
                    className={`w-full h-24 rounded-xl border-2 border-gray-100 bg-white focus:border-black text-xs p-4 resize-none transition-all outline-none ${lightControlText}`}
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
            className="space-y-12"
          >
             <div className="text-center space-y-2">
               <h3 className="text-3xl font-black uppercase text-black tracking-tight">
                 {isConsultationPath ? "RESERVE YOUR 30 MIN. ICONIC CONSULTATION CALL" : "Scheduling"}
               </h3>
               <p className="text-[11px] text-gray-400 font-bold uppercase tracking-[0.2em]">
                 {isConsultationPath ? "Choose your session details (CST Timezone)" : "Reserve your iconic launch date (CST Timezone)"}
               </p>
            </div>

            <div className="max-w-xl mx-auto space-y-8">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Month Selection */}
                  <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-2 px-1">
                      <CalendarIcon className="w-3.5 h-3.5" /> 1. Select Month
                    </label>
                    <Select
                      value={format(currentMonth, "yyyy-MM")}
                      onValueChange={(val) => {
                        const [year, month] = val.split("-").map(Number);
                        const newDate = new Date(year, month - 1, 1);
                        if (formData.serviceDate && isSameMonth(formData.serviceDate, newDate)) {
                          // keep
                        } else {
                          updateFormData({ serviceDate: newDate < new Date() ? new Date() : newDate });
                        }
                      }}
                    >
                      <SelectTrigger className={`h-16 rounded-[1.25rem] border-2 px-6 font-black border-black bg-white focus:ring-0 ${lightControlText}`}>
                        <SelectValue placeholder="Select Month" />
                      </SelectTrigger>
                      <SelectContent className="rounded-2xl border-none shadow-2xl p-2 max-h-[300px] bg-white text-neutral-950">
                        {months.map((m) => (
                          <SelectItem key={format(m, "yyyy-MM")} value={format(m, "yyyy-MM")} className="rounded-xl py-3 font-bold cursor-pointer text-neutral-950 focus:bg-gray-50 focus:text-neutral-950">
                            {format(m, "MMMM yyyy")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Date Selection */}
                  <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-2 px-1">
                      <Layout className="w-3.5 h-3.5" /> 2. Select Date
                    </label>
                    <Select
                      value={formData.serviceDate ? format(formData.serviceDate, "yyyy-MM-dd") : ""}
                      onValueChange={(val) => {
                        const [year, month, day] = val.split("-").map(Number);
                        updateFormData({ serviceDate: new Date(year, month - 1, day) });
                      }}
                    >
                      <SelectTrigger className={`h-16 rounded-[1.25rem] border-2 px-6 font-black border-black bg-white focus:ring-0 ${lightControlText}`}>
                        <SelectValue placeholder="Select Date" />
                      </SelectTrigger>
                      <SelectContent className="rounded-2xl border-none shadow-2xl p-2 max-h-[300px] bg-white text-neutral-950">
                        {daysInMonth.map((d) => (
                          <SelectItem key={format(d, "yyyy-MM-dd")} value={format(d, "yyyy-MM-dd")} className="rounded-xl py-3 font-bold cursor-pointer text-neutral-950 focus:bg-gray-50 focus:text-neutral-950">
                            {format(d, "EEEE, do")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Time Picker Dropdown */}
                  <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-2 px-1">
                      <Clock className="w-3.5 h-3.5" /> 3. Preferred Time
                    </label>
                    <Select
                      value={formData.serviceTime}
                      onValueChange={(val) => updateFormData({ serviceTime: val })}
                    >
                      <SelectTrigger className={`h-16 rounded-[1.25rem] border-2 px-6 font-black border-black bg-white focus:ring-0 ${lightControlText}`}>
                        <SelectValue placeholder="Select Time" />
                      </SelectTrigger>
                      <SelectContent className="rounded-2xl border-none shadow-2xl p-2 bg-white text-neutral-950">
                        {["9:00 AM", "11:00 AM", "1:00 PM", "3:00 PM", "5:00 PM"].map((t) => (
                          <SelectItem key={t} value={t} className="rounded-xl py-3 font-bold cursor-pointer text-neutral-950 focus:bg-gray-50 focus:text-neutral-950">
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {!isConsultationPath && (
                    <div className="space-y-4">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-2 px-1">
                        <Users className="w-3.5 h-3.5" /> 4. Photographer
                      </label>
                      <Select
                        value={formData.preferredPhotographer}
                        onValueChange={(val) => updateFormData({ preferredPhotographer: val })}
                      >
                        <SelectTrigger className={`h-16 rounded-[1.25rem] border-2 px-6 font-black border-black bg-white focus:ring-0 ${lightControlText}`}>
                          <SelectValue placeholder="Select Photographer" />
                        </SelectTrigger>
                        <SelectContent className="rounded-2xl border-none shadow-2xl p-2 bg-white text-neutral-950">
                          {photographers.map((p) => (
                            <SelectItem key={p} value={p} className="rounded-xl py-3 font-bold cursor-pointer text-neutral-950 focus:bg-gray-50 focus:text-neutral-950">
                              {p}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
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
               <h3 className="text-2xl font-black uppercase text-black tracking-tight">Strategy Questionnaire</h3>
               <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Help us prepare for our session</p>
            </div>

            <div className="space-y-8 max-w-2xl mx-auto">
               {consultQuestions.map((q) => (
                 <div key={q.id} className="space-y-4">
                    <label className="text-xs font-black uppercase tracking-widest text-black flex items-center gap-2">
                      <MessageSquare className="w-3.5 h-3.5" /> {q.question}
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                       {q.options.map((opt) => (
                         <button
                          key={opt}
                          onClick={() => updateFormData({ [q.id]: opt })}
                          className={`p-4 rounded-xl text-[11px] font-bold text-left border-2 transition-all flex items-center justify-between ${
                            formData[q.id as keyof typeof formData] === opt ? 'border-black bg-gray-50 text-neutral-950' : 'border-gray-50 bg-white text-neutral-800 hover:border-gray-200'
                          }`}
                         >
                           {opt}
                           {formData[q.id as keyof typeof formData] === opt && <Check className="w-3.5 h-3.5" />}
                         </button>
                       ))}
                    </div>
                 </div>
               ))}
            </div>
          </motion.div>
        );

      case 6:
        return (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-10"
          >
            <div className="text-center space-y-1.5">
               <h3 className="text-2xl font-black uppercase text-black tracking-tight">
                 {isConsultationPath ? "Secure Your Consultation" : "Secure Your Iconic Launch"}
               </h3>
               <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Complete your request</p>
            </div>

            <div className="space-y-8 max-w-lg mx-auto">
               <div data-testid="order-summary-before-submit" className="rounded-2xl border border-gray-100 bg-gray-50 p-5 space-y-3">
                 <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Order summary</p>
                 <TravelFeeLine travel={travel} />
                 <div className="flex items-baseline justify-between gap-3 border-t border-gray-200 pt-3">
                   <span className="min-w-0 text-[10px] font-black uppercase text-gray-400">Total estimate</span>
                   {hasBookingSelection(bookingPriceInput()) ? (
                     <MoneyAmount className="text-lg font-black text-black">${calculateTotal()}</MoneyAmount>
                   ) : (
                     <span className="text-sm font-bold uppercase tracking-widest text-gray-400">Select a package</span>
                   )}
                 </div>
               </div>
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">First Name</label>
                    <Input
                      placeholder="John"
                      className={`h-14 rounded-xl border-2 focus:border-black px-5 bg-white ${lightControlText}`}
                      value={formData.firstName}
                      onChange={(e) => updateFormData({ firstName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Last Name</label>
                    <Input
                      placeholder="Doe"
                      className={`h-14 rounded-xl border-2 focus:border-black px-5 bg-white ${lightControlText}`}
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
                      className={`h-14 rounded-xl border-2 focus:border-black px-5 bg-white ${lightControlText}`}
                      value={formData.email}
                      onChange={(e) => updateFormData({ email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Phone Number</label>
                    <Input
                      type="tel"
                      placeholder="(555) 000-0000"
                      className={`h-14 rounded-xl border-2 focus:border-black px-5 bg-white ${lightControlText}`}
                      value={formData.phone}
                      onChange={(e) => updateFormData({ phone: e.target.value })}
                    />
                  </div>
               </div>

               <SmsConsentField
                 checked={formData.smsConsent}
                 onChange={(smsConsent) => updateFormData({ smsConsent })}
               />

               {!isConsultationPath && (
                 <>
                   {/* Marketing Permission Toggle */}
                   <div className="bg-gray-50 p-6 rounded-2xl space-y-4">
                      <div className="flex items-center justify-between">
                         <div className="space-y-0.5">
                            <h4 className="text-[11px] font-black uppercase tracking-widest text-black">Marketing Permission</h4>
                            <p className="text-[9px] text-gray-500 leading-relaxed max-w-[280px]">I give permission for Iconic Images to market my listing via social media and other online channels.</p>
                            <p className="text-[11px] text-gray-600 leading-relaxed max-w-[320px]">
                              Listing marketing is separate from text messages. SMS terms are in our{" "}
                              <Link to="/privacy" className="underline font-semibold text-black">Privacy Policy</Link>
                              {" "}and{" "}
                              <Link to="/terms" className="underline font-semibold text-black">Terms and Conditions</Link>.
                            </p>
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

                   {!isStudioPath && (
                     <div className={`rounded-2xl border-2 p-4 transition-all ${
                       formData.lifeOfTheListingCare ? "border-black bg-white shadow-md" : "border-gray-100 bg-white"
                     }`}>
                       <div className="flex items-start gap-3">
                         <button
                           type="button"
                           role="checkbox"
                           aria-checked={formData.lifeOfTheListingCare}
                           onClick={() => updateFormData({ lifeOfTheListingCare: !formData.lifeOfTheListingCare })}
                           className="flex flex-1 items-start gap-3 text-left"
                         >
                           <span
                             className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-all shrink-0 ${
                               formData.lifeOfTheListingCare ? "border-black bg-black" : "border-gray-200 bg-white"
                             }`}
                           >
                             {formData.lifeOfTheListingCare && <Check className="w-3 h-3 text-white stroke-[4]" />}
                           </span>
                           <span className="text-[11px] font-bold text-neutral-800">
                             {LIFE_OF_THE_LISTING_CARE_CHECKBOX_LABEL}
                           </span>
                         </button>
                         <span className="text-[10px] font-black uppercase tracking-wide text-neutral-600 shrink-0 pt-0.5">
                           {LIFE_OF_THE_LISTING_CARE_PRICE_LABEL}
                         </span>
                       </div>
                       <button
                         type="button"
                         onClick={() => setSelectedDetailItem({
                           name: "Life of the Listing Care",
                           description: LIFE_OF_THE_LISTING_CARE_BLURB,
                           priceNote: LIFE_OF_THE_LISTING_CARE_PRICE_LABEL,
                         })}
                         className="mt-2 ml-8 inline-flex items-center gap-1 text-[10px] font-bold text-neutral-600 hover:text-neutral-950"
                       >
                         <Info className="w-3 h-3" />
                         Service note
                       </button>
                     </div>
                   )}
                 </>
               )}
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
              <h2 className="text-4xl font-black tracking-tight uppercase text-black">YOU'RE IN</h2>
              <p className="text-gray-500 font-medium max-w-md mx-auto leading-relaxed text-sm">
                {submitNote || "We're sharpening the lenses and checking the weather. Expect a confirmation text shortly."}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button asChild className="bg-black hover:bg-gray-800 text-white font-black px-10 py-6 text-sm rounded-2xl transition-all shadow-xl hover:scale-105 active:scale-95 w-full sm:w-auto">
                <a href="/">Back to Home</a>
              </Button>
              <Button
                onClick={() => {
                  setStep(1);
                  setExpandedCategories(["listings"]);
                  setFormData(prev => ({
                    ...prev,
                    address: "",
                    servicePlace: null,
                    selectedService: "",
                    selectedBasics: [],
                    selectedAddOns: [],
                    lifeOfTheListingCare: false,
                    premiumUpgrade: false,
                    virtualStagingCredits: 0,
                    smsConsent: false
                  }));
                }}
                variant="outline"
                className="border-2 border-black text-black font-black px-10 py-6 text-sm rounded-2xl transition-all shadow-md hover:scale-105 active:scale-95 w-full sm:w-auto"
              >
                Book Another Service
              </Button>
            </div>
          </motion.div>
        );
    }
  };

  if (step === "success") {
    return (
      <div className="max-w-2xl mx-auto px-4 text-neutral-950">
        {renderStep()}
      </div>
    );
  }

  return (
    <div className="max-w-[1300px] mx-auto px-4 py-8 text-neutral-950">
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Main Form Area */}
        <div className="flex-1 space-y-8">
           {/* Progress Steps */}
           <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5, 6].map((i) => {
                const isCurrentOrPast = (step as number) >= i;
                const isStepConsultationIgnored = isConsultationPath && [2, 3].includes(i);
                const isStepStudioIgnored = isStudioPath && [2, 3, 5].includes(i);
                const isStepStandardIgnored = !isConsultationPath && !isStudioPath && i === 5;

                if (isStepConsultationIgnored || isStepStudioIgnored || isStepStandardIgnored) return null;

                return (
                  <div key={i} className="flex-1 h-1.5 rounded-full transition-all duration-700 bg-gray-100 relative overflow-hidden">
                     <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: isCurrentOrPast ? "100%" : "0%" }}
                      className="absolute inset-0 bg-black"
                     />
                  </div>
                );
              })}
           </div>

           <div className="min-h-[550px] bg-white text-neutral-950 rounded-[3rem] border border-gray-50 p-10 shadow-sm relative overflow-hidden">
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
              {step < 6 ? (
                <Button
                  onClick={nextStep}
                  className="flex-1 h-16 bg-black hover:bg-gray-800 text-white font-black uppercase tracking-[0.15em] text-[11px] rounded-2xl shadow-xl transition-all hover:scale-[1.005] group"
                >
                  Next Stage <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform ml-2" />
                </Button>
              ) : (
                <div className="flex-1 space-y-3">
                <p className="text-sm leading-relaxed text-gray-700">
                  Iconic Images will send transactional booking and appointment texts only if the consent box above is checked. Message frequency varies. Message and data rates may apply. Reply STOP to opt out. Reply HELP for help.{" "}
                  <Link to="/privacy" className="font-semibold text-black underline">Privacy Policy</Link>
                  {" · "}
                  <Link to="/terms" className="font-semibold text-black underline">Terms and Conditions</Link>.
                </p>
                <Button
                  onClick={handleBookNow}
                  disabled={isSubmitting}
                  className="w-full h-16 bg-black hover:bg-gray-900 text-white font-black uppercase tracking-[0.15em] text-[11px] rounded-2xl shadow-xl transition-all hover:scale-[1.005] group"
                  style={{ backgroundColor: settings.global.primaryColor }}
                >
                  {isSubmitting ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Processing...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4" /> {isConsultationPath ? "BOOK MY CONSULTATION" : "BOOK MY CAMPAIGN"}
                    </div>
                  )}
                </Button>
                </div>
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
              <div className="pt-4 border-t border-gray-800 flex flex-wrap items-center gap-x-6 gap-y-3">
                 <button
                  onClick={() => setIsChatOpen(true)}
                  className="flex items-center gap-2.5 group transition-colors"
                 >
                    <div className="w-8 h-8 rounded-lg bg-teal-400/10 flex items-center justify-center text-teal-400 group-hover:bg-teal-400 group-hover:text-black transition-all shadow-sm">
                       <MessageCircle className="w-4 h-4" />
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-widest group-hover:text-teal-400 transition-colors whitespace-nowrap">Chat Support</span>
                 </button>

                 <a
                  href={BUSINESS_CONTACT.phoneHref}
                  className="flex items-center gap-2.5 group transition-colors"
                 >
                    <div className="w-8 h-8 rounded-lg bg-teal-400/10 flex items-center justify-center text-teal-400 group-hover:bg-teal-400 group-hover:text-black transition-all shadow-sm">
                       <Phone className="w-4 h-4" />
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-widest group-hover:text-teal-400 transition-colors whitespace-nowrap">{BUSINESS_CONTACT.phoneDisplay}</span>
                 </a>
              </div>
           </div>
        </div>
      </div>
      <ChatWidget isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />

      {/* Iconic Upgrade Popup */}
      <Dialog open={showIconicPopup} onOpenChange={setShowIconicPopup}>
        <DialogContent className="max-w-xl rounded-[2.5rem] p-0 overflow-hidden border-none bg-white shadow-2xl">
          <div className="bg-black p-10 text-white relative overflow-hidden">
             <div className="absolute top-0 right-0 p-10 opacity-10">
                <Sparkles className="w-32 h-32" />
             </div>
             <div className="relative z-10 text-center space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-400/20 text-teal-400 text-[10px] font-black uppercase tracking-widest border border-teal-400/30">
                  <Sparkles className="w-3 h-3" /> UPGRADE OPPORTUNITY
                </div>
                <DialogHeader className="space-y-4 text-center sm:text-center">
                  <DialogTitle className="text-4xl font-black uppercase tracking-tight leading-none text-white">
                    Make it <br />"Magazine Ready"
                  </DialogTitle>
                  <DialogDescription className="text-gray-400 text-sm font-medium max-w-xs mx-auto text-center">
                    The ultimate digital polish for your listing. We touch up every detail to ensure it stands out.
                  </DialogDescription>
                </DialogHeader>
             </div>
          </div>
          <div className="p-10 space-y-8">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                {[
                  "Remove Dirt & Debris",
                  "Remove Reflections and Harsh Shadows",
                  "Remove Cords & Powerlines",
                  "Clean Driveways",
                  "Clean Roads & Sidewalks",
                  "Add Grass",
                  "Add Curb Appeal",
                  "Add Landscaping",
                  "Add TVs & Screens",
                  "Add Fire to Pits and Places"
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-teal-50 flex items-center justify-center">
                       <Check className="w-3 h-3 text-teal-500 stroke-[3]" />
                    </div>
                    <span className="text-[11px] font-bold text-gray-700">{item}</span>
                  </div>
                ))}
             </div>

             <div className="flex flex-col gap-3">
                <Button
                  onClick={() => {
                    updateFormData({ premiumUpgrade: true });
                    setShowIconicPopup(false);
                    setStep(2);
                  }}
                  className="bg-black hover:bg-gray-800 text-white font-black py-8 text-sm rounded-2xl transition-all shadow-xl group"
                >
                   UPGRADE TO ICONIC FINISH (+${iconicFinishPrice})
                   <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
                <button
                  onClick={() => {
                    setShowIconicPopup(false);
                    setStep(2);
                  }}
                  className="py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-black transition-colors"
                >
                   No thanks, I'll stick with basics
                </button>
             </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail Pop-out Modal */}
      <Dialog open={showVirtualStagingPopup} onOpenChange={setShowVirtualStagingPopup}>
        <DialogContent className="max-w-xl rounded-[2.5rem] p-0 overflow-hidden border-none bg-white shadow-2xl">
          <div className="bg-black p-10 text-white relative overflow-hidden text-center">
             <div className="absolute top-0 right-0 p-10 opacity-10">
                <Layout className="w-32 h-32" />
             </div>
             <div className="relative z-10 space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-400/20 text-teal-400 text-[10px] font-black uppercase tracking-widest border border-teal-400/30">
                  <Sparkles className="w-3 h-3" /> Property is Unfurnished
                </div>
                <DialogHeader className="space-y-4">
                  <DialogTitle className="text-4xl font-black uppercase tracking-tight leading-none text-white text-center">
                    Add Virtual <br />Staging?
                  </DialogTitle>
                  <DialogDescription className="text-gray-400 text-sm font-medium max-w-xs mx-auto text-center">
                    Unfurnished homes take 2x longer to sell. Add high-end furniture to your photos and help buyers visualize the space.
                  </DialogDescription>
                </DialogHeader>
             </div>
          </div>
          <div className="p-10 space-y-8">
             <div className="bg-gray-50 rounded-2xl p-6 flex items-center justify-between border border-gray-100">
                <div className="space-y-1">
                   <h4 className="text-xs font-black uppercase text-black tracking-widest">Staging Credits</h4>
                   <p className="text-[10px] text-gray-400 font-bold">${virtualStagingUnitPrice} Per Image</p>
                </div>
                <div className="flex items-center gap-4">
                   <button
                    onClick={() => updateFormData({ virtualStagingCredits: Math.max(0, formData.virtualStagingCredits - 1) })}
                    className="w-10 h-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center hover:border-black transition-all"
                   >
                      <Minus className="w-4 h-4 text-black" />
                   </button>
                   <span className="text-xl font-black text-black w-6 text-center">{formData.virtualStagingCredits}</span>
                   <button
                    onClick={() => updateFormData({ virtualStagingCredits: formData.virtualStagingCredits + 1 })}
                    className="w-10 h-10 rounded-xl bg-black flex items-center justify-center hover:scale-105 transition-all"
                   >
                      <Plus className="w-4 h-4 text-white" />
                   </button>
                </div>
             </div>

             <div className="space-y-4">
                <div className="flex items-center gap-3">
                   <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center text-teal-500">
                      <Zap className="w-4 h-4" />
                   </div>
                   <p className="text-[11px] font-bold text-gray-700 leading-tight">
                     <span className="text-black">Post-Delivery Access:</span> You'll receive a direct link to our <span className="text-teal-600">AI Virtual Staging Lab</span> once your media is delivered to stage even more.
                   </p>
                </div>
             </div>

             <div className="flex flex-col gap-3">
                <Button
                  onClick={() => setShowVirtualStagingPopup(false)}
                  className="bg-black hover:bg-gray-800 text-white font-black py-8 text-sm rounded-2xl transition-all shadow-xl group"
                >
                   {formData.virtualStagingCredits > 0 ? `ADD ${formData.virtualStagingCredits} STAGING CREDITS` : 'CONTINUE WITHOUT STAGING'}
                   <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
             </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedDetailItem} onOpenChange={(open) => !open && setSelectedDetailItem(null)}>
        <DialogContent className="max-w-xl rounded-[2rem] p-0 overflow-hidden border-none bg-white shadow-2xl">
          <div className="bg-black p-8 text-white relative overflow-hidden">
             <div className="absolute top-0 right-0 p-8 opacity-10">
                <Sparkles className="w-24 h-24" />
             </div>
             <div className="relative z-10">
                <DialogHeader>
                   <div className="flex items-center gap-3 mb-2">
                      <div className="px-3 py-1 rounded-full bg-teal-400/20 text-teal-400 text-[10px] font-black uppercase tracking-widest border border-teal-400/30">
                         Product Details
                      </div>
                   </div>
                   <DialogTitle className="text-3xl font-black uppercase tracking-tight text-white mb-2">
                      {selectedDetailItem?.name}
                   </DialogTitle>
                   <DialogDescription className="text-gray-400 text-sm font-medium leading-relaxed">
                      {selectedDetailItem?.description}
                   </DialogDescription>
                </DialogHeader>
             </div>
          </div>
          <div className="p-8 space-y-6">
             {selectedDetailItem?.appointmentLimit && (
                <p className="text-[11px] font-medium leading-snug text-gray-400">
                   {selectedDetailItem.appointmentLimit}. Overages: {APPRENTICESHIP_OVERAGE_LABEL}.
                </p>
             )}
             {selectedDetailItem?.features && (
                <div className="space-y-4">
                   <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 flex items-center gap-2">
                      <Check className="w-3 h-3 text-teal-500" /> WHAT'S ALL INCLUDED
                   </h4>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {selectedDetailItem.features.map((feature: string, idx: number) => (
                         <div key={idx} className="flex items-start gap-3 bg-gray-50 p-3 rounded-xl border border-gray-100">
                            <Check className="w-3.5 h-3.5 text-teal-500 mt-0.5 shrink-0" />
                            <span className="text-[11px] font-bold text-gray-700 leading-tight">{feature}</span>
                         </div>
                      ))}
                   </div>
                </div>
             )}
             {Array.isArray(selectedDetailItem?.rules) && selectedDetailItem.rules.length > 0 && (
                <div className="space-y-3 rounded-2xl border border-black p-4">
                   <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-black">The rules. Read them.</h4>
                   <ul className="list-disc space-y-2 pl-4">
                      {selectedDetailItem.rules.map((rule: string) => (
                         <li key={rule} className="text-[12px] font-medium leading-relaxed text-gray-700">{rule}</li>
                      ))}
                   </ul>
                </div>
             )}
             <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                {selectedDetailItem?.price > 0 ? (
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Investment</p>
                    <p className="text-2xl font-black text-black">${selectedDetailItem.price}</p>
                  </div>
                ) : selectedDetailItem?.priceNote ? (
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Price</p>
                    <p className="text-2xl font-black text-black">{selectedDetailItem.priceNote}</p>
                  </div>
                ) : <div />}
                <Button
                  onClick={() => setSelectedDetailItem(null)}
                  className="bg-black hover:bg-gray-800 text-white font-black px-8 h-14 rounded-2xl transition-all shadow-lg"
                >
                   GOT IT
                </Button>
             </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
