/** Shared helpers for the admin client list and client account. */

import { recordAddressText } from "@shared/addressText";

export interface ClientSocial {
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  website?: string;
}

export interface ClientPresentation {
  goal?: string;
  audience?: string;
  talkingPoints?: string;
}

export interface ClientRecord {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  address?: string;
  status?: string;
  tags?: string[];
  group?: string;
  notes?: string;
  totalOrders?: number;
  totalSpend?: number;
  portalAccess?: boolean;
  social?: ClientSocial;
  marketingNotes?: string;
  conciergeStatus?: string;
  conciergeNotes?: string;
  presentation?: ClientPresentation;
  taxNotes?: string;
}

export function clientName(client: Pick<ClientRecord, "firstName" | "lastName" | "email">): string {
  const name = `${client.firstName || ""} ${client.lastName || ""}`.trim();
  return name || client.email || "Unnamed client";
}

export function clientInitials(client: Pick<ClientRecord, "firstName" | "lastName" | "email">): string {
  const parts = clientName(client).split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] || "?") + (parts[1]?.[0] || "");
}

export function normEmail(value?: string | null): string {
  return (value || "").trim().toLowerCase();
}

export function asTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((tag) => String(tag).trim()).filter(Boolean);
}

/** Match orders, listings, and invoices to a client by id or email only. */
export function belongsToClient(record: any, client: Pick<ClientRecord, "id" | "email">): boolean {
  if (!record) return false;
  if (record.clientId && record.clientId === client.id) return true;
  const mine = normEmail(client.email);
  if (!mine) return false;
  const emails = [record.email, record.clientEmail].map((value) => normEmail(value)).filter(Boolean);
  return emails.includes(mine);
}

export function money(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

export function formatMoney(value: unknown): string {
  const amount = money(value);
  if (amount === null) return "—";
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function formatWhen(value: any): string {
  if (!value) return "—";
  try {
    const date = value.toDate ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "—";
  }
}

export function recordAddress(record: any): string {
  return recordAddressText(record) || "—";
}
