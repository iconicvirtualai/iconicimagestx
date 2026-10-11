/**
 * The only public contact information for Iconic Images.
 * Render BUSINESS_CONTACT.line exactly. Do not publish another address,
 * phone number, or contact email.
 */
export const BUSINESS_CONTACT_LINE =
  "26410 Oakridge Dr. Ste 105 - 108, Spring, TX 77380 | 281.356.0965 | photos@iconicimagestx.com";

/** Legal entity name. Marketing copy keeps the brand "Iconic Images". */
export const LEGAL_BUSINESS_NAME = "Iconic Images Photography, LLC";

function parseContactLine(line: string) {
  const parts = line.split(" | ");
  if (parts.length !== 3) {
    throw new Error("BUSINESS_CONTACT_LINE must be address | phone | email");
  }
  const [address, phoneDisplay, email] = parts;
  const addressParts = address.split(", ");
  if (addressParts.length !== 3) {
    throw new Error("Public address must be street, city, ST ZIP");
  }
  const [streetAddress, city, stateZip] = addressParts;
  const [state, postalCode] = stateZip.split(" ");
  if (!streetAddress || !city || !state || !postalCode || !phoneDisplay || !email) {
    throw new Error("BUSINESS_CONTACT_LINE is missing a public contact field");
  }
  const phoneDigits = phoneDisplay.replace(/\D/g, "");
  return {
    line,
    address,
    streetAddress,
    addressLine2: `${city}, ${state} ${postalCode}`,
    city,
    state,
    postalCode,
    phoneDisplay,
    phoneHref: `tel:+1${phoneDigits}`,
    email,
    emailHref: `mailto:${email}`,
  };
}

export const BUSINESS_CONTACT = parseContactLine(BUSINESS_CONTACT_LINE);

/** schema.org LocalBusiness. Address, phone, and email come only from BUSINESS_CONTACT. */
export function businessContactJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: "Iconic Images",
    legalName: LEGAL_BUSINESS_NAME,
    url: "https://iconicimagestx.com",
    email: BUSINESS_CONTACT.email,
    telephone: BUSINESS_CONTACT.phoneDisplay,
    address: {
      "@type": "PostalAddress",
      streetAddress: BUSINESS_CONTACT.streetAddress,
      addressLocality: BUSINESS_CONTACT.city,
      addressRegion: BUSINESS_CONTACT.state,
      postalCode: BUSINESS_CONTACT.postalCode,
      addressCountry: "US",
    },
  };
}
