/**
 * Public business identity already printed on the site.
 * Strings match client/lib/legal.ts. The website host is the one already
 * used in transactional email ("Iconic Images TX | iconicimagestx.com")
 * and as the APP_URL default. legal.ts has no website field.
 */

export const ICONIC_BUSINESS = {
  entity: "Iconic Images Photography, LLC",
  brand: "Iconic Images",
  brandSite: "Iconic Images TX",
  email: "photos@iconicimagestx.com",
  additionalEmail: "cadi@iconicimagestx.com",
  phoneDisplay: "281-356-0965",
  addressLine1: "2219 Sawdust Rd. #1304",
  addressLine2: "Spring, TX 77380",
  website: "iconicimagestx.com",
} as const;

export function iconicBusinessFooterLines(): string[] {
  return [
    ICONIC_BUSINESS.entity,
    ICONIC_BUSINESS.addressLine1,
    ICONIC_BUSINESS.addressLine2,
    ICONIC_BUSINESS.phoneDisplay,
    ICONIC_BUSINESS.email,
    ICONIC_BUSINESS.additionalEmail,
    ICONIC_BUSINESS.website,
  ];
}
