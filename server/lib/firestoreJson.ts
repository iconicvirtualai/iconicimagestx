/** Convert Firestore values into JSON-safe data for API responses. */
export function jsonSafe<T = unknown>(value: T): T {
  if (value == null) return value;
  if (typeof value === "object" && value && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    try {
      return (value as unknown as { toDate: () => Date }).toDate().toISOString() as T;
    } catch {
      return null as T;
    }
  }
  if (Array.isArray(value)) return value.map((item) => jsonSafe(item)) as T;
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = jsonSafe(nested);
    }
    return out as T;
  }
  return value;
}
