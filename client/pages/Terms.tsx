import { Link } from "react-router-dom";
import LegalDocument, { legalScrollMarginClassName } from "@/components/LegalDocument";
import LegalArticle from "@/components/LegalArticle";
import { LEGAL } from "@/lib/legal";
import { useSiteText } from "@/content/siteContent";
import { termsSections } from "@shared/a2pPages";

export default function Terms() {
  const title = useSiteText("terms", "hero", "title", "Terms and Conditions");
  return (
    <LegalDocument>
      <h1 id="terms-and-conditions" data-site-page="terms" data-site-block="hero" data-site-field="title" data-site-kind="text" className={`${legalScrollMarginClassName} text-4xl font-bold text-gray-900 mb-2`}>{title}</h1>
      <p className="text-sm text-gray-500 mb-4">Last updated: {LEGAL.lastUpdated}</p>
      <p className="text-sm text-gray-600 mb-10">
        These Terms and Conditions are the terms of service for {LEGAL.brand} / {LEGAL.brandSite}. They are a
        separate page from our{" "}
        <Link to="/privacy" className="text-teal-600 underline">
          Privacy Policy
        </Link>
        . This page is published at /terms. The Privacy Policy is published at /privacy.
      </p>
      <LegalArticle sections={termsSections()} />
    </LegalDocument>
  );
}
