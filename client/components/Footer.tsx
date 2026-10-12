import { Link } from "react-router-dom";
import { Facebook, Instagram } from "lucide-react";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { LegalLinks } from "@/components/LegalLinks";
import { PublicContactLine } from "@/components/PublicContactLine";
import { LEGAL_BUSINESS_NAME } from "@shared/businessContact";
import { itemLink, itemText, useSiteItems, useSiteText } from "@/content/siteContent";

export default function Footer() {
  const currentYear = new Date().getFullYear();
  const settings = useSiteSettings();
  const footerItems = useSiteItems("chrome", "footer");
  const socialItems = useSiteItems("chrome", "socials");
  const copyright = useSiteText("chrome", "footer", "copyright", LEGAL_BUSINESS_NAME);
  const footerLinks = footerItems
    ? footerItems.map((item) => ({ label: itemText(item, "link"), href: itemLink(item, "link") || "/" }))
    : [
        { label: "Home", href: "/" },
        { label: "Pricing", href: "/pricing" },
        { label: "Socials", href: "/socials" },
        { label: "Portfolio", href: "/portfolio" },
        { label: "Studio 105", href: "/studio-105" },
        { label: "Contact Us", href: "/contact" },
        { label: "Client Login", href: "/login" },
      ];
  const socials = socialItems
    ? socialItems.map((item) => ({ label: itemText(item, "link"), href: itemLink(item, "link") }))
    : [
        { label: "Facebook", href: "https://facebook.com/iconicimagestx" },
        { label: "Instagram", href: "https://instagram.com/iconicimagestx" },
        { label: "TikTok", href: "https://tiktok.com/@iconicimagestx" },
      ];

  return (
    <footer className="text-white py-12" style={{ backgroundColor: settings.global.primaryColor }}>
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8 text-center md:text-left">
          {/* Copyright & Brand */}
          <div className="flex flex-col md:flex-row items-center gap-4 md:gap-8">
            <span className="text-sm opacity-80" data-site-page="chrome" data-site-block="footer" data-site-field="copyright" data-site-kind="text">
              © {currentYear} {copyright}
            </span>
            <nav className="flex flex-wrap justify-center gap-6">
              {footerLinks.map((item) => (
                <Link key={item.href + item.label} to={item.href} className="text-sm font-medium hover:text-white/80 transition-colors">{item.label}</Link>
              ))}
            </nav>
          </div>

          {/* Social Links */}
          <div className="flex items-center gap-6">
            <a href={socials[0]?.href || "https://facebook.com/iconicimagestx"} target="_blank" rel="noopener noreferrer" className="hover:scale-110 transition-transform" aria-label={socials[0]?.label || "Facebook"}><Facebook className="w-5 h-5" /></a>
            <a href={socials[1]?.href || "https://instagram.com/iconicimagestx"} target="_blank" rel="noopener noreferrer" className="hover:scale-110 transition-transform" aria-label={socials[1]?.label || "Instagram"}><Instagram className="w-5 h-5" /></a>
            <a href={socials[2]?.href || "https://tiktok.com/@iconicimagestx"} target="_blank" rel="noopener noreferrer" className="hover:scale-110 transition-transform" aria-label={socials[2]?.label || "TikTok"}>
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.04-.1z" />
              </svg>
            </a>
          </div>
        </div>

        <PublicContactLine
          className="mt-8 text-center text-sm leading-relaxed opacity-90"
          linkClassName="underline underline-offset-4 hover:text-white/80"
        />
        <LegalLinks
          className="mt-6 justify-center border-t border-white/20 pt-6"
          linkClassName="text-sm font-semibold underline underline-offset-4 hover:text-white/80 transition-colors"
        />
      </div>
    </footer>
  );
}
