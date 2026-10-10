import { businessContactJsonLd } from "@shared/businessContact";

export function LocalBusinessJsonLd() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(businessContactJsonLd()) }}
    />
  );
}
