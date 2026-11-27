import { Link } from "react-router-dom";
import LegalDocument, { legalScrollMarginClassName } from "@/components/LegalDocument";
import LegalArticle from "@/components/LegalArticle";
import { LEGAL } from "@/lib/legal";
import { useSiteText } from "@/content/siteContent";
import { privacySections } from "@shared/a2pPages";

export default function Privacy() {
  const title = useSiteText("privacy", "hero", "title", "Privacy Policy");
  return (
    <LegalDocument>
      <h1 id="privacy-policy" data-site-page="privacy" data-site-block="hero" data-site-field="title" data-site-kind="text" className={`${legalScrollMarginClassName} text-4xl font-bold text-gray-900 mb-2`}>{title}</h1>
      <p className="text-sm text-gray-500 mb-4">Last updated: {LEGAL.lastUpdated}</p>
      <p className="text-sm text-gray-600 mb-10">
        This policy works together with our{" "}
        <Link to="/terms" className="text-teal-600 underline">
          Terms and Conditions
        </Link>
        .
      </p>
      <LegalArticle sections={privacySections()} />
    </LegalDocument>
  );
}
