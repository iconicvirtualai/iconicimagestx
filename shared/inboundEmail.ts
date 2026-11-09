/**
 * Inbound mail for the task board.
 * The office mailbox is photos@iconicimagestx.com.
 * This module does not send, delete, or mark mail read.
 * Naming that address does not connect the mailbox.
 */

import { adminOrderDetailHref, adminOrderNumberLabel } from "./adminOrderList.ts";

export const PHOTOS_MAILBOX = "photos@iconicimagestx.com";

export const PHOTOS_INBOX_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export interface InboundClientEmail {
  /** Gmail thread id. One task per thread. */
  id: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  body: string;
  receivedAt: string;
  /** Explicit #123 in the subject or body. Never guessed from a name. */
  orderNumber: string | null;
  sample: boolean;
}

export interface InboundEmailAdapter {
  readonly id: "inbound-email";
  readonly mailbox: typeof PHOTOS_MAILBOX;
  readonly connected: boolean;
  readonly notice: string;
  readonly prerequisites: string[];
  list(): InboundClientEmail[];
}

export const PHOTOS_INBOX_PREREQUISITES = [
  "A Google service account that is not the calendar account and not the SMTP login.",
  `Domain-wide delegation for ${PHOTOS_INBOX_READONLY_SCOPE} only, impersonating ${PHOTOS_MAILBOX}.`,
  "Server env PHOTOS_INBOX_CLIENT_EMAIL, PHOTOS_INBOX_PRIVATE_KEY, and PHOTOS_INBOX_IMPERSONATE.",
  `PHOTOS_INBOX_IMPERSONATE must be exactly ${PHOTOS_MAILBOX}.`,
  "Do not reuse the calendar key, the SMTP password, or a bot connector.",
] as const;

export const INBOUND_EMAIL_DISCONNECTED_NOTICE =
  `${PHOTOS_MAILBOX} is the inbox for client questions and edit requests. It is not connected. Choosing that address does not open the mailbox. This board does not send email.`;

export interface PhotosInboxEnv {
  PHOTOS_INBOX_CLIENT_EMAIL?: string;
  PHOTOS_INBOX_PRIVATE_KEY?: string;
  PHOTOS_INBOX_IMPERSONATE?: string;
  GOOGLE_CALENDAR_CLIENT_EMAIL?: string;
  SMTP_USER?: string;
  EMAIL_FROM?: string;
}

export interface PhotosInboxConfig {
  clientEmail: string;
  privateKey: string;
  impersonate: typeof PHOTOS_MAILBOX;
}

/** Read-only config. Rejects the calendar service account and the SMTP login. */
export function photosInboxConfig(env: PhotosInboxEnv): PhotosInboxConfig | null {
  const clientEmail = (env.PHOTOS_INBOX_CLIENT_EMAIL || "").trim();
  const privateKey = (env.PHOTOS_INBOX_PRIVATE_KEY || "").trim();
  const impersonate = (env.PHOTOS_INBOX_IMPERSONATE || "").trim().toLowerCase();
  if (!clientEmail || !privateKey || impersonate !== PHOTOS_MAILBOX) return null;
  const blocked = [
    env.GOOGLE_CALENDAR_CLIENT_EMAIL,
    env.SMTP_USER,
    env.EMAIL_FROM,
  ].map((value) => (value || "").trim().toLowerCase()).filter(Boolean);
  if (blocked.includes(clientEmail.toLowerCase())) return null;
  return { clientEmail, privateKey, impersonate: PHOTOS_MAILBOX };
}

export function photosInboxNotice(connected: boolean): string {
  if (connected) {
    return `${PHOTOS_MAILBOX} is connected read-only. New client mail is added to the queue. This board does not send, delete, or mark mail read.`;
  }
  return INBOUND_EMAIL_DISCONNECTED_NOTICE;
}

export function disconnectedInboundEmailAdapter(): InboundEmailAdapter {
  return {
    id: "inbound-email",
    mailbox: PHOTOS_MAILBOX,
    connected: false,
    notice: INBOUND_EMAIL_DISCONNECTED_NOTICE,
    prerequisites: [...PHOTOS_INBOX_PREREQUISITES],
    list: () => [],
  };
}

/** One explicit order number, such as #123. Several numbers, or none, do not match. */
export function explicitOrderNumber(value: string): string | null {
  const found = new Set<string>();
  for (const match of value.matchAll(/(?:^|[\s(])#(\d{3,5})\b/g)) {
    const number = Number(match[1]);
    if (Number.isInteger(number) && number >= 1) found.add(`#${String(number).padStart(3, "0")}`);
  }
  if (found.size !== 1) return null;
  return [...found][0];
}

export function linkEmailToOrder(
  email: Pick<InboundClientEmail, "orderNumber">,
  orders: Array<Record<string, unknown>>,
): { id: string; href: string; label: string } | null {
  if (!email.orderNumber) return null;
  const hits = orders.filter((order) => adminOrderNumberLabel(order) === email.orderNumber && typeof order.id === "string" && order.id);
  if (hits.length !== 1) return null;
  const id = String(hits[0].id);
  return { id, href: adminOrderDetailHref(id), label: email.orderNumber };
}

const OWN_MAILBOX = PHOTOS_MAILBOX.toLowerCase();

export function inboundEmailFromParts(input: {
  threadId: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  body: string;
  receivedAt: string;
  sample?: boolean;
}): InboundClientEmail | null {
  const id = input.threadId.trim();
  const fromEmail = input.fromEmail.trim().toLowerCase();
  if (!id || !fromEmail) return null;
  if (fromEmail === OWN_MAILBOX) return null;
  if (/(^|[.+_-])(no-?reply|mailer-daemon|notifications?)@/i.test(fromEmail)) return null;
  const subject = input.subject.replace(/\s+/g, " ").trim().slice(0, 180);
  const body = input.body.replace(/\s+/g, " ").trim().slice(0, 2000);
  return {
    id,
    fromName: input.fromName.replace(/\s+/g, " ").trim().slice(0, 120),
    fromEmail,
    subject,
    body,
    receivedAt: input.receivedAt,
    orderNumber: explicitOrderNumber(`${subject}\n${body}`),
    sample: input.sample === true,
  };
}

/** One row per thread. A later message updates that row. */
export function dedupeInboundEmails(messages: InboundClientEmail[]): InboundClientEmail[] {
  const byThread = new Map<string, InboundClientEmail>();
  for (const message of messages) {
    const current = byThread.get(message.id);
    if (!current || message.receivedAt >= current.receivedAt) byThread.set(message.id, message);
  }
  return [...byThread.values()];
}
