import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Star, Zap, Rocket, MapPin, Quote, Award } from "lucide-react";

export default function About() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <Header />
      
      <main className="flex-1">
        {/* 10 Years Banner */}
        <section className="bg-black text-white overflow-hidden relative">
          <div className="absolute inset-0 opacity-20 pointer-events-none">
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-teal-500/20 via-transparent to-transparent"></div>
          </div>
          <div className="container mx-auto px-4 py-16 md:py-24 relative z-10 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-400 font-bold text-xs tracking-widest uppercase mb-6 animate-pulse">
              <Award className="w-4 h-4" />
              Decade of Excellence
            </div>
            <h1 className="text-5xl md:text-8xl font-black mb-8 tracking-tighter italic">
              Cheers to <span className="text-[#0d9488]">10 Years!!</span>
            </h1>
            
            {/* Video/Photo Placeholders */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-6xl mx-auto mt-12">
              <div className="aspect-square bg-gray-900 rounded-2xl border border-white/10 flex items-center justify-center relative overflow-hidden group">
                <img src="https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=600&q=80" className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:scale-110 transition-transform duration-500" alt="Behind the scenes" />
                <span className="relative z-10 text-[10px] font-bold text-white/50 uppercase tracking-widest">Est. 2014</span>
              </div>
              <div className="aspect-square bg-gray-900 rounded-2xl border border-white/10 flex items-center justify-center relative overflow-hidden group">
                <img src="https://images.unsplash.com/photo-1492691523567-61723c275df1?w=600&q=80" className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:scale-110 transition-transform duration-500" alt="Camera gear" />
                <span className="relative z-10 text-[10px] font-bold text-white/50 uppercase tracking-widest">Video Reel</span>
              </div>
              <div className="aspect-square bg-gray-900 rounded-2xl border border-white/10 flex items-center justify-center relative overflow-hidden group">
                <img src="https://images.unsplash.com/photo-1626544823126-bb212353394c?w=600&q=80" className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:scale-110 transition-transform duration-500" alt="Drone view" />
                <span className="relative z-10 text-[10px] font-bold text-white/50 uppercase tracking-widest">Woodlands Sky</span>
              </div>
              <div className="aspect-square bg-gray-900 rounded-2xl border border-white/10 flex items-center justify-center relative overflow-hidden group">
                <img src="https://images.unsplash.com/photo-1542038784456-1ea8e935640e?w=600&q=80" className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:scale-110 transition-transform duration-500" alt="Studio" />
                <span className="relative z-10 text-[10px] font-bold text-white/50 uppercase tracking-widest">Growth</span>
              </div>
            </div>
          </div>
        </section>

        {/* The Intelligence Hub */}
        <section className="py-24 bg-white">
          <div className="container mx-auto px-4 max-w-5xl">
            <div className="mb-20 text-center md:text-left">
              <h2 className="text-sm font-bold tracking-[0.3em] text-[#0d9488] uppercase mb-4">THE INTELLIGENCE HUB: BEYOND THE LENS</h2>
              <p className="text-4xl md:text-6xl font-bold text-black mb-8 leading-tight">Where Vision Meets Velocity.</p>
              <div className="space-y-6 text-xl text-gray-600 leading-relaxed font-medium">
                <p>
                  At <span className="text-black font-bold">Iconic Images</span>, we don’t just capture real estate; we engineer market ownership.
                </p>
                <p>
                  Based in the heart of The Woodlands - Houston-Spring-Conroe corridor, we’ve built a reputation as the "secret weapon" for the region's top-producing agents. We realized long ago that in a world of infinite scrolling, "pretty pictures" are the bare minimum. To win in 2026, you need a catapult.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-16 py-20 border-t border-gray-100">
              <div>
                <h3 className="text-3xl font-bold text-black mb-6 uppercase tracking-tight">THE ICONIC PHILOSOPHY</h3>
                <p className="text-gray-600 leading-relaxed text-lg italic border-l-4 border-[#0d9488] pl-6 py-2">
                  We believe the agent is the architect of the deal, but the media is the fuel. Our mission is to transform every listing into a high-converting digital asset and every realtor into a household name. We combine Hollywood-grade cinematography with predictive AI technology to ensure your brand isn’t just seen—it’s remembered.
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
                      <p className="font-bold text-black">The 4-Hour Standard</p>
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
                      <p className="text-sm text-gray-500">We are the first in Texas to bridge the gap between traditional photography and Spatial VR / AI Twin branding.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Cadi Section */}
        <section className="bg-gray-50 py-24 md:py-32 overflow-hidden">
          <div className="container mx-auto px-4 max-w-7xl">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              <div className="relative">
                <div className="absolute -top-10 -left-10 w-40 h-40 bg-teal-500/10 rounded-full blur-3xl"></div>
                <div className="relative rounded-[2.5rem] overflow-hidden shadow-2xl bg-gray-900 aspect-square md:aspect-[4/5]">
                  <img src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=800&q=80" className="w-full h-full object-cover mix-blend-luminosity hover:mix-blend-normal transition-all duration-700" alt="Cadi - Visionary Creator" />
                  <div className="absolute bottom-0 left-0 w-full p-8 bg-gradient-to-t from-black via-black/40 to-transparent">
                    <p className="text-teal-400 font-bold tracking-widest text-xs uppercase mb-1">Visionary Creator</p>
                    <h4 className="text-white text-3xl font-bold">CADI</h4>
                  </div>
                </div>
              </div>
              <div className="space-y-8">
                <div className="text-[#0d9488] font-bold tracking-wider text-xs uppercase">
                  MEET THE FACE OF THE FUTURE
                </div>
                <h2 className="text-4xl md:text-6xl font-bold text-black leading-tight tracking-tight">CADI</h2>
                <div className="space-y-6 text-gray-600 leading-relaxed text-lg">
                  <p>
                    Iconic is led by <span className="text-black font-bold">Cadi</span>, a visionary creator who obsessed over one question: <span className="italic">How do we make agents more money with less effort?</span>
                  </p>
                  <p>
                    Cadi has transformed Iconic from a local photography studio into a Media Powerhouse. By mirroring her high-energy hustle into our AI-driven workflows, she ensures that every client receives a "Celebrity Agent" experience.
                  </p>
                  <p>
                    Whether she’s on-site directing a cinematic drone sweep or in the lab perfecting our AI Twilight renders, Cadi’s goal remains the same: <span className="text-black font-bold">Your growth is our only metric of success.</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA / Location */}
        <section className="py-24 md:py-32 bg-white text-center">
          <div className="container mx-auto px-4">
            <h2 className="text-5xl md:text-7xl font-black text-black mb-8 italic">STAY ICONIC.</h2>
            <p className="text-xl md:text-2xl text-gray-500 max-w-3xl mx-auto leading-relaxed mb-12 font-medium">
              We aren't just vendors; we are your <span className="text-[#0d9488] font-bold">Growth Partners</span>. Every frame we shoot and every reel we edit is designed with one goal in mind: Getting you your next listing.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-6 md:gap-12 mb-16">
              {["The Woodlands", "Spring", "Conroe", "Houston"].map((loc) => (
                <div key={loc} className="flex items-center gap-2 text-gray-400 font-bold uppercase tracking-widest text-sm">
                  <MapPin className="w-4 h-4 text-[#0d9488]" />
                  {loc}
                </div>
              ))}
            </div>
            <div className="space-y-4">
              <p className="text-2xl font-bold text-black uppercase tracking-tight">Join the elite. Own the market.</p>
              <Link to="/book">
                <Button className="bg-black text-white hover:bg-gray-900 font-bold text-lg px-12 py-8 rounded-2xl transition-all hover:scale-105 shadow-xl">
                  Book Your Evolution &rarr;
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

// Helper component for internal links
import { Link } from "react-router-dom";
