/**
 * Who counts as the delivery QA client.
 * The portal login that QA uses to sign in is a separate client document.
 * It points at the playtest client and uses the same email. It is not playtest
 * itself, and the seed must not write it.
 */

import { mailboxAddress } from "./clientNotify.ts";

export const DELIVERY_QA_CLIENT_EMAIL = "ops+deliveryqa@iconicimagestx.com";
export const DELIVERY_QA_CLIENT_ID = "playtest-delivery-qa-client";
export const DELIVERY_QA_GALLERY_ID = "playtest-delivery-qa-gallery";

export interface DeliveryQaClientRecord {
  playtest?: unknown;
  linkedClientId?: unknown;
  email?: unknown;
}

/**
 * Part of the playtest set when the document is the seeded playtest client,
 * or when it is the portal login linked to that client at the QA mailbox.
 * Any other client, including one that merely shares the email, is not.
 */
export function isDeliveryQaClient(record: DeliveryQaClientRecord | null | undefined): boolean {
  if (!record) return false;
  if (record.playtest === true) return true;
  return record.linkedClientId === DELIVERY_QA_CLIENT_ID && exactQaEmail(record.email);
}

export function isPlaytestDeliveryQaGallery(record: { id?: unknown; playtest?: unknown } | null | undefined): boolean {
  return !!record && record.id === DELIVERY_QA_GALLERY_ID && record.playtest === true;
}

function exactQaEmail(value: unknown): boolean {
  return mailboxAddress(typeof value === "string" ? value : "") === DELIVERY_QA_CLIENT_EMAIL;
}
