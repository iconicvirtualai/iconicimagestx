/**
 * QA and playtest logins stay out of real photographer and staff assignment.
 * A record is QA staff when qaOnly or playtest is exactly true.
 */

import { isDeliveryQaClient, type DeliveryQaClientRecord } from "./deliveryQaClient.ts";
import { isPlaytestDoc } from "./lockImpact.ts";

export interface QaStaffRecord {
  id?: unknown;
  qaOnly?: unknown;
  playtest?: unknown;
  name?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  phone?: unknown;
  role?: unknown;
  googleCalendarId?: unknown;
  calendarId?: unknown;
  calendarEmail?: unknown;
}

export interface QaAssignmentRecord {
  id?: unknown;
  playtest?: unknown;
  linkedClientId?: unknown;
  clientId?: unknown;
  email?: unknown;
  clientEmail?: unknown;
  client?: DeliveryQaClientRecord | null;
}

export const QA_STAFF_ASSIGN_ERROR = "QA test accounts cannot be assigned to a real order.";

/** True for staff marked qaOnly or playtest, including a coordinator login such as "QA TEST Do Not Assign". */
export function isQaStaff(staff: QaStaffRecord | null | undefined): boolean {
  if (!staff) return false;
  return staff.qaOnly === true || staff.playtest === true;
}

/**
 * Staff that may be picked for this assignment.
 * QA staff stay in the list only when the order or listing is a playtest record.
 */
export function filterAssignableStaff<T extends QaStaffRecord>(
  list: readonly T[] | null | undefined,
  options: { forPlaytest?: boolean } = {},
): T[] {
  const people = Array.isArray(list) ? [...list] : [];
  if (options.forPlaytest) return people;
  return people.filter((person) => !isQaStaff(person));
}

/** Playtest orders, playtest listings, and the delivery QA client may take a QA login. */
export function recordAllowsQaStaff(record: QaAssignmentRecord | null | undefined): boolean {
  if (!record) return false;
  if (isPlaytestDoc(record)) return true;
  if (isDeliveryQaClient(record)) return true;
  if (isDeliveryQaClient({
    playtest: record.playtest,
    linkedClientId: record.linkedClientId ?? record.clientId,
    email: record.email ?? record.clientEmail,
  })) return true;
  if (record.client && isDeliveryQaClient(record.client)) return true;
  return false;
}

export function qaStaffAssignmentError(
  staff: readonly (QaStaffRecord | null | undefined)[] | null | undefined,
  record: QaAssignmentRecord | null | undefined,
): string | null {
  if (recordAllowsQaStaff(record)) return null;
  const people = Array.isArray(staff) ? staff : [];
  return people.some((person) => isQaStaff(person)) ? QA_STAFF_ASSIGN_ERROR : null;
}

function matchKey(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/** Names, emails, and ids that must not count as real shooters. */
export function qaStaffMatchKeys(staff: readonly QaStaffRecord[] | null | undefined): Set<string> {
  const keys = new Set<string>();
  for (const person of staff || []) {
    if (!isQaStaff(person)) continue;
    const first = typeof person.firstName === "string" ? person.firstName.trim() : "";
    const last = typeof person.lastName === "string" ? person.lastName.trim() : "";
    for (const value of [
      person.id,
      person.name,
      person.email,
      person.googleCalendarId,
      person.calendarId,
      person.calendarEmail,
      `${first} ${last}`.trim(),
    ]) {
      const key = matchKey(value);
      if (key) keys.add(key);
    }
  }
  return keys;
}

/** Drop QA staff from shooter counts, utilization names, and team leaderboards. */
export function assigneeNamesForOps(
  names: readonly string[] | null | undefined,
  staff: readonly QaStaffRecord[] | null | undefined,
): string[] {
  const hidden = qaStaffMatchKeys(staff);
  return (names || []).filter((name) => {
    const key = matchKey(name);
    return Boolean(key) && !hidden.has(key);
  });
}

function phoneKey(value: unknown): string {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

export function qaStaffMatchingPhone(
  staff: readonly QaStaffRecord[] | null | undefined,
  phone: unknown,
): QaStaffRecord | null {
  const key = phoneKey(phone);
  if (!key) return null;
  return (staff || []).find((person) => isQaStaff(person) && phoneKey(person.phone) === key) || null;
}
