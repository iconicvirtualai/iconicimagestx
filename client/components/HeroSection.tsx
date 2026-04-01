import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Star } from "lucide-react";
import { useSiteSettings } from "@/hooks/useSiteSettings";

export default function HeroSection() {
  const settings = useSiteSettings();

  return (
    <section className="relative overflow-hidden bg-transparent pt-32 pb-6">
      <div className="container mx-auto px-4 text-center">
        {/* Badge/Tag */}
        <div className="inline-flex items-center px-4 py-1 rounded-full bg-[#ccfbf1]/20 border border-[#ccfbf1]/30 mb-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <span className="text-[10px] md:text-[12px] font-bold tracking-wider uppercase text-teal-400">
            #1 REAL ESTATE MEDIA PARTNER FOR MODERN AGENTS
          </span>
        </div>

        {/* Headline */}
        <h1 className="text-5xl md:text-7xl lg:text-8xl font-black mb-6 leading-[1.05] tracking-tight text-white max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700 whitespace-pre-line">
          Create <span className="text-white">Stunning</span> Property <br />
          Media <span className="text-teal-400 italic">Instantly</span> with AI
        </h1>

        {/* Subheadline */}
        <p className="text-lg md:text-xl text-gray-400 mb-10 max-w-2xl mx-auto leading-relaxed animate-in fade-in slide-in-from-bottom-6 duration-900 font-medium">
          The ultimate content machine for real estate professionals. <br className="hidden md:block" />
          Join the elite media partners who refuse to blend in.
        </p>

        {/* Main CTA */}
        <div className="flex flex-col items-center gap-4 mb-12 animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <Link to="/book">
            <Button className="text-white font-black text-xl px-12 py-8 rounded-2xl shadow-2xl shadow-teal-900/20 transition-all hover:scale-105 bg-teal-500 hover:bg-teal-400 border-none group">
              Start for free <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
          <p className="text-gray-500 text-xs font-bold tracking-widest uppercase">No credit card required</p>
        </div>

        {/* Social Proof */}
        <div className="flex flex-col items-center gap-3 mb-16 animate-in fade-in slide-in-from-bottom-10 duration-1100">
          <div className="flex items-center gap-4">
            <div className="flex -space-x-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="w-10 h-10 rounded-full border-2 border-black overflow-hidden bg-gray-800 shadow-xl"
                >
                  <img
                    src={`https://i.pravatar.cc/150?u=${i + 10}`}
                    alt="User avatar"
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 bg-white/5 backdrop-blur-sm px-4 py-2 rounded-xl border border-white/10">
              <Star className="w-5 h-5 fill-yellow-400 text-yellow-400" />
              <span className="text-lg font-black text-white">4.9</span>
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="w-3.5 h-3.5 bg-green-500 rounded-[2px]"></div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Before / After Indicator */}
        <div className="flex items-center justify-center gap-3 text-[10px] md:text-xs font-black uppercase tracking-[0.3em] text-gray-500 mb-4">
          <span>Before</span>
          <ArrowRight className="w-3 h-3" />
          <span className="text-white">After</span>
        </div>
      </div>
    </section>
  );
}

import { ArrowRight } from "lucide-react";
