import type { ContactThreadView } from "../contactThread.ts";

export type ThreadAudience = "clients" | "leads" | "photographers" | "socials";

export type ThreadSource = "messages" | "conversations" | "sms" | "contact" | "orderRequest" | "social";

export interface ThreadMessage {
  id: string;
  direction: "inbound" | "outbound";
  senderId: string;
  senderName: string;
  senderType: string;
  body: string;
  channel: string;
  createdAt: string;
  delivery: string;
}

export interface UnifiedThread {
  id: string;
  audiences: ThreadAudience[];
  source: ThreadSource;
  title: string;
  subtitle: string;
  preview: string;
  updatedAt: string;
  email: string;
  phone: string;
  orderId: string;
  clientId: string;
  photographerId: string;
  photographerPhone: string;
  participantIds: string[];
  unread: number;
  connectorNeeded: boolean;
  messages: ThreadMessage[];
}

export interface CommunicationsSnapshot {
  messages?: Array<Record<string, unknown>>;
  conversations?: Array<Record<string, unknown>>;
  smsLogs?: Array<Record<string, unknown>>;
  contactThreads?: ContactThreadView[];
  orderRequests?: Array<Record<string, unknown>>;
}

export interface PortalScope {
  kind: "client" | "photographer";
  uid: string;
  email: string;
  phone: string;
}

const SOCIALS: { id: string; title: string; detail: string }[] = [
  { id: "social-instagram", title: "Instagram", detail: "Instagram DMs and comments" },
  { id: "social-facebook", title: "Facebook", detail: "Facebook DMs and comments" },
  { id: "social-tiktok", title: "TikTok", detail: "TikTok DMs and comments" },
  { id: "social-google-business", title: "Google Business", detail: "Google Business DMs and comments" },
];

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function emailOf(value: string): string {
  return value.includes("@") ? value : "";
}

function timeOf(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && value && "seconds" in value) {
    const seconds = Number((value as { seconds: unknown }).seconds);
    if (Number.isFinite(seconds) && seconds > 0) return new Date(seconds * 1000).toISOString();
  }
  return "";
}

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

function phonesMatch(left: string, right: string): boolean {
  const a = digits(left);
  const b = digits(right);
  if (a.length < 10 || b.length < 10) return false;
  return a.endsWith(b.slice(-10)) || b.endsWith(a.slice(-10));
}

function byTimeDesc(left: UnifiedThread, right: UnifiedThread): number {
  return (Date.parse(right.updatedAt) || 0) - (Date.parse(left.updatedAt) || 0);
}

function messageFrom(raw: Record<string, unknown>, index: number): ThreadMessage {
  const senderType = text(raw.senderType) || "client";
  const direction = text(raw.direction) === "outbound" || senderType === "staff"
    ? "outbound"
    : "inbound";
  return {
    id: text(raw.id) || `msg-${index}`,
    direction: text(raw.direction) === "inbound" || text(raw.direction) === "outbound" ? text(raw.direction) as "inbound" | "outbound" : direction,
    senderId: text(raw.senderId),
    senderName: text(raw.senderName) || (senderType === "staff" ? "Iconic Images" : "Client"),
    senderType,
    body: text(raw.content) || text(raw.body) || text(raw.text),
    channel: text(raw.channel) || "in-app",
    createdAt: timeOf(raw.createdAt),
    delivery: text(raw.delivery),
  };
}

function socialThreads(): UnifiedThread[] {
  return SOCIALS.map((item) => ({
    id: item.id,
    audiences: ["socials"],
    source: "social",
    title: item.title,
    subtitle: "Connector needed",
    preview: `${item.detail}. Connector needed — no integration is connected yet.`,
    updatedAt: "",
    email: "",
    phone: "",
    orderId: "",
    clientId: "",
    photographerId: "",
    photographerPhone: "",
    participantIds: [],
    unread: 0,
    connectorNeeded: true,
    messages: [],
  }));
}

function threadShell(partial: Partial<UnifiedThread> & Pick<UnifiedThread, "id" | "audiences" | "source" | "title">): UnifiedThread {
  return {
    subtitle: "",
    preview: "",
    updatedAt: "",
    email: "",
    phone: "",
    orderId: "",
    clientId: "",
    photographerId: "",
    photographerPhone: "",
    participantIds: [],
    unread: 0,
    connectorNeeded: false,
    messages: [],
    ...partial,
  };
}

export function buildUnifiedThreads(snapshot: CommunicationsSnapshot): UnifiedThread[] {
  const threads = new Map<string, UnifiedThread>();

  const ensure = (thread: UnifiedThread) => {
    const current = threads.get(thread.id);
    if (!current) {
      threads.set(thread.id, thread);
      return thread;
    }
    const audiences = new Set([...current.audiences, ...thread.audiences]);
    current.audiences = [...audiences];
    if (!current.email && thread.email) current.email = thread.email;
    if (!current.phone && thread.phone) current.phone = thread.phone;
    if (!current.clientId && thread.clientId) current.clientId = thread.clientId;
    if (!current.photographerId && thread.photographerId) current.photographerId = thread.photographerId;
    if (!current.orderId && thread.orderId) current.orderId = thread.orderId;
    for (const id of thread.participantIds) {
      if (id && !current.participantIds.includes(id)) current.participantIds.push(id);
    }
    return current;
  };

  for (const [index, raw] of (snapshot.messages || []).entries()) {
    const message = messageFrom(raw, index);
    if (!message.body && !message.senderName) continue;
    const orderId = text(raw.orderId);
    const explicit = text(raw.threadId);
    const id = explicit || (orderId ? `order:${orderId}` : `message:${message.id}`);
    const senderType = message.senderType;
    const clientId = text(raw.clientId) || (senderType === "client" && !explicit.startsWith("contact:") && !explicit.startsWith("lead:") ? message.senderId : "");
    const photographerId = text(raw.photographerId) || (senderType === "photographer" ? message.senderId : "");
    const audiences: ThreadAudience[] = [];
    if (explicit.startsWith("contact:") || explicit.startsWith("lead:")) {
      audiences.push("leads");
    } else {
      if (photographerId || senderType === "photographer") audiences.push("photographers");
      if (!audiences.includes("photographers") || clientId || senderType === "client" || orderId) {
        if (senderType !== "photographer" || clientId || orderId) audiences.push("clients");
      }
      if (!audiences.length) audiences.push("clients");
    }
    const thread = ensure(threadShell({
      id,
      audiences,
      source: "messages",
      title: text(raw.clientName) || message.senderName || "Conversation",
      subtitle: orderId ? `Order ${orderId.slice(0, 8)}` : text(raw.channel) || "Message",
      email: emailOf(text(raw.email) || text(raw.recipient)),
      phone: text(raw.phone),
      orderId,
      clientId,
      photographerId,
      participantIds: [clientId, photographerId, message.senderId].filter(Boolean),
      updatedAt: message.createdAt,
    }));
    thread.messages.push(message);
    if (message.createdAt > thread.updatedAt) thread.updatedAt = message.createdAt;
    if (senderType === "client" && !thread.title) thread.title = message.senderName;
    if ((senderType === "client" || senderType === "photographer") && message.senderName) {
      if (thread.title === "Conversation" || thread.title === "Iconic Images") thread.title = message.senderName;
    }
  }

  for (const raw of snapshot.conversations || []) {
    const id = `conversation:${text(raw.id) || text(raw.conversationSid)}`;
    const clientId = text(raw.clientId);
    const photographerId = text(raw.photographerId);
    ensure(threadShell({
      id,
      audiences: ["clients", "photographers"],
      source: "conversations",
      title: `${text(raw.photographerName) || "Photographer"} ↔ ${text(raw.clientName) || "Client"}`,
      subtitle: "Masked SMS",
      preview: text(raw.status) === "closed" ? "Closed bridge" : "Twilio masked number",
      updatedAt: timeOf(raw.createdAt),
      email: text(raw.clientEmail),
      phone: text(raw.clientPhone),
      orderId: text(raw.orderId),
      clientId,
      photographerId,
      photographerPhone: text(raw.photographerPhone),
      participantIds: [clientId, photographerId].filter(Boolean),
    }));
  }

  const mirrored = new Set(
    (snapshot.messages || []).map((raw) => `${text(raw.orderId)}|${text(raw.content) || text(raw.body)}`),
  );
  for (const [index, raw] of (snapshot.smsLogs || []).entries()) {
    const body = text(raw.body) || text(raw.content);
    const orderId = text(raw.orderId);
    if (orderId && mirrored.has(`${orderId}|${body}`)) continue;
    const message = messageFrom({ ...raw, content: body, channel: "sms", senderType: text(raw.senderType) || (text(raw.direction) === "outbound" ? "staff" : "client") }, index);
    const senderType = text(raw.senderType);
    const id = orderId ? `order:${orderId}` : `sms:${text(raw.id) || message.id}`;
    const audiences: ThreadAudience[] = senderType === "photographer" ? ["photographers"] : orderId ? ["clients"] : ["leads"];
    const thread = ensure(threadShell({
      id,
      audiences,
      source: orderId ? "messages" : "sms",
      title: text(raw.clientName) || text(raw.from) || text(raw.to) || "Text message",
      subtitle: "SMS",
      phone: text(raw.to) || text(raw.from) || text(raw.phone),
      orderId,
      clientId: text(raw.clientId),
      photographerId: text(raw.photographerId) || (senderType === "photographer" ? text(raw.senderId) : ""),
      updatedAt: message.createdAt,
    }));
    if (body) thread.messages.push(message);
    if (message.createdAt > thread.updatedAt) thread.updatedAt = message.createdAt;
  }

  for (const contact of snapshot.contactThreads || []) {
    const messages: ThreadMessage[] = contact.messages.map((message) => ({
      id: message.id,
      direction: message.sender === "staff" ? "outbound" : "inbound",
      senderId: "",
      senderName: message.senderName,
      senderType: message.sender,
      body: message.text,
      channel: "contact",
      createdAt: message.createdAt,
      delivery: "logged",
    }));
    const last = messages[messages.length - 1];
    ensure(threadShell({
      id: `contact:${contact.id}`,
      audiences: ["leads"],
      source: "contact",
      title: contact.name || "Website chat",
      subtitle: "Contact chat",
      preview: last?.body || "",
      updatedAt: contact.updatedAt || last?.createdAt || contact.createdAt,
      email: contact.email || "",
      phone: contact.phone || "",
      messages,
      unread: messages.filter((message) => message.direction === "inbound").length ? 1 : 0,
    }));
  }

  for (const raw of snapshot.orderRequests || []) {
    const id = `lead:${text(raw.id)}`;
    const name = text(raw.clientName) || [text(raw.firstName), text(raw.lastName)].filter(Boolean).join(" ") || text(raw.name) || "Order request";
    const body = text(raw.message) || text(raw.notes) || text(raw.services) || text(raw.address) || text(raw.propertyAddress) || "New order request";
    const createdAt = timeOf(raw.createdAt) || timeOf(raw.submittedAt);
    ensure(threadShell({
      id,
      audiences: ["leads"],
      source: "orderRequest",
      title: name,
      subtitle: "Order request",
      preview: body,
      updatedAt: createdAt,
      email: text(raw.email) || text(raw.clientEmail),
      phone: text(raw.phone) || text(raw.clientPhone),
      orderId: text(raw.id),
      clientId: text(raw.clientId),
      messages: [{
        id: `${id}-note`,
        direction: "inbound",
        senderId: text(raw.clientId),
        senderName: name,
        senderType: "lead",
        body,
        channel: "orderRequest",
        createdAt,
        delivery: "logged",
      }],
    }));
  }

  for (const thread of threads.values()) {
    thread.messages.sort((left, right) => (Date.parse(left.createdAt) || 0) - (Date.parse(right.createdAt) || 0));
    const last = thread.messages[thread.messages.length - 1];
    if (last && !thread.preview) thread.preview = last.body;
    thread.unread = thread.messages.filter((message) => message.direction === "inbound" && message.delivery !== "read").length;
    thread.participantIds = [...new Set(thread.participantIds.filter(Boolean))];
  }

  const list = [...threads.values()].sort(byTimeDesc);
  return [...list, ...socialThreads()];
}

export function filterThreads(threads: UnifiedThread[], audience: ThreadAudience, query = ""): UnifiedThread[] {
  const needle = query.trim().toLowerCase();
  return threads.filter((thread) => {
    if (!thread.audiences.includes(audience)) return false;
    if (!needle) return true;
    const haystack = [thread.title, thread.subtitle, thread.preview, thread.email, thread.phone, thread.orderId].join(" ").toLowerCase();
    return haystack.includes(needle);
  });
}

export function threadVisibleTo(thread: UnifiedThread, scope: PortalScope): boolean {
  if (thread.connectorNeeded || thread.audiences.includes("socials")) return false;
  const ids = new Set(
    [thread.clientId, thread.photographerId, ...thread.participantIds, ...thread.messages.map((message) => message.senderId)].filter(Boolean),
  );
  if (scope.kind === "client") {
    if (scope.uid && ids.has(scope.uid)) return true;
    return Boolean(scope.email && thread.email && thread.email.toLowerCase() === scope.email.toLowerCase());
  }
  if (scope.uid && (thread.photographerId === scope.uid || thread.participantIds.includes(scope.uid))) return true;
  if (scope.uid && ids.has(scope.uid) && thread.audiences.includes("photographers")) return true;
  return Boolean(scope.phone && thread.photographerPhone && phonesMatch(scope.phone, thread.photographerPhone));
}
