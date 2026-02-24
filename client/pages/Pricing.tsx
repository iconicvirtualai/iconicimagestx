import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Check, Rocket, Zap, User, Target, TrendingUp, Sparkles, Smartphone, MapPin } from "lucide-react";

const PillarCard = ({ 
  title, 
  subtitle, 
  items 
}: { 
  title: string; 
  subtitle: string; 
  items: { name: string; description: string; icon: any }[] 
}) => (
  <div className="bg-white rounded-[2.5rem] p-8 md:p-12 border border-gray-100 shadow-sm hover:shadow-xl transition-all duration-300">
    <div className="mb-8">
      <h3 className="text-3xl font-bold text-black mb-2">{title}</h3>
      <p className="text-[#0d9488] font-semibold uppercase tracking-widest text-sm">{subtitle}</p>
    </div>
    <div className="space-y-8">
      {items.map((item, i) => (
        <div key={i} className="flex gap-6">
          <div className="w-12 h-12 rounded-2xl bg-[#f0fdfa] border border-[#ccfbf1] flex items-center justify-center shrink-0">
            <item.icon className="w-6 h-6 text-[#0d9488]" />
          </div>
          <div>
            <h4 className="text-xl font-bold text-black mb-2">{item.name}</h4>
            <p className="text-gray-500 leading-relaxed text-sm">{item.description}</p>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const PackageCard = ({ 
  name, 
  price, 
  features, 
  hook, 
  isPopular 
}: { 
  name: string; 
  price: string; 
  features: string[]; 
  hook: string; 
  isPopular?: boolean 
}) => (
  <div className={`relative bg-white rounded-[2.5rem] p-8 md:p-10 border ${isPopular ? 'border-[#0d9488] shadow-2xl shadow-teal-100' : 'border-gray-100 shadow-sm'} flex flex-col h-full hover:scale-[1.02] transition-all duration-300`}>
    {isPopular && (
      <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#0d9488] text-white px-6 py-1 rounded-full text-xs font-bold tracking-widest uppercase">
        Most Powerful
      </div>
    )}
    <div className="mb-8">
      <h3 className="text-2xl font-bold text-black mb-2">{name}</h3>
      <div className="flex items-baseline gap-1">
        <span className="text-4xl font-bold text-black">{price}</span>
        {price !== "Custom" && price !== "TBD" && <span className="text-gray-400">/mo</span>}
      </div>
      <p className="mt-4 text-[#0d9488] font-bold text-sm italic">"{hook}"</p>
    </div>
    <ul className="space-y-4 mb-10 flex-1">
      {features.map((feature, i) => (
        <li key={i} className="flex items-start gap-3 text-sm text-gray-600">
          <Check className="w-5 h-5 text-[#0d9488] shrink-0" />
          {feature}
        </li>
      ))}
    </ul>
    <Button className={`w-full py-6 rounded-xl font-bold text-lg ${isPopular ? 'bg-[#0d9488] text-white hover:bg-[#0f766e]' : 'bg-black text-white hover:bg-gray-900'}`}>
      Choose {name.split(' ').pop()}
    </Button>
  </div>
);

export default function Pricing() {
  return (
    <div className="flex flex-col min-h-screen bg-[#fafafa]">
      <Header />
      
      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden bg-white pt-24 pb-20">
          <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#ccfbf1] rounded-full blur-[120px] opacity-20"></div>
          </div>
          
          <div className="container mx-auto px-4 text-center">
            <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-[#f0fdfa] border border-[#ccfbf1] mb-8">
              <span className="text-[12px] font-bold tracking-wider text-[#0d9488] uppercase">
                2026 MEDIA SUITE
              </span>
            </div>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-8 leading-[1.1] tracking-tight text-black max-w-5xl mx-auto">
              The <span className="text-[#0d9488]">Iconic Domination</span> Menu
            </h1>
            <p className="text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed">
              A futuristic suite of content products designed to dominate the 2026 real estate landscape. 
              Value-engineered for the "Pay Nothing / Get Everything" mindset.
            </p>
          </div>
        </section>

        {/* Pillars Section */}
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
              {/* Pillar 1 */}
              <PillarCard 
                title="Personal Brand"
                subtitle="Selling the Agent"
                items={[
                  {
                    name: "The 'Iconic Icon' Bio-Reel",
                    description: "A 60-second cinematic high-impact lifestyle edit showing you as the local authority at prime spots like Market Street.",
                    icon: User
                  },
                  {
                    name: "Podcast-in-a-Box",
                    description: "Monthly 2-hour session filming 8 'Value Bombs'. We edit these into 32 pieces of micro-content for TikTok/Reels.",
                    icon: Zap
                  },
                  {
                    name: "AI Digital Twin",
                    description: "High-fidelity AI avatar created from 100+ angles. 'Film' property updates without ever leaving your desk.",
                    icon: Sparkles
                  }
                ]}
              />

              {/* Pillar 2 */}
              <PillarCard 
                title="The Listing"
                subtitle="Selling the Property"
                items={[
                  {
                    name: "Vision Pro / VR Walkthroughs",
                    description: "Immersive spatial video tours that allow out-of-state buyers to 'walk' the home in 1:1 scale.",
                    icon: Smartphone
                  },
                  {
                    name: "The 'Hollywood' Social First Edit",
                    description: "9:16 Vertical Cinematic Trailers designed for the algorithm, optimized with trending audio and hook captions.",
                    icon: Rocket
                  },
                  {
                    name: "Predictive Twilight Staging",
                    description: "AI-driven 'Iconic Glow' transforms noon shots into Golden Hour masterpieces instantly. Saves $200+ in fees.",
                    icon: Zap
                  }
                ]}
              />

              {/* Pillar 3 */}
              <PillarCard 
                title="The Catapult"
                subtitle="Guaranteeing the Next Sale"
                items={[
                  {
                    name: "The 'Sold' Legacy Package",
                    description: "Social proof interview blasted to 5,000 neighbors via targeted ads showing why they chose you.",
                    icon: Target
                  },
                  {
                    name: "Neighborhood Domination Maps",
                    description: "Aerial drone overlays showing a 'Sea of Sold' visuals in your specific zip codes (77380, 77381).",
                    icon: MapPin
                  },
                  {
                    name: "The King of the Area",
                    description: "Undisputed visual proof of market dominance that makes you look like the only choice for sellers.",
                    icon: TrendingUp
                  }
                ]}
              />
            </div>
          </div>
        </section>

        {/* Packages Section */}
        <section className="py-24 bg-[#e0f7f6]/30">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-bold text-black mb-4">Package Architecture</h2>
              <p className="text-lg text-gray-500 max-w-2xl mx-auto">Value-engineered packages to fit every stage of your growth.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
              <PackageCard 
                name="THE ICONIC STARTER"
                price="$299"
                hook="The 'Basic' that looks like a Luxury listing."
                features={[
                  "25 High-Def Photos",
                  "Digital Floorplan",
                  "1 Vertical Cinematic Reel",
                  "Next Day Delivery"
                ]}
              />
              <PackageCard 
                name="THE MARKET LEADER"
                price="$599"
                hook="Everything needed to win the next listing presentation."
                isPopular
                features={[
                  "40 High-Def Photos",
                  "Aerial Drone Photography",
                  "9:16 Vertical Video Trailer",
                  "'Just Listed' Social Kit",
                  "Predictive Twilight Staging"
                ]}
              />
              <PackageCard 
                name="THE DOMINATOR"
                price="$1,499"
                hook="Consistently 'Always-On' branding for a flat monthly fee."
                features={[
                  "2 Full Listing Packages/mo",
                  "1 Personal Brand Shoot/mo",
                  "Weekly Social Media Content",
                  "The 'Sold' Legacy Blast",
                  "Dedicated Creative Partner"
                ]}
              />
            </div>
          </div>
        </section>

        {/* Promo Blast Strategy */}
        <section className="py-24 bg-white overflow-hidden">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-black text-white mb-6">
                <span className="text-[12px] font-bold tracking-wider uppercase">
                  THE MILLION-DOLLAR STRATEGY
                </span>
              </div>
              <h2 className="text-4xl md:text-5xl font-bold text-black mb-4">Promo Blast Roadmap</h2>
              <p className="text-lg text-gray-500">How we deploy your brand across social platforms.</p>
            </div>

            <div className="max-w-5xl mx-auto relative">
              {/* Timeline Line */}
              <div className="hidden lg:block absolute left-1/2 top-0 bottom-0 w-px bg-gray-100 -translate-x-1/2"></div>
              
              <div className="space-y-12">
                {/* Phase 1 */}
                <div className="relative flex flex-col lg:flex-row items-center gap-12 group">
                  <div className="flex-1 lg:text-right">
                    <h3 className="text-2xl font-bold text-black mb-4">Phase 1: The "Call Out"</h3>
                    <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 inline-block text-left">
                      <p className="text-sm font-bold text-gray-400 mb-2">AD COPY EXAMPLE</p>
                      <p className="text-sm italic text-gray-600">
                        "Is your media company still living in 2022? Your competition just switched to Iconic. While you're waiting 3 days for photos, they're already viral on TikTok. Catch up or get left behind."
                      </p>
                    </div>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-black text-white flex items-center justify-center font-bold relative z-10 shadow-lg group-hover:scale-110 transition-transform">1</div>
                  <div className="flex-1 hidden lg:block"></div>
                </div>

                {/* Phase 2 */}
                <div className="relative flex flex-col lg:flex-row items-center gap-12 group">
                  <div className="flex-1 hidden lg:block"></div>
                  <div className="w-12 h-12 rounded-full bg-[#0d9488] text-white flex items-center justify-center font-bold relative z-10 shadow-lg group-hover:scale-110 transition-transform">2</div>
                  <div className="flex-1 lg:text-left">
                    <h3 className="text-2xl font-bold text-black mb-4">Phase 2: The "Value Bomb"</h3>
                    <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 inline-block text-left">
                      <p className="text-sm font-bold text-gray-400 mb-2">VIDEO STRATEGY</p>
                      <p className="text-sm text-gray-600 mb-4">Fast-paced "Before & After" reel showing boring iPhone photo vs. Iconic Cinematic edit.</p>
                      <p className="text-sm font-bold text-gray-400 mb-2">CAPTION</p>
                      <p className="text-sm italic text-gray-600">"We don't take photos. We create magnets for millionaires. Get the 'Luxe' look for the 'Standard' price."</p>
                    </div>
                  </div>
                </div>

                {/* Phase 3 */}
                <div className="relative flex flex-col lg:flex-row items-center gap-12 group">
                  <div className="flex-1 lg:text-right">
                    <h3 className="text-2xl font-bold text-black mb-4">Phase 3: The "Future-Proof" Guarantee</h3>
                    <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 inline-block text-left">
                      <p className="text-sm font-bold text-gray-400 mb-2">THE OFFER</p>
                      <p className="text-sm italic text-gray-600">
                        "The Iconic 4-Hour Turnaround. Book a 'Dominator' package today and get your social media 'Just Listed' kit before you even leave the driveway."
                      </p>
                    </div>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-black text-white flex items-center justify-center font-bold relative z-10 shadow-lg group-hover:scale-110 transition-transform">3</div>
                  <div className="flex-1 hidden lg:block"></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="bg-black py-24 text-center">
          <div className="container mx-auto px-4">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-8">Ready to Dominate Your Market?</h2>
            <Link to="/book">
              <Button className="bg-white text-black hover:bg-gray-100 font-bold text-xl px-12 py-8 rounded-2xl transition-all hover:scale-105">
                Book Your Dominator Shoot &rarr;
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
