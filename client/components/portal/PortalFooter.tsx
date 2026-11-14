import { BUSINESS_CONTACT, LEGAL_BUSINESS_NAME } from "@shared/businessContact";
import { LegalLinks } from "@/components/LegalLinks";

/** Compact desk footer for the signed-in portal. Public pages keep the marketing footer. */
export function PortalFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="portal-foot" data-testid="portal-footer">
      <div>© {year} {LEGAL_BUSINESS_NAME}</div>
      <div className="foot-meta">
        <span>{BUSINESS_CONTACT.address}</span>
        <a href={BUSINESS_CONTACT.phoneHref}>{BUSINESS_CONTACT.phoneDisplay}</a>
        <a href={BUSINESS_CONTACT.emailHref}>{BUSINESS_CONTACT.email}</a>
      </div>
      <LegalLinks className="foot-legal" />
    </footer>
  );
}
