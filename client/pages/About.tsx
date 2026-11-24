import Layout from "@/components/Layout";
import AboutTeam from "@/components/about/AboutTeam";
import DecadeMashupCarousel from "@/components/DecadeMashupCarousel";
import { Button } from "@/components/ui/button";
import { Star, Zap, Rocket, MapPin, Award } from "lucide-react";
import { Link } from "react-router-dom";
import { itemText, useSiteItems, useSiteText } from "@/content/siteContent";
import { DECADE_MASHUPS, type DecadeMashup } from "@shared/decadeMashups";

const DECADE_BODY = "Est. 2016. 10 Years. Thousands of Listings. Millions in Commission Generated for our Partners.";

export default function About() {
  const badge = useSiteText("about", "hero", "badge", "Decade of Excellence");
  const titleLead = useSiteText("about", "hero", "titleLead", "A Decade of");
  const titleAccent = useSiteText("about", "hero", "titleAccent", "Setting the Standard.");
  const body = useSiteText("about", "hero", "body", DECADE_BODY);
  const hubKicker = useSiteText("about", "hub", "kicker", "THE INTELLIGENCE HUB: BEYOND THE LENS");
  const hubTitle = useSiteText("about", "hub", "title", "Where Vision Meets Velocity.");
  const hubBody = useSiteText("about", "hub", "body", "At Iconic Images, we don’t just capture real estate; we engineer market ownership. In a world of infinite scrolling, 'pretty pictures' are the bare minimum.");
  const philosophyTitle = useSiteText("about", "hub", "philosophyTitle", "THE ICONIC PHILOSOPHY");
  const philosophy = useSiteText("about", "hub", "philosophy", "We believe the agent is the architect of the deal, but the media is the fuel.");
  const tiles = useSiteItems("about", "hero");
  const mashups: DecadeMashup[] = tiles?.length
    ? tiles.flatMap((item) => {
      const video = itemText(item, "video");
      const poster = itemText(item, "poster");
      if (!video && !poster) return [];
      return [{ id: item.id, video, poster, label: itemText(item, "label") }];
    })
    : DECADE_MASHUPS;
  return (
    <Layout>
      <div className="bg-white text-black">
        {/* 10 Years Banner */}
        <section className="bg-black text-white overflow-hidden relative">
          <div className="absolute inset-0 opacity-20 pointer-events-none">
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-teal-500/20 via-transparent to-transparent"></div>
          </div>
          <div className="container relative z-10 mx-auto px-4 pb-12 pt-36 text-center md:pb-16">
            <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-400 font-bold text-xs tracking-widest uppercase mb-6 animate-pulse">
              <Award className="w-4 h-4" />
              {badge}
            </div>
            <h1 className="text-4xl md:text-6xl font-bold mb-4 tracking-tight">
              <span data-site-page="about" data-site-block="hero" data-site-field="titleLead" data-site-kind="text">{titleLead}</span> <span className="text-[#0d9488]" data-site-page="about" data-site-block="hero" data-site-field="titleAccent" data-site-kind="text">{titleAccent}</span>
            </h1>
            <p data-site-page="about" data-site-block="hero" data-site-field="body" data-site-kind="text" className="mx-auto max-w-3xl text-balance font-medium leading-relaxed text-gray-300">
              {body === DECADE_BODY ? (
                <>
                  <span className="block whitespace-nowrap text-[clamp(11px,3.2vw,1.25rem)]">Est. 2016. 10 Years. Thousands of Listings.</span>
                  <span className="block whitespace-nowrap text-[clamp(11px,3.2vw,1.25rem)]">Millions in Commission Generated for our Partners.</span>
                </>
              ) : body}
            </p>

            <DecadeMashupCarousel cards={mashups.length ? mashups : DECADE_MASHUPS} />
          </div>
        </section>

        {/* The Intelligence Hub */}
        <section className="py-24 bg-white">
          <div className="container mx-auto px-4 max-w-5xl">
            <div className="mb-20 text-center md:text-left">
              <h2 data-site-page="about" data-site-block="hub" data-site-field="kicker" data-site-kind="text" className="text-sm font-bold tracking-[0.3em] text-[#0d9488] uppercase mb-4">{hubKicker}</h2>
              <p data-site-page="about" data-site-block="hub" data-site-field="title" data-site-kind="text" className="text-4xl md:text-6xl font-bold text-black mb-8 leading-tight">{hubTitle}</p>
              {hubBody !== "At Iconic Images, we don’t just capture real estate; we engineer market ownership. In a world of infinite scrolling, 'pretty pictures' are the bare minimum." ? (
                <p data-site-page="about" data-site-block="hub" data-site-field="body" data-site-kind="text" className="text-xl text-gray-600 leading-relaxed font-medium">{hubBody}</p>
              ) : null}
              <div data-site-page="about" data-site-block="hub" data-site-field="body" data-site-kind="text" className={`space-y-6 text-xl text-gray-600 leading-relaxed font-medium ${hubBody === "At Iconic Images, we don’t just capture real estate; we engineer market ownership. In a world of infinite scrolling, 'pretty pictures' are the bare minimum." ? "" : "hidden"}`}>
                <p>
                  At <span className="text-black font-bold">Iconic Images</span>, we don’t just capture real estate; we engineer market ownership.
                </p>
                <p>
                  In a world of infinite scrolling, 'pretty pictures' are the bare minimum. We built the Iconic Engine—a proprietary fusion of Hollywood-grade cinematography and high-velocity marketing tech—to ensure your brand isn't just seen; it's unavoidable.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-16 py-20 border-t border-gray-100">
              <div>
                <h3 data-site-page="about" data-site-block="hub" data-site-field="philosophyTitle" data-site-kind="text" className="text-3xl font-bold text-black mb-6 uppercase tracking-tight">{philosophyTitle}</h3>
                <p data-site-page="about" data-site-block="hub" data-site-field="philosophy" data-site-kind="text" className="text-gray-600 leading-relaxed text-lg italic border-l-4 border-[#0d9488] pl-6 py-2">
                  {philosophy === "We believe the agent is the architect of the deal, but the media is the fuel."
                    ? "We believe the agent is the architect of the deal, but the media is the fuel. Our mission is to transform every listing into a high-converting digital asset and every realtor into a household name. We combine Hollywood-grade cinematography with predictive AI technology to ensure your brand isn’t just seen—it’s remembered."
                    : philosophy}
                </p>
              </div>
              <div className="space-y-8">
                <h3 className="text-3xl font-bold text-black mb-6 uppercase tracking-tight">WHY THE TOP 1% CHOOSE US:</h3>
                <div className="space-y-6">
                  <div className="flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-[#f0fdfa] flex items-center justify-center shrink-0">
                      <Zap className="w-5 h-5 text-[#0d9488]" />
                    </div>
                    <div>
                      <p className="font-bold text-black">The Same-Day Standard</p>
                      <p className="text-sm text-gray-500">In the North Houston market, speed is currency. We deliver your "Just Listed" kits while the ink on the contract is still wet.</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-[#f0fdfa] flex items-center justify-center shrink-0">
                      <Star className="w-5 h-5 text-[#0d9488]" />
                    </div>
                    <div>
                      <p className="font-bold text-black">The Luxury Edge</p>
                      <p className="text-sm text-gray-500">From the estates of Carlton Woods to the custom builds in Bentwater, we know how to speak the language of high-net-worth buyers.</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-[#f0fdfa] flex items-center justify-center shrink-0">
                      <Rocket className="w-5 h-5 text-[#0d9488]" />
                    </div>
                    <div>
                      <p className="font-bold text-black">Futuristic Integration</p>
                      <p className="text-sm text-gray-500">Speed is the only unfair advantage. Iconic is the first in our region to bridge the gap between traditional photography and AI Twin branding at this magnitude.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <AboutTeam />

        {/* Final CTA / Location */}
        <section className="py-20 md:py-24 bg-white text-center">
          <div className="container mx-auto px-4">
            <h2 className="text-4xl md:text-6xl font-bold text-black mb-8 tracking-tight uppercase">BE ICONIC.</h2>
            <p className="text-xl md:text-2xl text-gray-500 max-w-3xl mx-auto leading-relaxed mb-12 font-medium">
              We aren't just vendors; we are your <span className="text-[#0d9488] font-bold">Growth Partners</span>. Every frame we shoot and every reel we edit is designed with one goal in mind: Getting you your next listing.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-6 md:gap-12 mb-16">
              {["The Woodlands", "Spring", "Conroe", "Greater Houston Area", "Cypress", "Livingston"].map((loc) => (
                <div key={loc} className="flex items-center gap-2 text-gray-400 font-bold uppercase tracking-widest text-sm">
                  <MapPin className="w-4 h-4 text-[#0d9488]" />
                  {loc}
                </div>
              ))}
            </div>
            <div className="space-y-12">
              <p className="text-2xl font-bold text-black uppercase tracking-tight">Join the elite. Own the market.</p>
              <div className="w-24 h-1 mx-auto"></div>
              <Link to="/book">
                <Button className="bg-black text-white hover:bg-gray-900 font-bold text-lg px-12 py-8 rounded-2xl transition-all hover:scale-105 shadow-xl">
                  Book Your Evolution &rarr;
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </div>

    </Layout>
  );
}
