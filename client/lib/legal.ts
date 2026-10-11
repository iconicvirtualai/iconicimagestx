import { BUSINESS_CONTACT, LEGAL_BUSINESS_NAME } from "@shared/businessContact";
import { ICONIC_BUSINESS } from "@shared/iconicBusiness";

/** Public legal identity. Contact fields come from the shared business contact. */
export const LEGAL = {
  entity: LEGAL_BUSINESS_NAME,
  brand: ICONIC_BUSINESS.brand,
  brandSite: ICONIC_BUSINESS.brandSite,
  email: BUSINESS_CONTACT.email,
  phoneDisplay: BUSINESS_CONTACT.phoneDisplay,
  phoneHref: BUSINESS_CONTACT.phoneHref,
  address: BUSINESS_CONTACT.address,
  addressLine1: BUSINESS_CONTACT.streetAddress,
  addressLine2: BUSINESS_CONTACT.addressLine2,
  line: BUSINESS_CONTACT.line,
  lastUpdated: "October 1, 2026",
} as const;
