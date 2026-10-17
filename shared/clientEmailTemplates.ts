/**
 * Client email catalog.
 * Document id is the template key in emailTemplates.
 * Placeholders are {{name}} in the editor, sendEmail, and the order-created function.
 * A missing or invalid override falls back to the built-in subject and HTML.
 */

import { LEGAL_BUSINESS_NAME } from "./businessContact.ts";
import { DEFAULT_PUBLIC_SITE_URL } from "./publicSiteUrl.ts";
import { clientEmailContactLineHtml } from "./clientEmailContact.ts";
import { doorsOpenDeliveryEmailHtml, doorsOpenReceiptEmailHtml } from "./doorsOpenTour.ts";
import { galleryDeliverySubject } from "./galleryDelivery.ts";
import { BOOKING_PROCESSING_LABEL } from "./invoiceProcessing.ts";
import { paymentReceiptFromVars } from "./paymentReceiptLayout.ts";

export const EMAIL_TEMPLATES_COLLECTION = "emailTemplates";

export const CLIENT_EMAIL_TEMPLATE_KEYS = [
  "booking_received",
  "account_password_setup",
  "order_confirmed",
  "gallery_delivery",
  "invoice",
  "payment_receipt",
  "contact_confirmation",
  "clientConfirmation",
] as const;

export type ClientEmailTemplateKey = (typeof CLIENT_EMAIL_TEMPLATE_KEYS)[number];

export interface ClientEmailTemplateMeta {
  id: ClientEmailTemplateKey;
  label: string;
  trigger: string;
  placeholders: string[];
}

export const CLIENT_EMAIL_TEMPLATES: ClientEmailTemplateMeta[] = [
  {
    id: "booking_received",
    label: "Booking received",
    trigger: "Sent to the client when a booking request is saved",
    placeholders: ["clientName", "address", "orderNumber", "scheduledDate", "scheduledTime", "propertyStatus", "furnishingStatus", "accessMethod", "squareFootage", "travelFee", "processing", "total", "requestId"],
  },
  {
    id: "account_password_setup",
    label: "Portal password setup",
    trigger: "Sent to a new client so they can set a portal password",
    placeholders: ["clientName", "clientEmail", "setupUrl", "portalUrl"],
  },
  {
    id: "order_confirmed",
    label: "Appointment confirmed",
    trigger: "Sent to the client when staff confirms the booking",
    placeholders: ["clientName", "address", "orderNumber", "scheduledDate", "scheduledTime", "photographerName", "travelFee", "portalUrl"],
  },
  {
    id: "gallery_delivery",
    label: "Gallery delivery",
    trigger: "Sent to the client when their gallery is delivered",
    placeholders: ["clientName", "address", "galleryUrl", "invoiceAmount", "processing", "paymentUrl", "expiresAt"],
  },
  {
    id: "invoice",
    label: "Invoice",
    trigger: "Sent to the client with a pay link",
    placeholders: ["clientName", "invoiceNumber", "amount", "processing", "dueDate", "paymentUrl"],
  },
  {
    id: "payment_receipt",
    label: "Payment receipt",
    trigger: "Sent to the client after a payment is recorded",
    placeholders: ["clientName", "invoiceNumber", "amount", "processing", "balance", "paidAt", "galleryUrl", "presentationUrl"],
  },
  {
    id: "contact_confirmation",
    label: "Contact confirmation",
    trigger: "Sent to someone who submits the contact form",
    placeholders: ["name"],
  },
  {
    id: "clientConfirmation",
    label: "Order created",
    trigger: "Sent by the order-created function when an order document is created",
    placeholders: ["clientName", "orderNumber", "propertyAddress", "services", "lineItems", "notes", "total"],
  },
];

const MONEY_KEYS = new Set<ClientEmailTemplateKey>([
  "booking_received",
  "gallery_delivery",
  "invoice",
  "payment_receipt",
]);

export function isClientEmailTemplate(value: string): value is ClientEmailTemplateKey {
  return (CLIENT_EMAIL_TEMPLATE_KEYS as readonly string[]).includes(value);
}

export function emailTemplateDocId(key: string): string {
  return key;
}

/** {{name}} only. An unknown token is left in place. */
export function fillEmailPlaceholders(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => (
    Object.prototype.hasOwnProperty.call(variables, key) && variables[key] != null
      ? variables[key]
      : `{{${key}}}`
  ));
}

export interface EmailTemplateOverride {
  subject: string;
  htmlBody: string;
}

/** A saved override must have a non-empty subject and a non-empty HTML body. */
export function readEmailTemplateOverride(data: unknown): EmailTemplateOverride | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  if (typeof row.subject !== "string" || !row.subject.trim()) return null;
  if (typeof row.htmlBody !== "string" || !row.htmlBody.trim()) return null;
  return { subject: row.subject.trim(), htmlBody: row.htmlBody };
}

/** #NNN only. A Firestore document id is not an order number. */
export function displayOrderNumber(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return /^#\d{3,}$/.test(trimmed) ? trimmed : "";
}

export function clientOrderReceivedSubject(address: string, orderNumber?: string): string {
  const code = orderNumber && /^#\d{3,}$/.test(orderNumber) ? ` ${orderNumber}` : "";
  return `Your Iconic order${code} was received: ${address}`;
}

export function clientAppointmentConfirmedSubject(address: string, orderNumber?: string): string {
  const code = orderNumber && /^#\d{3,}$/.test(orderNumber) ? ` ${orderNumber}` : "";
  return `Your Iconic appointment${code} is confirmed: ${address}`;
}

export function invoiceEmailSubject(invoiceNumber?: string): string {
  const number = (invoiceNumber || "").trim();
  return number ? `Invoice ${number} from Iconic Images` : "Invoice from Iconic Images";
}

export function paymentReceiptEmailSubject(invoiceNumber?: string): string {
  return `Payment received — ${invoiceNumber?.trim() || "Iconic Images"}`;
}

export function clientConfirmationSubject(orderNumber?: string): string {
  const code = orderNumber && /^#\d{3,}$/.test(orderNumber) ? ` ${orderNumber}` : "";
  return `We received your Iconic order${code}`;
}

export function builtinEmailSubject(type: string, vars: Record<string, string> = {}): string {
  switch (type) {
    case "booking_received":
      return clientOrderReceivedSubject(vars.address || "", vars.orderNumber);
    case "account_password_setup":
      return "Set your Iconic Images portal password";
    case "order_confirmed":
      return clientAppointmentConfirmedSubject(vars.address || "", vars.orderNumber);
    case "gallery_delivery":
      return galleryDeliverySubject(vars.address);
    case "invoice":
      return invoiceEmailSubject(vars.invoiceNumber);
    case "payment_receipt":
      return paymentReceiptEmailSubject(vars.invoiceNumber);
    case "contact_confirmation":
      return "We received your message — Iconic Images";
    case "clientConfirmation":
      return clientConfirmationSubject(vars.orderNumber);
    default:
      return "";
  }
}

const SUBJECT_SOURCE: Record<ClientEmailTemplateKey, string> = {
  booking_received: "Your Iconic order {{orderNumber}} was received: {{address}}",
  account_password_setup: "Set your Iconic Images portal password",
  order_confirmed: "Your Iconic appointment {{orderNumber}} is confirmed: {{address}}",
  gallery_delivery: "Your gallery is ready: {{address}}",
  invoice: "Invoice {{invoiceNumber}} from Iconic Images",
  payment_receipt: "Payment received — {{invoiceNumber}}",
  contact_confirmation: "We received your message — Iconic Images",
  clientConfirmation: "We received your Iconic order {{orderNumber}}",
};

function shell(content: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #000; padding: 20px; text-align: center; margin-bottom: 30px;">
        <h1 style="color: #fff; margin: 0; font-size: 24px;">ICONIC IMAGES</h1>
        <p style="color: #ccc; margin: 5px 0 0; font-size: 12px; letter-spacing: 2px;">REAL ESTATE MEDIA</p>
      </div>
      ${content}
      <div style="border-top: 1px solid #eee; margin-top: 30px; padding-top: 20px; text-align: center; color: #999; font-size: 12px;">
        <p>${clientEmailContactLineHtml("#666666")}</p>
        <p>${LEGAL_BUSINESS_NAME}</p>
        <p><a href="${DEFAULT_PUBLIC_SITE_URL}" style="color:#999999;text-decoration:underline;">iconicimagestx.vercel.app</a></p>
        <p>Questions? Reply to this email or message us through your client portal.</p>
      </div>
    </div>
  `;
}

function processingLine(): string {
  return `<p style="margin:12px 0;font-size:14px;color:#111111;">${BOOKING_PROCESSING_LABEL}</p>`;
}

const HTML_SOURCE: Record<ClientEmailTemplateKey, string> = {
  booking_received: shell(`
      <h2 style="color:#0d9488;">We received your booking request!</h2>
      <p>Hi {{clientName}},</p>
      <p>Thank you for choosing Iconic Images. We've received your booking request for <strong>{{address}}</strong> and our team will review and confirm your appointment within 1 business day.</p>
      <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px;border:1px solid #eee;border-radius:8px;overflow:hidden;">
        <tr style="background:#f8fafc;"><td style="padding:10px 14px;font-weight:bold;width:42%;color:#555;border-bottom:1px solid #eee;">Requested Date</td><td style="padding:10px 14px;border-bottom:1px solid #eee;">{{scheduledDate}}</td></tr>
        <tr><td style="padding:10px 14px;font-weight:bold;color:#555;border-bottom:1px solid #eee;">Requested Time</td><td style="padding:10px 14px;border-bottom:1px solid #eee;">{{scheduledTime}}</td></tr>
        <tr style="background:#f8fafc;"><td style="padding:10px 14px;font-weight:bold;color:#555;border-bottom:1px solid #eee;">Property Status</td><td style="padding:10px 14px;border-bottom:1px solid #eee;">{{propertyStatus}}</td></tr>
        <tr><td style="padding:10px 14px;font-weight:bold;color:#555;border-bottom:1px solid #eee;">Furnishing</td><td style="padding:10px 14px;border-bottom:1px solid #eee;">{{furnishingStatus}}</td></tr>
        <tr style="background:#f8fafc;"><td style="padding:10px 14px;font-weight:bold;color:#555;border-bottom:1px solid #eee;">Access Method</td><td style="padding:10px 14px;border-bottom:1px solid #eee;"><strong>{{accessMethod}}</strong></td></tr>
        <tr><td style="padding:10px 14px;font-weight:bold;color:#555;border-bottom:1px solid #eee;">Square Footage</td><td style="padding:10px 14px;border-bottom:1px solid #eee;">{{squareFootage}}</td></tr>
        <tr style="background:#f8fafc;"><td style="padding:10px 14px;font-weight:bold;color:#555;border-bottom:1px solid #eee;">Travel</td><td style="padding:10px 14px;border-bottom:1px solid #eee;">{{travelFee}}</td></tr>
        <tr><td style="padding:10px 14px;font-weight:bold;color:#555;border-bottom:1px solid #eee;">${BOOKING_PROCESSING_LABEL}</td><td style="padding:10px 14px;border-bottom:1px solid #eee;">{{processing}}</td></tr>
        <tr style="background:#f8fafc;"><td style="padding:10px 14px;font-weight:bold;color:#555;">Order Total</td><td style="padding:10px 14px;font-weight:bold;color:#0d9488;">{{total}}</td></tr>
      </table>
      <p style="color:#888;font-size:13px;">Confirmation ID: <strong>{{requestId}}</strong> — keep this for your records.</p>
      <p style="color:#888;font-size:13px;">If any details look incorrect, simply reply to this email and we'll sort it out.</p>
    `),
  account_password_setup: shell(`
      <h2 style="color:#0d9488;">Set your portal password</h2>
      <p>Hi {{clientName}},</p>
      <p>We created a client portal login for <strong>{{clientEmail}}</strong> so you can see this appointment request.</p>
      <p>This email is only for your password. Your appointment request details are in a separate email.</p>
      <p><a href="{{setupUrl}}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;display:inline-block;border-radius:4px;">Set your password</a></p>
      <p style="color:#888;font-size:13px;">After that, sign in at <a href="{{portalUrl}}">{{portalUrl}}</a>.</p>
    `),
  order_confirmed: shell(`
      <h2>Your appointment is confirmed!</h2>
      <p>Hi {{clientName}},</p>
      <p>Great news — your shoot at <strong>{{address}}</strong> is confirmed!</p>
      <p>Order <strong>{{orderNumber}}</strong></p>
      <p><strong>Date:</strong> {{scheduledDate}}<br>
      <strong>Time:</strong> {{scheduledTime}}<br>
      <strong>Photographer:</strong> {{photographerName}}<br>
      <strong>Travel:</strong> {{travelFee}}</p>
      <p><a href="{{portalUrl}}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;display:inline-block;border-radius:4px;">View Your Portal</a></p>
    `),
  gallery_delivery: shell(`
      <h2>Your gallery is ready!</h2>
      <p>Hi {{clientName}},</p>
      <p>Your photos for <strong>{{address}}</strong> are edited and waiting in your Iconic Images gallery.</p>
      <p>Iconic Images invoices after the shoot. Downloads stay locked until the <strong>{{invoiceAmount}}</strong> invoice is paid.</p>
      ${processingLine()}
      <p style="margin:0 0 8px;font-size:14px;">{{processing}}</p>
      <p><a href="{{galleryUrl}}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;display:inline-block;border-radius:4px;">View Gallery</a></p>
      <p><a href="{{paymentUrl}}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;display:inline-block;border-radius:4px;">Pay invoice</a></p>
      ${doorsOpenDeliveryEmailHtml()}
      <p style="color:#999;font-size:12px;">Gallery available for {{expiresAt}}.</p>
    `),
  invoice: shell(`
      <h2>Invoice from Iconic Images</h2>
      <p>Hi {{clientName}},</p>
      <p>Your invoice <strong>{{invoiceNumber}}</strong> for <strong>{{amount}}</strong> is ready.</p>
      ${processingLine()}
      <p style="margin:0 0 8px;font-size:14px;">{{processing}}</p>
      <p>Due: <strong>{{dueDate}}</strong></p>
      <p><a href="{{paymentUrl}}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;display:inline-block;border-radius:4px;">Pay Invoice</a></p>
    `),
  payment_receipt: shell(`
      <h2>Payment received</h2>
      <p>Hi {{clientName}},</p>
      <p>We've received your payment of <strong>{{amount}}</strong> for invoice {{invoiceNumber}}.</p>
      ${processingLine()}
      <p style="margin:0 0 8px;font-size:14px;">{{processing}}</p>
      <p>Paid: {{paidAt}}</p>
      <p>Remaining balance: <strong>{{balance}}</strong></p>
      <p><a href="{{galleryUrl}}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;display:inline-block;border-radius:4px;">Your downloads &amp; invoice</a></p>
      <p><a href="{{presentationUrl}}">Listing presentation</a></p>
    `),
  contact_confirmation: shell(`
      <h2 style="color:#0d9488;">We received your message!</h2>
      <p>Hi {{name}},</p>
      <p>Thank you for reaching out to Iconic Images. We've received your message and our team will review it shortly.</p>
      <p>We typically respond to inquiries within 24 business hours. If your question is urgent, call or email us using the contact line below.</p>
      <p style="margin-top:30px;color:#888;font-size:12px;">
        If you have any additional information to add, simply reply to this email or visit <a href="${DEFAULT_PUBLIC_SITE_URL}" style="color:#888888;text-decoration:underline;">iconicimagestx.vercel.app</a>.
      </p>
    `),
  clientConfirmation: shell(`
      <h2 style="color:#0d9488;">We received your order</h2>
      <p>Hi {{clientName}},</p>
      <p>Thank you for booking with Iconic Images. Your order number is <strong>{{orderNumber}}</strong>.</p>
      <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px;border:1px solid #eee;">
        <tr style="background:#f8fafc;"><td style="padding:10px 14px;font-weight:bold;width:42%;color:#555;border-bottom:1px solid #eee;">Order</td><td style="padding:10px 14px;border-bottom:1px solid #eee;">{{orderNumber}}</td></tr>
        <tr><td style="padding:10px 14px;font-weight:bold;color:#555;border-bottom:1px solid #eee;">Property</td><td style="padding:10px 14px;border-bottom:1px solid #eee;">{{propertyAddress}}</td></tr>
        <tr style="background:#f8fafc;"><td style="padding:10px 14px;font-weight:bold;color:#555;border-bottom:1px solid #eee;">Services</td><td style="padding:10px 14px;border-bottom:1px solid #eee;">{{services}}</td></tr>
        <tr><td style="padding:10px 14px;font-weight:bold;color:#555;border-bottom:1px solid #eee;">Details</td><td style="padding:10px 14px;border-bottom:1px solid #eee;">{{lineItems}}</td></tr>
        <tr style="background:#f8fafc;"><td style="padding:10px 14px;font-weight:bold;color:#555;">Notes</td><td style="padding:10px 14px;">{{notes}}</td></tr>
      </table>
      <p>Total: <strong>{{total}}</strong></p>
      <p>We'll be in touch to confirm your shoot time.</p>
    `),
};

export function defaultEmailTemplate(key: ClientEmailTemplateKey): EmailTemplateOverride {
  return {
    subject: SUBJECT_SOURCE[key],
    htmlBody: HTML_SOURCE[key],
  };
}

export function templateShowsMoney(key: ClientEmailTemplateKey): boolean {
  return MONEY_KEYS.has(key);
}

/**
 * Built-in HTML. payment_receipt is the branded receipt from #136, plus the
 * Doors Open note. Every other client key fills its editable source.
 */
function galleryDeliveryBuiltin(vars: Record<string, string>): string {
  const money = vars.invoiceAmount
    ? `<p>Iconic Images invoices after the shoot. Downloads stay locked until the <strong>${vars.invoiceAmount}</strong> invoice is paid.</p>
      ${processingLine()}
      <p style="margin:0 0 8px;font-size:14px;">${vars.processing || ""}</p>`
    : `<p>Downloads open from your gallery once that invoice is paid, or when our team releases the files.</p>`;
  const pay = vars.paymentUrl
    ? `<p><a href="${vars.paymentUrl}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;display:inline-block;border-radius:4px;">Pay invoice</a></p>`
    : "";
  return shell(`
      <h2>Your gallery is ready!</h2>
      <p>Hi ${vars.clientName || ""},</p>
      <p>Your photos for <strong>${vars.address || ""}</strong> are edited and waiting in your Iconic Images gallery.</p>
      ${money}
      <p><a href="${vars.galleryUrl || ""}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;display:inline-block;border-radius:4px;">View Gallery</a></p>
      ${pay}
      ${doorsOpenDeliveryEmailHtml()}
      <p style="color:#999;font-size:12px;">Gallery available for ${vars.expiresAt || ""}.</p>
    `);
}

export function clientBuiltinEmailHtml(type: string, vars: Record<string, string> = {}): string {
  if (type === "payment_receipt") {
    const branded = paymentReceiptFromVars(vars).html;
    const doorsOpen = doorsOpenReceiptEmailHtml(vars.dotOptInUrl || "");
    return branded.includes("</body>")
      ? branded.replace("</body>", `${doorsOpen}</body>`)
      : `${branded}${doorsOpen}`;
  }
  if (type === "gallery_delivery") return galleryDeliveryBuiltin(vars);
  if (!isClientEmailTemplate(type)) {
    return shell(`<p>You have a new notification from Iconic Images.</p>`);
  }
  return fillEmailPlaceholders(HTML_SOURCE[type], vars);
}

export const CLIENT_EMAIL_SAMPLE: Record<string, string> = {
  clientName: "Drew Feig",
  clientEmail: "drew@example.com",
  name: "Drew Feig",
  address: "100 Congress Ave, Austin, TX 78701",
  propertyAddress: "100 Congress Ave, Austin, TX 78701",
  orderNumber: "#104",
  scheduledDate: "October 20, 2026",
  scheduledTime: "10:00 AM",
  propertyStatus: "Vacant",
  furnishingStatus: "Unfurnished",
  accessMethod: "Lockbox — Code: 1234",
  squareFootage: "2,400 sq ft",
  travelFee: "Travel quoted",
  processing: "$15.37",
  total: "$564.37",
  amount: "$564.37",
  requestId: "req_sample",
  setupUrl: "https://iconicimagestx.vercel.app/portal",
  portalUrl: "https://iconicimagestx.vercel.app/portal",
  galleryUrl: "https://iconicimagestx.vercel.app/gallery/gal-sample",
  invoiceAmount: "$564.37",
  paymentUrl: "https://iconicimagestx.vercel.app/invoice/inv-sample?t=sample",
  expiresAt: "30 days",
  invoiceNumber: "INV-104",
  dueDate: "Upon receipt",
  balance: "$0.00",
  paidAt: "OCT. 11, 2026",
  presentationUrl: "https://iconicimagestx.vercel.app/present/sample",
  services: "The Showcase",
  lineItems: "The Showcase — $549.00",
  notes: "Gate code is on the lockbox.",
  photographerName: "Alex Rivera",
  subtotal: "549",
  promotions: "0",
  fees: "0",
  totalPaid: "564.37",
  unlocked: "true",
  status: "",
  paymentStatus: "",
  lineItemsJson: JSON.stringify([{ name: "The Showcase", qty: 1, unitPrice: 549, price: 549 }]),
  dotOptInUrl: "",
};

export function clientEmailPreview(key: ClientEmailTemplateKey, draft?: Partial<EmailTemplateOverride>): { subject: string; html: string; builtin: boolean } {
  const defaults = defaultEmailTemplate(key);
  const subject = draft?.subject ?? defaults.subject;
  const htmlBody = draft?.htmlBody ?? defaults.htmlBody;
  const builtin = subject === defaults.subject && htmlBody === defaults.htmlBody;
  if (builtin) {
    return {
      subject: builtinEmailSubject(key, CLIENT_EMAIL_SAMPLE),
      html: clientBuiltinEmailHtml(key, CLIENT_EMAIL_SAMPLE),
      builtin: true,
    };
  }
  return {
    subject: fillEmailPlaceholders(subject, CLIENT_EMAIL_SAMPLE),
    html: fillEmailPlaceholders(htmlBody, CLIENT_EMAIL_SAMPLE),
    builtin: false,
  };
}
