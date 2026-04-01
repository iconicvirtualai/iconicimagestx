import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Star } from "lucide-react";
import { useSiteSettings } from "@/hooks/useSiteSettings";

export default function HeroSection() {
  const settings = useSiteSettings();

  return (
    <section className="relative overflow-hidden bg-transparent pt-20 pb-4">
      <div className="container mx-auto px-4 text-left">
        {/* Badge/Tag */}
        <div className="inline-flex items-center px-4 py-1 rounded-full bg-[#ccfbf1]/20 border border-[#ccfbf1]/30 mb-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <span className="text-[10px] md:text-[12px] font-bold tracking-wider uppercase text-teal-400">
            #1 REAL ESTATE MEDIA PARTNER FOR MODERN AGENTS
          </span>
        </div>

        {/* Headline */}
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-4 leading-[1.05] tracking-tight text-white max-w-4xl animate-in fade-in slide-in-from-bottom-4 duration-700 whitespace-pre-line">
          Create <span className="text-white">Stunning</span> Property <br />
          Media <span className="text-teal-400">Instantly</span> with AI
        </h1>

        {/* Subheadline */}
        <p className="text-base md:text-lg text-gray-400 mb-6 max-w-xl leading-relaxed animate-in fade-in slide-in-from-bottom-6 duration-900 font-medium">
          The ultimate content machine for real estate professionals. <br className="hidden md:block" />
          Join the elite media partners who refuse to blend in.
        </p>

        {/* Main CTA */}
        <div className="flex flex-col items-start gap-4 mb-8 animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <Link to="/book">
            <Button className="text-white font-bold text-lg px-10 py-6 rounded-2xl shadow-2xl shadow-teal-900/20 transition-all hover:scale-105 bg-teal-500 hover:bg-teal-400 border-none group">
              Start for free <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
          <p className="text-gray-500 text-xs font-bold tracking-widest uppercase">No credit card required</p>
        </div>

        {/* Social Proof */}
        <div className="flex flex-col items-start gap-3 mb-10 animate-in fade-in slide-in-from-bottom-10 duration-1100">
          <div className="flex items-center gap-4">
            <div className="flex -space-x-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="w-8 h-8 rounded-full border-2 border-black overflow-hidden bg-gray-800 shadow-xl"
                >
                  <img
                    src={`https://i.pravatar.cc/150?u=${i + 10}`}
                    alt="User avatar"
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 bg-white/5 backdrop-blur-sm px-3 py-1.5 rounded-xl border border-white/10">
              <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
              <span className="text-base font-bold text-white">4.9</span>
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="w-2.5 h-2.5 bg-green-500 rounded-[2px]"></div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Before / After Indicator */}
        <div className="flex items-center justify-start gap-3 text-[10px] md:text-xs font-bold uppercase tracking-[0.3em] text-gray-500 mb-2">
          <span>Before</span>
          <ArrowRight className="w-3 h-3" />
          <span className="text-white">After</span>
        </div>
      </div>
    </section>
  );
}

import { ArrowRight } from "lucide-react";
