import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Sparkles, UserCheck, ArrowRight } from "lucide-react";

export default function VirtualStagingSelection() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <Header />
      
      <main className="flex-1 pt-32 pb-24">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center mb-16">
            <h1 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight">
              Choose Your <span className="text-[#0d9488]">Staging</span> Experience
            </h1>
            <p className="text-xl text-gray-500 leading-relaxed">
              Select the option that best fits your project goals and budget.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* Option 1: AI Staging */}
            <div className="p-8 md:p-12 rounded-[2.5rem] bg-[#f8fdff] border border-[#ccfbf1] border-dashed flex flex-col group hover:shadow-2xl transition-all duration-500">
              <div className="w-16 h-16 bg-[#0d9488] rounded-2xl flex items-center justify-center mb-8 shadow-lg shadow-teal-100 group-hover:scale-110 transition-transform">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-3xl font-bold mb-4">Try AI Staging for Free</h2>
              <p className="text-gray-500 mb-8 flex-1 leading-relaxed">
                Use our automated AI tool to instantly furnish your space. Perfect for quick mockups and exploring different styles on the fly.
              </p>
              <Link to="/services/virtual-staging/ai-tool">
                <Button className="w-full bg-black text-white hover:bg-gray-800 py-7 rounded-2xl font-bold text-lg group">
                  Try AI Staging
                  <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
            </div>

            {/* Option 2: Pro Staging */}
            <div className="p-8 md:p-12 rounded-[2.5rem] bg-white border border-gray-100 shadow-xl flex flex-col group hover:shadow-2xl transition-all duration-500">
              <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center mb-8 shadow-lg group-hover:scale-110 transition-transform">
                <UserCheck className="w-8 h-8 text-[#0d9488]" />
              </div>
              <h2 className="text-3xl font-bold mb-4">Submit Staging to Iconic</h2>
              <p className="text-gray-500 mb-8 flex-1 leading-relaxed">
                Send your photos to our professional design team for high-end, manual editing. Get the absolute best quality with custom furniture and perspectives.
              </p>
              <Link to="/services/virtual-staging/pro-order">
                <Button className="w-full bg-[#0d9488] hover:bg-[#0f766e] text-white py-7 rounded-2xl font-bold text-lg group">
                  Submit to Iconic
                  <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
