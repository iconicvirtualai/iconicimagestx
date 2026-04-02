import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useSiteSettings } from "@/hooks/useSiteSettings";

const CAPABILITIES = [
  "Cinematic Filmmakers",
  "Social Architects",
  "REEL Producers",
  "Your Private Editing Studio",
  "Content Managers",
  "Personal Production Team"
];

export default function HeroSection() {
  const settings = useSiteSettings();
  const [capabilityIndex, setCapabilityIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCapabilityIndex((prev) => (prev + 1) % CAPABILITIES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="relative min-h-[60vh] flex items-center overflow-hidden bg-black pt-32 pb-12">
      {/* Background Image with Overlay */}
      <div className="absolute inset-0 z-0">
        <img
          src="https://cdn.builder.io/api/v1/image/assets%2F0ed22311ac6a4dbebeda1b4230c2746c%2F6529795874414a1e9fe845f3eb948e94?format=webp&width=1600&height=900"
          alt="Luxury Real Estate Background"
          className="w-full h-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/40 to-transparent"></div>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black"></div>
      </div>

      <div className="max-w-[1200px] mx-auto px-8 w-full relative z-10">
        <div className="max-w-2xl text-left">
          {/* Headline */}
          <div className="mb-6 animate-in fade-in slide-in-from-left-4 duration-700">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-white mb-2 uppercase opacity-90">
              Your Brand, Made
            </h2>
            <h1 className="text-6xl md:text-8xl lg:text-9xl font-bold leading-none tracking-tighter text-white uppercase drop-shadow-2xl">
              ICONIC
            </h1>
          </div>

          {/* Subheadline from Screenshot */}
          <p className="text-lg md:text-xl text-gray-200 mb-6 max-w-xl leading-relaxed animate-in fade-in slide-in-from-left-6 duration-900 font-medium drop-shadow-lg">
            Media Production. Virtual Staging. Content Management.<br />
            <span className="font-bold">ICONIC</span> is the dedicated creative crew for businesses and agents who demand more than "good enough".
          </p>

          {/* Auto-scrolling Capabilities */}
          <div className="flex items-center gap-3 mb-10 h-8 animate-in fade-in slide-in-from-left-8 duration-1000">
            <span className="text-sm font-black uppercase tracking-widest text-teal-400 shrink-0">We Are:</span>
            <div className="relative h-full flex-1 overflow-hidden">
              {CAPABILITIES.map((capability, index) => (
                <span
                  key={capability}
                  className={`absolute left-0 top-0 h-full flex items-center text-sm font-bold uppercase tracking-wider text-white transition-all duration-700 transform ${
                    index === capabilityIndex
                      ? "translate-y-0 opacity-100"
                      : "translate-y-full opacity-0"
                  }`}
                >
                  {capability}
                </span>
              ))}
            </div>
          </div>

          {/* CTA Buttons from Screenshot */}
          <div className="flex flex-wrap items-center gap-4 animate-in fade-in slide-in-from-bottom-8 duration-1100">
            <Link to="/book?type=real-estate">
              <Button className="bg-white text-black hover:bg-gray-100 font-bold text-sm px-8 py-6 rounded-full transition-all hover:scale-105 border-none shadow-xl">
                I'm in Real Estate
              </Button>
            </Link>
            <Link to="/book?type=business">
              <Button className="bg-white text-black hover:bg-gray-100 font-bold text-sm px-8 py-6 rounded-full transition-all hover:scale-105 border-none shadow-xl">
                I own a Business
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
