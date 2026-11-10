/** Short order number: #003, #004 … #1000. */
export function formatOrderNumber(n: number): string {
  if (!Number.isInteger(n) || n < 1) throw new Error(`Invalid order number ${n}`);
  return `#${String(n).padStart(3, "0")}`;
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
