import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export default function PartnershipCTA() {
  return (
    <section className="bg-black text-white py-20 md:py-32">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto text-center">
          {/* Overline */}
          <p className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wide">
            Ready To Transform Your Brand?
          </p>

          {/* Headline */}
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
            Let's Create Something
            <br className="hidden md:block" />
            <span className="text-white">Extraordinary Together</span>
          </h2>

          {/* Description */}
          <p className="text-xl text-gray-300 mb-12 max-w-2xl mx-auto leading-relaxed">
            Whether you're looking for creative services, strategic partnership, 
            or media licensing solutions, our team is ready to discuss your vision 
            and bring it to life.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Link to="/book">
              <Button className="bg-white text-black hover:bg-gray-100 font-semibold text-lg px-8 py-6 flex items-center justify-center gap-2 w-full sm:w-auto">
                Book a Consultation
                <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
            <Link to="/contact">
              <Button
                variant="outline"
                className="border-white text-white hover:bg-white/10 font-semibold text-lg px-8 py-6 w-full sm:w-auto"
              >
                Get In Touch
              </Button>
            </Link>
          </div>

          {/* Contact Info */}
          <div className="border-t border-gray-800 pt-12">
            <p className="text-gray-400 text-sm mb-4">
              Questions? Reach out directly:
            </p>
            <div className="flex flex-col sm:flex-row gap-6 justify-center items-center text-gray-300">
              <a
                href="mailto:hello@iconicimages.com"
                className="hover:text-white transition-colors font-medium"
              >
                hello@iconicimages.com
              </a>
              <span className="hidden sm:block text-gray-600">•</span>
              <a
                href="tel:+1234567890"
                className="hover:text-white transition-colors font-medium"
              >
                +1 (234) 567-890
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
