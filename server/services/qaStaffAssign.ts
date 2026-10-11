/**
 * Server refusal for assigning a QA or playtest login to a real order.
 * Call this before any write, calendar insert, assignment email, or photographer SMS.
 */

import admin from "firebase-admin";
import {
  QA_STAFF_ASSIGN_ERROR,
  qaStaffAssignmentError,
  qaStaffMatchingPhone,
  recordAllowsQaStaff,
  type QaAssignmentRecord,
  type QaStaffRecord,
} from "../../shared/qaStaff";

export interface QaAssignRefusal {
  status: 400;
  error: string;
}

export type StaffById = (id: string) => Promise<QaStaffRecord | null>;

async function defaultStaffById(id: string): Promise<QaStaffRecord | null> {
  const snap = await admin.firestore().collection("staff").doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as QaStaffRecord) };
}

function refusal(error: string | null): QaAssignRefusal | null {
  return error ? { status: 400, error } : null;
}

/**
 * Reject QA staff on a non-playtest order, booking, listing, or schedule slot.
 * Playtest records are allowed. Missing staff ids are not treated as QA.
 */
export async function refuseQaStaffAssignment(
  input: {
    staffIds?: readonly (string | null | undefined)[];
    staff?: readonly (QaStaffRecord | null | undefined)[];
    record: QaAssignmentRecord | null | undefined;
  },
  loadStaff: StaffById = defaultStaffById,
): Promise<QaAssignRefusal | null> {
  if (recordAllowsQaStaff(input.record)) return null;

  const provided = (input.staff || []).filter((person): person is QaStaffRecord => Boolean(person));
  const ids = [...new Set(
    (input.staffIds || [])
      .map((id) => (typeof id === "string" ? id.trim() : ""))
      .filter(Boolean),
  )];
  const loaded = ids.length > 0
    ? (await Promise.all(ids.map((id) => loadStaff(id)))).filter((person): person is QaStaffRecord => Boolean(person))
    : [];

  return refusal(qaStaffAssignmentError([...provided, ...loaded], input.record));
}

/** Masked photographer SMS. A QA phone on a real order is the same refusal as an assignment. */
export function refuseQaStaffPhone(
  input: {
    photographerPhone: unknown;
    staff: readonly QaStaffRecord[] | null | undefined;
    record: QaAssignmentRecord | null | undefined;
  },
): QaAssignRefusal | null {
  const match = qaStaffMatchingPhone(input.staff, input.photographerPhone);
  if (!match) return null;
  return refusal(qaStaffAssignmentError([match], input.record));
}

export { QA_STAFF_ASSIGN_ERROR };
