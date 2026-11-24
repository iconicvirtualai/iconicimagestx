/**
 * Which stored client ids belong to a different person.
 * A missing client document is stale or unknown, so the caller can still
 * match that row by email. This does not write Firestore.
 */

import { foreignIdCandidates, knownClientIds } from "../../shared/clientLink";

export async function otherKnownClientIds(
  db: FirebaseFirestore.Firestore,
  records: Array<{ clientId?: unknown; firebaseUid?: unknown; clientProfileId?: unknown }>,
  identityIds: readonly string[],
): Promise<string[]> {
  const candidates = foreignIdCandidates(records, identityIds).slice(0, 40);
  const docs: Array<{ id: string; firebaseUid?: unknown }> = [];
  await Promise.all(candidates.map(async (id) => {
    const direct = await db.collection("clients").doc(id).get();
    if (direct.exists) {
      docs.push({ id: direct.id, firebaseUid: direct.data()?.firebaseUid });
      return;
    }
    const byUid = await db.collection("clients").where("firebaseUid", "==", id).limit(1).get();
    const hit = byUid.docs[0];
    if (hit) docs.push({ id: hit.id, firebaseUid: hit.data()?.firebaseUid });
  }));
  return knownClientIds(docs, identityIds);
}
