const CHICAGO = "America/Chicago";

export function dayPart(date = new Date(), timeZone = CHICAGO): "Morning" | "Afternoon" | "Evening" {
  const raw = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(date);
  const hour = Number(raw) % 24;
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}

/** Clock time in America/Chicago for a calendar day plus a "5:30 PM" label. */
export function chicagoInstant(dateKey: string, timeLabel: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const match = timeLabel.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  let hour = match ? Number(match[1]) : 9;
  const minute = match ? Number(match[2] || 0) : 0;
  const meridian = (match?.[3] || "").toLowerCase();
  if (meridian === "pm" && hour < 12) hour += 12;
  if (meridian === "am" && hour === 12) hour = 0;
  const [year, month, day] = dateKey.split("-").map(Number);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: CHICAGO,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(utcGuess).map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return new Date(utcGuess.getTime() - (asUtc - utcGuess.getTime()));
}

export function countdownParts(target: Date, now = new Date()): { days: number; hours: number } | null {
  const ms = target.getTime() - now.getTime();
  if (ms <= 0) return { days: 0, hours: 0 };
  const hoursTotal = Math.floor(ms / 3_600_000);
  return { days: Math.floor(hoursTotal / 24), hours: hoursTotal % 24 };
}
