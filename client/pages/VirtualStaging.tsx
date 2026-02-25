import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { CheckCircle2, ArrowRight, Sparkles, UserCheck } from "lucide-react";

export default function VirtualStaging() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <Header />
      
      <main className="flex-1 pt-32">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center mb-16">
            <h1 className="text-4xl md:text-6xl font-bold mb-6 tracking-tight">
              AI <span className="text-[#0d9488]">Virtual Staging</span>
            </h1>
            <p className="text-xl text-gray-500 mb-8 leading-relaxed">
              Transform empty spaces into beautifully furnished rooms instantly. 
              Our AI-powered staging helps buyers visualize their future home.
            </p>
            
            {/* Try for Free Text */}
            <p className="text-[#0d9488] font-bold text-sm uppercase tracking-widest mb-4">
              Try for free
            </p>
            
            <div className="flex flex-wrap justify-center gap-4">
              <Link to="/services/virtual-staging/select">
                <Button className="bg-[#0d9488] hover:bg-[#0f766e] text-white px-8 py-6 text-lg rounded-xl shadow-lg">
                  Upload Your Photos
                </Button>
              </Link>
              <Link to="/contact">
                <Button variant="outline" className="px-8 py-6 text-lg rounded-xl border-gray-200">
                  Talk to an Expert
                </Button>
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-24">
            <div className="relative rounded-3xl overflow-hidden shadow-2xl aspect-video bg-gray-100 border-8 border-gray-50">
              <img 
                src="https://images.unsplash.com/photo-1600607687940-47a0f9259017?w=800&q=80" 
                alt="Empty Room" 
                className="w-full h-full object-cover"
              />
              <div className="absolute top-4 left-4 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm">
                Before: Empty
              </div>
            </div>
            <div className="relative rounded-3xl overflow-hidden shadow-2xl aspect-video bg-gray-100 border-8 border-gray-50">
              <img 
                src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80" 
                alt="Staged Room" 
                className="w-full h-full object-cover"
              />
              <div className="absolute top-4 right-4 bg-[#0d9488]/90 backdrop-blur px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider text-white shadow-sm">
                After: Staged
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-24">
            {[
              {
                title: "Realistic Results",
                description: "Our AI uses high-quality furniture models that match the lighting and perspective of your room."
              },
              {
                title: "Fast Turnaround",
                description: "Get your virtually staged photos back in minutes, not days."
              },
              {
                title: "Cost Effective",
                description: "Save thousands on physical staging while achieving the same visual impact."
              }
            ].map((feature, i) => (
              <div key={i} className="p-8 rounded-3xl bg-[#f8fdff] border border-[#ccfbf1] border-dashed text-center md:text-left">
                <CheckCircle2 className="w-10 h-10 text-[#0d9488] mb-4 mx-auto md:mx-0" />
                <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
                <p className="text-gray-500 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>

          {/* Pricing Section */}
          <div className="mb-24">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-5xl font-bold mb-4 tracking-tight">Flexible <span className="text-[#0d9488]">Pricing</span></h2>
              <p className="text-gray-500 max-w-2xl mx-auto">Choose between our lightning-fast AI tool or professional human edits for the ultimate quality.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
              {/* AI Staging Tier */}
              <div className="p-8 rounded-[2rem] bg-white border border-gray-100 shadow-xl flex flex-col relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4">
                  <Sparkles className="w-8 h-8 text-[#0d9488] opacity-20 group-hover:opacity-40 transition-opacity" />
                </div>
                <div className="mb-8">
                  <h3 className="text-2xl font-bold mb-2">AI Staging</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-[#0d9488]">$5</span>
                    <span className="text-gray-500">/ photo</span>
                  </div>
                </div>
                
                <div className="space-y-4 mb-8">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <span className="font-medium">10 Photos</span>
                    <span className="font-bold text-[#0d9488]">$45</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <span className="font-medium">25 Photos</span>
                    <span className="font-bold text-[#0d9488]">$100</span>
                  </div>
                </div>

                <ul className="space-y-4 mb-8 flex-1">
                  <li className="flex items-center gap-3 text-sm text-gray-600">
                    <CheckCircle2 className="w-5 h-5 text-[#0d9488] shrink-0" />
                    Instant Results
                  </li>
                  <li className="flex items-center gap-3 text-sm text-gray-600">
                    <CheckCircle2 className="w-5 h-5 text-[#0d9488] shrink-0" />
                    Unlimited Variations
                  </li>
                  <li className="flex items-center gap-3 text-sm text-gray-600">
                    <CheckCircle2 className="w-5 h-5 text-[#0d9488] shrink-0" />
                    Self-Service Tool
                  </li>
                </ul>

                <Link to="/services/virtual-staging/select">
                  <Button className="w-full bg-black text-white hover:bg-gray-800 py-6 rounded-xl font-bold">
                    Get Started
                  </Button>
                </Link>
              </div>

              {/* Submit to Pros Tier */}
              <div className="p-8 rounded-[2rem] bg-black text-white shadow-xl flex flex-col relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4">
                  <UserCheck className="w-8 h-8 text-[#0d9488] opacity-20 group-hover:opacity-40 transition-opacity" />
                </div>
                <div className="mb-8">
                  <h3 className="text-2xl font-bold mb-2">Submit to Pros</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-[#0d9488]">$25</span>
                    <span className="text-gray-400">/ photo</span>
                  </div>
                </div>

                <div className="space-y-4 mb-8">
                  <div className="flex items-center justify-between p-3 bg-white/10 rounded-xl">
                    <span className="font-medium">10 Photos</span>
                    <span className="font-bold text-[#0d9488]">$200</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-white/10 rounded-xl">
                    <span className="font-medium">20 Photos</span>
                    <span className="font-bold text-[#0d9488]">$350</span>
                  </div>
                </div>

                <ul className="space-y-4 mb-8 flex-1">
                  <li className="flex items-center gap-3 text-sm text-gray-300">
                    <CheckCircle2 className="w-5 h-5 text-[#0d9488] shrink-0" />
                    Professional Edits
                  </li>
                  <li className="flex items-center gap-3 text-sm text-gray-300">
                    <CheckCircle2 className="w-5 h-5 text-[#0d9488] shrink-0" />
                    Multi-room Angles
                  </li>
                  <li className="flex items-center gap-3 text-sm text-gray-300">
                    <CheckCircle2 className="w-5 h-5 text-[#0d9488] shrink-0" />
                    Manual Review & Refinement
                  </li>
                  <li className="flex items-center gap-3 text-sm text-gray-300">
                    <CheckCircle2 className="w-5 h-5 text-[#0d9488] shrink-0" />
                    Custom Style Matching
                  </li>
                </ul>

                <Link to="/services/virtual-staging/select">
                  <Button className="w-full bg-[#0d9488] hover:bg-[#0f766e] text-white py-6 rounded-xl font-bold border-none shadow-lg shadow-teal-900/20">
                    Order Professional Staging
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
