import { Link } from "react-router-dom";
import { BUSINESS_CONTACT, LEGAL_BUSINESS_NAME } from "@shared/businessContact";
import { isClientLoginChrome } from "@shared/clientPortal";
import { itemLink, itemText, useSiteItems } from "@/content/siteContent";
import { LegalLinks } from "@/components/LegalLinks";

const FALLBACK_LINKS = [
  { label: "Home", href: "/" },
  { label: "What we do", href: "/what-we-do" },
  { label: "Pricing", href: "/pricing" },
  { label: "Socials", href: "/socials" },
  { label: "Portfolio", href: "/portfolio" },
  { label: "Insights", href: "/insights" },
  { label: "Studio 105", href: "/studio-105" },
  { label: "Contact Us", href: "/contact" },
];

const FALLBACK_SOCIALS = [
  { label: "Facebook", href: "https://facebook.com/iconicimagestx" },
  { label: "Instagram", href: "https://instagram.com/iconicimagestx" },
  { label: "TikTok", href: "https://tiktok.com/@iconicimagestx" },
];

/** Portal footer. Client Login is omitted even when the portal flag is on. */
export function PortalFooter() {
  const year = new Date().getFullYear();
  const footerItems = useSiteItems("chrome", "footer");
  const socialItems = useSiteItems("chrome", "socials");
  const links = (footerItems
    ? footerItems.map((item) => ({ label: itemText(item, "link"), href: itemLink(item, "link") || "/" }))
    : FALLBACK_LINKS
  ).filter((item) => item.label && !isClientLoginChrome(item.href, item.label));
  const socials = socialItems
    ? socialItems.map((item) => ({ label: itemText(item, "link"), href: itemLink(item, "link") })).filter((item) => item.label && item.href)
    : FALLBACK_SOCIALS;

  return (
    <footer className="site-footer">
      <div className="foot-row">
        <span>© {year} {LEGAL_BUSINESS_NAME}</span>
      </div>
      <div className="foot-row links">
        {links.map((item) => (
          <Link key={item.href + item.label} to={item.href}>{item.label}</Link>
        ))}
        <span style={{ marginLeft: "auto", display: "flex", gap: 12 }}>
          {socials.map((item) => (
            <a key={item.label} href={item.href} target="_blank" rel="noopener noreferrer">{item.label}</a>
          ))}
        </span>
      </div>
      <div className="foot-meta">
        <span>{BUSINESS_CONTACT.address}</span>
        <a href={BUSINESS_CONTACT.phoneHref}>{BUSINESS_CONTACT.phoneDisplay}</a>
        <a href={BUSINESS_CONTACT.emailHref}>{BUSINESS_CONTACT.email}</a>
      </div>
      <LegalLinks className="foot-legal" />
      <p style={{ marginTop: 14, fontSize: 12, color: "#e7f7f4" }}>
        Pay at Close is arranged by Titus. <Link to="/pay-at-close">Estimate your payment</Link>. $0 due until closing with financing arranged by Titus.
      </p>
    </footer>
  );
}
