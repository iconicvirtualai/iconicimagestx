import { useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const menuItems = [
    { label: "About", href: "/about" },
    { label: "Blog", href: "/blog" },
    { label: "Pricing", href: "/pricing" },
    { label: "Contact Us", href: "/contact" },
  ];

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100 py-3">
      <div className="container mx-auto px-4 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 flex-shrink-0">
          <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center text-white">
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </div>
          <span className="text-xl font-bold tracking-tight text-black">
            Iconic Images
          </span>
        </Link>

        {/* Desktop Navigation (Centered) */}
        <nav className="hidden lg:flex items-center gap-8 absolute left-1/2 -translate-x-1/2">
          {menuItems.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              className="text-gray-500 hover:text-black transition-colors text-[15px] font-medium"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Right side buttons */}
        <div className="hidden lg:flex items-center gap-6">
          <Link 
            to="/login" 
            className="text-gray-600 hover:text-black transition-colors text-[15px] font-medium"
          >
            Log in
          </Link>
          <Link to="/book">
            <Button className="bg-[#0f766e] text-white hover:bg-[#0d9488] rounded-lg px-6 font-semibold shadow-sm transition-all flex items-center gap-2">
              Start for free
              <svg 
                className="w-4 h-4" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Button>
          </Link>
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
        <div className="lg:hidden bg-white border-t border-gray-100 absolute w-full left-0 animate-in slide-in-from-top duration-300">
          <nav className="container mx-auto px-4 py-6 flex flex-col gap-4">
            {menuItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className="text-gray-600 hover:text-black transition-colors font-medium py-2 text-lg"
                onClick={() => setIsMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <div className="pt-4 border-t border-gray-100 flex flex-col gap-4">
              <Link to="/login" onClick={() => setIsMenuOpen(false)}>
                <span className="text-gray-600 font-medium py-2 text-lg block">Log in</span>
              </Link>
              <Link to="/book" onClick={() => setIsMenuOpen(false)}>
                <Button className="w-full bg-[#0f766e] text-white hover:bg-[#0d9488] font-semibold py-6 text-lg">
                  Start for free
                </Button>
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
