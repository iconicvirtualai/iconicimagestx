import { Link } from "react-router-dom";
import { BUSINESS_CONTACT, LEGAL_BUSINESS_NAME } from "@shared/businessContact";
import { PAY_AT_CLOSE_PACKAGES_FOOTNOTE } from "@shared/titusEstimate";
import { openTitusEstimateModal } from "@/lib/titusSdk";

const LINKS = [
  { label: "Home", href: "/" },
  { label: "What we do", href: "/what-we-do" },
  { label: "Pricing", href: "/pricing" },
  { label: "Socials", href: "/socials" },
  { label: "Portfolio", href: "/portfolio" },
  { label: "Insights", href: "/insights" },
  { label: "Studio 105", href: "/studio-105" },
  { label: "Contact Us", href: "/contact" },
  { label: "Client Login", href: "/portal" },
];

const SOCIALS = [
  { label: "Facebook", href: "https://facebook.com/iconicimagestx" },
  { label: "Instagram", href: "https://instagram.com/iconicimagestx" },
  { label: "TikTok", href: "https://tiktok.com/@iconicimagestx" },
];

/** Site footer for the signed-in portal. Matches the public Iconic footer links. */
export function PortalFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer" data-testid="portal-footer">
      <div className="foot-row">
        <span>© {year} {LEGAL_BUSINESS_NAME}</span>
      </div>
      <div className="foot-row links">
        {LINKS.map((item) => (
          <Link key={item.href + item.label} to={item.href}>{item.label}</Link>
        ))}
        <span className="foot-socials">
          {SOCIALS.map((item) => (
            <a key={item.label} href={item.href} target="_blank" rel="noopener noreferrer" aria-label={item.label}>{item.label}</a>
          ))}
        </span>
      </div>
      <div className="foot-meta">
        <span>{BUSINESS_CONTACT.address}</span>
        <a href={BUSINESS_CONTACT.phoneHref}>{BUSINESS_CONTACT.phoneDisplay}</a>
        <a href={BUSINESS_CONTACT.emailHref}>{BUSINESS_CONTACT.email}</a>
      </div>
      <div className="foot-legal">
        <Link to="/privacy">Privacy Policy</Link>
        <Link to="/terms">Terms and Conditions</Link>
      </div>
      <p className="foot-titus">
        Pay at Close is arranged by Titus.{" "}
        <button type="button" onClick={() => void openTitusEstimateModal()}>Estimate your payment</button>
        . {PAY_AT_CLOSE_PACKAGES_FOOTNOTE}
      </p>
    </footer>
  );
}
