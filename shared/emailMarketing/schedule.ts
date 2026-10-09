/** GMass sendTime is "MM/DD/YYYY HH:MM ±HH:MM" using the account send zone. Iconic uses America/Chicago. */
export function gmassSendTime(localDateTime: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(localDateTime.trim());
  if (!match) throw new Error("Choose a date and time.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  for (const offsetHours of [-5, -6]) {
    const utc = new Date(wall - offsetHours * 3_600_000);
    const parts = chicagoParts(utc);
    if (parts.year === year && parts.month === month && parts.day === day && parts.hour === hour && parts.minute === minute) {
      const sign = offsetHours < 0 ? "-" : "+";
      return `${match[2]}/${match[3]}/${match[1]} ${match[4]}:${match[5]} ${sign}${String(Math.abs(offsetHours)).padStart(2, "0")}:00`;
    }
  }
  throw new Error("That Chicago time is not valid.");
}

function chicagoParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value || "0");
  return { year: read("year"), month: read("month"), day: read("day"), hour: read("hour"), minute: read("minute") };
}

export function chicagoLocalToIso(localDateTime: string): string {
  const formatted = gmassSendTime(localDateTime);
  const match = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}) ([+-]\d{2}):(\d{2})$/.exec(formatted);
  if (!match) throw new Error("Could not read the Chicago time.");
  const [, month, day, year, hour, minute, offset] = match;
  const sign = offset.startsWith("-") ? -1 : 1;
  const hours = Number(offset.slice(1, 3));
  const utc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)) - sign * hours * 3_600_000;
  return new Date(utc).toISOString();
}
