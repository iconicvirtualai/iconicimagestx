import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { itemLink, itemText, useSiteHref, useSiteItems, useSiteText } from "@/content/siteContent";
import { clientPortalEnabled, isClientLoginChrome } from "@shared/clientPortal";

function isStudioNavItem(item: { label: string; href: string }): boolean {
  const href = item.href.split("?")[0].replace(/\/$/, "") || "/";
  return href === "/studio-105" || href.startsWith("/studio-105/") || /^studio\s*105$/i.test(item.label.trim());
}

export default function Header() {
  const settings = useSiteSettings();
  const location = useLocation();
  const showPromo = settings.global.showPromoBar;
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

  const navItems = useSiteItems("chrome", "nav");
  const menuItems = (navItems
    ? navItems.map((item) => ({ label: itemText(item, "link"), href: itemLink(item, "link") || "/" }))
    : [
        { label: "About", href: "/about" },
        { label: "Pricing", href: "/pricing" },
        { label: "Studio 105", href: "/studio-105" },
        { label: "Portfolio", href: "/portfolio" },
        { label: "Insights", href: "/insights" },
        { label: "Stock Footage", href: "/stock-footage" },
        { label: "Contact Us", href: "/contact" },
      ]
  ).filter((item) => !isStudioNavItem(item));
  const portalOpen = clientPortalEnabled();
  const visibleMenuItems = portalOpen
    ? menuItems
    : menuItems.filter((item) => !isClientLoginChrome(item.href, item.label));
  const studioLabel = "Studio 105";
  const loginLabel = useSiteText("chrome", "headerCtas", "login", "Log in");
  const loginHref = useSiteHref("chrome", "headerCtas", "login", "/login");
  const bookLabel = useSiteText("chrome", "headerCtas", "book", "Book Now");
  const bookHref = useSiteHref("chrome", "headerCtas", "book", "/book");
  const logoSrc = useSiteText("chrome", "brand", "logo", "/media/logos/camera-logo-white-on-black.png");

  return (
    <header className={`fixed ${showPromo ? "top-14" : "top-6"} left-0 right-0 z-50 px-4 transition-all duration-300 sm:px-6`}>
      <div
        className="mx-auto flex min-h-16 max-w-[1280px] items-center gap-3 overflow-visible rounded-full border border-white/20 bg-black/40 px-4 py-3 shadow-[0_4px_30px_rgba(0,0,0,0.3)] backdrop-blur-xl transition-all duration-500 sm:gap-4 sm:px-6"
      >
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 flex-shrink-0 group">
          <div className="w-8 h-8 rounded-xl overflow-hidden flex items-center justify-center transition-transform group-hover:scale-105 bg-black ring-1 ring-white/15">
            <img
              src={logoSrc}
              alt="Iconic Images"
              data-site-page="chrome"
              data-site-block="brand"
              data-site-field="logo"
              data-site-kind="image"
              className="w-full h-full object-cover"
            />
          </div>
          <span className="text-[15px] font-bold tracking-tight text-white uppercase">
            {settings.global.logoText}
          </span>
        </Link>

        {/* Desktop Navigation (Left Aligned) */}
        <nav className="hidden min-w-0 flex-1 items-center gap-x-3 overflow-visible lg:flex xl:ml-4 xl:gap-x-5">
          {visibleMenuItems.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              className="whitespace-nowrap text-[13px] font-semibold text-white/70 transition-colors hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Studio 105 sits apart from the main link group, beside Log in and Book Now. */}
        <div className="hidden lg:flex items-center gap-4">
          <Link
            to="/studio-105"
            data-testid="nav-studio-105"
            className="inline-flex items-center rounded-full border border-[#2dd4bf] px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-[#2dd4bf] transition-colors hover:bg-[#2dd4bf] hover:text-black"
          >
            {studioLabel}
          </Link>
          {portalOpen ? (
          <Link to={loginHref}>
            <span data-site-page="chrome" data-site-block="headerCtas" data-site-field="login" data-site-kind="text" className="text-xs font-bold text-white/70 hover:text-white cursor-pointer transition-colors">{loginLabel}</span>
          </Link>
          ) : null}
          <Link to={bookHref}>
            <Button className="rounded-xl px-5 py-1.5 h-8 text-[10px] font-black uppercase tracking-widest bg-white text-black hover:bg-gray-200">
              <span data-site-page="chrome" data-site-block="headerCtas" data-site-field="book" data-site-kind="text">{bookLabel}</span>
            </Button>
          </Link>
        </div>

        {/* Mobile Menu Button */}
        <button
          className="inline-flex shrink-0 p-2 text-white/70 transition-colors hover:text-white lg:hidden"
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
            {visibleMenuItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className="text-gray-400 hover:text-white transition-colors font-bold py-1 text-xl"
                onClick={() => setIsMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <Link
              to="/studio-105"
              className="inline-flex w-fit items-center rounded-full border border-[#2dd4bf] px-4 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-[#2dd4bf]"
              onClick={() => setIsMenuOpen(false)}
            >
              {studioLabel}
            </Link>
            {portalOpen ? (
            <Link
              to={loginHref}
              className="text-xs font-bold text-white/70 hover:text-white transition-colors"
              onClick={() => setIsMenuOpen(false)}
            >
              {loginLabel}
            </Link>
            ) : null}
            <Link to={bookHref} onClick={() => setIsMenuOpen(false)}>
              <Button className="w-full rounded-xl px-5 py-1.5 h-10 text-[10px] font-black uppercase tracking-widest bg-white text-black hover:bg-gray-200">
                {bookLabel}
              </Button>
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
