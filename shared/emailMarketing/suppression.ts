import { isValidEmail, normalizeEmail, normalizePersonName } from "./contacts";
import type { MarketingContact, SuppressionEntry, SuppressionReason } from "./types";

export interface SuppressionDraft {
  kind: SuppressionEntry["kind"];
  value: string;
  reason: SuppressionReason;
  hold?: SuppressionEntry["hold"];
  note: string;
  aliases?: string[];
  email?: string;
  source?: SuppressionEntry["source"];
  names?: string[];
}

function entry(now: string, draft: SuppressionDraft): SuppressionEntry {
  const names = draft.names || [];
  const aliases = (draft.aliases || names).map((name) => normalizePersonName(name)).filter(Boolean);
  return {
    id: draft.kind === "email"
      ? `email:${normalizeEmail(draft.value)}`
      : draft.kind === "domain"
        ? `domain:${draft.value.replace(/^@/, "").toLowerCase()}`
        : `name:${normalizePersonName(draft.value)}`,
    kind: draft.kind,
    value: draft.kind === "email"
      ? normalizeEmail(draft.value)
      : draft.kind === "domain"
        ? draft.value.replace(/^@/, "").trim().toLowerCase()
        : normalizePersonName(draft.value),
    reason: draft.reason,
    hold: draft.hold || "",
    note: draft.note,
    aliases,
    email: normalizeEmail(draft.email || (draft.kind === "email" ? draft.value : "")),
    source: draft.source || "manual",
    createdAt: now,
    updatedAt: now,
  };
}

/** Cadi's standing blacklist and personal holds. Emails she still needs to type stay as name matches. */
export function seedSuppression(now: string): SuppressionEntry[] {
  const manual = "Standing blacklist. Add the email here when you have it. A matching customer name is already blocked.";
  return [
    entry(now, {
      kind: "domain",
      value: "thekinkteam.com",
      reason: "manual",
      note: "Standing blacklist: every @thekinkteam.com address.",
      source: "seed",
    }),
    entry(now, { kind: "name", value: "Bruce Kink", reason: "manual", note: manual, source: "seed", names: ["Bruce Kink"] }),
    entry(now, { kind: "name", value: "Lisa Cagle", reason: "manual", note: manual, source: "seed", names: ["Lisa Cagle"] }),
    entry(now, { kind: "name", value: "Haley Garcia", reason: "manual", note: manual, source: "seed", names: ["Haley Garcia"] }),
    entry(now, { kind: "name", value: "Shannon Cox", reason: "manual", note: manual, source: "seed", names: ["Shannon Cox"] }),
    entry(now, { kind: "name", value: "Melissa Franklin", reason: "manual", note: manual, source: "seed", names: ["Melissa Franklin"] }),
    entry(now, { kind: "name", value: "Justin McClung", reason: "manual", note: manual, source: "seed", names: ["Justin McClung"] }),
    entry(now, {
      kind: "name",
      value: "Rebecca Nye",
      reason: "manual",
      hold: "personal",
      note: "Personal hold. Cadi emails Rebecca herself.",
      source: "seed",
      names: ["Rebecca Nye"],
    }),
    entry(now, {
      kind: "name",
      value: "Jacalyn Henthorne",
      reason: "manual",
      hold: "personal",
      note: "Personal hold. Cadi emails Jacki (Jacalyn) Henthorne herself.",
      source: "seed",
      names: ["Jacki Henthorne", "Jacalyn Henthorne", "Jacki Jacalyn Henthorne"],
    }),
  ];
}

export function suppressionIdForEmail(email: string): string {
  return `email:${normalizeEmail(email)}`;
}

export function buildSuppression(now: string, draft: SuppressionDraft): SuppressionEntry | null {
  if (draft.kind === "email" && !isValidEmail(draft.value)) return null;
  if (draft.kind === "domain" && !draft.value.replace(/^@/, "").includes(".")) return null;
  if (draft.kind === "name" && !normalizePersonName(draft.value)) return null;
  return entry(now, draft);
}

export function matchSuppression(
  contact: Pick<MarketingContact, "email" | "firstName" | "lastName">,
  list: SuppressionEntry[],
): SuppressionEntry | null {
  const email = normalizeEmail(contact.email);
  const domain = email.split("@")[1] || "";
  const name = normalizePersonName(`${contact.firstName} ${contact.lastName}`);
  for (const item of list) {
    if (item.kind === "email" && item.value === email) return item;
    if (item.email && item.email === email) return item;
    if (item.kind === "domain" && domain === item.value) return item;
    if (item.kind === "name" && name && (name === item.value || item.aliases.includes(name))) return item;
  }
  return null;
}

export function reasonLabel(reason: SuppressionReason, hold: SuppressionEntry["hold"]): string {
  if (hold === "personal") return "Personal hold";
  if (reason === "bounced") return "Bounced";
  if (reason === "blocked") return "Blocked";
  if (reason === "unsubscribed") return "Unsubscribed";
  if (reason === "complained") return "Complained";
  return "Do not email";
}
