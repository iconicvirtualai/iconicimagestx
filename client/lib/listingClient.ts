import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { choosePortalClient, type ClientCandidate } from "@shared/listingWrite";
import { nonEmptyId } from "@shared/orderProjectInvoice";
import { db } from "@/lib/firebase";
import { syncListingPair } from "@/lib/orderProjectInvoice";

function asCandidate(id: string, data: Record<string, unknown>): ClientCandidate {
  return {
    id,
    email: typeof data.email === "string" ? data.email : null,
    firebaseUid: typeof data.firebaseUid === "string" ? data.firebaseUid : null,
    portalAccess: typeof data.portalAccess === "boolean" ? data.portalAccess : null,
  };
}

/** Staff-side lookup. Prefers clients/{auth uid} when several docs share the email. */
export async function resolvePortalClientId(hint: {
  email?: string | null;
  clientId?: string | null;
}): Promise<string | null> {
  const email = (hint.email || "").trim().toLowerCase();
  const candidates: ClientCandidate[] = [];

  if (email) {
    const snap = await getDocs(query(collection(db, "clients"), where("email", "==", email)));
    snap.docs.forEach((entry) => candidates.push(asCandidate(entry.id, entry.data())));
  }

  if (hint.clientId && !candidates.some((client) => client.id === hint.clientId)) {
    const direct = await getDoc(doc(db, "clients", hint.clientId));
    if (direct.exists()) candidates.push(asCandidate(direct.id, direct.data()));
  }

  return choosePortalClient(candidates, { clientId: hint.clientId, email })?.id || hint.clientId || null;
}

/**
 * Point the order at the new listing. If that update fails, remove the listing
 * when the signed-in admin is allowed to, and always surface the failure.
 */
export async function linkOrderToListing(input: {
  orderRequestId: string;
  listingId: string;
  clientId?: string | null;
  clientEmail?: string | null;
  orderId?: string | null;
  invoiceId?: string | null;
}): Promise<void> {
  const patch: Record<string, unknown> = {
    listingId: input.listingId,
    updatedAt: serverTimestamp(),
  };
  if (input.clientId) patch.clientId = input.clientId;
  const email = (input.clientEmail || "").trim().toLowerCase();
  if (email) patch.clientEmail = email;
  const orderId = nonEmptyId(input.orderId);
  const invoiceId = nonEmptyId(input.invoiceId);
  if (orderId) patch.orderId = orderId;
  if (invoiceId) patch.invoiceId = invoiceId;

  try {
    await updateDoc(doc(db, "orderRequests", input.orderRequestId), patch);
  } catch (err) {
    let removed = false;
    try {
      await deleteDoc(doc(db, "listings", input.listingId));
      removed = true;
    } catch {
      removed = false;
    }
    const detail = err instanceof Error ? err.message : "Could not update the order.";
    if (removed) {
      throw new Error(`Project could not be linked to this order, so the new project was removed. ${detail}`);
    }
    throw new Error(
      `Project ${input.listingId} was created but could not be linked to this order. Open it from Projects and attach it, or delete that extra project. ${detail}`,
    );
  }

  try {
    await syncListingPair({
      orderRequestId: input.orderRequestId,
      listingId: input.listingId,
      orderId,
      invoiceId,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Could not finish the invoice link.";
    throw new Error(`Project is linked to this order. Open it and use Manage Invoice to finish the shared invoice. ${detail}`);
  }
}
