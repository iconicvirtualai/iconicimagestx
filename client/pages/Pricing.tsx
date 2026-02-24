import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Check, X, ArrowRight, Star, ChevronLeft, ChevronRight } from "lucide-react";
import { useState, useRef } from "react";

export default function Pricing() {
  const [isYearly, setIsYearly] = useState(true);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollTestimonials = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 400;
      scrollContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const plans = [
    {
      name: "FREE",
      description: "For agents who want to see the Iconic difference.",
      metrics: "1 Strategy",
      metricsUnit: "/month",
      monthlyPrice: 0,
      yearlyPrice: 0,
      pricePerUnit: 0,
      unitName: "session",
      buttonText: "Book Now →",
      features: [
        { text: "1 Strategy Session/month", included: true },
        { text: "Content Audit", included: true },
        { text: "Growth Roadmap", included: true },
        { text: "Cinematic Media", included: false },
        { text: "Next-Day Delivery", included: false },
        { text: "Social Media Kits", included: false },
        { text: "Drone Photography", included: false },
        { text: "Priority Support", included: false },
      ]
    },
    {
      name: "STARTER",
      description: "For individuals ready to upgrade their listing game.",
      metrics: "1 Package",
      metricsUnit: isYearly ? "/year" : "/month",
      monthlyPrice: 299,
      yearlyPrice: 239,
      originalMonthlyPrice: 349,
      originalYearlyPrice: 299,
      pricePerUnit: 299,
      unitName: "listing",
      discount: "20% OFF",
      buttonText: "Start Free Trial →",
      trialText: "7-day free trial – cancel anytime*",
      features: [
        { text: "1 Full Listing Package/month", included: true },
        { text: "25 High-Def Photos", included: true },
        { text: "Digital Floorplan", included: true },
        { text: "1 Vertical Cinematic Reel", included: true },
        { text: "Next Day Delivery", included: true },
        { text: "Unlimited AI photo edits", included: true },
        { text: "Drone Photography", included: false },
        { text: "Priority Support", included: false },
      ]
    },
    {
      name: "LEADER",
      description: "For growing teams scaling their market presence.",
      metrics: "2 Packages",
      metricsUnit: isYearly ? "/year" : "/month",
      monthlyPrice: 599,
      yearlyPrice: 479,
      originalMonthlyPrice: 749,
      originalYearlyPrice: 599,
      pricePerUnit: 240,
      unitName: "listing",
      discount: "20% OFF",
      isPopular: true,
      buttonText: "Start Free Trial →",
      trialText: "7-day free trial – cancel anytime*",
      features: [
        { text: "2 Full Listing Packages/month", included: true },
        { text: "40 High-Def Photos", included: true },
        { text: "Aerial Drone Photography", included: true },
        { text: "9:16 Vertical Video Trailer", included: true },
        { text: "Predictive Twilight Staging", included: true },
        { text: "'Just Listed' Social Kit", included: true },
        { text: "Unlimited AI photo edits", included: true },
        { text: "Priority Support", included: true },
      ]
    },
    {
      name: "DOMINATOR",
      description: "For top producers and agencies dominating the area.",
      metrics: "Unlimited",
      metricsUnit: isYearly ? "/year" : "/month",
      monthlyPrice: 1499,
      yearlyPrice: 1199,
      originalMonthlyPrice: 1899,
      originalYearlyPrice: 1499,
      pricePerUnit: 199,
      unitName: "listing",
      discount: "20% OFF",
      buttonText: "Start Free Trial →",
      trialText: "7-day free trial – cancel anytime*",
      features: [
        { text: "Unlimited Listing Packages", included: true },
        { text: "1 Personal Brand Shoot/mo", included: true },
        { text: "Weekly Social Media Content", included: true },
        { text: "The 'Sold' Legacy Blast", included: true },
        { text: "Neighborhood Domination Maps", included: true },
        { text: "Dedicated Creative Partner", included: true },
        { text: "AI Digital Twin Access", included: true },
        { text: "24/7 Priority Support", included: true },
      ]
    }
  ];

  return (
    <div className="flex flex-col min-h-screen bg-white">
      <Header />
      
      <main className="flex-1 pb-20">
        {/* Hero */}
        <div className="pt-20 pb-12 text-center px-4">
          <h1 className="text-4xl md:text-6xl font-bold text-black mb-4">
            Choose the <span className="text-[#0d9488]">perfect</span> plan for your needs
          </h1>
          <p className="text-gray-500 text-lg">
            Start for free, upgrade when you <span className="text-[#0d9488]">❤</span> love it.
          </p>

          {/* Billing Toggle */}
          <div className="mt-10 flex items-center justify-center gap-4">
            <span className={`text-sm font-medium ${!isYearly ? 'text-black' : 'text-gray-400'}`}>Monthly</span>
            <button 
              onClick={() => setIsYearly(!isYearly)}
              className="relative w-14 h-7 bg-[#0d9488] rounded-full p-1 transition-colors"
            >
              <div className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${isYearly ? 'translate-x-7' : 'translate-x-0'}`}></div>
            </button>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-medium ${isYearly ? 'text-black' : 'text-gray-400'}`}>Yearly</span>
              <span className="bg-[#ccfbf1] text-[#0d9488] text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tight">
                up to 30% off
              </span>
            </div>
          </div>
        </div>

        {/* Pricing Grid */}
        <div className="max-w-[1400px] mx-auto px-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {plans.map((plan, i) => (
            <div 
              key={i} 
              className={`relative bg-white rounded-2xl p-6 border transition-all duration-300 flex flex-col ${
                plan.isPopular ? 'border-[#0d9488] ring-1 ring-[#0d9488] shadow-lg scale-105 z-10' : 'border-gray-100 hover:border-gray-200'
              }`}
            >
              {plan.isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#0d9488] text-white text-[10px] font-bold px-4 py-1 rounded-full uppercase tracking-widest whitespace-nowrap">
                  Most Popular
                </div>
              )}

              <div className="flex justify-between items-start mb-2">
                <h3 className="text-xl font-bold text-[#0d9488] tracking-tight">{plan.name}</h3>
                {plan.discount && (
                  <div className="flex items-center gap-1 bg-[#f0f9ff] text-[#0ea5e9] text-[10px] font-bold px-2 py-1 rounded-md">
                    <Star className="w-3 h-3 fill-current" />
                    {plan.discount}
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-400 mb-6 leading-relaxed h-8">{plan.description}</p>

              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-black">{plan.metrics}</span>
                  <span className="text-gray-400 text-xs">{plan.metricsUnit}</span>
                </div>
                
                <div className="mt-4 flex gap-2">
                  <div className="bg-gray-50 rounded-lg px-3 py-1.5 flex-1">
                    <p className="text-[10px] font-bold text-black">${isYearly ? plan.yearlyPrice : plan.monthlyPrice} <span className="text-gray-400 font-normal">/month</span></p>
                    {isYearly && (
                      <p className="text-[8px] text-gray-300 line-through">${plan.originalYearlyPrice} /month</p>
                    )}
                  </div>
                  <div className="bg-gray-50 rounded-lg px-3 py-1.5 flex-1">
                    <p className="text-[10px] font-bold text-black">${plan.pricePerUnit} <span className="text-gray-400 font-normal">/{plan.unitName}</span></p>
                    {isYearly && (
                      <p className="text-[8px] text-gray-300 line-through">${plan.pricePerUnit + 5} /{plan.unitName}</p>
                    )}
                  </div>
                </div>
              </div>

              <Link to="/book" className="mb-2">
                <Button className={`w-full py-5 rounded-lg font-bold text-sm ${
                  plan.isPopular ? 'bg-[#0d9488] hover:bg-[#0f766e] text-white' : 'bg-[#22d3ee] hover:bg-[#0891b2] text-white'
                }`}>
                  {plan.buttonText}
                </Button>
              </Link>
              {plan.trialText && (
                <p className="text-[10px] text-gray-400 text-center mb-6 italic">{plan.trialText}</p>
              )}

              <div className="mt-auto pt-6 border-t border-gray-50 space-y-3">
                {plan.features.map((feature, j) => (
                  <div key={j} className="flex items-center gap-3">
                    {feature.included ? (
                      <div className="w-4 h-4 rounded-full bg-[#ccfbf1] flex items-center justify-center shrink-0">
                        <Check className="w-2.5 h-2.5 text-[#0d9488] stroke-[3]" />
                      </div>
                    ) : (
                      <div className="w-4 h-4 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                        <X className="w-2.5 h-2.5 text-red-400 stroke-[3]" />
                      </div>
                    )}
                    <span className={`text-[11px] ${feature.included ? 'text-gray-600' : 'text-gray-300'}`}>
                      {feature.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Enterprise Section */}
        <div className="max-w-[1400px] mx-auto px-4 mt-12">
          <div className="bg-white border border-gray-100 rounded-2xl p-8 flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="flex-1">
              <h3 className="text-2xl font-bold text-[#0d9488] mb-2 uppercase tracking-tight">Enterprise / API Access</h3>
              <p className="text-gray-500 text-sm">Need more? Get in touch for custom plans for your business needs.</p>
            </div>
            <div className="flex-1 flex flex-col md:flex-row gap-8">
              <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                {[
                  "100+ videos/month included",
                  "20+ images per video",
                  "60+ seconds per video",
                  "Custom billing cycles",
                  "Early access to new features",
                  "API access"
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-[#ccfbf1] flex items-center justify-center shrink-0">
                      <Check className="w-2.5 h-2.5 text-[#0d9488] stroke-[3]" />
                    </div>
                    <span className="text-[11px] text-gray-600">{item}</span>
                  </div>
                ))}
              </div>
              <Link to="/contact">
                <Button variant="outline" className="border-[#0d9488] text-[#0d9488] hover:bg-[#f0fdfa] font-bold px-8 py-6 rounded-lg whitespace-nowrap">
                  Contact Us →
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Testimonials */}
        <section className="bg-[#e0f7f6]/40 py-24 md:py-32 overflow-hidden mt-20">
          <div className="container mx-auto px-4 text-center">
            <div className="inline-flex items-center px-3 py-1 rounded bg-white border border-[#ccfbf1] mb-8 shadow-sm">
              <span className="text-[10px] font-bold tracking-wider text-[#0d9488] uppercase">
                TESTIMONIALS
              </span>
            </div>

            <h2 className="text-4xl md:text-5xl font-bold mb-6 text-black">
              What our users are saying
            </h2>
            <p className="text-gray-500 max-w-2xl mx-auto mb-16">
              Real estate media businesses, photographers, and agents are using Iconic
              every day to boost their video marketing.
            </p>

            <div className="relative group">
              <div
                ref={scrollContainerRef}
                className="flex gap-6 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-12"
              >
                {[
                  {
                    name: "Mark Shepherd",
                    role: "MD & Founder, Apollo3D Ltd, UK",
                    content: "Iconic has enhanced our video and 3D tour services uniquely. The team behind the app is super responsive and is always looking to improve the product and its capabilities.",
                    avatar: "https://i.pravatar.cc/150?u=mark"
                  },
                  {
                    name: "Kerry Riordan",
                    role: "Director, Blue Lemonade Photography",
                    content: "The future is here! Iconic surpasses the rest in terms of quality and accuracy. The generations look authentic, with subtle movements and tasteful add-ons.",
                    avatar: "https://i.pravatar.cc/150?u=kerry"
                  },
                  {
                    name: "Ron Potts",
                    role: "Owner, Advanced Virtual Imaging",
                    content: "This is truly an amazing product, turning photos into video. If you're looking for short video ads or property videos, consider Iconic!",
                    avatar: "https://i.pravatar.cc/150?u=ron"
                  },
                  {
                    name: "Nick Ptak",
                    role: "The PTK Alliance Team at Compass",
                    content: "It's 10 times less expensive and up to 100 times faster than marketing agencies, producing high-quality videos on demand 24/7/365.",
                    avatar: "https://i.pravatar.cc/150?u=nick"
                  },
                  {
                    name: "John Rudy",
                    role: "Founder, Rudy Media Group",
                    content: "Iconic saves a huge amount of time and money. I'm using it for a wide range of real estate.",
                    avatar: "https://i.pravatar.cc/150?u=john"
                  },
                  {
                    name: "Kim Lindsey",
                    role: "Owner, Kim Lindsey Photography",
                    content: "Groundbreaking tool. They are committed to improving the services with new updates often.",
                    avatar: "https://i.pravatar.cc/150?u=kim"
                  }
                ].map((t, i) => (
                  <div key={i} className="flex-shrink-0 w-[350px] md:w-[400px] snap-center">
                    <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm text-left h-full flex flex-col">
                      <div className="flex items-center gap-4 mb-6">
                        <img src={t.avatar} alt={t.name} className="w-12 h-12 rounded-full border border-gray-100" />
                        <div>
                          <h4 className="font-bold text-black text-sm">{t.name}</h4>
                          <p className="text-gray-400 text-[10px] font-medium uppercase tracking-tight">{t.role}</p>
                        </div>
                      </div>
                      <p className="text-gray-600 text-sm leading-relaxed mb-6 italic flex-1">
                        "{t.content}"
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Navigation Controls */}
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={() => scrollTestimonials('left')}
                  className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 hover:text-[#0d9488] hover:border-[#0d9488] transition-all"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((p) => (
                    <div key={p} className={`w-1.5 h-1.5 rounded-full ${p === 1 ? "bg-[#0d9488]" : "bg-gray-200"}`}></div>
                  ))}
                </div>
                <button
                  onClick={() => scrollTestimonials('right')}
                  className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 hover:text-[#0d9488] hover:border-[#0d9488] transition-all"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
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
              <p className="text-gray-500 max-w-2xl mx-auto">
                Everything you need to know about Iconic in a nutshell.
              </p>
            </div>

            <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { q: "How long does video processing take?", a: "Typically, our high-end media assets are delivered within 24 hours of capture. Our rapid post-production workflow is optimized for social media timelines." },
                { q: "Does Iconic support portrait mode?", a: "Yes, we specialize in both cinematic landscape and scroll-stopping vertical content optimized for Reels, TikTok, and Shorts." },
                { q: "How many images can I use per video?", a: "Our standard cinematic reel utilizes between 15-25 of the best property shots, but this can be customized based on your specific project needs." },
                { q: "How long is each video?", a: "Most property reels are between 30-60 seconds, which is the 'sweet spot' for high engagement across modern social platforms." },
                { q: "Is there a free trial?", a: "Yes! We offer a 7-day free trial on our Starter, Leader, and Dominator plans so you can experience the full power of Iconic media." },
                { q: "Do I need a credit card to sign up?", a: "No credit card is required to book a strategy session. A card is only needed to start a free trial of our premium packages." },
                { q: "Is there a file size limit for images?", a: "We support high-resolution uploads up to 25MB per image to ensure the highest quality cinematic output." },
                { q: "How do I get rid of the watermark in the video?", a: "Watermarks are automatically removed on all paid plans (Starter, Leader, and Dominator)." },
                { q: "What makes Iconic a better real estate video editor than generic editing tools?", a: "Iconic is built specifically for real estate. Our AI understands property flow, lighting, and cinematic composition, delivering luxury-quality edits in a fraction of the time." },
                { q: "My question isn't answered here. How can I get help?", a: "We're here to help! You can reach out to our support team via the contact page or book a strategy session for personalized guidance." }
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
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}} />
    </div>
  );
}
