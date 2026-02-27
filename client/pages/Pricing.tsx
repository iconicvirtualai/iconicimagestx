import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Check, X, ArrowRight, Star, ChevronLeft, ChevronRight, Info, Sparkles, Zap, Trophy, Crown, Camera, Video, Layout, Box, Users, Clock, DollarSign, Palette, Rocket } from "lucide-react";
import { useState, useRef } from "react";

export default function Pricing() {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);
  const [brandingSliderPos, setBrandingSliderPos] = useState(50);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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
      tagline: "The High-Speed Starter.",
      price: "249",
      period: "per listing",
      description: "Fast-paced content to get your listing live with impact.",
      icon: <Zap className="w-6 h-6 text-[#0d9488]" />,
      buttonText: "Start My Consistency",
      ctaSubtext: "Your reel is ready before the sign is up.",
      tooltip: "Ideal for fast-moving residential listings where speed and social presence are key.",
      features: [
        "30 Ultra-HDR Photos",
        "The 'Snap' Reel (15s vertical montage)",
        "Trending Audio Integration",
        "High-Energy Social Trailer",
        "Pre-Launch Delivery"
      ]
    },
    {
      name: "THE SHOWCASE",
      tagline: "The Market Mover.",
      price: "549",
      period: "per listing",
      description: "Complete visual story with drone and AI enhancements.",
      icon: <Trophy className="w-6 h-6 text-[#0d9488]" />,
      isPopular: true,
      buttonText: "Start My Consistency",
      ctaSubtext: "Your reel is ready before the sign is up.",
      tooltip: "Best for standard to mid-range listings needing a professional cinematic edge.",
      features: [
        "50 Ultra-HDR Photos",
        "5 Drone Aerials",
        "The 'Cinematic' Reel (30-60s vertical film)",
        "Smooth transitions & Speed ramps",
        "AI Twilight 'Glow' (2 Exterior shots)",
        "2D Floorplan"
      ]
    },
    {
      name: "THE LEGACY",
      tagline: "For luxury estates.",
      price: "899",
      period: "per listing",
      description: "Luxury-tier production for high-value properties.",
      icon: <Crown className="w-6 h-6 text-[#0d9488]" />,
      buttonText: "Start My Consistency",
      ctaSubtext: "Your reel is ready before the sign is up.",
      tooltip: "Engineered for luxury listings and high-value neighborhoods where image is everything.",
      features: [
        "The Full Media Suite (All Photos + Drone)",
        "10 AI Twilight Renders",
        "90s Cinematic Property Film (4K Landscape)",
        "Professional Color Grading",
        "Licensed Music",
        "Agent-on-camera Intro/Outro",
        "The 'Iconic' Animated Reel (60s Vertical)"
      ]
    },
    {
      name: "THE MARKET LEADER",
      tagline: "The Full-Scale Production.",
      price: "1599",
      period: "per listing",
      description: "Dominate the market with complete media saturation.",
      icon: <Box className="w-6 h-6 text-[#0d9488]" />,
      badge: "Only 4 slots left in your zip code",
      buttonText: "Secure My Zip Code",
      ctaSubtext: "Your reel is ready before the sign is up.",
      tooltip: "For top producers who want to own their local market and provide unmatched seller value.",
      features: [
        "The Full Media Suite (Max Possible Assets)",
        "Max AI Twilight Renders",
        "90s Cinematic Property Film (4K)",
        "The 'Iconic' Animated Reel (60s Vertical)",
        "3D Motion Graphics & Spatial Effects",
        "Spatial VR / Matterport (Vision Pro Ready)",
        "2D Floorplan",
        "Post-Sale Marketing: 'Success Story' Interview"
      ]
    }
  ];

  const brandingTiers = [
    {
      name: "THE REFRESH",
      tagline: "The modern headshot replacement.",
      price: "349",
      period: "session",
      description: "Upgrade your professional image with high-end lifestyle content.",
      icon: <Camera className="w-6 h-6 text-[#0d9488]" />,
      buttonText: "Start My Consistency",
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
      name: "THE AUTHORITY",
      tagline: "Content department on autopilot.",
      price: "999",
      period: "per month",
      description: "Monthly strategic content production for consistent brand growth.",
      icon: <Video className="w-6 h-6 text-[#0d9488]" />,
      isPopular: true,
      buttonText: "Build My Empire",
      ctaSubtext: "You sell homes; we’ll handle the fame.",
      tooltip: "Designed for agents who want to dominate social media without the stress of filming or editing.",
      features: [
        "The 'Value Bomb' Session: 2hrs Filming/mo",
        "We provide the Scripts",
        "20 Custom Reels/TikToks",
        "Edited with 2026 Trends",
        "Trending Audio & AI Mascot Branding"
      ]
    },
    {
      name: "THE LOCAL LEGEND",
      tagline: "Complete brand reinvention.",
      price: "2499",
      period: "session/campaign",
      description: "Become the go-to authority in your specific local neighborhood.",
      icon: <Users className="w-6 h-6 text-[#0d9488]" />,
      buttonText: "Build My Empire",
      ctaSubtext: "You sell homes; we’ll handle the fame.",
      tooltip: "For agents aiming for 'Neighborhood Mayor' status and total local authority.",
      features: [
        "6-8hr 'Day in the Life' Production",
        "90-Second Bio-Film",
        "Neighborhood Mayor Series (5 Videos)",
        "Cinematic Hotspot Highlights",
        "Complete Brand Transformation"
      ]
    }
  ];

  const phase1Tiers = [
    {
      name: "THE CONTENT STARTER",
      price: "500",
      period: "per month",
      tagline: '"The Leverage Entry"',
      description: 'The Vibe: You film it, we make it "Iconic."',
      features: [
        "8 Professionally Edited Reels (2/week)",
        "Signature 2026 Editing Style",
        "Trending Audio Integration",
        "Iconic Branding Application",
        "Goal: Professionalism on a budget"
      ],
      buttonText: "Start My Consistency"
    },
    {
      name: "THE CONTENT PRO",
      price: "850",
      period: "per month",
      tagline: '"The Growth Engine"',
      description: "The Vibe: Consistency is your new best friend.",
      features: [
        "12 Professionally Edited Reels (3/week)",
        "Caption & Hashtag Suite",
        "Scroll-Stopping Hooks",
        "Conversion-Focused Copywriting",
        "Goal: High Engagement & DMs"
      ],
      buttonText: "Grow My Consistency",
      isPopular: true
    }
  ];

  const phase2Tiers = [
    {
      name: "THE STARTER DOMINATOR",
      price: "1,500",
      period: "per month",
      tagline: '"The Visual Foundation"',
      description: "For the producer too busy to worry about 'the grid.'",
      features: [
        "12 Reels per month (3/week)",
        "Scheduling to IG/FB/TikTok",
        "Custom Captions & Hashtags",
        "60min Active Engagement",
        "Algorithm 'Warm-up' Service"
      ],
      buttonText: "Secure My Zip Code"
    },
    {
      name: "THE LEADER DOMINATOR",
      price: "2,800",
      period: "per month",
      tagline: '"The Active Presence"',
      description: "Total hands-off authority. You show up, we do the rest.",
      features: [
        "20 Reels/month (Daily M-F)",
        "1 Monthly Branding/Field Shoot",
        "DM Lead Capture & Flagging",
        "Dedicated Hook Strategy Sessions",
        "Full Management across platforms"
      ],
      buttonText: "Build My Empire",
      isPopular: true
    },
    {
      name: "THE ICONIC DOMINATOR",
      price: "4,500",
      period: "per month",
      tagline: '"The Total Market Takeover"',
      description: "A full-scale media agency in your pocket.",
      features: [
        "Unlimited Reels Production",
        "2 Monthly Field Shoots",
        "GHL Lead Automation",
        "Listing Bombs (Ad Management)",
        "Email/SMS Blast Integration"
      ],
      buttonText: "Build My Empire"
    },
    {
      name: 'THE "STANDARD" MARKETING',
      price: "2,000",
      period: "per month",
      tagline: '"The Consistent Presence"',
      description: "Balanced social and direct-to-SOI marketing.",
      features: [
        "12 Edited Reels + Captions",
        "1 Monthly 'Featured Insight' Email",
        "Repurposing best Reel of the month",
        "1 Monthly 'Check Inbox' Nudge Text",
        "Direct-to-Sphere engagement"
      ],
      buttonText: "Secure My Zip Code"
    },
    {
      name: 'THE "ELITE" MARKETING',
      price: "3,200",
      period: "per month",
      tagline: '"The Authority Engine"',
      description: "High-frequency content and deep SOI penetration.",
      features: [
        "20+ Reels + Pro-Filming Session",
        "Bi-weekly Updates (Listings + Pulse)",
        "Bi-weekly Direct-Response Texts",
        "High-Impact pro production",
        "Full Management & Automation"
      ],
      buttonText: "Build My Empire"
    }
  ];

  return (
    <div className="flex flex-col min-h-screen bg-[#fafafa]">
      <Header />
      
      <main className="flex-1 pb-20">
        {/* Hero Section - Reverted Style */}
        <div className="pt-32 pb-16 text-center px-4 max-w-5xl mx-auto">
          <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-[#f0fdfa] border border-[#ccfbf1] mb-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <span className="text-[12px] font-bold tracking-wider text-[#0d9488] uppercase">
              Pricing & Packages
            </span>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-black mb-6 tracking-tight leading-[1.1]">
            Pick the <span className="text-[#0d9488]">Perfect Price</span> for Your Presence
          </h1>
          <p className="text-lg text-gray-500 mb-10 max-w-2xl mx-auto font-medium">
            Not sure where to start?
          </p>

          {/* Hyperlink Bubbles */}
          <div className="flex flex-wrap justify-center gap-4 mb-16">
            {[
              { label: "For Listings", id: "listings" },
              { label: "For Branding", id: "branding" },
              { label: "For Business", id: "social" },
              { label: "For Growth", id: "brand-identity" }
            ].map((bubble) => (
              <button
                key={bubble.id}
                onClick={() => scrollToSection(bubble.id)}
                className="px-8 py-3 rounded-full border border-gray-200 bg-white text-sm font-bold text-gray-600 hover:border-[#0d9488] hover:text-[#0d9488] hover:shadow-lg transition-all"
              >
                {bubble.label}
              </button>
            ))}
          </div>

          {/* AI Assistant CTA - Smaller */}
          <div className="mt-8 p-0.5 bg-gradient-to-r from-[#0d9488] via-[#22d3ee] to-[#0d9488] rounded-[2rem] shadow-lg shadow-teal-500/5 max-w-lg mx-auto transform hover:scale-[1.01] transition-transform duration-500">
            <Link to="/pricing/ai-assistant" className="block bg-white rounded-[1.9rem] p-6 relative overflow-hidden group">
              <div className="relative z-10 flex items-center gap-6">
                <div className="w-12 h-12 rounded-[1rem] bg-[#f0fdfa] border border-[#ccfbf1] flex items-center justify-center shrink-0">
                  <Sparkles className="w-6 h-6 text-[#0d9488]" />
                </div>
                <div className="text-left flex-1">
                  <h3 className="text-lg font-bold text-black mb-1">Our AI Can Help</h3>
                  <div className="flex items-center gap-2 text-[#0d9488] font-bold text-xs">
                    Our AI Can Help <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </div>
            </Link>
          </div>
        </div>

        {/* Choose Your Path UX - The Doors */}
        <section className="py-16 bg-white border-y border-gray-50">
          <div className="max-w-5xl mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-2xl font-black text-black uppercase tracking-widest mb-2">Do you have...</h2>
              <div className="w-20 h-1 bg-[#0d9488] mx-auto rounded-full"></div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Door 1 */}
              <div
                onClick={() => scrollToSection('phase1')}
                className="group relative bg-white border border-gray-200 rounded-[2.5rem] p-10 text-center hover:border-[#0d9488] hover:shadow-2xl hover:shadow-teal-500/10 transition-all duration-500 overflow-hidden cursor-pointer shadow-xl shadow-gray-200/50"
              >
                <div className="absolute top-0 right-0 p-6 opacity-[0.05] group-hover:scale-110 transition-transform">
                  <Clock className="w-24 h-24" />
                </div>
                <div className="relative z-10">
                  <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-sm border border-gray-100 group-hover:scale-110 transition-transform">
                    <Clock className="w-8 h-8 text-[#0d9488]" />
                  </div>
                  <h3 className="text-2xl font-black text-black mb-4">MORE TIME THAN MONEY</h3>
                  <p className="text-gray-500 text-sm mb-8 leading-relaxed">
                    I’m ready to hustle, I just need the tools and the professional polish to win.
                  </p>
                  <Button className="bg-white border-2 border-black text-black hover:bg-black hover:text-white font-bold px-8 py-6 rounded-xl transition-all">
                    I'm ready to hustle →
                  </Button>
                </div>
              </div>

              {/* Door 2 */}
              <div
                onClick={() => scrollToSection('phase2')}
                className="group relative bg-white border border-gray-200 rounded-[2.5rem] p-10 text-center hover:border-[#0d9488] hover:shadow-2xl hover:shadow-teal-500/10 transition-all duration-500 overflow-hidden cursor-pointer shadow-xl shadow-gray-200/50"
              >
                <div className="absolute top-0 right-0 p-6 opacity-[0.05] group-hover:scale-110 transition-transform">
                  <DollarSign className="w-24 h-24" />
                </div>
                <div className="relative z-10">
                  <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-sm border border-gray-100 group-hover:scale-110 transition-transform">
                    <DollarSign className="w-8 h-8 text-[#0d9488]" />
                  </div>
                  <h3 className="text-2xl font-black text-black mb-4">MORE MONEY THAN TIME</h3>
                  <p className="text-gray-500 text-sm mb-8 leading-relaxed">
                    I’m ready to scale, I need my time back and my brand on autopilot.
                  </p>
                  <Button className="bg-[#0d9488] text-white hover:bg-[#0f766e] font-bold px-8 py-6 rounded-xl transition-all shadow-lg shadow-teal-100">
                    I'm ready to scale →
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
                Listing Domination <span className="text-gray-300">(The Property)</span>
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
                  className={`relative group bg-white rounded-[2rem] p-8 border transition-all duration-500 flex flex-col ${
                    tier.isPopular ? 'border-[#0d9488] shadow-2xl shadow-teal-500/10 scale-105 z-10' : 'border-gray-100 hover:border-[#0d9488]/30 hover:shadow-xl'
                  }`}
                >
                  {tier.badge && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest whitespace-nowrap shadow-lg">
                      {tier.badge}
                    </div>
                  )}

                  <div className="mb-6 flex items-center justify-between">
                    <div className="p-3 bg-[#f0fdfa] rounded-2xl">
                      {tier.icon}
                    </div>
                  </div>

                  <h3 className="text-xl font-black text-black mb-1">{tier.name}</h3>
                  <p className="text-[#0d9488] font-bold text-xs uppercase tracking-wider mb-6">{tier.tagline}</p>

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
                          <Check className="w-3.5 h-3.5 text-[#0d9488] stroke-[3]" />
                      </div>
                      <span className="text-sm font-medium text-gray-600 leading-tight">{feature}</span>
                    </div>
                    ))}
                  </div>

                  <div className="mt-auto space-y-4">
                    <Button asChild className={`w-full py-6 rounded-xl font-bold text-sm transition-all hover:scale-[1.02] ${
                      tier.isPopular ? 'bg-[#0d9488] hover:bg-[#0f766e] text-white shadow-lg shadow-teal-100' : 'bg-black hover:bg-gray-800 text-white shadow-lg'
                    }`}>
                      <Link to="/book">
                        {tier.buttonText}
                      </Link>
                    </Button>
                    <p className="text-[10px] text-gray-400 text-center font-medium italic">{tier.ctaSubtext}</p>

                    {/* Tooltip Simulation */}
                    <div className="pt-4 border-t border-gray-50 flex items-center justify-center group/tooltip relative">
                      <div className="flex items-center gap-2 text-[10px] font-bold text-gray-300 group-hover/tooltip:text-[#0d9488] cursor-help transition-colors">
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

            {/* The Basics Section */}
            <div className="mt-20 pt-20 border-t border-gray-100">
              <div className="text-center mb-12">
                <h3 className="text-2xl font-black text-black uppercase tracking-widest mb-4">Choose the Basics</h3>
                <p className="text-gray-500 text-sm font-medium">Fast, efficient, and essential media for every listing.</p>
              </div>

              <div className="bg-[#fafafa] rounded-[2.5rem] p-8 md:p-12 border border-gray-100">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                  {/* Photo Packages */}
                  <div className="lg:col-span-1 space-y-6">
                    <h4 className="text-[#0d9488] font-black text-xs uppercase tracking-widest mb-6">Photo Packages</h4>
                    <div className="space-y-4">
                      {[
                        { label: "20 Photos", price: "99" },
                        { label: "35 Photos", price: "150" },
                        { label: "50 Photos", price: "200" }
                      ].map((pkg, idx) => (
                        <div key={idx} className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-100 shadow-sm">
                          <span className="font-bold text-gray-700">{pkg.label}</span>
                          <span className="text-xl font-black text-black">${pkg.price}</span>
                        </div>
                      ))}
                    </div>
                    <div className="pt-4 space-y-2">
                      <div className="flex items-center gap-2 text-[11px] font-bold text-gray-400">
                        <Check className="w-3 h-3 text-[#0d9488]" />
                        <span>Lite Edits, No Grass</span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] font-bold text-gray-400">
                        <Check className="w-3 h-3 text-[#0d9488]" />
                        <span>Next Day Turn Around</span>
                      </div>
                    </div>
                  </div>

                  {/* Add-Ons */}
                  <div className="lg:col-span-1 space-y-6">
                    <h4 className="text-[#0d9488] font-black text-xs uppercase tracking-widest mb-6">Add-Ons</h4>
                    <div className="space-y-4">
                      {[
                        { label: "Aerial Add Ons", price: "99" },
                        { label: "Reel Add On", price: "125" },
                        { label: "Video Add On", price: "350-500+" }
                      ].map((addon, idx) => (
                        <div key={idx} className="flex items-center justify-between p-4 bg-white/50 rounded-xl border border-gray-100">
                          <span className="font-bold text-gray-600 text-sm">{addon.label}</span>
                          <span className="font-black text-black">${addon.price}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ICONIC Edits */}
                  <div className="lg:col-span-1">
                    <div className="h-full bg-black rounded-3xl p-8 text-white relative overflow-hidden group hover:scale-[1.02] transition-transform duration-500">
                      <div className="absolute top-0 right-0 p-6 opacity-10">
                        <Palette className="w-24 h-24" />
                      </div>
                      <div className="relative z-10">
                        <div className="flex items-center justify-between mb-6">
                          <h4 className="text-[#0d9488] font-black text-xs uppercase tracking-widest">Premium Upgrade</h4>
                          <span className="text-2xl font-black text-white">$55</span>
                        </div>
                        <h3 className="text-xl font-black mb-4">ICONIC EDITS</h3>
                        <div className="grid grid-cols-1 gap-3">
                          {[
                            "Add Grass",
                            "Clean Driveway",
                            "Remove Cords",
                            "Add Fire to Fireplaces",
                            "Add TV Screens",
                            "Digital Curb Appeal"
                          ].map((edit, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <Sparkles className="w-3 h-3 text-[#0d9488]" />
                              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{edit}</span>
                            </div>
                          ))}
                        </div>
                        <Button asChild className="w-full mt-8 bg-[#0d9488] hover:bg-[#0f766e] text-white font-black py-6 rounded-xl transition-all shadow-lg shadow-teal-900/20">
                          <Link to="/book">Upgrade My Photos</Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Branding Before & After Slider - Smaller */}
        <section className="py-24 bg-[#fafafa]">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <h2 className="text-3xl font-bold text-black mb-4">Elevate Your Personal Brand</h2>
            <p className="text-gray-500 mb-12 max-w-xl mx-auto text-sm">See the difference between a standard corporate headshot and an Iconic Lifestyle Portrait.</p>
            
            <div className="relative max-w-2xl mx-auto aspect-[16/9] rounded-[2rem] overflow-hidden shadow-xl border-4 border-white">
              {/* After (Iconic) */}
              <img 
                src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=1200&q=80" 
                className="absolute inset-0 w-full h-full object-cover"
                alt="Iconic Lifestyle"
              />
              <div className="absolute inset-0 flex flex-col justify-end p-6 text-white z-10 text-right pointer-events-none">
                <div className="bg-[#0d9488] px-3 py-1.5 rounded-full inline-block self-end text-[10px] font-black uppercase tracking-widest shadow-lg">Iconic Lifestyle</div>
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
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-[#0d9488] rounded-full flex items-center justify-center text-white border-4 border-white shadow-2xl">
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
                Iconic Branding <span className="text-gray-300">(The Agent)</span>
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
                    tier.isPopular ? 'border-[#0d9488] shadow-2xl shadow-teal-500/10 scale-105 z-10' : 'border-gray-100 hover:border-[#0d9488]/30 hover:shadow-xl'
                  }`}
                >
                  <div className="mb-6 flex items-center justify-between">
                    <div className="p-3 bg-[#f0fdfa] rounded-2xl">
                      {tier.icon}
                    </div>
                  </div>

                  <h3 className="text-xl font-black text-black mb-1">{tier.name}</h3>
                  <p className="text-[#0d9488] font-bold text-xs uppercase tracking-wider mb-6">{tier.tagline}</p>

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
                          <Check className="w-3.5 h-3.5 text-[#0d9488] stroke-[3]" />
                      </div>
                      <span className="text-sm font-medium text-gray-600 leading-tight">{feature}</span>
                    </div>
                    ))}
                  </div>

                  <div className="mt-auto space-y-4">
                    <Button asChild className={`w-full py-6 rounded-xl font-bold text-sm transition-all hover:scale-[1.02] ${
                      tier.isPopular ? 'bg-[#0d9488] hover:bg-[#0f766e] text-white shadow-lg shadow-teal-100' : 'bg-black hover:bg-gray-800 text-white shadow-lg'
                    }`}>
                      <Link to="/book">
                        {tier.buttonText}
                      </Link>
                    </Button>
                    <p className="text-[10px] text-gray-400 text-center font-medium italic">{tier.ctaSubtext}</p>
                    
                    {/* Tooltip Simulation */}
                    <div className="pt-4 border-t border-gray-50 flex items-center justify-center group/tooltip relative">
                      <div className="flex items-center gap-2 text-[10px] font-bold text-gray-300 group-hover/tooltip:text-[#0d9488] cursor-help transition-colors">
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
                Social Monopoly (The Management)
              </h2>
              <p className="text-lg text-gray-500 leading-relaxed">
                Transitioning from "Content Creation" to "Market Ownership."
                These are your recurring revenue "Social Manager" packages designed to build your empire.
              </p>
            </div>

            {/* Phase 1: Time Over Money */}
            <div id="phase1" className="mb-24">
              <div className="flex items-center gap-4 mb-10">
                <div className="h-[2px] flex-1 bg-gradient-to-r from-transparent to-gray-200"></div>
                <h3 className="text-lg font-black text-gray-400 uppercase tracking-[0.3em] whitespace-nowrap">PHASE 1: THE "TIME OVER MONEY" TRACK</h3>
                <div className="h-[2px] flex-1 bg-gradient-to-l from-transparent to-gray-200"></div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
                {phase1Tiers.map((tier, i) => (
                  <div key={i} className={`bg-white rounded-[2rem] p-10 border transition-all duration-500 hover:shadow-xl ${tier.isPopular ? 'border-[#0d9488]' : 'border-gray-100'}`}>
                    <h4 className="text-xl font-black text-black mb-1">{tier.name}</h4>
                    <p className="text-[#0d9488] font-bold text-xs uppercase tracking-widest mb-6">{tier.tagline}</p>
                    <div className="mb-6 flex items-baseline gap-1">
                      <span className="text-4xl font-black text-black">${tier.price}</span>
                      <span className="text-gray-400 text-xs font-bold uppercase tracking-widest">{tier.period}</span>
                    </div>
                    <p className="text-sm font-bold text-gray-700 mb-8 italic">{tier.description}</p>
                    <div className="space-y-4 mb-10">
                      {tier.features.map((feature, j) => (
                        <div key={j} className="flex items-start gap-3">
                      <Check className="w-4 h-4 text-[#0d9488] stroke-[3] mt-0.5" />
                      <span className="text-sm font-medium text-gray-600">{feature}</span>
                        </div>
                      ))}
                    </div>
                    <Button asChild className="w-full py-6 rounded-xl bg-black hover:bg-gray-800 text-white font-bold transition-all shadow-lg">
                      <Link to="/book">
                        {tier.buttonText}
                      </Link>
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Phase 2: Money Over Time */}
            <div id="phase2">
              <div className="flex items-center gap-4 mb-10">
                <div className="h-[2px] flex-1 bg-gradient-to-r from-transparent to-[#0d9488]/20"></div>
                <h3 className="text-lg font-black text-[#0d9488] uppercase tracking-[0.3em] whitespace-nowrap">PHASE 2: THE "MONEY OVER TIME" TRACK</h3>
                <div className="h-[2px] flex-1 bg-gradient-to-l from-transparent to-[#0d9488]/20"></div>
              </div>

              <div className="flex flex-wrap justify-center gap-8">
                {phase2Tiers.slice(0, 3).map((tier, i) => (
                  <div key={i} className={`relative bg-white rounded-[2rem] p-8 border transition-all duration-500 hover:shadow-2xl w-full md:w-[calc(33.333%-1.5rem)] ${tier.isPopular ? 'border-[#0d9488] scale-105 z-10 shadow-xl' : 'border-gray-100'}`}>
                    {tier.isPopular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#0d9488] text-white text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest">Active Presence</div>
                    )}
                    <h4 className="text-xl font-black text-black mb-1">{tier.name}</h4>
                    <p className="text-[#0d9488] font-bold text-xs uppercase tracking-widest mb-6">{tier.tagline}</p>
                    <div className="mb-6 flex items-baseline gap-1">
                      <span className="text-4xl font-black text-black">${tier.price}</span>
                      <span className="text-gray-400 text-xs font-bold uppercase tracking-widest">{tier.period}</span>
                    </div>
                    <p className="text-xs text-gray-500 leading-relaxed mb-8 h-12 overflow-hidden">{tier.description}</p>
                    <div className="space-y-4 mb-10">
                      {tier.features.map((feature, j) => (
                        <div key={j} className="flex items-start gap-3">
                          <Check className="w-3.5 h-3.5 text-[#0d9488] stroke-[3] mt-0.5" />
                          <span className="text-[11px] font-medium text-gray-600 leading-tight">{feature}</span>
                        </div>
                      ))}
                    </div>
                    <Button asChild className={`w-full py-6 rounded-xl font-bold transition-all ${tier.isPopular ? 'bg-[#0d9488] text-white' : 'bg-black text-white'}`}>
                      <Link to="/book">
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
                      <p className="text-[#0d9488] font-bold text-xs uppercase tracking-widest mb-6">{tier.tagline}</p>
                      <div className="mb-6 flex items-baseline gap-1">
                        <span className="text-4xl font-black text-black">${tier.price}</span>
                        <span className="text-gray-400 text-xs font-bold uppercase tracking-widest">{tier.period}</span>
                      </div>
                      <p className="text-xs text-gray-500 leading-relaxed mb-8 h-12 overflow-hidden">{tier.description}</p>
                      <div className="space-y-4 mb-10">
                        {tier.features.map((feature, j) => (
                          <div key={j} className="flex items-start gap-3">
                            <Check className="w-3.5 h-3.5 text-[#0d9488] stroke-[3] mt-0.5" />
                            <span className="text-[11px] font-medium text-gray-600 leading-tight">{feature}</span>
                          </div>
                        ))}
                      </div>
                      <Button asChild className="w-full py-6 rounded-xl bg-black text-white font-bold transition-all">
                        <Link to="/book">
                          {tier.buttonText}
                        </Link>
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Need a Brand? Section */}
        <section id="brand-identity" className="py-24 bg-white">
          <div className="max-w-6xl mx-auto px-4">
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-3 text-[#0d9488] mb-4">
                <Palette className="w-6 h-6" />
                <span className="text-sm font-black uppercase tracking-widest underline underline-offset-8">NEED A BRAND?</span>
              </div>
              <h2 className="text-4xl md:text-5xl font-bold text-black mb-6 tracking-tight">
                The "Iconic" Strategic Plan
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-20">
              {/* Foundation */}
              <div className="bg-[#fafafa] rounded-[2.5rem] p-10 border border-gray-100 group hover:border-[#0d9488]/30 transition-all duration-500">
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
                      <Check className="w-4 h-4 text-[#0d9488]" />
                      <span className="text-xs font-bold text-gray-600">{item}</span>
                    </div>
                  ))}
                </div>
                <Button asChild className="w-full py-6 rounded-xl bg-black text-white hover:bg-[#0d9488] transition-all">
                  <Link to="/book">
                    Start My Foundation →
                  </Link>
                </Button>
              </div>

              {/* Evolution */}
              <div className="bg-[#fafafa] rounded-[2.5rem] p-10 border border-gray-100 group hover:border-[#0d9488]/30 transition-all duration-500">
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
                      <Check className="w-4 h-4 text-[#0d9488]" />
                      <span className="text-xs font-bold text-gray-600">{item}</span>
                    </div>
                  ))}
                </div>
                <Button asChild className="w-full py-6 rounded-xl bg-black text-white hover:bg-[#0d9488] transition-all">
                  <Link to="/book">
                    Start My Evolution →
                  </Link>
                </Button>
              </div>
            </div>

            {/* Redesigned Bundle Box */}
            <div className="bg-[#fafafa] rounded-[2.5rem] p-10 md:p-16 border border-gray-100 group hover:border-[#0d9488]/30 transition-all duration-500 mb-20 relative overflow-hidden">
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
                  <Button asChild className="bg-black text-white hover:bg-[#0d9488] font-black px-12 py-8 text-xl rounded-2xl transition-all shadow-xl hover:scale-105 active:scale-95 shrink-0">
                    <Link to="/book">Let's Chat</Link>
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  <div className="space-y-4">
                    <h4 className="text-[#0d9488] font-black text-xs uppercase tracking-widest mb-4">Core Brand Foundation</h4>
                    {[
                      "Logos Suite & Visual Identity",
                      "Signature Style Guide",
                      "Hex Color Palettes",
                      "Canva Brand Hub Setup",
                      "Marketing Templates",
                      "Digital Business Card"
                    ].map((item, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <Check className="w-4 h-4 text-[#0d9488]" />
                        <span className="text-sm font-bold text-gray-600">{item}</span>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-[#0d9488] font-black text-xs uppercase tracking-widest mb-4">AI & Automation Suite</h4>
                    {[
                      "AI Voice Clone Setup",
                      "AI Video Avatar Creation",
                      "Automated Updates Suite",
                      "Voice Synthesis Training",
                      "Likeness Protection",
                      "Vision Pro Readiness"
                    ].map((item, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <Check className="w-4 h-4 text-[#0d9488]" />
                        <span className="text-sm font-bold text-gray-600">{item}</span>
                      </div>
                    ))}
                  </div>

                  <div className="bg-white/50 rounded-2xl p-6 border border-gray-100 flex flex-col justify-center gap-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#f0fdfa] flex items-center justify-center">
                        <Star className="w-5 h-5 text-[#0d9488] fill-[#0d9488]" />
                      </div>
                      <span className="text-sm font-black text-black">Total Brand Immersion</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#f0fdfa] flex items-center justify-center">
                        <Rocket className="w-5 h-5 text-[#0d9488]" />
                      </div>
                      <span className="text-sm font-black text-black">Instant Market Authority</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#f0fdfa] flex items-center justify-center">
                        <Users className="w-5 h-5 text-[#0d9488]" />
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
                  <h4 className="text-xl font-bold mb-4 text-[#0d9488]">Iconic Logo Suite</h4>
                  <p className="text-gray-400 text-sm leading-relaxed">High-res custom logos for agent/team in PNG, Vector, and Social Square formats.</p>
                </div>
                <div>
                  <h4 className="text-xl font-bold mb-4 text-[#0d9488]">Signature Style Guide</h4>
                  <p className="text-gray-400 text-sm leading-relaxed">Curated Font Kits and Hex Color Palettes to ensure every piece of content looks cohesive.</p>
                </div>
                <div>
                  <h4 className="text-xl font-bold mb-4 text-[#0d9488]">Brand Hub Setup</h4>
                  <p className="text-gray-400 text-sm leading-relaxed">We build your Brand Kit directly into your Canva or marketing platform for instant access.</p>
                </div>
                <div>
                  <h4 className="text-xl font-bold mb-4 text-[#0d9488]">Marketing Templates</h4>
                  <p className="text-gray-400 text-sm leading-relaxed">10+ "Plug & Play" templates for Just Listed/Sold, Open House, and Market Updates.</p>
                </div>
                <div>
                  <h4 className="text-xl font-bold mb-4 text-[#0d9488]">Premium Business Cards</h4>
                  <p className="text-gray-400 text-sm leading-relaxed">Custom heavy-stock physical card design + Digital QR Card for instant lead capture.</p>
                </div>
                <div className="flex items-center">
                  <div className="p-6 border-2 border-[#0d9488] rounded-2xl">
                    <p className="text-sm font-bold text-white uppercase tracking-widest">Dominate with Identity</p>
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
              <div className="inline-flex items-center px-3 py-1 rounded bg-[#f0fdfa] border border-[#ccfbf1] mb-8">
                <span className="text-[10px] font-bold tracking-wider text-[#0d9488] uppercase">
                  FAQ
                </span>
              </div>
              <h2 className="text-4xl md:text-5xl font-bold mb-6 text-black">
                Got questions? We've got <span className="text-[#0d9488]">answers</span>.
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
