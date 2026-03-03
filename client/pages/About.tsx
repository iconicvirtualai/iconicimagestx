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
          <div className="container mx-auto px-4 py-12 md:py-16 relative z-10 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-400 font-bold text-xs tracking-widest uppercase mb-6 animate-pulse">
              <Award className="w-4 h-4" />
              Decade of Excellence
            </div>
            <h1 className="text-4xl md:text-6xl font-bold mb-4 tracking-tight">
              A Decade of <span className="text-[#0d9488]">Setting the Standard.</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-300 font-medium max-w-2xl mx-auto leading-relaxed">
              Est. 2016<br />
              10 Years. Thousands of Listings. Millions in Commission Generated for our Partners.
            </p>

            {/* Moving Photo Carousel */}
            <div className="relative w-full overflow-hidden py-12">
              <div className="flex animate-scroll whitespace-nowrap">
                {[
                  { img: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800&q=80", label: "Est. 2016" },
                  { img: "https://images.unsplash.com/photo-1492691523567-61723c275df1?w=800&q=80", label: "The Engine" },
                  { img: "https://images.unsplash.com/photo-1626544823126-bb212353394c?w=800&q=80", label: "Scale" },
                  { img: "https://images.unsplash.com/photo-1542038784456-1ea8e935640e?w=800&q=80", label: "Growth" },
                  { img: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800&q=80", label: "Legacy" },
                  { img: "https://images.unsplash.com/photo-1492691523567-61723c275df1?w=800&q=80", label: "Cinematic" },
                  { img: "https://images.unsplash.com/photo-1626544823126-bb212353394c?w=800&q=80", label: "Elite" },
                  { img: "https://images.unsplash.com/photo-1542038784456-1ea8e935640e?w=800&q=80", label: "Market Lead" },
                  // Repeat for seamless loop
                  { img: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800&q=80", label: "Est. 2016" },
                  { img: "https://images.unsplash.com/photo-1492691523567-61723c275df1?w=800&q=80", label: "The Engine" },
                  { img: "https://images.unsplash.com/photo-1626544823126-bb212353394c?w=800&q=80", label: "Scale" },
                  { img: "https://images.unsplash.com/photo-1542038784456-1ea8e935640e?w=800&q=80", label: "Growth" },
                  { img: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800&q=80", label: "Legacy" },
                  { img: "https://images.unsplash.com/photo-1492691523567-61723c275df1?w=800&q=80", label: "Cinematic" },
                  { img: "https://images.unsplash.com/photo-1626544823126-bb212353394c?w=800&q=80", label: "Elite" },
                  { img: "https://images.unsplash.com/photo-1542038784456-1ea8e935640e?w=800&q=80", label: "Market Lead" },
                ].map((item, i) => (
                  <div key={i} className="flex-shrink-0 mx-2 w-[184px] h-[184px] md:w-[268px] md:h-[268px] bg-gray-900 rounded-2xl border border-white/10 flex items-center justify-center relative overflow-hidden group">
                    <img src={item.img} className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:scale-110 group-hover:opacity-60 transition-all duration-700" alt={item.label} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                    <span className="absolute bottom-6 left-6 z-10 text-[10px] font-bold text-white uppercase tracking-widest opacity-80 group-hover:opacity-100 transition-opacity">
                      {item.label}
                    </span>
                  </div>
                ))}
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
                  In a world of infinite scrolling, 'pretty pictures' are the bare minimum. We built the Iconic Engine—a proprietary fusion of Hollywood-grade cinematography and high-velocity marketing tech—to ensure your brand isn't just seen; it's unavoidable.
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

        {/* Cadi Section */}
        <section className="bg-gray-50 py-24 md:py-32 overflow-hidden">
          <div className="container mx-auto px-4 max-w-7xl">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              <div className="relative">
                <div className="absolute -top-10 -left-10 w-40 h-40 bg-teal-500/10 rounded-full blur-3xl"></div>
                <div className="relative rounded-[2.5rem] overflow-hidden shadow-2xl bg-gray-900 aspect-square md:aspect-[4/5]">
                  <img src="https://cdn.builder.io/api/v1/image/assets%2F0ed22311ac6a4dbebeda1b4230c2746c%2Fb694584c91da4099bb13e517f9890e59?format=webp&width=800&height=1200" className="w-full h-full object-cover mix-blend-luminosity hover:mix-blend-normal transition-all duration-700" alt="Cadi - Visionary Creator" />
                  <div className="absolute bottom-0 left-0 w-full p-8 bg-gradient-to-t from-black via-black/40 to-transparent">
                    <p className="text-teal-400 font-bold tracking-widest text-xs uppercase mb-1">Visionary Creator</p>
                    <h4 className="text-white text-3xl font-bold">CADI</h4>
                  </div>
                </div>
              </div>
              <div className="space-y-8">
                <div className="text-[#0d9488] font-bold tracking-wider text-xs uppercase">
                  THE ARCHITECT OF THE ICON
                </div>
                <h2 className="text-4xl md:text-6xl font-bold text-black leading-tight tracking-tight">CADI</h2>
                <div className="space-y-6 text-gray-600 leading-relaxed text-lg">
                  <p>
                    Cadi didn't just start a photography studio; she engineered a media powerhouse. Obsessed with the friction agents face daily, she built Iconic to solve one problem: <span className="text-black font-bold">How to make agents more money with less effort.</span>
                  </p>
                  <p>
                    She doesn't just direct the operation; she directs the strategy. By mirroring her high-energy hustle into our AI-driven workflows, she ensures that every client receives a "Celebrity Agent" experience.
                  </p>
                </div>

                {/* New Block: The Infrastructure of Success */}
                <div className="pt-8 border-t border-gray-100">
                  <h3 className="text-2xl font-bold text-black mb-1 uppercase tracking-tight">THE INFRASTRUCTURE OF SUCCESS</h3>
                  <p className="text-[#0d9488] font-bold text-sm uppercase tracking-wider mb-4">Propelling your brand while the world sleeps.</p>
                  <div className="space-y-4 text-gray-600 leading-relaxed">
                    <p>
                      Our proprietary Marketing Studio and AI Editing Tools are the unfair advantage. We’ve engineered a high-velocity backend that allows us to absorb massive workloads and deliver surgical-grade precision at scale. Our custom infrastructure empowers agents to leverage high-end, custom edits in seconds, saving thousands in production costs without compromising quality.
                    </p>
                    <p>
                      While you sleep, our systems are awake. The Iconic Infrastructure is custom-built to automatically integrate new features, master emerging AI trends, and update your content strategy in real-time. We don't just keep up with the market; we stay on top of it.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

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
      </main>

      <Footer />

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-scroll {
          animation: scroll 40s linear infinite;
        }
        .animate-scroll:hover {
          animation-play-state: paused;
        }
      `}} />
    </div>
  );
}

// Helper component for internal links
import { Link } from "react-router-dom";
