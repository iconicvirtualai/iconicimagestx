import { useLocation } from "react-router-dom";
import { businessContactJsonLd } from "@shared/businessContact";

export function LocalBusinessJsonLd() {
  const { pathname } = useLocation();
  if (pathname === "/headshots-10" || pathname.startsWith("/headshots-10/")) return null;
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(businessContactJsonLd()) }}
    />
  );
}
