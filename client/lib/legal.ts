import { ICONIC_BUSINESS } from "@shared/iconicBusiness";

/** Public legal identity already used on the site. */
export const LEGAL = {
  entity: ICONIC_BUSINESS.entity,
  brand: ICONIC_BUSINESS.brand,
  brandSite: ICONIC_BUSINESS.brandSite,
  email: ICONIC_BUSINESS.email,
  additionalEmail: ICONIC_BUSINESS.additionalEmail,
  phoneDisplay: ICONIC_BUSINESS.phoneDisplay,
  phoneHref: `tel:${ICONIC_BUSINESS.phoneDisplay}`,
  addressLine1: ICONIC_BUSINESS.addressLine1,
  addressLine2: ICONIC_BUSINESS.addressLine2,
  lastUpdated: "October 1, 2026",
} as const;
