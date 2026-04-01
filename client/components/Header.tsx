import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSiteSettings } from "@/hooks/useSiteSettings";

export default function Header() {
  const settings = useSiteSettings();
  const location = useLocation();
  const isHome = location.pathname === "/";
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const menuItems = [
    { label: "About", href: "/about" },
    { label: "Resources", href: "/insights" },
    { label: "Pricing", href: "/pricing" },
    { label: "Contact Us", href: "/contact" },
  ];

  return (
    <header className={`fixed ${isHome ? "top-[44px]" : "top-4"} left-0 right-0 z-50 px-6 transition-all duration-300`}>
      <div
        className={`mx-auto max-w-[1200px] rounded-full border border-white/10 shadow-[0_4px_30px_rgba(0,0,0,0.5)] transition-all duration-500 px-8 flex items-center gap-4 ${
          scrolled
            ? "bg-black/80 backdrop-blur-xl py-1 border-white/20"
            : "bg-white/5 backdrop-blur-md py-2 border-white/10"
        }`}
      >
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 flex-shrink-0 group">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105"
            style={{ backgroundColor: settings.global.primaryColor }}
          >
            <img
              src="https://cdn.builder.io/api/v1/image/assets%2F0ed22311ac6a4dbebeda1b4230c2746c%2Fc64073babcd04fcf966feeaacd4c903c?format=webp&width=800&height=1200"
              alt="Logo"
              className="w-6 h-6 object-contain"
              style={{ filter: 'invert(1)' }}
            />
          </div>
          <span className="text-[17px] font-bold tracking-tight text-white uppercase">
            {settings.global.logoText}
          </span>
        </Link>

        {/* Desktop Navigation (Left Aligned) */}
        <nav className="hidden lg:flex items-center gap-8 ml-8 flex-1">
          {menuItems.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              className="text-gray-400 hover:text-white transition-colors text-[14px] font-semibold"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Right side buttons */}
        <div className="hidden lg:flex items-center gap-4">
          <Link to="/admin/login">
            <span className="text-sm font-bold text-gray-400 hover:text-white cursor-pointer transition-colors">Log in</span>
          </Link>
          <Link to="/book">
            <Button className="rounded-xl px-6 py-2 h-10 text-xs font-black uppercase tracking-widest bg-white text-black hover:bg-gray-200">
              Start for free
            </Button>
          </Link>
        </div>

        {/* Mobile Menu Button */}
        <button
          className="lg:hidden p-2 text-gray-400 hover:text-white transition-colors"
          onClick={toggleMenu}
          aria-label="Toggle menu"
        >
          {isMenuOpen ? (
            <X className="w-6 h-6" />
          ) : (
            <Menu className="w-6 h-6" />
          )}
        </button>
      </div>

      {/* Mobile Navigation */}
      {isMenuOpen && (
        <div className="mt-4 mx-auto max-w-[400px] bg-black/95 backdrop-blur-xl border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
          <nav className="px-8 py-10 flex flex-col gap-6">
            {menuItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className="text-gray-400 hover:text-white transition-colors font-bold py-1 text-xl"
                onClick={() => setIsMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
