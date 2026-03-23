import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { useIsMobile } from "@/hooks/use-mobile";
import { createOrder } from "@/lib/createOrder";
import { useSearchParams } from "react-router-dom";
import ChatWidget from "@/components/ChatWidget";
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
import { testWrite } from "../lib/testWrite";

type Step = 1 | 2 | 3 | 4 | 5 | 6 | "success";

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
  features?: string[];
}

const services: Service[] = [
  // Listings
  {
    id: "listing-essentials",
    name: "The Essentials",
    category: "listings",
    price: 249,
    description: "Clean, bright, and ready to post. Perfect for quick turnarounds.",
    features: [
      "30 Images",
      "The 'Snap' Reel (15s)",
      "Trending Audio",
      "Pre-Launch Delivery Packet",
      "1 Iconic Twilight Render",
      "Same Day Delivery*"
    ]
  },
  {
    id: "listing-showcase",
    name: "The Showcase",
    category: "listings",
    price: 549,
    description: "A complete visual deep-dive. We capture the details, the angles, and the atmosphere.",
    isPopular: true,
    features: [
      "50 Images",
      "5 Aerials",
      "The 'Snap' Reel (15s)",
      "1 'Iconic' 3D Animated Reel (60s Vert)",
      "2D Floorplan",
      "Pre-Launch Delivery Packet",
      "2 Iconic Twilight Renders",
      "Same Day Delivery*"
    ]
  },
  {
    id: "listing-legacy",
    name: "The Legacy",
    category: "listings",
    price: 899,
    description: "Our highest level of care. We create a cinematic experience.",
    features: [
      "Full Images",
      "Full Aerials",
      "The 'Snap' Reel (15s)",
      "1 'Iconic' 3D Animated Reel (60s Vert)",
      "90s 4K Cinematic Property Video (with Aerial)",
      "Pre-Launch Delivery Packet",
      "5 Iconic Twilight Renders",
      "Agent On Camera Intro/Outro",
      "3D Motion Graphics and Animations",
      "Same Day Delivery*"
    ]
  },
  {
    id: "listing-market-leader",
    name: "The Market Leader",
    category: "listings",
    price: 1599,
    description: "Total market saturation strategy. Full-cycle media partner.",
    features: [
      "Full Images (Next-Day)",
      "Full Aerials (Same-Day by 7PM)",
      "The 'Snap' Reel (15s) (Same-Day by 7PM)",
      "1 'Iconic' Animated Reel (60s Vert) (Next-Day)",
      "2D Floorplan (Next-Day)",
      "Pre-Launch Delivery Packet (Same-Day by 7PM)",
      "5 Iconic Twilight Renders (Same-Day by 7PM)",
      "90s 4K Cinematic Video (Next-Day)",
      "VR / Matterport (Vision Pro Ready) & 2D Floorplan (Next-Day)",
      "The Iconic Finish - Complimentary Premium Editing",
      "Post-Sale Marketing Package (Scheduled)"
    ]
  },

  // Branding
  {
    id: "branding-refresh",
    name: "The Refresh",
    category: "branding",
    price: 349,
    description: "The Modern Portrait. Approachable, professional, and uniquely you.",
    features: [
      "60-Minute Session",
      "10 High-End 'Lifestyle' Portraits",
      "The Woodlands/Spring Locations",
      "AI Digital Twin Lite Setup",
      "Voice and Likeness Cloning"
    ]
  },
  {
    id: "branding-content-partner",
    name: "The Content Partner",
    category: "branding",
    price: 999,
    description: "30 days of content in 2 hours. Never wonder what to post again.",
    isPopular: true,
    features: [
      "2-Hour Monthly Filming Session",
      "Full Strategy, Scripting & Direction",
      "20 Custom Reels for Socials",
      "Trending Audio & Personal Branding"
    ]
  },
  {
    id: "branding-local-legend",
    name: "The Local Legend",
    category: "branding",
    price: 2499,
    description: "The Market Takeover Campaign. Your Story, Told Cinematically.",
    features: [
      "6-8 Hour Signature Production Day",
      "90-Second 4K Bio Film",
      "5 \"Local Authority\" Neighborhood Spotlights",
      "Pre-Production \"Vibe Check\" and Professional Scripting",
      "Post-Production Guidance and Marketing Review"
    ]
  },

  // Business (Social Monopoly)
  {
    id: "business-baseline",
    name: "The Baseline",
    category: "business",
    price: 500,
    description: "The Professional Foundation. Establish consistency with 8 edited reels per month.",
    phase: 1,
    features: [
      "8 Professionally Edited Reels (2/week)",
      "Signature \"Iconic\" 2026 Editing Style",
      "Trending Audio & Brand Integration"
    ]
  },
  {
    id: "business-growth-engine",
    name: "The Growth Engine",
    category: "business",
    price: 850,
    description: "Turning Views into Conversations. 12 edited reels with high-conversion hooks.",
    phase: 1,
    isPopular: true,
    features: [
      "12 Professionally Edited Reels (3/week)",
      "The Hook Suite: High-conversion captions & strategic hashtags.",
      "Scroll-Stopping Visual Flow.",
      "Conversion-Focused Copywriting"
    ]
  },
  {
    id: "business-professional-suite",
    name: "The Professional Suite",
    category: "business",
    price: 1500,
    description: "Total hands-off management for your professional presence.",
    phase: 2,
    features: [
      "12 Reels + Full Scheduling & Posting",
      "Multi-Platform Deployment (IG/FB/TikTok)",
      "Algorithm \"Warm-up\" & Manual Engagement"
    ]
  },
  {
    id: "business-signature-tier",
    name: "The Signature Tier",
    category: "business",
    price: 2800,
    description: "The High-Volume Authority. Total hands-off authority.",
    phase: 2,
    features: [
      "20 Reels/month (Daily M-F Presence)",
      "1 Monthly In-Person Branding/Field Shoot",
      "Lead Flagging (We notify you who to call)"
    ]
  },
  {
    id: "business-iconic-partnership",
    name: "The Iconic Partnership",
    category: "business",
    price: 4500,
    description: "Your Personal Media Agency. A full-scale media agency in your pocket.",
    phase: 2,
    features: [
      "Unlimited Reel Production",
      "2 Monthly Professional Field Shoots",
      "Full CRM & Lead Automation Integration",
      "The Iconic Polish: All Premium Editing Included"
    ]
  },
  {
    id: "business-connected-core",
    name: "The Connected Core",
    category: "business",
    price: 2000,
    description: "Social + Database Penetration. Balanced social and direct-to-SOI marketing.",
    phase: 2,
    highlights: "Full Stack Email & Database Marketing",
    features: [
      "12 Edited Reels + Management",
      "Monthly 'Featured Insight' Email Blast",
      "Repurposed Content for your Newsletter",
      "Direct-to-Sphere Engagement"
    ]
  },
  {
    id: "business-authority-stack",
    name: "The Authority Stack",
    category: "business",
    price: 3200,
    description: "Total Audience Ownership. High-frequency content and deep SOI penetration.",
    phase: 2,
    highlights: "Full Stack Email & Database Marketing",
    features: [
      "20+ Reels + Monthly Pro-Filming Session",
      "Bi-Weekly SMS & Email Campaign Updates",
      "Full Automation of Social & Direct Outreach",
      "High-Impact Omni-channel Production"
    ]
  },

  // Growth / Brand Strategy
  {
    id: "growth-foundation",
    name: "The Foundation",
    category: "growth",
    price: 0,
    description: "Essential visual assets and strategic core for a professional presence.",
    features: [
      "Logos Suite",
      "Signature Style Guide",
      "Hex Color Palettes",
      "Canva Brand Hub Setup",
      "Marketing Templates",
      "Digital Business Card"
    ]
  },
  {
    id: "growth-evolution",
    name: "The Evolution",
    category: "growth",
    price: 0,
    description: "Cutting-edge AI integration to automate your content and reach.",
    features: [
      "AI Voice Clone Setup",
      "AI Video Avatar Creation",
      "Automated Updates Suite",
      "Voice Synthesis Training",
      "Likeness Protection",
      "Vision Pro Readiness"
    ]
  },
  {
    id: "growth-bundle",
    name: "The Bundle",
    category: "growth",
    price: 0,
    description: "Foundation + Evolution. Total brand immersion and strategic identity design.",
    features: [
      "Logos Suite & Visual Identity",
      "Signature Style Guide",
      "Hex Color Palettes",
      "Canva Brand Hub Setup",
      "Marketing Templates",
      "Digital Business Card",
      "AI Voice Clone Setup",
      "AI Video Avatar Creation",
      "Automated Updates Suite",
      "Voice Synthesis Training",
      "Likeness Protection",
      "Vision Pro Readiness"
    ]
  },
];

const basicsList = [
  {
    id: "photos-20",
    name: "20 Photos",
    price: 99,
    description: "Essential photo package for smaller listings.",
    features: [
      "20 High-End Photos",
      "Basic Edits",
      "Color Balance",
      "Clear Windows",
      "Sky Replacement",
      "Next Day Turn Around",
      "Reflection/Mirror Removal"
    ]
  },
  {
    id: "photos-35",
    name: "35 Photos",
    price: 150,
    description: "Standard photo package for most residential listings.",
    features: [
      "35 High-End Photos",
      "Basic Edits",
      "Color Balance",
      "Clear Windows",
      "Sky Replacement",
      "Next Day Turn Around",
      "Reflection/Mirror Removal"
    ]
  },
  {
    id: "photos-50",
    name: "50 Photos",
    price: 200,
    description: "Complete photo package for large homes and detailed spaces.",
    features: [
      "50 High-End Photos",
      "Basic Edits",
      "Color Balance",
      "Clear Windows",
      "Sky Replacement",
      "Next Day Turn Around",
      "Reflection/Mirror Removal"
    ]
  },
];

const addOns = [
  { category: "Speed & Social", items: [
    {
      id: "same-day",
      name: "Same-Day Delivery",
      price: 50,
      description: "Photos, Twilight Render and Snap Reel by 7PM (Basic Edits).",
      features: [
        "Photos by 7PM",
        "Snap Reel by 7PM",
        "Twilight Renders by 7PM"
      ]
    },
    {
      id: "basic-reel",
      name: "Basic Reel",
      price: 125,
      description: "A high-impact 15s vertical video optimized for social media.",
      features: [
        "15-Second Vertical Video",
        "Trending Audio Integration",
        "Fast-Paced Editing Style"
      ]
    },
  ]},
  { category: "The Space", items: [
    {
      id: "aerial-drone",
      name: "Aerial Drone Stills",
      price: 99,
      description: "Capture the property and its surroundings from a unique perspective.",
      features: [
        "5 High-Res Aerial Photos",
        "Neighborhood Context Shots",
        "Professional Color Grading"
      ]
    },
    {
      id: "matterport-3d",
      name: "Matterport 3D Tour",
      price: 200,
      description: "A fully immersive 3D walkthrough experience for remote buyers.",
      features: [
        "Full 3D Interior Model",
        "Dollhouse View",
        "Interactive Floor Navigation"
      ]
    },
    {
      id: "basic-video",
      name: "Basic Video",
      price: 300,
      description: "A professional cinematic walkthrough of the property interior.",
      features: [
        "60-Second 4K Video",
        "Interior & Exterior Highlights",
        "Licensed Background Music"
      ]
    },
    {
      id: "aerial-premium",
      name: "Aerial Premium Video",
      price: 550,
      description: "The ultimate drone experience with cinematic sweeps and tracking shots.",
      features: [
        "90-Second 4K Aerial Film",
        "Dynamic Tracking Shots",
        "Advanced Neighborhood Highlights"
      ]
    },
    {
      id: "floorplan-2d",
      name: "2D Floor Plan",
      price: 75,
      description: "Accurate dimensions and layout visualization for buyers.",
      features: [
        "Precise Room Measurements",
        "Clean Schematic Layout",
        "PDF & JPG Deliverables"
      ]
    },
    {
      id: "amenity-addon",
      name: "Amenity",
      price: 50,
      description: "Capture the shared spaces and community features that add value.",
      features: [
        "Pool & Clubhouse Shots",
        "Parks & Shared Spaces",
        "Community Context"
      ]
    },
  ]},
  { category: "The Brand", items: [
    {
      id: "agent-intro",
      name: "Agent Intro/Outro",
      price: 75,
      description: "Put a face to the brand with a professional on-camera introduction.",
      features: [
        "On-Camera Greeting",
        "Professional Audio Setup",
        "Call-to-Action Closing"
      ]
    },
  ]}
];

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

export default function BookingForm({ initialServiceId, initialCategoryId }: BookingFormProps = {}) {
  const settings = useSiteSettings();
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState<Step>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
    sqft: "",
    serviceDate: undefined as Date | undefined,
    serviceTime: "9:00 AM",
    preferredPhotographer: "Available (Auto-Assign)",
    selectedService: initialServiceId || "" as string,
    selectedBasics: [] as string[],
    selectedAddOns: [] as string[],
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
    marketingDoing: "",
    resultsBothering: "",
    perfectBusiness: "",
    businessSource: "",
    investmentWilling: "",
    leadSource: "", // UTM tracking
    specializedPhotography: "mls" as "mls" | "social" | "both",
  });

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

      setFormData(prev => ({
        ...prev,
        selectedBasics: items.filter(i => i !== "specialized-social" && i !== "specialized-both"),
        premiumUpgrade: premiumParam,
        specializedPhotography: specializedBoth ? "both" : specializedSocial ? "social" : prev.specializedPhotography
      }));
      setShowBasics(true);
    }
  }, [searchParams, initialServiceId]);

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
        price: 65,
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

  const nextStep = () => {
    if (step === 1 && !formData.selectedService && formData.selectedBasics.length === 0) {
      toast.error("Please select a Campaign Tier or Basics package");
      return;
    }

    // Check if we should show the Iconic Finish popup
    if (step === 1) {
      if (isConsultationPath) {
        setStep(4); // Jump to scheduling
        return;
      }

      const selectedService = services.find(s => s.id === formData.selectedService);
      const isListing = selectedService?.category === "listings";
      const isMarketLeader = formData.selectedService === "listing-market-leader";
      const isBasics = formData.selectedBasics.length > 0;

      if ((isListing && !isMarketLeader) || isBasics) {
        if (!formData.premiumUpgrade) {
          setShowIconicPopup(true);
          return;
        }
      }
    }

    if (step === 4) {
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
    if (step === 4 && isConsultationPath) {
      setStep(1);
      return;
    }
    if (step === 6) {
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

  const handleBookNow = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    console.log("STEP 1: submit clicked")
    setIsSubmitting(true);
    try {
  await createOrder({
    ...formData,

    selectedServicesDetailed: orderSummaryItems,
    selectedAddOnsDetailed: orderSummaryAddOns,

    subtotal: totalEstimate,
    total: totalEstimate
  });

} catch (error) {
  console.error("ORDER ERROR:", error);
}
  const selectedServiceData = services.find(s => s.id === formData.selectedService);
  const isConsultationPath = selectedServiceData && ["branding", "business", "growth"].includes(selectedServiceData.category);

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
    if (formData.virtualStagingCredits > 0) total += formData.virtualStagingCredits * 35;

    if (formData.specializedPhotography === "social") total += 85;
    if (formData.specializedPhotography === "both") total += 125;

    if (appliedPromo) {
      total = Math.max(0, total - appliedPromo.discount);
    }

    return total;
  };

  const handleApplyPromo = () => {
    if (promoInput.toUpperCase() === "ICONICAI") {
      setAppliedPromo({ code: "ICONICAI", discount: 35 }); // $35 off (1 free virtual staging)
      toast.success("Promo code 'ICONICAI' applied! ($35 discount)");
    } else if (promoInput.toUpperCase() === "NEWYEAR") {
      setAppliedPromo({ code: "NEWYEAR", discount: 50 });
      toast.success("Promo code applied!");
    } else {
      toast.error("Invalid promo code");
    }
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
        {formData.specializedPhotography !== "mls" && (
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-gray-500 italic">📸 Specialized: {formData.specializedPhotography === "social" ? "Social Media Optimized" : "MLS + Social Media Optimized"}</span>
            <span className="font-bold text-black">${formData.specializedPhotography === "social" ? 85 : 125}</span>
          </div>
        )}
        {formData.virtualStagingCredits > 0 && (
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-gray-500 italic">🏠 Virtual Staging ({formData.virtualStagingCredits} credits)</span>
            <span className="font-bold text-black">${formData.virtualStagingCredits * 35}</span>
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

        {/* Applied Promo Display */}
        {appliedPromo && (
          <div className="pt-2 mt-2 border-t border-dashed border-teal-100 flex justify-between items-center text-[11px]">
             <span className="text-teal-600 font-bold flex items-center gap-1.5"><Sparkles className="w-3 h-3" /> PROMO: {appliedPromo.code}</span>
             <span className="font-black text-teal-600">-${appliedPromo.discount}</span>
          </div>
        )}
      </div>

      {/* Promo Code Input Section */}
      <div className="mb-6">
        <div className="flex gap-2">
          <Input
            placeholder="PROMO CODE"
            className="h-10 text-[10px] font-black uppercase tracking-widest border-gray-100 rounded-xl px-4"
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
        <div className="flex justify-between items-center mb-4">
          <span className="text-[10px] font-black uppercase text-gray-400">Total Estimate</span>
          <span className="text-2xl font-black text-black" style={{ color: settings.global.primaryColor }}>
            ${calculateTotal()}
          </span>
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
                // Basics View
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                   {basicsList.map((b) => (
                     <button
                      key={b.id}
                      onClick={() => toggleBasic(b.id)}
                      className={`p-6 rounded-2xl border-2 transition-all text-left bg-white relative ${
                        formData.selectedBasics.includes(b.id) ? 'border-black bg-white scale-[1.01] shadow-lg' : 'border-gray-100 bg-white hover:border-gray-200'
                      }`}
                     >
                       <div className="space-y-1">
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
            {((selectedServiceData && selectedServiceData.id !== "listing-market-leader") || formData.selectedBasics.length > 0) && (
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
                           <span className="text-sm font-black text-teal-400 whitespace-nowrap">+$65</span>
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
                    { id: "social", name: "Social Media Optimized", price: 85, description: "vertical, detailed, and lifestyle" },
                    { id: "both", name: "Both Styles", price: 125, description: "MLS + Social Media Optimized" }
                  ].map((style) => (
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
                          onClick={() => {
                            updateFormData({ furnishingStatus: status });
                            if (status === "Unfurnished") {
                              setShowVirtualStagingPopup(true);
                            }
                          }}
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
                      <SelectTrigger className="h-16 rounded-[1.25rem] border-2 px-6 font-black text-black border-black bg-white focus:ring-0">
                        <SelectValue placeholder="Select Month" />
                      </SelectTrigger>
                      <SelectContent className="rounded-2xl border-none shadow-2xl p-2 max-h-[300px]">
                        {months.map((m) => (
                          <SelectItem key={format(m, "yyyy-MM")} value={format(m, "yyyy-MM")} className="rounded-xl py-3 font-bold cursor-pointer focus:bg-gray-50">
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
                      <SelectTrigger className="h-16 rounded-[1.25rem] border-2 px-6 font-black text-black border-black bg-white focus:ring-0">
                        <SelectValue placeholder="Select Date" />
                      </SelectTrigger>
                      <SelectContent className="rounded-2xl border-none shadow-2xl p-2 max-h-[300px]">
                        {daysInMonth.map((d) => (
                          <SelectItem key={format(d, "yyyy-MM-dd")} value={format(d, "yyyy-MM-dd")} className="rounded-xl py-3 font-bold cursor-pointer focus:bg-gray-50">
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
                      <SelectTrigger className="h-16 rounded-[1.25rem] border-2 px-6 font-black text-black border-black bg-white focus:ring-0">
                        <SelectValue placeholder="Select Time" />
                      </SelectTrigger>
                      <SelectContent className="rounded-2xl border-none shadow-2xl p-2">
                        {["9:00 AM", "11:00 AM", "1:00 PM", "3:00 PM", "5:00 PM"].map((t) => (
                          <SelectItem key={t} value={t} className="rounded-xl py-3 font-bold cursor-pointer focus:bg-gray-50">
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
                        <SelectTrigger className="h-16 rounded-[1.25rem] border-2 px-6 font-black text-black border-black bg-white focus:ring-0">
                          <SelectValue placeholder="Select Photographer" />
                        </SelectTrigger>
                        <SelectContent className="rounded-2xl border-none shadow-2xl p-2">
                          {photographers.map((p) => (
                            <SelectItem key={p} value={p} className="rounded-xl py-3 font-bold cursor-pointer focus:bg-gray-50">
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
                            formData[q.id as keyof typeof formData] === opt ? 'border-black bg-gray-50' : 'border-gray-50 bg-white hover:border-gray-200'
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

               {!isConsultationPath && (
                 <>
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
              <h2 className="text-4xl font-black tracking-tight uppercase text-black">Booking received</h2>
              <p className="text-gray-500 font-medium max-w-sm mx-auto leading-relaxed text-sm">
                We're sharpening the lenses and checking the weather. Expect a confirmation text shortly.
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
                    selectedService: "",
                    selectedBasics: [],
                    selectedAddOns: [],
                    premiumUpgrade: false,
                    virtualStagingCredits: 0
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
      <div className="max-w-2xl mx-auto px-4">
        {renderStep()}
      </div>
    );
  }

  return (
    <div className="max-w-[1300px] mx-auto px-4 py-8">
      <button type="button" onClick={testWrite}>
        TEST FIRESTORE
      </button>
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Main Form Area */}
        <div className="flex-1 space-y-8">
           {/* Progress Steps */}
           <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5, 6].map((i) => {
                const isCurrentOrPast = (step as number) >= i;
                const isStepConsultationIgnored = isConsultationPath && [2, 3].includes(i);
                const isStepStandardIgnored = !isConsultationPath && i === 5;

                if (isStepConsultationIgnored || isStepStandardIgnored) return null;

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
              {step < 6 ? (
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
                      <Sparkles className="w-4 h-4" /> {isConsultationPath ? "BOOK MY CONSULTATION" : "BOOK MY CAMPAIGN"}
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
                  href="tel:281-356-0965"
                  className="flex items-center gap-2.5 group transition-colors"
                 >
                    <div className="w-8 h-8 rounded-lg bg-teal-400/10 flex items-center justify-center text-teal-400 group-hover:bg-teal-400 group-hover:text-black transition-all shadow-sm">
                       <Phone className="w-4 h-4" />
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-widest group-hover:text-teal-400 transition-colors whitespace-nowrap">281.356.0965</span>
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
                   UPGRADE TO ICONIC FINISH (+$65)
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
                   <p className="text-[10px] text-gray-400 font-bold">$35 Per Image</p>
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
             <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                {selectedDetailItem?.price > 0 ? (
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Investment</p>
                    <p className="text-2xl font-black text-black">${selectedDetailItem.price}</p>
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
    });

  } catch (error) {
    console.error("ORDER ERROR:", error);
  }
}
