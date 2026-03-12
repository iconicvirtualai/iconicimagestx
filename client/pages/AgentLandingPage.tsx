import React, { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { 
  Star, 
  Zap, 
  Camera, 
  Clock, 
  CheckCircle2, 
  ArrowRight, 
  Users, 
  ShieldCheck,
  TrendingUp,
  Award,
  Calendar,
  Sparkles,
  MessageSquare
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import BookingForm from "@/components/BookingForm";
import { Button } from "@/components/ui/button";
import { useSiteSettings } from "@/hooks/useSiteSettings";

export default function AgentLandingPage() {
  const settings = useSiteSettings();
  const [searchParams] = useSearchParams();
  const [utmSource, setUtmSource] = useState<string | null>(null);

  useEffect(() => {
    const source = searchParams.get("utm_source");
    const medium = searchParams.get("utm_medium");
    const campaign = searchParams.get("utm_campaign");
    
    if (source) {
      setUtmSource(source);
      // Store for later use in booking finalization if needed
      localStorage.setItem("iconic_lead_source", JSON.stringify({
        source,
        medium,
        campaign,
        timestamp: new Date().toISOString()
      }));
    }
  }, [searchParams]);

  const stats = [
    { label: "Listings Shot", value: "1,200+" },
    { label: "Avg. ROI Increase", value: "34%" },
    { label: "Delivery Speed", value: "Next Day" },
    { label: "Rating", value: "4.98/5" }
  ];

  const benefits = [
    {
      icon: <Clock className="w-6 h-6 text-teal-500" />,
      title: "Next-Day Delivery",
      description: "Don't wait. Get your high-res photos and videos within 24 hours of the shoot."
    },
    {
      icon: <TrendingUp className="w-6 h-6 text-teal-500" />,
      title: "Higher Engagement",
      description: "Our 'Iconic' style is proven to get 10x more views on Zillow and social media."
    },
    {
      icon: <Camera className="w-6 h-6 text-teal-500" />,
      title: "Premium Equipment",
      description: "We use 4K cinematic cameras and advanced lighting to make every room shine."
    }
  ];

  const testimonials = [
    {
      name: "Sarah Jenkins",
      role: "Top 1% Producer, Keller Williams",
      content: "Iconic Images changed my business. My listings sell 40% faster now that I've switched to their cinematic reels."
    },
    {
      name: "Michael Chen",
      role: "Luxury Specialist",
      content: "The quality is unmatched. They don't just take photos; they tell a story that luxury buyers resonate with."
    }
  ];

  const scrollToBooking = () => {
    document.getElementById("booking-section")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-white font-sans text-black">
      <Header />
      
      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-6 lg:pt-48 lg:pb-32 overflow-hidden">
        <div className="absolute top-0 right-0 -z-10 w-1/2 h-full bg-gradient-to-l from-teal-50/50 to-transparent blur-3xl opacity-50" />
        
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-8"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-black text-white text-xs font-black uppercase tracking-widest shadow-lg">
              <Sparkles className="w-3 h-3 text-white" /> Exclusive Offer for Real Estate Agents
            </div>

            <h1 className="text-5xl lg:text-7xl font-black uppercase leading-[0.9] tracking-tighter text-black">
              Get <span className="accent-text-bordered">10X More Eyes</span> On Your Listings
            </h1>
            
            <p className="text-lg lg:text-xl text-gray-600 max-w-xl font-medium">
              Top-producing agents don't just list homes—they create experiences. Iconic Images provides the cinematic content you need to dominate your market and win every listing presentation.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button 
                onClick={scrollToBooking}
                className="bg-black hover:bg-gray-900 text-white font-bold text-xl px-12 py-8 rounded-2xl shadow-2xl transition-all hover:scale-105"
              >
                Book Your Iconic Launch
              </Button>
              <div className="flex flex-col justify-center px-4">
                <div className="flex items-center gap-1">
                  <span className="text-xl font-black text-black">4.98</span>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} className="w-4 h-4 fill-green-500 text-green-500" />
                  ))}
                </div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Trusted by 500+ Agents</p>
              </div>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8 }}
            className="relative"
          >
            <div className="aspect-[4/5] rounded-[2rem] overflow-hidden shadow-2xl border-8 border-white">
              <img 
                src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&q=80" 
                alt="Luxury Real Estate" 
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <div className="absolute bottom-8 left-8 right-8 text-white">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
                  <span className="text-xs font-bold uppercase tracking-widest">Recently Sold for $2.4M</span>
                </div>
                <p className="text-2xl font-black uppercase tracking-tight">The Legacy Package Experience</p>
              </div>
            </div>
            
            {/* Floating Badge */}
            <div className="absolute -top-6 -right-6 bg-white p-6 rounded-3xl shadow-2xl border border-gray-100 hidden md:block">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-teal-100 rounded-2xl flex items-center justify-center">
                  <Zap className="w-6 h-6 text-teal-600" />
                </div>
                <div>
                  <p className="text-sm font-black uppercase tracking-widest">Next-Day</p>
                  <p className="text-xs font-bold text-gray-400">Delivery Guaranteed</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="bg-black py-12">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat, i) => (
            <div key={i} className="text-center space-y-1">
              <p className="text-3xl lg:text-5xl font-black text-white">{stat.value}</p>
              <p className="text-[10px] lg:text-xs font-bold text-teal-400 uppercase tracking-[0.2em]">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-24 px-6 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center space-y-4 mb-20">
            <h2 className="text-3xl lg:text-5xl font-black uppercase tracking-tight">Why Agents Choose <span className="accent-text-bordered">Iconic</span></h2>
            <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">The gold standard in real estate marketing</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-12">
            {benefits.map((benefit, i) => (
              <motion.div 
                key={i}
                whileHover={{ y: -10 }}
                className="bg-white p-10 rounded-[2rem] shadow-xl shadow-gray-200/50 space-y-6"
              >
                <div className="w-14 h-14 bg-teal-50 rounded-2xl flex items-center justify-center">
                  {benefit.icon}
                </div>
                <h3 className="text-xl font-black uppercase tracking-tight">{benefit.title}</h3>
                <p className="text-gray-600 leading-relaxed font-medium">{benefit.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Referral Section (Mini) */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto bg-teal-600 rounded-[2.5rem] p-12 text-center text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl" />
          <div className="relative z-10 space-y-6">
            <h2 className="text-3xl lg:text-4xl font-black uppercase tracking-tight">The Agent Referral Program</h2>
            <p className="text-teal-50 font-medium text-lg max-w-xl mx-auto">
              Refer a colleague and you both get <span className="font-black text-white underline">$50 OFF</span> your next shoot. It's our way of saying thanks for growing the Iconic community.
            </p>
            <Button className="bg-white text-teal-600 hover:bg-teal-50 font-black uppercase tracking-widest px-8 py-6 rounded-xl">
              Learn More About Referrals
            </Button>
          </div>
        </div>
      </section>

      {/* Social Proof / Testimonials */}
      <section className="py-24 px-6 overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-8">
              <h2 className="text-4xl lg:text-6xl font-black uppercase tracking-tighter leading-[0.9]">
                Hear it from <span className="accent-text-bordered">The Experts</span>
              </h2>
              <div className="space-y-6">
                {testimonials.map((t, i) => (
                  <div key={i} className="bg-white p-8 rounded-3xl border border-gray-100 shadow-lg space-y-4">
                    <div className="flex gap-1">
                      {[1,2,3,4,5].map(star => <Star key={star} className="w-4 h-4 fill-yellow-400 text-yellow-400" />)}
                    </div>
                    <p className="italic text-gray-700 text-lg font-medium">"{t.content}"</p>
                    <div>
                      <p className="font-black uppercase tracking-widest text-sm">{t.name}</p>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{t.role}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="relative">
              <div className="aspect-video rounded-[2rem] bg-gray-100 overflow-hidden shadow-2xl flex items-center justify-center group cursor-pointer">
                <img 
                  src="https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&q=80" 
                  alt="Video Testimonial" 
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-all flex items-center justify-center">
                  <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-2xl transition-transform group-hover:scale-110">
                    <div className="w-0 h-0 border-t-[10px] border-t-transparent border-l-[18px] border-l-black border-b-[10px] border-b-transparent ml-1" />
                  </div>
                </div>
              </div>
              <p className="text-center mt-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Watch: How 1 Iconic Shoot Sold a House in 3 Days</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pre-Appointment Prep Section */}
      <section className="py-24 px-6 bg-black text-white">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-teal-600 text-white text-xs font-black uppercase tracking-widest">
              Success Blueprint
            </div>
            <h2 className="text-4xl lg:text-5xl font-black uppercase tracking-tight">How To Prepare For Your <span className="accent-text-bordered">Iconic Shoot</span></h2>
            <p className="text-gray-400 font-medium text-lg">
              We don't just show up. We partner with you to ensure the property looks its absolute best. 
            </p>
            
            <div className="space-y-6">
              {[
                { title: "The Checklist", desc: "Access our 'Magazine-Ready' preparation guide for your sellers." },
                { title: "Lighting Optimization", desc: "Our team coordinates the best time of day for natural light." },
                { title: "Strategic Staging", desc: "Minor adjustments on-site that make a major difference on camera." }
              ].map((item, i) => (
                <div key={i} className="flex gap-4">
                  <div className="mt-1 flex-shrink-0 w-6 h-6 rounded-full border-2 border-teal-500 flex items-center justify-center text-[10px] font-black">
                    {i + 1}
                  </div>
                  <div>
                    <p className="font-black uppercase tracking-widest text-sm">{item.title}</p>
                    <p className="text-gray-400 text-sm mt-1">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="bg-gray-900 rounded-[2.5rem] p-10 border border-gray-800 space-y-8">
            <div className="space-y-2">
              <h3 className="text-2xl font-black uppercase tracking-tight">What to Expect</h3>
              <p className="text-gray-500 text-sm font-bold uppercase tracking-widest">The Iconic Timeline</p>
            </div>
            
            <div className="space-y-8 relative">
              <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-gray-800" />
              
              {[
                { time: "Day 0", title: "Book Online", icon: <Calendar className="w-3.5 h-3.5" /> },
                { time: "Shoot Day", title: "We Capture The Magic", icon: <Camera className="w-3.5 h-3.5" /> },
                { time: "24h Later", title: "Next-Day Delivery", icon: <Zap className="w-3.5 h-3.5" /> },
                { time: "Sold!", title: "The Iconic Results", icon: <Award className="w-3.5 h-3.5" /> }
              ].map((step, i) => (
                <div key={i} className="flex gap-6 relative z-10">
                  <div className="w-6 h-6 rounded-full bg-teal-600 flex items-center justify-center text-white">
                    {step.icon}
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-teal-400">{step.time}</p>
                    <p className="font-bold uppercase tracking-tight">{step.title}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Booking Section */}
      <section id="booking-section" className="py-32 px-6 bg-white scroll-mt-20">
        <div className="max-w-5xl mx-auto space-y-16">
          <div className="text-center space-y-4">
            <h2 className="text-4xl lg:text-6xl font-black uppercase tracking-tighter">Secure Your <span className="accent-text-bordered">Iconic Launch</span></h2>
            <p className="text-gray-500 font-bold uppercase tracking-widest text-sm italic">
              "The best investment I make in every listing." — Top Agent
            </p>
          </div>
          
          <div className="bg-[#fafafa] rounded-[3rem] p-8 lg:p-12 shadow-2xl border border-gray-100">
            {/* Booking form pre-selected for Listings Showcase */}
            <BookingForm initialServiceId="listing-showcase" initialCategoryId="listings" />
          </div>
          
          <div className="flex flex-col md:flex-row justify-center items-center gap-8 md:gap-16">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-10 h-10 text-teal-600" />
              <div>
                <p className="text-sm font-black uppercase tracking-widest">Secure Booking</p>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">256-bit Encryption</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-10 h-10 text-teal-600" />
              <div>
                <p className="text-sm font-black uppercase tracking-widest">Quality Guaranteed</p>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">100% Satisfaction</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <MessageSquare className="w-10 h-10 text-teal-600" />
              <div>
                <p className="text-sm font-black uppercase tracking-widest">24/7 Support</p>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Always Here To Help</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />

      {/* Mobile Sticky CTA */}
      <div className="fixed bottom-6 left-6 right-6 md:hidden z-50">
        <Button
          onClick={scrollToBooking}
          className="w-full bg-black hover:bg-gray-900 text-white font-black uppercase tracking-widest py-8 rounded-2xl shadow-2xl border-2 border-white/10 backdrop-blur-lg"
        >
          Book Your Shoot Now
        </Button>
      </div>
    </div>
  );
}
