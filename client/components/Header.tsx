import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Header() {
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
    { label: "Insights", href: "/insights" },
    { label: "Pricing", href: "/pricing" },
    { label: "Contact Us", href: "/contact" },
  ];

  return (
    <header className="fixed top-[44px] left-0 right-0 z-50 px-6 transition-all duration-300">
      <div
        className={`mx-auto max-w-[1200px] rounded-full border border-gray-100/50 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] transition-all duration-500 px-8 flex items-center gap-4 ${
          scrolled
            ? "bg-white/80 backdrop-blur-xl py-1 shadow-lg border-white/50"
            : "bg-white py-2 shadow-md"
        }`}
      >
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 flex-shrink-0 group">
          <div className="w-9 h-9 bg-teal-500 rounded-xl flex items-center justify-center text-white shadow-sm transition-transform group-hover:scale-105">
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <circle cx="12" cy="13" r="3" />
            </svg>
          </div>
          <span className="text-[17px] font-bold tracking-tight text-gray-900">
            Iconic
          </span>
        </Link>

        {/* Desktop Navigation (Left Aligned) */}
        <nav className="hidden lg:flex items-center gap-8 ml-8 flex-1">
          {menuItems.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              className="text-gray-500 hover:text-black transition-colors text-[14px] font-semibold"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Right side buttons */}
        <div className="hidden lg:flex items-center gap-4">
          <Link to="/book">
            <Button className="bg-[#22d3ee] hover:bg-[#06b6d4] text-white rounded-xl px-6 h-10 font-bold shadow-sm transition-all text-sm">
              Dashboard
            </Button>
          </Link>
          <div className="w-10 h-10 rounded-full bg-[#166534] border-2 border-white shadow-md flex items-center justify-center text-white font-bold text-[15px] cursor-pointer hover:scale-105 transition-transform flex-shrink-0">
            C
          </div>
        </div>

        {/* Mobile Menu Button */}
        <button
          className="lg:hidden p-2 text-gray-600 hover:text-black transition-colors"
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
        <div className="mt-4 mx-auto max-w-[400px] bg-white/95 backdrop-blur-xl border border-gray-100 rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
          <nav className="px-8 py-10 flex flex-col gap-6">
            {menuItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className="text-gray-600 hover:text-black transition-colors font-bold py-1 text-xl"
                onClick={() => setIsMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <div className="pt-8 border-t border-gray-100 flex flex-col gap-5">
              <Link to="/book" onClick={() => setIsMenuOpen(false)}>
                <Button className="w-full bg-[#22d3ee] text-white hover:bg-[#06b6d4] font-bold py-7 text-xl rounded-2xl shadow-lg">
                  Dashboard
                </Button>
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
