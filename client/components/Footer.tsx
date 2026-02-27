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
              <Link to="/socials" className="text-sm font-medium hover:text-white/80 transition-colors">Socials</Link>
              <Link to="/portfolio" className="text-sm font-medium hover:text-white/80 transition-colors">Portfolio</Link>
              <Link to="/contact" className="text-sm font-medium hover:text-white/80 transition-colors">Contact Us</Link>
              <Link to="/privacy" className="text-sm font-medium hover:text-white/80 transition-colors">Privacy Policy</Link>
              <Link to="/terms" className="text-sm font-medium hover:text-white/80 transition-colors">Terms of Service</Link>
            </nav>
          </div>

          {/* Social Links */}
          <div className="flex items-center gap-6">
            <a href="https://facebook.com/iconicimagestx" target="_blank" rel="noopener noreferrer" className="hover:scale-110 transition-transform"><Facebook className="w-5 h-5" /></a>
            <a href="https://instagram.com/iconicimagestx" target="_blank" rel="noopener noreferrer" className="hover:scale-110 transition-transform"><Instagram className="w-5 h-5" /></a>
            <a href="https://tiktok.com/@iconicimagestx" target="_blank" rel="noopener noreferrer" className="hover:scale-110 transition-transform">
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.04-.1z" />
              </svg>
            </a>
            <a href="https://youtube.com/@iconicimagestx" target="_blank" rel="noopener noreferrer" className="hover:scale-110 transition-transform"><Youtube className="w-5 h-5" /></a>
          </div>
        </div>
      </div>
    </footer>
  );
}
