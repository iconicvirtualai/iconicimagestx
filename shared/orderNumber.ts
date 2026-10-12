/** Short order number: #003, #004 … #1000. */
export function formatOrderNumber(n: number): string {
  if (!Number.isInteger(n) || n < 1) throw new Error(`Invalid order number ${n}`);
  return `#${String(n).padStart(3, "0")}`;
}
