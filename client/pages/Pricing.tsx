import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Check, X, ArrowRight, Star, ChevronLeft, ChevronRight, Info, Sparkles, Zap, Trophy, Crown, Camera, Video, Layout, Box, Users, Clock, DollarSign, Palette, Rocket, Mic } from "lucide-react";
import { useState, useRef } from "react";
import { useSiteSettings } from "@/hooks/useSiteSettings";

export default function Pricing() {
  const settings = useSiteSettings();
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);
  const [brandingSliderPos, setBrandingSliderPos] = useState(50);
  const [selectedPhotoPkg, setSelectedPhotoPkg] = useState<string | null>(null);
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([]);
  const [isPremiumUpgrade, setIsPremiumUpgrade] = useState(false);

  const toggleAddOn = (addon: string) => {
    setSelectedAddOns(prev =>
      prev.includes(addon) ? prev.filter(a => a !== addon) : [...prev, addon]
    );
  };

  const getBasicsBookingUrl = (premium = false) => {
    const items = [
      selectedPhotoPkg,
      ...selectedAddOns
    ].filter(Boolean);

    if (items.length === 0) return "/book";

    const params = new URLSearchParams();
    params.set("items", items.join(","));
    if (premium) params.set("premium", "true");
    return `/book?${params.toString()}`;
  };

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const offset = 100;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;
      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth"
      });
    }
  };

  const listingTiers = [
    {
      name: "THE ESSENTIALS",
      tagline: "The Fast & Fresh.",
      price: "249",
      period: "per listing",
      description: "Clean, bright, and ready to post. Perfect for quick turnarounds and keeping your feed active.",
      icon: <Zap className="w-6 h-6" style={{ color: settings.global.primaryColor }} />,
      buttonText: "START MY MOMENTUM",
      ctaSubtext: "Your reel is ready before the sign is up.",
      tooltip: "Ideal for fast-moving residential listings where speed and social presence are key.",
      disclaimer: {
        title: "Same Day Delivery",
        text: "Photos, Twilight Render and Snap Reel by 7PM with Basic Edits, premium edits upgrades next day"
      },
      features: [
        { text: "30 Images" },
        { text: "The 'Snap' Reel (15s)" },
        { text: "Trending Audio" },
        { text: "Pre-Launch Delivery Packet" },
        { text: "1 Iconic Twilight Render" },
        { text: "Same Day Delivery*", emphasized: true }
      ]
    },
    {
      name: "THE SHOWCASE",
      tagline: "The Full Story.",
      price: "549",
      period: "per listing",
      description: "A complete visual deep-dive. We capture the details, the angles, and the atmosphere that makes your space unique.",
      icon: <Trophy className="w-6 h-6" style={{ color: settings.global.primaryColor }} />,
      isPopular: true,
      buttonText: "TELL THE FULL STORY",
      ctaSubtext: "Your reel is ready before the sign is up.",
      tooltip: "Best for standard to mid-range listings needing a professional cinematic edge.",
      disclaimer: {
        title: "Same Day Delivery",
        text: "Photos, Aerials, Twilight Renders by 7PM with Basic Edits - Reel, premium edits and 2D Floorplan Next Day"
      },
      features: [
        { text: "50 Images" },
        { text: "5 Aerials" },
        { text: "The 'Snap' Reel (15s)" },
        { text: "1 'Iconic' 3D Animated Reel (60s Vert)" },
        { text: "2D Floorplan" },
        { text: "Pre-Launch Delivery Packet" },
        { text: "2 Iconic Twilight Renders" },
        { text: "Same Day Delivery*", emphasized: true }
      ]
    },
    {
      name: "THE LEGACY",
      tagline: "The Signature Production.",
      price: "899",
      period: "per listing",
      description: "Our highest level of care. We create a cinematic experience that tells people exactly why your brand (or your home) is the one to choose.",
      icon: <Crown className="w-6 h-6" style={{ color: settings.global.primaryColor }} />,
      buttonText: "BUILD MY LEGACY",
      ctaSubtext: "Your reel is ready before the sign is up.",
      tooltip: "Engineered for luxury listings and high-value neighborhoods where image is everything.",
      disclaimer: {
        title: "Same Day Delivery",
        text: "Photos, Aerials, Twilight Renders Same day (Basic Edits) Premium Edits, Video, Reel Next Day"
      },
      features: [
        { text: "Full Images" },
        { text: "Full Aerials" },
        { text: "The 'Snap' Reel (15s)" },
        { text: "1 'Iconic' 3D Animated Reel (60s Vert)" },
        { text: "90s 4K Cinematic Property Video (with Aerial)" },
        { text: "Pre-Launch Delivery Packet" },
        { text: "5 Iconic Twilight Renders" },
        { text: "Agent On Camera Intro/Outro" },
        { text: "3D Motion Graphics and Animations" },
        { text: "Same Day Delivery*", emphasized: true }
      ]
    },
    {
      name: "THE MARKET LEADER",
      tagline: "The Total Takeover",
      subheadline: "Your Full-Cycle Media Partner",
      price: "1,599",
      period: "per listing",
      description: "This isn't just a shoot; it’s a market saturation strategy. We handle the narrative from the first \"Coming Soon\" teaser to the final \"Sold\" success story, ensuring you stay top-of-mind at every stage of the deal.",
      icon: <Box className="w-6 h-6" style={{ color: settings.global.primaryColor }} />,
      badge: "VIP PRIORITY ACCESS",
      isVIP: true,
      buttonText: "ORDER VIP ACCESS",
      ctaSubtext: "Full Campaign Delivery: 24-36 Hours",
      tooltip: "For top producers who want to own their local market and provide unmatched seller value.",
      features: [
        { text: "Full Images (Next-Day)" },
        { text: "Full Aerials (Same-Day by 7PM)", icon: "zap" },
        { text: "The 'Snap' Reel (15s) (Same-Day by 7PM)", icon: "zap" },
        { text: "1 'Iconic' Animated Reel (60s Vert) (Next-Day)", icon: "video" },
        { text: "2D Floorplan (Next-Day)" },
        { text: "Pre-Launch Delivery Packet (Same-Day by 7PM)", icon: "zap" },
        { text: "5 Iconic Twilight Renders (Same-Day by 7PM)", icon: "zap" },
        { text: "90s 4K Cinematic Video (with Aerial, Agent Intro/Outro, 3D Animations & Motion Graphics) (Next-Day)", icon: "video" },
        { text: "VR / Matterport (Vision Pro Ready) & 2D Floorplan (Next-Day)" },
        { text: "The Iconic Finish - Complimentary Premium Editing (Next Day Delivery)" },
        { text: "Post-Sale Marketing Package (Scheduled)", icon: "mic" }
      ]
    }
  ];

  const brandingTiers = [
    {
      name: "THE REFRESH",
      tagline: "The Modern Portrait.",
      price: "349",
      period: "PER SESSION",
      description: "Forget the stiff corporate headshot. We capture you in your element—approachable, professional, and uniquely you.",
      icon: <Camera className="w-6 h-6" style={{ color: settings.global.primaryColor }} />,
      buttonText: "UPGRADE MY IMAGE",
      ctaSubtext: "You sell homes; we’ll handle the fame.",
      tooltip: "Perfect for agents needing a quick but high-end update to their social and professional profiles.",
      features: [
        "60-Minute Session",
        "10 High-End 'Lifestyle' Portraits",
        "The Woodlands/Spring Locations",
        "AI Digital Twin Lite Setup",
        "Voice and Likeness Cloning"
      ]
    },
    {
      name: "THE CONTENT PARTNER",
      tagline: "30 days of content in 2 hours.",
      price: "999",
      period: "per month",
      description: "You show up; we build the brand.",
      icon: <Video className="w-6 h-6" style={{ color: settings.global.primaryColor }} />,
      isPopular: true,
      buttonText: "CREATE MY CONTENT",
      ctaSubtext: "Result: Never wonder \"what to post\" again.",
      tooltip: "Designed for agents who want to dominate social media without the stress of filming or editing.",
      features: [
        "2-Hour Monthly Filming Session",
        "Full Strategy, Scripting & Direction",
        "20 Custom Reels for Socials",
        "Trending Audio & Personal Branding"
      ]
    },
    {
      name: "THE LOCAL LEGEND",
      tagline: "THE MARKET TAKEOVER CAMPAIGN",
      price: "2,499",
      period: "PER SESSION/CAMPAIGN",
      description: "We spend a full day in your world to build a \"Day in the Life\" cinematic library that makes you the undisputed go-to authority in your chosen neighborhood.",
      icon: <Users className="w-6 h-6" style={{ color: settings.global.primaryColor }} />,
      buttonText: "BUILD MY EMPIRE",
      ctaSubtext: "Result: Undisputed status as the local expert.",
      tooltip: "For agents aiming for 'Neighborhood Mayor' status and total local authority.",
      features: [
        "6-8 Hour Signature Production Day",
        "90-Second 4K Bio Film",
        "5 \"Local Authority\" Neighborhood Spotlights",
        "Pre-Production \"Vibe Check\" and Professional Scripting",
        "Post-Production Guidance and Marketing Review"
      ]
    }
  ];

  const phase1Tiers = [
    {
      name: "THE BASELINE",
      price: "500",
      period: "per month",
      tagline: "The Professional Foundation.",
      description: "Stop ghosting your audience. We take your raw footage and turn it into a consistent, professional brand presence.",
      features: [
        "8 Professionally Edited Reels (2/week)",
        "Signature \"Iconic\" 2026 Editing Style",
        "Trending Audio & Brand Integration"
      ],
      buttonText: "SIMPLIFY MY SOCIAL",
      ctaSubtext: "The Goal: Established Consistency.",
      packageId: "content-starter"
    },
    {
      name: "THE GROWTH ENGINE",
      price: "850",
      period: "per month",
      tagline: "Turning Views into Conversations.",
      description: "For the creator ready to start conversations. We don’t just post; we write the hooks that make people stop scrolling and start typing.",
      features: [
        "12 Professionally Edited Reels (3/week)",
        "The Hook Suite: High-conversion captions & strategic hashtags.",
        "Scroll-Stopping Visual Flow.",
        "Conversion-Focused Copywriting"
      ],
      buttonText: "UNLOCK MY GROWTH",
      ctaSubtext: "The Goal: High Engagement & Inbound DMs.",
      isPopular: true,
      packageId: "content-pro"
    }
  ];

  const phase2Tiers = [
    {
      name: "THE PROFESSIONAL SUITE",
      price: "1,500",
      period: "per month",
      tagline: "Your Digital Storefront, Fully Managed.",
      description: "Total hands-off management for your professional presence.",
      features: [
        "12 Reels + Full Scheduling & Posting",
        "Multi-Platform Deployment (IG/FB/TikTok)",
        "Algorithm \"Warm-up\" & Manual Engagement"
      ],
      buttonText: "SECURE MY SUITE"
    },
    {
      name: "THE SIGNATURE TIER",
      price: "2,800",
      period: "per month",
      tagline: "The High-Volume Authority.",
      description: "Total hands-off authority. You show up, we do the rest.",
      features: [
        "20 Reels/month (Daily M-F Presence)",
        "1 Monthly In-Person Branding/Field Shoot",
        "Lead Flagging (We notify you who to call)"
      ],
      buttonText: "ELEVATE MY BRAND",
      isPopular: true
    },
    {
      name: "THE ICONIC PARTNERSHIP",
      price: "4,500",
      period: "per month",
      tagline: "Your Personal Media Agency.",
      description: "A full-scale media agency in your pocket.",
      features: [
        "Unlimited Reel Production",
        "2 Monthly Professional Field Shoots",
        "Full CRM & Lead Automation Integration",
        "The Iconic Polish: All Premium Editing Included (Next Day Delivery)"
      ],
      buttonText: "PARTNER WITH ICONIC"
    },
    {
      name: "THE CONNECTED CORE",
      price: "2,000",
      period: "per month",
      tagline: "Social + Database Penetration.",
      description: "Balanced social and direct-to-SOI marketing.",
      features: [
        "12 Edited Reels + Management",
        "Monthly 'Featured Insight' Email Blast",
        "Repurposed Content for your Newsletter",
        "Direct-to-Sphere Engagement"
      ],
      buttonText: "REACH MY DATABASE"
    },
    {
      name: "THE AUTHORITY STACK",
      price: "3,200",
      period: "per month",
      tagline: "Total Audience Ownership.",
      description: "High-frequency content and deep SOI penetration.",
      features: [
        "20+ Reels + Monthly Pro-Filming Session",
        "Bi-Weekly SMS & Email Campaign Updates",
        "Full Automation of Social & Direct Outreach",
        "High-Impact Omni-channel Production"
      ],
      buttonText: "BECOME OMNIPRESENT"
    }
  ];

  return (
    <div className="flex flex-col min-h-screen bg-[#fafafa]">
      <Header />

      <main className="flex-1 pb-20">
        {/* Hero Section - Reverted Style */}
        <div className="relative overflow-hidden">
          {/* Background Video */}
          <div className="absolute inset-0 z-0 pointer-events-none">
            <video
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-full object-cover opacity-[0.15]"
            >
              <source src="https://videos.pexels.com/video-files/32821434/13990151_640_360_30fps.mp4" type="video/mp4" />
            </video>
            <div className="absolute inset-0 bg-gradient-to-b from-[#fafafa] via-transparent to-[#fafafa]"></div>
          </div>

          <div className="relative z-10 pt-32 pb-16 text-center px-4 max-w-5xl mx-auto">
          <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-black border border-black mb-6 shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-500">
            <span className="text-[12px] font-bold tracking-wider uppercase accent-text-bordered">
              Pricing & Packages
            </span>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-black mb-6 tracking-tight leading-[1.1]">
            The Perfect <span className="accent-text-bordered">Price</span> for Your Presence
          </h1>
          <p className="text-lg text-gray-500 mb-10 max-w-2xl mx-auto font-medium">
            Media that moves as fast as you do.
          </p>

          {/* Hyperlink Bubbles */}
          <div className="flex flex-wrap justify-center gap-4 mb-16">
            {[
              { label: "FOR LISTINGS", id: "listings" },
              { label: "FOR BRANDING", id: "branding" },
              { label: "FOR BUSINESS", id: "social" },
              { label: "FOR GROWTH", id: "brand-identity" }
            ].map((bubble) => (
              <button
                key={bubble.id}
                onClick={() => scrollToSection(bubble.id)}
                className="px-8 py-3 rounded-full border border-gray-200 bg-white text-sm font-bold text-gray-600 hover:text-white transition-all hover:border-transparent"
                style={{ backgroundColor: 'transparent' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = settings.global.primaryColor; e.currentTarget.style.color = 'white'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'white'; e.currentTarget.style.color = 'rgb(75 85 99)'; }}
              >
                {bubble.label}
              </button>
            ))}
          </div>

          {/* AI Assistant CTA - Smaller */}
          <div className="mt-8 p-px bg-black rounded-[2rem] shadow-lg max-w-lg mx-auto transform hover:scale-[1.01] transition-transform duration-500">
            <Link to="/pricing/ai-assistant" className="block bg-white rounded-[1.9rem] p-6 relative overflow-hidden group">
              <div className="relative z-10 flex items-center gap-6">
                <div className="w-12 h-12 rounded-[1rem] bg-[#f0fdfa] border border-[#ccfbf1] flex items-center justify-center shrink-0">
                  <Sparkles className="w-6 h-6" style={{ color: settings.global.primaryColor }} />
                </div>
                <div className="text-left flex-1">
                  <h3 className="text-lg font-bold text-black mb-1">Not sure where to start?</h3>
                  <div className="flex items-center gap-2 font-bold text-xs accent-text-bordered">
                    Let our AI guide you <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </div>
            </Link>
          </div>
        </div>

        </div>

        {/* Choose Your Path UX - The Doors */}
        <section className="py-16 bg-white border-y border-gray-50">
          <div className="max-w-5xl mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-2xl font-black text-black uppercase tracking-widest mb-2">Do you have...</h2>
              <div className="w-20 h-1 mx-auto rounded-full" style={{ backgroundColor: settings.global.primaryColor }}></div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Door 1 */}
              <div
                onClick={() => scrollToSection('phase1')}
                className="group relative bg-white border border-gray-200 rounded-[2.5rem] p-10 text-center transition-all duration-500 overflow-hidden cursor-pointer shadow-xl shadow-gray-200/50 hover:shadow-2xl"
                style={{ borderColor: 'transparent' }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = settings.global.primaryColor}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgb(229 231 235)'}
              >
                <div className="absolute top-0 right-0 p-6 opacity-[0.05] group-hover:scale-110 transition-transform">
                  <Clock className="w-24 h-24" />
                </div>
                <div className="relative z-10">
                  <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-sm border border-gray-100 group-hover:scale-110 transition-transform">
                    <Clock className="w-8 h-8" style={{ color: settings.global.primaryColor }} />
                  </div>
                  <h3 className="text-2xl font-black text-black mb-4">MORE TIME THAN MONEY</h3>
                  <p className="text-gray-500 text-sm mb-8 leading-relaxed">
                    I’m ready to hustle, I just need the tools and the professional polish to win.
                  </p>
                  <Button className="bg-white border-2 border-black text-black hover:bg-black hover:text-white font-bold px-8 py-6 rounded-xl transition-all">
                    I'M READY TO HUSTLE →
                  </Button>
                </div>
              </div>

              {/* Door 2 */}
              <div
                onClick={() => scrollToSection('phase2')}
                className="group relative bg-white border border-gray-200 rounded-[2.5rem] p-10 text-center transition-all duration-500 overflow-hidden cursor-pointer shadow-xl shadow-gray-200/50 hover:shadow-2xl"
                style={{ borderColor: 'transparent' }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = settings.global.primaryColor}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgb(229 231 235)'}
              >
                <div className="absolute top-0 right-0 p-6 opacity-[0.05] group-hover:scale-110 transition-transform">
                  <DollarSign className="w-24 h-24" />
                </div>
                <div className="relative z-10">
                  <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-sm border border-gray-100 group-hover:scale-110 transition-transform">
                    <DollarSign className="w-8 h-8" style={{ color: settings.global.primaryColor }} />
                  </div>
                  <h3 className="text-2xl font-black text-black mb-4">MORE MONEY THAN TIME</h3>
                  <p className="text-gray-500 text-sm mb-8 leading-relaxed">
                    I’m ready to scale, I need my time back and my brand on autopilot.
                  </p>
                  <Button className="text-white font-bold px-8 py-6 rounded-xl transition-all shadow-lg" style={{ backgroundColor: settings.global.primaryColor }}>
                    I'M READY TO SCALE →
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 1: Listing Domination */}
        <section id="listings" className="py-24 bg-white">
          <div className="max-w-[1400px] mx-auto px-4">
            <div className="text-center mb-20 max-w-3xl mx-auto">
              <h2 className="text-4xl md:text-5xl font-bold text-black mb-6 tracking-tight">
                Listings & Spaces <span className="text-gray-300">(The Property)</span>
              </h2>
              <p className="text-lg text-gray-500 leading-relaxed">
                Targeting the listing lifecycle: Pre-launch buzz, active sale, and post-close legacy.
                Every package now includes a Listing Reel as the core deliverable. <span className="font-bold text-black">We don't just shoot; we trend.</span>
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {listingTiers.map((tier, i) => (
                <div
                  key={i}
                  className={`relative group rounded-[2rem] p-8 border transition-all duration-500 flex flex-col ${
                    tier.isVIP
                      ? 'bg-[#262626] border-teal-900/50 shadow-2xl scale-105 z-10'
                      : tier.isPopular ? 'bg-white shadow-2xl scale-105 z-10' : 'bg-white border-gray-100 hover:shadow-xl'
                  }`}
                  style={{ borderColor: tier.isVIP ? settings.global.primaryColor : tier.isPopular ? settings.global.primaryColor : undefined }}
                >
                  {tier.badge && (
                    <div className={`absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest whitespace-nowrap shadow-lg ${
                      tier.isVIP ? 'bg-[#FFD700] text-black' : 'bg-red-500 text-white'
                    }`}>
                      {tier.badge}
                    </div>
                  )}

                  <div className="mb-6 flex items-center justify-between">
                    <div className={`p-3 rounded-2xl ${tier.isVIP ? 'bg-teal-950/50' : 'bg-[#f0fdfa]'}`}>
                      {tier.icon}
                    </div>
                  </div>

                  <h3 className={`text-xl font-black mb-1 ${tier.isVIP ? 'text-white' : 'text-black'}`}>{tier.name}</h3>
                  <p className="font-bold text-xs uppercase tracking-wider mb-2 accent-text-bordered">{tier.tagline}</p>
                  {tier.subheadline && (
                    <p className={`text-[10px] font-bold uppercase tracking-tight mb-6 ${tier.isVIP ? 'text-white/80' : 'text-gray-400'}`}>{tier.subheadline}</p>
                  )}

                  <div className="mb-6 flex items-baseline gap-1">
                    <span className={`text-4xl font-black ${tier.isVIP ? 'text-white' : 'text-black'}`}>${tier.price}</span>
                    <span className="text-gray-400 text-xs font-bold uppercase tracking-widest">{tier.period}</span>
                  </div>

                  <p className={`text-xs leading-relaxed mb-8 min-h-[48px] ${tier.isVIP ? 'text-gray-400' : 'text-gray-500'}`}>
                    {tier.description}
                  </p>

                  <div className="space-y-4 mb-10">
                    {tier.features.map((feature, j) => (
                      <div key={j} className="flex items-start gap-3">
                        <div className="mt-1 shrink-0">
                          {feature.icon === "zap" ? (
                            <Zap className="w-3.5 h-3.5 fill-current" style={{ color: tier.isVIP ? '#ffffff' : settings.global.primaryColor }} />
                          ) : feature.icon === "video" ? (
                            <Video className="w-3.5 h-3.5" style={{ color: tier.isVIP ? '#ffffff' : settings.global.primaryColor }} />
                          ) : feature.icon === "mic" ? (
                            <Mic className="w-3.5 h-3.5" style={{ color: tier.isVIP ? '#ffffff' : settings.global.primaryColor }} />
                          ) : (
                            <Check className="w-3.5 h-3.5 stroke-[3]" style={{ color: tier.isVIP ? '#ffffff' : settings.global.primaryColor }} />
                          )}
                      </div>
                      <span className={`text-sm font-medium leading-tight ${tier.isVIP ? 'text-gray-300' : 'text-gray-600'} ${feature.emphasized ? 'font-black' : ''}`} style={{ color: feature.emphasized ? settings.global.primaryColor : undefined }}>{feature.text}</span>
                    </div>
                    ))}
                  </div>

                  <div className="mt-auto space-y-4">
                    {!tier.isVIP && (
                      <p className="text-[10px] text-gray-400 font-bold italic text-center">* Same Day Delivery by 7PM (Snap Reel & Photos Only)</p>
                    )}
                    {tier.disclaimer && (
                      <div className="text-center mb-2 px-2">
                        <p className={`text-[11px] font-bold uppercase tracking-tight leading-none mb-1 ${tier.isVIP ? 'text-white' : 'text-black'}`}>{tier.disclaimer.title}</p>
                        <p className="text-[9px] text-gray-500 leading-tight italic">{tier.disclaimer.text}</p>
                      </div>
                    )}
                    <Button asChild className={`w-full py-6 rounded-xl font-bold text-sm transition-all hover:scale-[1.02] ${
                      tier.isVIP ? 'bg-white text-black hover:bg-gray-100 border-2 border-[#FFD700]' : tier.isPopular ? 'text-white shadow-lg' : 'bg-black hover:bg-gray-800 text-white shadow-lg'
                    }`} style={{ backgroundColor: tier.isVIP ? undefined : tier.isPopular ? settings.global.primaryColor : undefined }}>
                      <Link to={`/book?service=${tier.name === 'THE ESSENTIALS' ? 'listing-essentials' : tier.name === 'THE SHOWCASE' ? 'listing-showcase' : tier.name === 'THE LEGACY' ? 'listing-legacy' : 'listing-market-leader'}`}>
                        {tier.buttonText}
                      </Link>
                    </Button>
                    <p className="text-[10px] text-gray-400 text-center font-medium italic">{tier.ctaSubtext}</p>

                    {/* Tooltip Simulation */}
                    <div className="pt-4 border-t border-gray-50 flex items-center justify-center group/tooltip relative">
                      <div className="flex items-center gap-2 text-[10px] font-bold text-gray-300 group-hover/tooltip:text-[#0d9488] cursor-help transition-colors" style={{ color: undefined }} onMouseEnter={(e) => e.currentTarget.style.color = settings.global.primaryColor} onMouseLeave={(e) => e.currentTarget.style.color = '#d1d5db'}>
                        <Info className="w-3 h-3" />
                        Which is for me?
                      </div>
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-[200px] bg-black text-white p-3 rounded-xl text-[10px] font-medium leading-relaxed opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all duration-300 shadow-2xl z-20 pointer-events-none">
                        {tier.tooltip}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-black"></div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* The Iconic Standard Section */}
            <div className="mt-24 max-w-4xl mx-auto text-center">
              <h3 className="text-3xl font-black text-black uppercase tracking-widest mb-6">"The Iconic Standard"</h3>
              <p className="text-lg text-gray-500 leading-relaxed font-medium">
                We’ve spent a decade learning what makes people stop scrolling. It’s not just a fancy camera; it’s the hand-polished finish. Every image and video we deliver is checked by our team to ensure it hits our standards for color, clarity, and impact. We treat your business like it’s our own.
              </p>
            </div>

            {/* The Basics Section */}
            {settings.pricing.showBasics && (
              <div className="mt-20 pt-20 border-t border-gray-100">
                <div className="text-center mb-12">
                  <p className="text-sm font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Or</p>
                  <h3 className="text-5xl md:text-7xl font-black text-black uppercase tracking-tight mb-6">Choose the Basics</h3>
                  <p className="text-gray-500 text-lg font-medium">Fast, efficient, and essential media for every listing.</p>
                </div>

                <div className="bg-[#fafafa] rounded-[2.5rem] p-8 md:p-12 border border-gray-100">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                    {/* Photo Packages */}
                    <div className="lg:col-span-1 space-y-6">
                      <h4 className="font-black text-xs uppercase tracking-widest mb-6" style={{ color: settings.global.primaryColor }}>Photo Packages</h4>
                      <div className="space-y-4">
                        {[
                          { label: "20 Photos", price: "99", id: "photos-20" },
                          { label: "35 Photos", price: "150", id: "photos-35" },
                          { label: "50 Photos", price: "200", id: "photos-50" }
                        ].map((pkg) => (
                          <div
                            key={pkg.id}
                            onClick={() => setSelectedPhotoPkg(selectedPhotoPkg === pkg.id ? null : pkg.id)}
                            className="flex items-center justify-between p-4 bg-white rounded-xl border transition-all cursor-pointer hover:shadow-md"
                            style={{
                              borderColor: selectedPhotoPkg === pkg.id ? settings.global.primaryColor : '#f3f4f6',
                              backgroundColor: selectedPhotoPkg === pkg.id ? `${settings.global.primaryColor}05` : 'white'
                            }}
                          >
                            <span className="font-bold text-gray-700">{pkg.label}</span>
                            <span className="text-xl font-black text-black">${pkg.price}</span>
                          </div>
                        ))}
                      </div>
                      <div className="pt-4 space-y-3">
                        {[
                          { label: "Basic Edits", included: true },
                          { label: "Color Balance", included: true },
                          { label: "Clear Windows", included: true },
                          { label: "Sky Replacement", included: true },
                          { label: "Next Day Turn Around", included: true },
                          { label: "Reflection/Mirror Removal", included: true },
                          { label: "Grass Replacement", included: false },
                          { label: "Firepits, Fireplaces", included: false },
                          { label: "Extra love in Iconic Edits", included: false }
                        ].map((item, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            {item.included ? (
                              <Check className="w-3.5 h-3.5 stroke-[3]" style={{ color: settings.global.primaryColor }} />
                            ) : (
                              <X className="w-3.5 h-3.5 text-red-400 stroke-[3]" />
                            )}
                            <span className={`text-[13px] font-bold ${item.included ? 'text-gray-600' : 'text-gray-400 line-through decoration-gray-300'}`}>
                              {item.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Add-Ons */}
                    <div className="lg:col-span-1 space-y-6">
                      <div>
                        <h4 className="font-black text-xs uppercase tracking-widest mb-1" style={{ color: settings.global.primaryColor }}>Add-On Services</h4>
                        <p className="text-[10px] text-gray-400 font-bold italic mb-6">(Must already be on site doing a full service shoot)</p>
                      </div>
                      <div className="space-y-4">
                        {[
                          { label: "Aerial Add-On", price: "99", id: "aerial-addon" },
                          { label: "Reel Add-On", price: "125", id: "reel-addon" },
                          { label: "Video Add-On", price: "350-500+", id: "video-addon" },
                          { label: "3D Matterport", price: "200+", id: "matterport" },
                          { label: "2D Floorplan Add-On", price: "99", id: "floorplan-addon" },
                          { label: "Amenity Add-On", price: "50", id: "amenity-addon" }
                        ].map((addon) => (
                          <div
                            key={addon.id}
                            onClick={() => toggleAddOn(addon.id)}
                            className="flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer hover:shadow-md"
                            style={{
                              borderColor: selectedAddOns.includes(addon.id) ? settings.global.primaryColor : '#f3f4f6',
                              backgroundColor: selectedAddOns.includes(addon.id) ? `${settings.global.primaryColor}05` : 'rgba(255,255,255,0.5)'
                            }}
                          >
                            <span className="font-bold text-gray-600 text-sm">{addon.label}</span>
                            <span className="font-black text-black">${addon.price}</span>
                          </div>
                        ))}
                      </div>
                      <Button asChild className="w-full mt-4 bg-black hover:bg-gray-800 text-white font-bold py-6 rounded-xl transition-all shadow-lg" disabled={!selectedPhotoPkg && selectedAddOns.length === 0}>
                        <Link to={getBasicsBookingUrl()}>ORDER BASICS</Link>
                      </Button>
                    </div>

                    {/* ICONIC Edits */}
                    <div className="lg:col-span-1">
                      <div className="h-full bg-black rounded-3xl p-8 text-white relative overflow-hidden group hover:scale-[1.02] transition-transform duration-500">
                        <div className="absolute top-0 right-0 p-6 opacity-10">
                          <Palette className="w-24 h-24" />
                        </div>
                        <div className="relative z-10">
                          <div className="flex flex-col mb-6">
                            <div className="flex items-center justify-between mb-4">
                              <h4 className="font-black text-xs uppercase tracking-widest accent-text-bordered">THE ICONIC POLISH (Premium Upgrade) $65</h4>
                            </div>
                            <p className="text-[11px] font-bold text-gray-100">Standard on Market Leader | $65 Add-on for all other packages (Next Day Delivery)</p>
                          </div>
                          <div className="grid grid-cols-1 gap-3">
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
                            ].map((edit, idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                <Sparkles className="w-3 h-3" style={{ color: settings.global.primaryColor }} />
                                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{edit}</span>
                              </div>
                            ))}
                          </div>
                          <Button asChild className="w-full mt-8 text-white font-black py-6 rounded-xl transition-all shadow-lg shadow-teal-900/20 bg-[#0d9488] hover:bg-[#0f766e]">
                            <Link to={getBasicsBookingUrl(true)}>UPGRADE MY EDITS</Link>
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Branding Before & After Slider - Smaller */}
        <section className="py-24 bg-[#fafafa]">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <h2 className="text-4xl md:text-6xl font-black text-black mb-8 tracking-tight">Elevate Your <span className="accent-text-bordered">Personal Brand</span></h2>
            <p className="text-lg text-gray-500 mb-12 max-w-xl mx-auto font-medium">See the difference between a standard corporate headshot and an Iconic Lifestyle Portrait.</p>

            <div className="relative max-w-2xl mx-auto aspect-[16/9] rounded-[2rem] overflow-hidden shadow-xl border-4 border-white">
              {/* After (Iconic) */}
              <img
                src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=1200&q=80"
                className="absolute inset-0 w-full h-full object-cover"
                alt="Iconic Lifestyle"
              />
              <div className="absolute inset-0 flex flex-col justify-end p-6 text-white z-10 text-right pointer-events-none">
                <div className="px-3 py-1.5 rounded-full inline-block self-end text-[10px] font-black uppercase tracking-widest shadow-lg" style={{ backgroundColor: settings.global.primaryColor }}>Iconic Lifestyle</div>
              </div>

              {/* Before (Standard) */}
              <div
                className="absolute inset-0 overflow-hidden"
                style={{ clipPath: `inset(0 ${100 - brandingSliderPos}% 0 0)` }}
              >
                <img
                  src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=1200&q=80"
                  className="absolute inset-0 w-full h-full object-cover grayscale brightness-[0.8]"
                  alt="Standard Corporate"
                />
                <div className="absolute inset-0 flex flex-col justify-end p-6 text-white z-10 text-left pointer-events-none">
                  <div className="bg-gray-800/80 px-3 py-1.5 rounded-full inline-block self-start text-[10px] font-black uppercase tracking-widest">Standard Corporate</div>
                </div>
              </div>

              {/* Slider Control */}
              <div
                className="absolute inset-y-0 z-20 pointer-events-none"
                style={{ left: `${brandingSliderPos}%` }}
              >
                <div className="absolute inset-y-0 -left-[1px] w-[2px] bg-white shadow-xl"></div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center text-white border-4 border-white shadow-2xl" style={{ backgroundColor: settings.global.primaryColor }}>
                  <ChevronLeft className="w-3 h-3" />
                  <ChevronRight className="w-3 h-3" />
                </div>
              </div>

              <input
                type="range"
                min="0"
                max="100"
                value={brandingSliderPos}
                onChange={(e) => setBrandingSliderPos(parseInt(e.target.value))}
                className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-30"
              />
            </div>
          </div>
        </section>

        {/* Section 2: Iconic Branding */}
        <section id="branding" className="py-24 bg-white">
          <div className="max-w-[1400px] mx-auto px-4">
            <div className="text-center mb-20 max-w-3xl mx-auto">
              <h2 className="text-4xl md:text-5xl font-bold text-black mb-6 tracking-tight">
                The Human Brand <span className="text-gray-300">(The Agent)</span>
              </h2>
              <p className="text-lg text-gray-500 leading-relaxed">
                Targeting the human brand: Life, business, and local authority.
                We don't just capture portraits; we build ecosystems of authority.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {brandingTiers.map((tier, i) => (
                <div
                  key={i}
                  className={`relative group bg-white rounded-[2rem] p-8 border transition-all duration-500 flex flex-col ${
                    tier.isPopular ? 'shadow-2xl scale-105 z-10' : 'border-gray-100 hover:shadow-xl'
                  }`}
                  style={{ borderColor: tier.isPopular ? settings.global.primaryColor : undefined }}
                >
                  <div className="mb-6 flex items-center justify-between">
                    <div className="p-3 bg-[#f0fdfa] rounded-2xl">
                      {tier.icon}
                    </div>
                  </div>

                  <h3 className="text-xl font-black text-black mb-1">{tier.name}</h3>
                  <p className="font-bold text-xs uppercase tracking-wider mb-6" style={{ color: settings.global.primaryColor }}>{tier.tagline}</p>

                  <div className="mb-6 flex items-baseline gap-1">
                    <span className="text-4xl font-black text-black">${tier.price}</span>
                    <span className="text-gray-400 text-xs font-bold uppercase tracking-widest">{tier.period}</span>
                  </div>

                  <p className="text-xs text-gray-500 leading-relaxed mb-8 min-h-[48px]">
                    {tier.description}
                  </p>

                  <div className="space-y-4 mb-10">
                    {tier.features.map((feature, j) => (
                      <div key={j} className="flex items-start gap-3">
                        <div className="mt-1 shrink-0">
                          <Check className="w-3.5 h-3.5 stroke-[3]" style={{ color: settings.global.primaryColor }} />
                      </div>
                      <span className="text-sm font-medium text-gray-600 leading-tight">{feature}</span>
                    </div>
                    ))}
                  </div>

                  <div className="mt-auto space-y-4">
                    {tier.disclaimer && (
                      <div className="text-center mb-2 px-2">
                        <p className="text-[11px] font-bold text-black uppercase tracking-tight leading-none mb-1">{tier.disclaimer.title}</p>
                        <p className="text-[9px] text-gray-500 leading-tight italic">{tier.disclaimer.text}</p>
                      </div>
                    )}
                    <Button asChild className={`w-full py-6 rounded-xl font-bold text-sm transition-all hover:scale-[1.02] ${
                      tier.isPopular ? 'text-white shadow-lg' : 'bg-black hover:bg-gray-800 text-white shadow-lg'
                    }`} style={{ backgroundColor: tier.isPopular ? settings.global.primaryColor : undefined }}>
                      <Link to={`/book?service=${tier.name === 'THE REFRESH' ? 'branding-refresh' : tier.name === 'THE CONTENT PARTNER' ? 'branding-content-partner' : 'branding-local-legend'}`}>
                        {tier.buttonText}
                      </Link>
                    </Button>
                    <p className="text-[10px] text-gray-400 text-center font-medium italic">{tier.ctaSubtext}</p>

                    {/* Tooltip Simulation */}
                    <div className="pt-4 border-t border-gray-50 flex items-center justify-center group/tooltip relative">
                      <div className="flex items-center gap-2 text-[10px] font-bold text-gray-300 cursor-help transition-colors" onMouseEnter={(e) => e.currentTarget.style.color = settings.global.primaryColor} onMouseLeave={(e) => e.currentTarget.style.color = '#d1d5db'}>
                        <Info className="w-3 h-3" />
                        Which is for me?
                      </div>
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-[200px] bg-black text-white p-3 rounded-xl text-[10px] font-medium leading-relaxed opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all duration-300 shadow-2xl z-20 pointer-events-none">
                        {tier.tooltip}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-black"></div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Section 3: Social Monopoly */}
        <section id="social" className="py-24 bg-[#fafafa]">
          <div className="max-w-[1400px] mx-auto px-4">
            <div className="text-center mb-20 max-w-4xl mx-auto">
              <h2 className="text-4xl md:text-5xl font-bold text-black mb-6 tracking-tight">
                Social Monopoly <span className="text-gray-400 font-medium">(The Partnership)</span>
              </h2>
              <p className="text-lg text-gray-500 leading-relaxed mb-8">
                Stop fighting the algorithm and start growing your business. We handle the technical "heavy lifting" so you can stay focused on the face-to-face.
              </p>
              <div className="space-y-4 max-w-2xl mx-auto">
                <p className="text-sm font-bold text-gray-400 uppercase tracking-widest italic">
                  "We don't just post for you; we protect your time. From editing to strategy, we ensure your business stays relevant while you stay focused on your work."
                </p>
                <p className="text-xl font-black text-black uppercase tracking-tight">
                  "You be the face; we’ll be the hands."
                </p>
              </div>
            </div>

            {/* Phase 1: The 7-Tier Lifecycle Management */}
            <div id="phase1" className="mb-24">
              <div className="flex items-center gap-4 mb-10">
                <div className="h-[2px] flex-1 bg-gradient-to-r from-transparent to-gray-200"></div>
                <h3 className="text-lg font-black text-gray-400 uppercase tracking-[0.3em] whitespace-nowrap">THE 7-TIER LIFECYCLE MANAGEMENT</h3>
                <div className="h-[2px] flex-1 bg-gradient-to-l from-transparent to-gray-200"></div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
                {phase1Tiers.map((tier, i) => (
                  <div key={i} className={`bg-white rounded-[2rem] p-10 border transition-all duration-500 hover:shadow-xl ${tier.isPopular ? '' : 'border-gray-100'}`} style={{ borderColor: tier.isPopular ? settings.global.primaryColor : undefined }}>
                    <h4 className="text-xl font-black text-black mb-1">{tier.name}</h4>
                    <p className="font-bold text-xs uppercase tracking-widest mb-6" style={{ color: settings.global.primaryColor }}>{tier.tagline}</p>
                    <div className="mb-6 flex items-baseline gap-1">
                      <span className="text-4xl font-black text-black">${tier.price}</span>
                      <span className="text-gray-400 text-xs font-bold uppercase tracking-widest">{tier.period}</span>
                    </div>
                    <p className="text-sm font-bold text-gray-700 mb-8 italic">{tier.description}</p>
                    <div className="space-y-4 mb-10">
                      {tier.features.map((feature, j) => (
                        <div key={j} className="flex items-start gap-3">
                      <Check className="w-4 h-4 stroke-[3] mt-0.5" style={{ color: settings.global.primaryColor }} />
                      <span className="text-sm font-medium text-gray-600">{feature}</span>
                        </div>
                      ))}
                    </div>
                    <Button asChild className="w-full py-6 rounded-xl bg-black hover:bg-gray-800 text-white font-bold transition-all shadow-lg">
                      <Link to={`/book?service=${tier.packageId === 'content-starter' ? 'business-baseline' : 'business-growth-engine'}`}>
                        {tier.buttonText}
                      </Link>
                    </Button>
                    {tier.ctaSubtext && (
                      <p className="mt-4 text-[10px] text-center font-bold text-gray-400 uppercase tracking-widest">{tier.ctaSubtext}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Phase 2: Money Over Time */}
            {settings.pricing.showPhase2 && (
              <div id="phase2">
                <div className="flex items-center gap-4 mb-10">
                  <div className="h-[2px] flex-1" style={{ backgroundImage: `linear-gradient(to right, transparent, ${settings.global.primaryColor}33)` }}></div>
                  <h3 className="text-lg font-black uppercase tracking-[0.3em] whitespace-nowrap" style={{ color: settings.global.primaryColor }}>PHASE 2: THE "MONEY OVER TIME" TRACK</h3>
                  <div className="h-[2px] flex-1" style={{ backgroundImage: `linear-gradient(to left, transparent, ${settings.global.primaryColor}33)` }}></div>
                </div>

                <div className="flex flex-wrap justify-center gap-8">
                  {phase2Tiers.slice(0, 3).map((tier, i) => (
                    <div key={i} className={`relative bg-white rounded-[2rem] p-8 border transition-all duration-500 hover:shadow-2xl w-full md:w-[calc(33.333%-1.5rem)] ${tier.isPopular ? 'scale-105 z-10 shadow-xl' : 'border-gray-100'}`} style={{ borderColor: tier.isPopular ? settings.global.primaryColor : undefined }}>
                      <h4 className="text-xl font-black text-black mb-1">{tier.name}</h4>
                      <p className="font-bold text-xs uppercase tracking-wider mb-6" style={{ color: settings.global.primaryColor }}>{tier.tagline}</p>
                      <div className="mb-6 flex items-baseline gap-1">
                        <span className="text-4xl font-black text-black">${tier.price}</span>
                        <span className="text-gray-400 text-xs font-bold uppercase tracking-widest">{tier.period}</span>
                      </div>
                      <p className="text-xs text-gray-500 leading-relaxed mb-8 h-12 overflow-hidden">{tier.description}</p>
                      <div className="space-y-4 mb-10">
                        {tier.features.map((feature, j) => (
                          <div key={j} className="flex items-start gap-3">
                            <Check className="w-3.5 h-3.5 stroke-[3] mt-0.5" style={{ color: settings.global.primaryColor }} />
                            <span className="text-[11px] font-medium text-gray-600 leading-tight">{feature}</span>
                          </div>
                        ))}
                      </div>
                      <Button asChild className={`w-full py-6 rounded-xl font-bold transition-all ${tier.isPopular ? 'text-white' : 'bg-black text-white'}`} style={{ backgroundColor: tier.isPopular ? settings.global.primaryColor : undefined }}>
                        <Link to={`/book?service=${tier.name === 'THE PROFESSIONAL SUITE' ? 'business-professional-suite' : tier.name === 'THE SIGNATURE TIER' ? 'business-signature-tier' : tier.name === 'THE ICONIC PARTNERSHIP' ? 'business-iconic-partnership' : tier.name === 'THE CONNECTED CORE' ? 'business-connected-core' : 'business-authority-stack'}`}>
                          {tier.buttonText}
                        </Link>
                      </Button>
                    </div>
                  ))}

                  {/* Centered Second Row for New Tiers */}
                  <div className="w-full flex flex-wrap justify-center gap-8 mt-4">
                    {phase2Tiers.slice(3).map((tier, i) => (
                      <div key={i} className="relative bg-white rounded-[2rem] p-8 border border-gray-100 transition-all duration-500 hover:shadow-2xl w-full md:w-[calc(33.333%-1.5rem)]">
                        <h4 className="text-xl font-black text-black mb-1">{tier.name}</h4>
                        <p className="font-bold text-xs uppercase tracking-wider mb-6" style={{ color: settings.global.primaryColor }}>{tier.tagline}</p>
                        <div className="mb-6 flex items-baseline gap-1">
                          <span className="text-4xl font-black text-black">${tier.price}</span>
                          <span className="text-gray-400 text-xs font-bold uppercase tracking-widest">{tier.period}</span>
                        </div>
                        <p className="text-xs text-gray-500 leading-relaxed mb-8 h-12 overflow-hidden">{tier.description}</p>
                        <div className="space-y-4 mb-10">
                          {tier.features.map((feature, j) => (
                            <div key={j} className="flex items-start gap-3">
                              <Check className="w-3.5 h-3.5 stroke-[3] mt-0.5" style={{ color: settings.global.primaryColor }} />
                              <span className="text-[11px] font-medium text-gray-600 leading-tight">{feature}</span>
                            </div>
                          ))}
                        </div>
                        <Button asChild className="w-full py-6 rounded-xl bg-black text-white font-bold transition-all">
                          <Link to={`/book?service=${tier.name === 'THE PROFESSIONAL SUITE' ? 'business-professional-suite' : tier.name === 'THE SIGNATURE TIER' ? 'business-signature-tier' : tier.name === 'THE ICONIC PARTNERSHIP' ? 'business-iconic-partnership' : tier.name === 'THE CONNECTED CORE' ? 'business-connected-core' : 'business-authority-stack'}`}>
                            {tier.buttonText}
                          </Link>
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* The 90/10 Rule Callout */}
            <div className="mt-24 bg-black rounded-[3rem] p-12 text-white relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-12 opacity-[0.05] group-hover:scale-110 transition-transform duration-700">
                <Info className="w-64 h-64" />
              </div>
              <div className="relative z-10 max-w-3xl">
                <h3 className="text-3xl font-black mb-6 uppercase tracking-widest" style={{ color: settings.global.primaryColor }}>The 90/10 Rule</h3>
                <p className="text-xl text-gray-300 leading-relaxed font-medium">
                  Filming your content is only 10% of the battle. The other 90% is the Algorithm War: Meta/TikTok SEO, Metadata tagging, shadow-ban protection, and 24/7 engagement. Most clients start at The Baseline and quickly realize their time is worth more than fighting an algorithm. Our higher tiers don’t just give you "more videos"—they give you your life back.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Need a Brand? Section */}
        <section id="brand-identity" className="py-24 bg-white">
          <div className="max-w-6xl mx-auto px-4">
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-3 mb-4" style={{ color: settings.global.primaryColor }}>
                <Palette className="w-6 h-6" />
                <span className="text-sm font-black uppercase tracking-widest underline underline-offset-8">NEED A BRAND?</span>
              </div>
              <h2 className="text-4xl md:text-5xl font-bold text-black mb-6 tracking-tight">
                The "Iconic" Strategic Plan
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-20">
              {/* Foundation */}
              <div className="bg-[#fafafa] rounded-[2.5rem] p-10 border border-gray-100 transition-all duration-500" onMouseEnter={(e) => e.currentTarget.style.borderColor = settings.global.primaryColor + '4D'} onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgb(243 244 246)'}>
                <div className="mb-6 flex justify-between items-start">
                  <h3 className="text-2xl font-black text-black">THE FOUNDATION</h3>
                </div>
                <p className="text-gray-500 text-sm mb-8">Essential visual assets and strategic core for a professional presence.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                  {[
                    "Logos Suite",
                    "Signature Style Guide",
                    "Hex Color Palettes",
                    "Canva Brand Hub Setup",
                    "Marketing Templates",
                    "Digital Business Card"
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Check className="w-4 h-4" style={{ color: settings.global.primaryColor }} />
                      <span className="text-xs font-bold text-gray-600">{item}</span>
                    </div>
                  ))}
                </div>
                <Button asChild className="w-full py-6 rounded-xl bg-black text-white hover:text-white transition-all" onMouseEnter={(e) => e.currentTarget.style.backgroundColor = settings.global.primaryColor} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'black'}>
                  <Link to="/book?service=growth-foundation">
                    START MY FOUNDATION →
                  </Link>
                </Button>
              </div>

              {/* Evolution */}
              <div className="bg-[#fafafa] rounded-[2.5rem] p-10 border border-gray-100 transition-all duration-500" onMouseEnter={(e) => e.currentTarget.style.borderColor = settings.global.primaryColor + '4D'} onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgb(243 244 246)'}>
                <div className="mb-6 flex justify-between items-start">
                  <h3 className="text-2xl font-black text-black">THE EVOLUTION</h3>
                </div>
                <p className="text-gray-500 text-sm mb-8">Cutting-edge AI integration to automate your content and reach.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                  {[
                    "AI Voice Clone Setup",
                    "AI Video Avatar Creation",
                    "Automated Updates Suite",
                    "Voice Synthesis Training",
                    "Likeness Protection",
                    "Vision Pro Readiness"
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Check className="w-4 h-4" style={{ color: settings.global.primaryColor }} />
                      <span className="text-xs font-bold text-gray-600">{item}</span>
                    </div>
                  ))}
                </div>
                <Button asChild className="w-full py-6 rounded-xl bg-black text-white hover:text-white transition-all" onMouseEnter={(e) => e.currentTarget.style.backgroundColor = settings.global.primaryColor} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'black'}>
                  <Link to="/book?service=growth-evolution">
                    START MY EVOLUTION →
                  </Link>
                </Button>
              </div>
            </div>

            {/* Redesigned Bundle Box */}
            <div className="bg-[#fafafa] rounded-[2.5rem] p-10 md:p-16 border border-gray-100 transition-all duration-500 mb-20 relative overflow-hidden" onMouseEnter={(e) => e.currentTarget.style.borderColor = settings.global.primaryColor + '4D'} onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgb(243 244 246)'}>
              <div className="absolute top-0 right-0 p-12 opacity-[0.03] pointer-events-none">
                <Sparkles className="w-64 h-64" />
              </div>
              <div className="relative z-10">
                <div className="flex flex-col md:flex-row justify-between items-start gap-8 mb-12">
                  <div className="max-w-2xl">
                    <h3 className="text-3xl font-black text-black mb-4">THE BUNDLE</h3>
                    <p className="text-gray-500 text-lg leading-relaxed">
                      Foundation + Evolution. Total brand immersion, AI automation, and strategic identity design in one cohesive execution. Everything you need to own your market and automate your growth.
                    </p>
                  </div>
                  <Button asChild className="text-white font-black px-12 py-8 text-xl rounded-2xl transition-all shadow-xl hover:scale-105 active:scale-95 shrink-0" style={{ backgroundColor: settings.global.primaryColor }}>
                    <Link to="/book?service=growth-bundle">LET'S CHAT</Link>
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  <div className="space-y-4">
                    <h4 className="font-black text-xs uppercase tracking-widest mb-4" style={{ color: settings.global.primaryColor }}>Core Brand Foundation</h4>
                    {[
                      "Logos Suite & Visual Identity",
                      "Signature Style Guide",
                      "Hex Color Palettes",
                      "Canva Brand Hub Setup",
                      "Marketing Templates",
                      "Digital Business Card"
                    ].map((item, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <Check className="w-4 h-4" style={{ color: settings.global.primaryColor }} />
                        <span className="text-sm font-bold text-gray-600">{item}</span>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-4">
                    <h4 className="font-black text-xs uppercase tracking-widest mb-4" style={{ color: settings.global.primaryColor }}>AI & Automation Suite</h4>
                    {[
                      "AI Voice Clone Setup",
                      "AI Video Avatar Creation",
                      "Automated Updates Suite",
                      "Voice Synthesis Training",
                      "Likeness Protection",
                      "Vision Pro Readiness"
                    ].map((item, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <Check className="w-4 h-4" style={{ color: settings.global.primaryColor }} />
                        <span className="text-sm font-bold text-gray-600">{item}</span>
                      </div>
                    ))}
                  </div>

                  <div className="bg-white/50 rounded-2xl p-6 border border-gray-100 flex flex-col justify-center gap-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#f0fdfa] flex items-center justify-center">
                        <Star className="w-5 h-5 fill-current" style={{ color: settings.global.primaryColor }} />
                      </div>
                      <span className="text-sm font-black text-black">Total Brand Immersion</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#f0fdfa] flex items-center justify-center">
                        <Rocket className="w-5 h-5" style={{ color: settings.global.primaryColor }} />
                      </div>
                      <span className="text-sm font-black text-black">Instant Market Authority</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#f0fdfa] flex items-center justify-center">
                        <Users className="w-5 h-5" style={{ color: settings.global.primaryColor }} />
                      </div>
                      <span className="text-sm font-black text-black">Strategic SOI Penetration</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Detailed Feature List */}
            <div className="bg-black rounded-[3rem] p-12 text-white relative overflow-hidden">
              <div className="absolute top-0 right-0 p-12 opacity-10">
                <Palette className="w-64 h-64" />
              </div>
              <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
                <div>
                  <h4 className="text-xl font-bold mb-4" style={{ color: settings.global.primaryColor }}>Iconic Logo Suite</h4>
                  <p className="text-gray-400 text-sm leading-relaxed">High-res custom logos for agent/team in PNG, Vector, and Social Square formats.</p>
                </div>
                <div>
                  <h4 className="text-xl font-bold mb-4" style={{ color: settings.global.primaryColor }}>Signature Style Guide</h4>
                  <p className="text-gray-400 text-sm leading-relaxed">Curated Font Kits and Hex Color Palettes to ensure every piece of content looks cohesive.</p>
                </div>
                <div>
                  <h4 className="text-xl font-bold mb-4" style={{ color: settings.global.primaryColor }}>Brand Hub Setup</h4>
                  <p className="text-gray-400 text-sm leading-relaxed">We build your Brand Kit directly into your Canva or marketing platform for instant access.</p>
                </div>
                <div>
                  <h4 className="text-xl font-bold mb-4" style={{ color: settings.global.primaryColor }}>Marketing Templates</h4>
                  <p className="text-gray-400 text-sm leading-relaxed">10+ "Plug & Play" templates for Just Listed/Sold, Open House, and Market Updates.</p>
                </div>
                <div>
                  <h4 className="text-xl font-bold mb-4" style={{ color: settings.global.primaryColor }}>Premium Business Cards</h4>
                  <p className="text-gray-400 text-sm leading-relaxed">Custom heavy-stock physical card design + Digital QR Card for instant lead capture.</p>
                </div>
                <div className="flex items-center">
                  <div className="p-6 border-2 rounded-2xl" style={{ borderColor: settings.global.primaryColor }}>
                    <p className="text-sm font-bold text-white uppercase tracking-widest">CULTIVATE YOUR INFLUENCE</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="bg-white py-24 md:py-32">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
                      <div className="inline-flex items-center px-3 py-1 rounded bg-black border border-black mb-8 shadow-lg">
                <span className="text-[10px] font-bold tracking-wider uppercase accent-text-bordered">
                  FAQ
                </span>
              </div>
              <h2 className="text-4xl md:text-5xl font-bold mb-6 text-black">
                Got questions? We've got <span className="accent-text-bordered">answers</span>.
              </h2>
            </div>

            <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { q: "How long does video processing take?", a: "Listing media is delivered within 24 hours. Branding content depends on the package but typically within 48-72 hours." },
                { q: "What is an AI Digital Twin?", a: "It's a clone of your voice and likeness that allows you to generate market updates and content without sitting in front of a camera every day." },
                { q: "Can I cancel a monthly subscription?", a: "Yes, our monthly plans like THE AUTHORITY are contract-free. Cancel anytime with 30 days notice." },
                { q: "Do you shoot in 4K?", a: "Yes, all cinematic films and reels are delivered in 4K resolution optimized for social media platforms." }
              ].map((faq, i) => (
                <div
                  key={i}
                  className="bg-white border border-gray-100 rounded-xl px-6 py-5 cursor-pointer hover:bg-gray-50 transition-colors group"
                  onClick={() => setOpenFaqIndex(openFaqIndex === i ? null : i)}
                >
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-gray-700">{faq.q}</h4>
                    <ChevronRight className={`w-4 h-4 text-gray-300 transition-transform ${openFaqIndex === i ? 'rotate-90' : ''}`} />
                  </div>
                  {openFaqIndex === i && (
                    <div className="mt-4 text-xs text-gray-500 leading-relaxed animate-in fade-in slide-in-from-top-1 duration-200">
                      {faq.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />

      <style dangerouslySetInnerHTML={{ __html: `
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 40px;
          height: 40px;
          cursor: ew-resize;
        }
      `}} />
    </div>
  );
}
