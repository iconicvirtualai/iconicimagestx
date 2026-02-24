import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Check, X, ArrowRight, Star } from "lucide-react";
import { useState } from "react";

export default function Pricing() {
  const [isYearly, setIsYearly] = useState(true);

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
      </main>

      <Footer />
    </div>
  );
}
