import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { CheckCircle2, ArrowRight } from "lucide-react";

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
            <div className="flex flex-wrap justify-center gap-4">
              <Button className="bg-[#0d9488] hover:bg-[#0f766e] text-white px-8 py-6 text-lg rounded-xl shadow-lg">
                Upload Your Photos
              </Button>
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
              <div key={i} className="p-8 rounded-3xl bg-[#f8fdff] border border-[#ccfbf1] border-dashed">
                <CheckCircle2 className="w-10 h-10 text-[#0d9488] mb-4" />
                <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
                <p className="text-gray-500 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
