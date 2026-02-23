import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function HeroSection() {
  return (
    <section className="relative bg-black text-white py-20 md:py-32 lg:py-40">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl">
          {/* Main Headline */}
          <h1 className="text-4xl md:text-5xl lg:text-7xl font-bold mb-6 leading-tight tracking-tight">
            Creative Media Partners for Modern Brands
          </h1>

          {/* Subheading */}
          <p className="text-lg md:text-xl text-gray-300 mb-8 max-w-2xl leading-relaxed">
            We've transformed from photographers to creative media partners. 
            Elevate your brand with cutting-edge content production and strategic 
            visual storytelling that resonates.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 mb-16">
            <Link to="/book">
              <Button className="w-full sm:w-auto bg-white text-black hover:bg-gray-100 font-semibold text-lg px-8 py-6">
                Book Now
              </Button>
            </Link>
            <Link to="/services">
              <Button
                variant="outline"
                className="w-full sm:w-auto border-white text-white hover:bg-white/10 font-semibold text-lg px-8 py-6"
              >
                Explore Services
              </Button>
            </Link>
          </div>

          {/* Trust Indicators */}
          <div className="pt-8 border-t border-gray-700">
            <p className="text-gray-400 text-sm font-medium mb-4">
              TRUSTED BY LEADING BRANDS
            </p>
            <div className="flex flex-wrap gap-6 items-center">
              <div className="text-gray-500 text-sm">
                100+ Successful Projects
              </div>
              <div className="text-gray-500 text-sm">
                15+ Years Experience
              </div>
              <div className="text-gray-500 text-sm">
                Global Creative Team
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Subtle Background Accent */}
      <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-gray-900 to-transparent opacity-30 -z-10"></div>
    </section>
  );
}
