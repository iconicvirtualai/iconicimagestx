import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export default function PartnershipCTA() {
  return (
    <section className="bg-black text-white py-24 md:py-32">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto text-center">
          {/* Headline */}
          <h2 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-8 leading-[1.1] tracking-tight uppercase">
            Let's Create Something
            <br className="hidden md:block" />
            ICONIC Together.
          </h2>

          {/* Description */}
          <p className="text-xl md:text-2xl text-white/70 mb-12 max-w-2xl mx-auto leading-relaxed">
            Whether you're looking for creative services, strategic partnership, 
            or media licensing solutions, our team is ready to discuss your vision 
            and bring it to life.
          </p>

          {/* CTA Button */}
          <div className="flex justify-center">
            <Link to="/book">
              <Button className="bg-white text-black hover:bg-gray-100 font-bold text-xl px-12 py-8 rounded-2xl transition-all hover:scale-105 flex items-center gap-2">
                Get your free Iconic Video
                <ArrowRight className="w-6 h-6" />
              </Button>
            </Link>
          </div>
          
          {/* Subtle branding line */}
          <div className="mt-20 pt-12 border-t border-white/10">
            <p className="text-white/40 text-sm font-medium tracking-widest uppercase">
              Iconic Media Partners &copy; {new Date().getFullYear()}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
