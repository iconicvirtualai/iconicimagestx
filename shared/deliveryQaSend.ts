/**
 * Playtest-only client delivery email.
 * The live script calls deliverGalleryToClient, which calls sendEmail.
 * This module does not import the mailer and does not send.
 */

import { mailboxAddress } from "./clientNotify.ts";
import { isDeliveryQaClient, type DeliveryQaClientRecord } from "./deliveryQaClient.ts";
import { PLAYTEST_ADDRESS } from "./listingAccess.ts";
import {
  DELIVERY_QA_CLIENT_EMAIL,
  DELIVERY_QA_CLIENT_NAME,
  DELIVERY_QA_DEFAULT_ORIGIN,
  DELIVERY_QA_IDS,
  buildDeliveryQaSeed,
} from "./deliveryQaSeed.ts";

/** Same fallback sendEmail uses when no subject override and no stored template subject. */
export const DELIVERY_QA_EMAIL_SUBJECT = "Message from Iconic Images";
export const DELIVERY_QA_EMAIL_TEMPLATE = "gallery_delivery";

export interface DeliveryQaSendRecord extends DeliveryQaClientRecord {
  exists: boolean;
  clientId?: unknown;
  orderId?: unknown;
  clientEmail?: unknown;
  phone?: unknown;
}

export interface DeliveryQaSendPreview {
  template: typeof DELIVERY_QA_EMAIL_TEMPLATE;
  to: typeof DELIVERY_QA_CLIENT_EMAIL;
  subject: typeof DELIVERY_QA_EMAIL_SUBJECT;
  galleryUrl: string;
  paymentUrl: string;
  invoiceAmount: string;
  expiresAt: string;
  clientName: string;
  address: string;
}

export function parseDeliveryQaSendArgs(argv: string[]): { playtest: boolean; dryRun: boolean; unknown: string[] } {
  const args = argv.filter((arg) => arg !== "--");
  return {
    playtest: args.includes("--playtest"),
    dryRun: args.includes("--dry-run"),
    unknown: args.filter((arg) => arg.startsWith("-") && arg !== "--playtest" && arg !== "--dry-run"),
  };
}

export function deliveryQaSendPreview(origin?: string): DeliveryQaSendPreview {
  const plan = buildDeliveryQaSeed({ origin: cleanOrigin(origin) });
  const invoice = plan.documents.find((doc) => doc.collection === "invoices");
  const total = Number(invoice?.data.total);
  return {
    template: DELIVERY_QA_EMAIL_TEMPLATE,
    to: DELIVERY_QA_CLIENT_EMAIL,
    subject: DELIVERY_QA_EMAIL_SUBJECT,
    galleryUrl: `${plan.origin}/gallery/${DELIVERY_QA_IDS.gallery}`,
    paymentUrl: `${plan.origin}/invoice/${DELIVERY_QA_IDS.invoice}`,
    invoiceAmount: `$${total.toFixed(2)}`,
    expiresAt: "30 days",
    clientName: DELIVERY_QA_CLIENT_NAME,
    address: PLAYTEST_ADDRESS,
  };
}

export function formatDeliveryQaSendDryRun(preview: DeliveryQaSendPreview): string {
  const lines = [
    "DELIVERY QA SEND — DRY RUN",
    "No email sent. deliverGalleryToClient was not called. Firestore was not read.",
    "",
    `template: ${preview.template}`,
    `recipient: ${preview.to}`,
    `subject: ${preview.subject}`,
    "subject source: built-in sendEmail subject. An active emailTemplates document with category gallery_delivery replaces it on a real send. This preview does not read that document.",
    `clientName: ${preview.clientName}`,
    `address: ${preview.address}`,
    `galleryUrl: ${preview.galleryUrl}`,
    `paymentUrl: ${preview.paymentUrl}`,
    `invoiceAmount: ${preview.invoiceAmount}`,
    `expiresAt: ${preview.expiresAt}`,
    "",
    "The live command loads:",
    `- galleries/${DELIVERY_QA_IDS.gallery}`,
    `- orders/${DELIVERY_QA_IDS.order}`,
    `- clients/${DELIVERY_QA_IDS.client}`,
    "It sends nothing unless the gallery and order are playtest, the client is the delivery QA client, and the client email is exactly ops+deliveryqa@iconicimagestx.com.",
    "It then calls deliverGalleryToClient. That function calls sendEmail.",
    "sendEmail keeps the CLIENT_NOTIFY_LIVE and NOTIFY_TEST_ALLOWLIST gate.",
    "This script does not set those variables and does not call the mail transport itself.",
    "A non-empty client phone is refused, because deliverGalleryToClient would also send SMS.",
    "",
    "SMTP_PASS is a Vercel secret, so this live command cannot send from a laptop.",
    "Staff send the real delivery email by clicking Deliver Gallery on the playtest order in the app.",
    "That button calls the same deliverGalleryToClient path.",
    "The playtest gallery clears the release gate, so that button is not held.",
    "",
  ];
  return `${lines.join("\n")}\n`;
}

export function deliveryQaSendRefusals(input: {
  gallery: DeliveryQaSendRecord;
  order: DeliveryQaSendRecord;
  client: DeliveryQaSendRecord;
}): string[] {
  const reasons: string[] = [];
  const galleryPath = `galleries/${DELIVERY_QA_IDS.gallery}`;
  const orderPath = `orders/${DELIVERY_QA_IDS.order}`;
  const clientPath = `clients/${DELIVERY_QA_IDS.client}`;

  if (!input.gallery.exists) reasons.push(`${galleryPath} does not exist.`);
  else if (input.gallery.playtest !== true) reasons.push(`${galleryPath} is not marked playtest.`);
  if (input.gallery.exists && input.gallery.clientId !== DELIVERY_QA_IDS.client) {
    reasons.push(`${galleryPath} clientId is not ${DELIVERY_QA_IDS.client}.`);
  }
  if (input.gallery.exists && input.gallery.orderId !== DELIVERY_QA_IDS.order) {
    reasons.push(`${galleryPath} orderId is not ${DELIVERY_QA_IDS.order}.`);
  }
  if (input.gallery.exists && input.gallery.clientEmail != null && input.gallery.clientEmail !== "" && !exactQaEmail(input.gallery.clientEmail)) {
    reasons.push(`${galleryPath} clientEmail is not ${DELIVERY_QA_CLIENT_EMAIL}.`);
  }

  if (!input.order.exists) reasons.push(`${orderPath} does not exist.`);
  else if (input.order.playtest !== true) reasons.push(`${orderPath} is not marked playtest.`);
  if (input.order.exists && input.order.clientId !== DELIVERY_QA_IDS.client) {
    reasons.push(`${orderPath} clientId is not ${DELIVERY_QA_IDS.client}.`);
  }
  if (input.order.exists && input.order.clientEmail != null && input.order.clientEmail !== "" && !exactQaEmail(input.order.clientEmail)) {
    reasons.push(`${orderPath} clientEmail is not ${DELIVERY_QA_CLIENT_EMAIL}.`);
  }

  if (!input.client.exists) reasons.push(`${clientPath} does not exist.`);
  else if (!isDeliveryQaClient(input.client)) reasons.push(`${clientPath} is not the delivery QA client.`);
  if (input.client.exists && !exactQaEmail(input.client.email)) {
    reasons.push(`${clientPath} email is not ${DELIVERY_QA_CLIENT_EMAIL}.`);
  }
  if (input.client.exists && phoneSet(input.client.phone)) {
    reasons.push(`${clientPath} has a phone number, so deliverGalleryToClient would also send SMS.`);
  }
  return reasons;
}

function exactQaEmail(value: unknown): boolean {
  return mailboxAddress(typeof value === "string" ? value : "") === DELIVERY_QA_CLIENT_EMAIL;
}

function phoneSet(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanOrigin(value: string | undefined): string {
  const trimmed = String(value || "").trim().replace(/\/$/, "");
  return trimmed || DELIVERY_QA_DEFAULT_ORIGIN;
}
