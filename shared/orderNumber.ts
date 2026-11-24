/** Short order number: #003, #004 … #1000. */
export function formatOrderNumber(n: number): string {
  if (!Number.isInteger(n) || n < 1) throw new Error(`Invalid order number ${n}`);
  return `#${String(n).padStart(3, "0")}`;
}

/** Values a return page or webhook may use for the same short order number. */
export function orderNumberLookupKeys(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 40) return [];
  const bare = trimmed.replace(/^#/, "");
  const keys = [trimmed];
  if (/^\d+$/.test(bare)) {
    const n = Number(bare);
    if (Number.isInteger(n) && n > 0 && n < 1_000_000) {
      keys.push(formatOrderNumber(n), bare, `#${bare}`);
    }
  }
  return [...new Set(keys)];
}

function labelText(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" ? value.trim() : "";
}

/** #003 from a counter value. Long ids and words are not sequential numbers. */
export function sequentialOrderLabel(value: unknown): string | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1) return formatOrderNumber(value);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const hashed = trimmed.match(/^#(\d+)$/);
  const digits = hashed ? hashed[1] : (/^\d+$/.test(trimmed) ? trimmed : "");
  if (!digits) return null;
  const n = Number(digits);
  if (!Number.isInteger(n) || n < 1) return null;
  return formatOrderNumber(n);
}

/**
 * Label shown on the orders desk. A sequential #003 wins.
 * `ORD - L - 10482` is shown as #10482. A raw document id becomes a stable
 * 4-digit code. Nothing here writes or changes the document id.
 */
export function compactOrderLabel(record: Record<string, unknown> | null | undefined): string {
  if (!record) return "";
  const sequential = sequentialOrderLabel(record.orderNumber);
  if (sequential) return sequential;
  const coded = [record.orderCode, record.displayId]
    .map(labelText)
    .find((value) => value && !/example/i.test(value)) || "";
  const wrapped = coded.match(/^ORD\s*-\s*[A-Z0-9]+\s*-\s*(\d{3,8})$/i);
  if (wrapped) {
    const digits = wrapped[1].replace(/^0+(?=\d)/, "");
    return `#${digits.padStart(3, "0")}`;
  }
  const source = labelText(record.id) || coded || labelText(record.orderNumber);
  if (!source) return "";
  const short = sequentialOrderLabel(source);
  if (short && source.length <= 8) return short;
  return `#${orderCodeTail(source).slice(-4)}`;
}

/**
 * Five-digit code for a Firestore id. Ids with at least five digits keep their
 * last five (unless that is all zeros); short or digit-poor ids, which used to
 * pad to "00000", get a stable 10000–99999 hash of the full id instead.
 */
export function orderCodeTail(id: string, salt = 0): string {
  const digits = id.replace(/\D/g, "");
  if (salt === 0 && digits.length >= 5) {
    const last = digits.slice(-5);
    if (!/^0+$/.test(last)) return last;
  }
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return String(10000 + ((h >>> 0) % 90000));
}
