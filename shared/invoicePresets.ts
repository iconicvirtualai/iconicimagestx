/**
 * Staff-editable invoice presets.
 * A preset is a flat dollar amount or a percent of the service subtotal.
 * Nothing in this module charges a client or talks to Square.
 */

export const INVOICE_PRESET_KINDS = ["processing", "fees", "travel", "tax", "promotions"] as const;
export type InvoicePresetKind = (typeof INVOICE_PRESET_KINDS)[number];
export type InvoicePresetMode = "flat" | "percent";

export const INVOICE_PRESET_KIND_LABELS: Record<InvoicePresetKind, string> = {
  processing: "Processing",
  fees: "Fees",
  travel: "Travel",
  tax: "Tax",
  promotions: "Promotions",
};

export interface InvoicePreset {
  id: string;
  kind: InvoicePresetKind;
  name: string;
  mode: InvoicePresetMode;
  /** Dollars when mode is flat. Percent points when mode is percent (8 means 8%). */
  amount: number;
  active: boolean;
  sortOrder: number;
}

export interface InvoicePresetDraft {
  kind: InvoicePresetKind;
  name: string;
  mode: InvoicePresetMode;
  amount: number;
  active?: boolean;
  sortOrder?: number;
}

const KINDS = new Set<string>(INVOICE_PRESET_KINDS);
const MODES = new Set<string>(["flat", "percent"]);

export function roundInvoiceMoney(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100) / 100;
}

/** Dollar amount a preset writes into an invoice field. Percent uses the service subtotal. */
export function presetFilledAmount(
  preset: Pick<InvoicePreset, "mode" | "amount">,
  subtotal: number,
): number {
  const magnitude = Math.abs(roundInvoiceMoney(preset.amount));
  if (preset.mode === "percent") {
    const base = Math.max(0, roundInvoiceMoney(subtotal));
    return roundInvoiceMoney((base * magnitude) / 100);
  }
  return magnitude;
}

export function parseInvoicePreset(id: string, data: Record<string, unknown> | null | undefined): InvoicePreset | null {
  const docId = id.trim();
  if (!docId || !data) return null;
  const kind = typeof data.kind === "string" ? data.kind.trim() : "";
  const mode = typeof data.mode === "string" ? data.mode.trim() : "";
  const name = typeof data.name === "string" ? data.name.trim() : "";
  if (!KINDS.has(kind) || !MODES.has(mode) || !name) return null;
  const amount = Number(data.amount);
  if (!Number.isFinite(amount)) return null;
  const sortOrder = Number(data.sortOrder);
  return {
    id: docId,
    kind: kind as InvoicePresetKind,
    name,
    mode: mode as InvoicePresetMode,
    amount: Math.abs(roundInvoiceMoney(amount)),
    active: data.active !== false,
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
  };
}

export function invoicePresetWrite(draft: InvoicePresetDraft): Omit<InvoicePreset, "id"> | null {
  const name = draft.name.trim();
  if (!KINDS.has(draft.kind) || !MODES.has(draft.mode) || !name) return null;
  const amount = Number(draft.amount);
  if (!Number.isFinite(amount)) return null;
  return {
    kind: draft.kind,
    name,
    mode: draft.mode,
    amount: Math.abs(roundInvoiceMoney(amount)),
    active: draft.active !== false,
    sortOrder: Number.isFinite(Number(draft.sortOrder)) ? Number(draft.sortOrder) : Date.now(),
  };
}

export function presetsForKind(presets: InvoicePreset[], kind: InvoicePresetKind): InvoicePreset[] {
  return presets
    .filter((preset) => preset.kind === kind)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function presetOptionLabel(preset: InvoicePreset): string {
  const value = preset.mode === "percent"
    ? `${roundInvoiceMoney(preset.amount)}%`
    : roundInvoiceMoney(preset.amount).toLocaleString("en-US", { style: "currency", currency: "USD" });
  return `${preset.name} · ${value}`;
}
