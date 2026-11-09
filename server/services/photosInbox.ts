/**
 * Read-only photos@ inbox.
 * Lists mail. Does not send, delete, trash, or mark anything read.
 * Calendar keys and SMTP passwords are not accepted.
 */

import { google } from "googleapis";
import {
  PHOTOS_INBOX_PREREQUISITES,
  PHOTOS_INBOX_READONLY_SCOPE,
  PHOTOS_MAILBOX,
  dedupeInboundEmails,
  inboundEmailFromParts,
  photosInboxConfig,
  photosInboxNotice,
  type InboundClientEmail,
  type PhotosInboxEnv,
} from "../../shared/inboundEmail";

export interface PhotosInboxSnapshot {
  mailbox: typeof PHOTOS_MAILBOX;
  connected: boolean;
  notice: string;
  prerequisites: string[];
  messages: InboundClientEmail[];
  error: string | null;
}

interface GmailHeader {
  name?: string | null;
  value?: string | null;
}

interface GmailListMessage {
  id?: string | null;
  threadId?: string | null;
}

export interface GmailReadClient {
  list(query: string): Promise<GmailListMessage[]>;
  get(id: string): Promise<{
    id?: string | null;
    threadId?: string | null;
    internalDate?: string | null;
    payload?: { headers?: GmailHeader[] | null; body?: { data?: string | null } | null; parts?: unknown } | null;
  }>;
}

const LIST_QUERY = "in:inbox newer_than:21d -category:promotions -category:social";

export async function readPhotosInbox(
  env: PhotosInboxEnv,
  client?: GmailReadClient,
): Promise<PhotosInboxSnapshot> {
  const config = photosInboxConfig(env);
  if (!config) {
    return {
      mailbox: PHOTOS_MAILBOX,
      connected: false,
      notice: photosInboxNotice(false),
      prerequisites: [...PHOTOS_INBOX_PREREQUISITES],
      messages: [],
      error: null,
    };
  }
  try {
    const gmail = client || gmailReadClient(config.clientEmail, config.privateKey);
    const listed = await gmail.list(LIST_QUERY);
    const parsed: InboundClientEmail[] = [];
    for (const item of listed.slice(0, 25)) {
      if (!item.id) continue;
      const full = await gmail.get(item.id);
      const headers = full.payload?.headers || [];
      const from = header(headers, "from");
      const parsedFrom = parseFrom(from);
      const email = inboundEmailFromParts({
        threadId: full.threadId || item.threadId || item.id,
        fromName: parsedFrom.name,
        fromEmail: parsedFrom.email,
        subject: header(headers, "subject"),
        body: bodyText(full.payload),
        receivedAt: full.internalDate ? new Date(Number(full.internalDate)).toISOString() : "",
      });
      if (email) parsed.push(email);
    }
    return {
      mailbox: PHOTOS_MAILBOX,
      connected: true,
      notice: photosInboxNotice(true),
      prerequisites: [],
      messages: dedupeInboundEmails(parsed),
      error: null,
    };
  } catch (error) {
    return {
      mailbox: PHOTOS_MAILBOX,
      connected: false,
      notice: `${PHOTOS_MAILBOX} is configured, but the mailbox could not be read. Nothing was sent or changed.`,
      prerequisites: [],
      messages: [],
      error: error instanceof Error ? error.message : "Mailbox read failed.",
    };
  }
}

function gmailReadClient(clientEmail: string, privateKey: string): GmailReadClient {
  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey.replace(/\\n/g, "\n"),
    scopes: [PHOTOS_INBOX_READONLY_SCOPE],
    subject: PHOTOS_MAILBOX,
  });
  const gmail = google.gmail({ version: "v1", auth });
  return {
    async list(q: string) {
      const response = await gmail.users.messages.list({ userId: "me", q, maxResults: 25 });
      return response.data.messages || [];
    },
    async get(id: string) {
      const response = await gmail.users.messages.get({ userId: "me", id, format: "full" });
      return response.data;
    },
  };
}

function header(headers: GmailHeader[], name: string): string {
  return headers.find((item) => item.name?.toLowerCase() === name)?.value || "";
}

function parseFrom(value: string): { name: string; email: string } {
  const match = value.match(/^(.*)<([^>]+)>$/);
  if (!match) return { name: "", email: value.trim() };
  return { name: match[1].replace(/"/g, "").trim(), email: match[2].trim() };
}

function bodyText(payload: { body?: { data?: string | null } | null; parts?: unknown } | null | undefined): string {
  const data = payload?.body?.data;
  if (typeof data === "string" && data) return decode(data);
  const parts = Array.isArray(payload?.parts) ? payload.parts : [];
  for (const part of parts) {
    const row = part as { mimeType?: string; body?: { data?: string | null }; parts?: unknown };
    if (row.mimeType === "text/plain" && row.body?.data) return decode(row.body.data);
    const nested = bodyText(row);
    if (nested) return nested;
  }
  return "";
}

function decode(data: string): string {
  try {
    return Buffer.from(data, "base64url").toString("utf8");
  } catch {
    return "";
  }
}
