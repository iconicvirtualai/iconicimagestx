/**
 * Public business identity printed on invoices, receipts, and legal pages.
 * Address, phone, and contact email come from shared/businessContact.ts.
 */

import { BUSINESS_CONTACT } from "./businessContact.ts";

export const ICONIC_BUSINESS = {
  entity: "Iconic Images Photography, LLC",
  brand: "Iconic Images",
  brandSite: "Iconic Images TX",
  email: BUSINESS_CONTACT.email,
  phoneDisplay: BUSINESS_CONTACT.phoneDisplay,
  addressLine1: BUSINESS_CONTACT.streetAddress,
  addressLine2: BUSINESS_CONTACT.addressLine2,
  address: BUSINESS_CONTACT.address,
  website: "iconicimagestx.com",
} as const;

export function iconicBusinessFooterLines(): string[] {
  return [
    ICONIC_BUSINESS.entity,
    BUSINESS_CONTACT.address,
    BUSINESS_CONTACT.phoneDisplay,
    BUSINESS_CONTACT.email,
    ICONIC_BUSINESS.website,
  ];
}
