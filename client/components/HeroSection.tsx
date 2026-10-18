import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { itemText, useSiteHref, useSiteItems, useSiteText } from "@/content/siteContent";

const CAPABILITIES = [
  "Cinematic Filmmakers",
  "Social Architects",
  "REEL Producers",
  "Private Editing Studio",
  "Content Managers",
  "Personal Production Team"
];

const HERO_IMAGE = "https://cdn.builder.io/api/v1/image/assets%2F0ed22311ac6a4dbebeda1b4230c2746c%2F6529795874414a1e9fe845f3eb948e94?format=webp&width=1600&height=900";

export default function HeroSection() {
  const settings = useSiteSettings();
  const [capabilityIndex, setCapabilityIndex] = useState(0);
  const customCaps = useSiteItems("home", "hero");
  const capabilities = customCaps?.length ? customCaps.map((item) => itemText(item, "label")).filter(Boolean) : CAPABILITIES;
  const heroImage = useSiteText("home", "hero", "image", HERO_IMAGE);
  const realEstateHref = useSiteHref("home", "hero", "ctaRealEstate", "/pricing#listings");
  const businessHref = useSiteHref("home", "hero", "ctaBusiness", "/pricing#branding-personal");

  useEffect(() => {
    const interval = setInterval(() => {
      setCapabilityIndex((prev) => (prev + 1) % capabilities.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [capabilities.length]);

  return (
    <section className="iframe-safe-hero relative flex items-center overflow-hidden bg-black pt-32 pb-12">
      {/* Background Image with Overlay */}
      <div className="absolute inset-0 z-0">
        <img
          src={heroImage}
          alt="Luxury home at twilight"
          data-site-page="home"
          data-site-block="hero"
          data-site-field="image"
          data-site-kind="image"
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
              <span data-site-page="home" data-site-block="hero" data-site-field="kicker" data-site-kind="text">{useSiteText("home", "hero", "kicker", "Your Brand, Made")}</span>
            </h2>
            <h1 className="text-6xl md:text-8xl lg:text-9xl font-bold leading-none tracking-tighter text-white uppercase drop-shadow-2xl">
              <span data-site-page="home" data-site-block="hero" data-site-field="title" data-site-kind="text">{useSiteText("home", "hero", "title", "ICONIC")}</span>
            </h1>
          </div>

          {/* Subheadline from Screenshot */}
          <p className="text-lg md:text-xl text-gray-200 mb-6 max-w-xl leading-relaxed animate-in fade-in slide-in-from-left-6 duration-900 font-medium drop-shadow-lg">
            <span data-site-page="home" data-site-block="hero" data-site-field="line1" data-site-kind="text">{useSiteText("home", "hero", "line1", "Media Production. Virtual Staging. Content Management.")}</span><br />
            <span data-site-page="home" data-site-block="hero" data-site-field="line2" data-site-kind="text">{useSiteText("home", "hero", "line2", "ICONIC is the dedicated creative crew for businesses and agents who demand more than \"good enough\".")}</span>
          </p>

          {/* Auto-scrolling Capabilities */}
          <div className="flex items-center gap-3 mb-10 h-8 animate-in fade-in slide-in-from-left-8 duration-1000">
            <span data-site-page="home" data-site-block="hero" data-site-field="weAre" data-site-kind="text" className="text-sm font-black uppercase tracking-widest text-teal-400 shrink-0">{useSiteText("home", "hero", "weAre", "WE ARE YOUR:")}</span>
            <div className="relative h-full flex-1 overflow-hidden">
              {capabilities.map((capability, index) => (
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
            <Link to={realEstateHref}>
              <Button className="bg-white text-black hover:bg-gray-100 font-bold text-sm px-8 py-6 rounded-full transition-all hover:scale-105 border-none shadow-xl">
                <span data-site-page="home" data-site-block="hero" data-site-field="ctaRealEstate" data-site-kind="text">{useSiteText("home", "hero", "ctaRealEstate", "I'm in Real Estate")}</span>
              </Button>
            </Link>
            <Link to={businessHref}>
              <Button className="bg-white text-black hover:bg-gray-100 font-bold text-sm px-8 py-6 rounded-full transition-all hover:scale-105 border-none shadow-xl">
                <span data-site-page="home" data-site-block="hero" data-site-field="ctaBusiness" data-site-kind="text">{useSiteText("home", "hero", "ctaBusiness", "I own a Business")}</span>
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
