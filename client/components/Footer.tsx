import { Link } from "react-router-dom";
import { Facebook, Instagram, Linkedin, Twitter } from "lucide-react";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-[#0d9488] text-white py-12">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8 text-center md:text-left">
          {/* Copyright & Brand */}
          <div className="flex flex-col md:flex-row items-center gap-4 md:gap-8">
            <span className="text-sm opacity-80">
              © {currentYear} Iconic Images Inc.
            </span>
            <nav className="flex flex-wrap justify-center gap-6">
              <Link to="/" className="text-sm font-medium hover:text-white/80 transition-colors">Home</Link>
              <Link to="/pricing" className="text-sm font-medium hover:text-white/80 transition-colors">Pricing</Link>
              <Link to="/portfolio" className="text-sm font-medium hover:text-white/80 transition-colors">Portfolio</Link>
              <Link to="/contact" className="text-sm font-medium hover:text-white/80 transition-colors">Contact Us</Link>
              <Link to="/privacy" className="text-sm font-medium hover:text-white/80 transition-colors">Privacy Policy</Link>
              <Link to="/terms" className="text-sm font-medium hover:text-white/80 transition-colors">Terms of Service</Link>
            </nav>
          </div>

          {/* Social Links */}
          <div className="flex items-center gap-6">
            <a href="#" className="hover:scale-110 transition-transform"><Facebook className="w-5 h-5" /></a>
            <a href="#" className="hover:scale-110 transition-transform"><Instagram className="w-5 h-5" /></a>
            <a href="#" className="hover:scale-110 transition-transform"><Twitter className="w-5 h-5" /></a>
            <a href="#" className="hover:scale-110 transition-transform"><Linkedin className="w-5 h-5" /></a>
          </div>
        </div>
      </div>
    </footer>
  );
}
