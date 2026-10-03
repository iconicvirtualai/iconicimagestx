/**
 * Iconic Images — Clients Routes
 * CRM: client database management.
 * Place at: server/routes/clients.ts
 */

import { Router } from "express";
import admin from "firebase-admin";
import { requireCoordinator, requireStaff, requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { cleanPersonName, normalizeEmail } from "../../shared/listingAccess";
import { visibleToPortalClient } from "../../shared/listingWrite";
import {
  addressText,
  buildClientAppointment,
  buildClientInvoice,
  buildClientListing,
  sortNewestFirst,
} from "../../shared/clientHome";
import { resolveClientIdentity, upsertPortalClient } from "../services/clientAccounts";
import { jsonSafe } from "../lib/firestoreJson";
import { handleGetPortalListing, handlePatchPortalMedia, handlePatchPortalWebsite } from "./portalListing";

const router = Router();
const db = () => admin.firestore();
const HOME_LIMIT = 100;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

// GET /api/clients — list (staff only)
router.get("/", requireStaff, async (req, res) => {
  try {
    const { status, search, limit = "50" } = req.query;
    let query = db().collection("clients").orderBy("createdAt", "desc");
    if (status) query = query.where("status", "==", status) as typeof query;

    const snapshot = await query.limit(Number(limit)).get();
    let clients = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Simple search filter (client-side for now)
    if (search) {
      const s = (search as string).toLowerCase();
      clients = clients.filter((c: Record<string, unknown>) => {
        const name = `${c.firstName} ${c.lastName}`.toLowerCase();
        const email = ((c.email as string) || "").toLowerCase();
        return name.includes(s) || email.includes(s);
      });
    }

    return res.json(clients);
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch clients." });
  }
});

function adminReady(res: { status: (code: number) => { json: (body: unknown) => unknown } }) {
  if (admin.apps.length) return true;
  res.status(503).json({
    error: "Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT.",
  });
  return false;
}

// POST /api/clients/register — public client portal signup (never creates staff)
router.post("/register", async (req, res) => {
  if (!adminReady(res)) return;
  const firstName = cleanPersonName(req.body?.firstName);
  const lastName = cleanPersonName(req.body?.lastName);
  const phone = String(req.body?.phone || "").trim().slice(0, 40);
  if (!firstName || !lastName) {
    return res.status(400).json({ error: "First and last name are required." });
  }

  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const decoded = await admin.auth().verifyIdToken(authHeader.slice("Bearer ".length));
      const staffDoc = await db().collection("staff").doc(decoded.uid).get();
      if (staffDoc.exists && staffDoc.data()?.isActive !== false) {
        return res.status(403).json({ error: "Staff accounts cannot register as clients." });
      }
      const email = normalizeEmail(decoded.email || req.body?.email);
      if (!email) return res.status(400).json({ error: "A valid email is required." });
      const result = await upsertPortalClient({ uid: decoded.uid, email, firstName, lastName, phone });
      return res.status(201).json(result);
    }

    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");
    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "A valid email is required." });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }

    const staffHit = await db().collection("staff").where("email", "==", email).limit(1).get();
    if (!staffHit.empty) {
      return res.status(403).json({ error: "This email is a staff login. Use the staff sign-in page." });
    }

    let userRecord: admin.auth.UserRecord;
    try {
      userRecord = await admin.auth().createUser({
        email,
        password,
        displayName: `${firstName} ${lastName}`,
      });
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === "auth/email-already-exists") {
        return res.status(409).json({ error: "An account with this email already exists. Sign in instead." });
      }
      if (code === "auth/invalid-password" || code === "auth/weak-password") {
        return res.status(400).json({ error: "Password must be at least 6 characters." });
      }
      throw err;
    }

    try {
      const result = await upsertPortalClient({ uid: userRecord.uid, email, firstName, lastName, phone });
      return res.status(201).json(result);
    } catch (err) {
      await admin.auth().deleteUser(userRecord.uid).catch(() => undefined);
      throw err;
    }
  } catch (err) {
    console.error("[Clients] Register error:", err);
    return res.status(500).json({ error: "Could not create the client account." });
  }
});

// GET /api/clients/me/home — listings, invoices, and appointments for the signed-in client
router.get("/me/home", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!adminReady(res)) return;
  try {
    const identity = await resolveClientIdentity(req.user!.uid, req.user!.email);
    if (!identity.profile) {
      return res.status(404).json({ error: "Client profile not found." });
    }

    const galleries: Record<string, unknown>[] = [];
    const invoices: ReturnType<typeof buildClientInvoice>[] = [];
    const projects: ReturnType<typeof buildClientListing>[] = [];
    const appointmentDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    let listingsTruncated = false;
    let invoicesTruncated = false;
    let appointmentsTruncated = false;
    const seenGallery = new Set<string>();
    const seenInvoice = new Set<string>();
    const seenProject = new Set<string>();
    const seenAppointment = new Set<string>();
    const pushAppointment = (entry: FirebaseFirestore.QueryDocumentSnapshot) => {
      if (seenAppointment.has(entry.id)) return;
      seenAppointment.add(entry.id);
      appointmentDocs.push(entry);
    };
    const pushInvoice = (entry: FirebaseFirestore.QueryDocumentSnapshot) => {
      if (seenInvoice.has(entry.id)) return;
      seenInvoice.add(entry.id);
      invoices.push(buildClientInvoice(entry.id, asRecord(jsonSafe(entry.data()))));
    };
    const pushListing = (entry: FirebaseFirestore.QueryDocumentSnapshot) => {
      if (seenProject.has(entry.id)) return;
      seenProject.add(entry.id);
      projects.push(buildClientListing(entry.id, asRecord(jsonSafe(entry.data()))));
    };

    for (const clientId of identity.ids) {
      const [gallerySnap, invoiceSnap, projectSnap] = await Promise.all([
        db().collection("galleries").where("clientId", "==", clientId).limit(HOME_LIMIT).get(),
        db().collection("invoices").where("clientId", "==", clientId).limit(HOME_LIMIT).get(),
        db().collection("listings").where("clientId", "==", clientId).limit(HOME_LIMIT).get(),
      ]);
      for (const doc of gallerySnap.docs) {
        if (seenGallery.has(doc.id)) continue;
        seenGallery.add(doc.id);
        const data = doc.data();
        galleries.push({
          id: doc.id,
          title: data.title || addressText(data.address) || "Gallery",
          address: addressText(data.address),
          status: data.status || "pending_upload",
          href: `/gallery/${doc.id}`,
        });
      }
      if (invoiceSnap.size >= HOME_LIMIT) invoicesTruncated = true;
      invoiceSnap.docs.forEach(pushInvoice);
      if (projectSnap.size >= HOME_LIMIT) listingsTruncated = true;
      projectSnap.docs.forEach(pushListing);

      try {
        const appointmentSnap = await db().collection("appointments").where("clientId", "==", clientId).limit(HOME_LIMIT).get();
        if (appointmentSnap.size >= HOME_LIMIT) appointmentsTruncated = true;
        appointmentSnap.docs.forEach(pushAppointment);
      } catch (appointmentErr) {
        console.error("[Clients] Appointment lookup failed:", appointmentErr);
      }
    }

    const orders: Record<string, unknown>[] = [];
    const seenOrder = new Set<string>();
    const pushOrder = (entry: FirebaseFirestore.QueryDocumentSnapshot) => {
      if (seenOrder.has(entry.id)) return;
      const data = entry.data();
      if (!visibleToPortalClient(
        { clientId: data.clientId, email: data.email, clientEmail: data.clientEmail },
        { ids: identity.ids, email: identity.email },
      )) return;
      seenOrder.add(entry.id);
      const listingId = typeof data.listingId === "string" ? data.listingId : "";
      orders.push({
        id: entry.id,
        address: addressText(data.address || data.shootLocation) || "Order",
        status: data.status || "new",
        href: listingId ? `/studio/${listingId}` : "",
      });
    };
    try {
      for (const clientId of identity.ids) {
        const snap = await db().collection("orderRequests").where("clientId", "==", clientId).limit(HOME_LIMIT).get();
        snap.docs.forEach(pushOrder);
      }
      if (identity.email) {
        const [byEmail, byClientEmail] = await Promise.all([
          db().collection("orderRequests").where("email", "==", identity.email).limit(HOME_LIMIT).get(),
          db().collection("orderRequests").where("clientEmail", "==", identity.email).limit(HOME_LIMIT).get(),
        ]);
        byEmail.docs.forEach(pushOrder);
        byClientEmail.docs.forEach(pushOrder);
      }
    } catch (orderErr) {
      console.error("[Clients] Order lookup failed:", orderErr);
    }

    if (identity.email) {
      try {
        const byInvoiceEmail = await db().collection("invoices").where("clientEmail", "==", identity.email).limit(HOME_LIMIT).get();
        if (byInvoiceEmail.size >= HOME_LIMIT) invoicesTruncated = true;
        byInvoiceEmail.docs.forEach(pushInvoice);
      } catch (invoiceErr) {
        console.error("[Clients] Invoice email lookup failed:", invoiceErr);
      }
    }

    if (identity.email) {
      try {
        const appointmentsByEmail = await db().collection("appointments").where("clientEmail", "==", identity.email).limit(HOME_LIMIT).get();
        if (appointmentsByEmail.size >= HOME_LIMIT) appointmentsTruncated = true;
        appointmentsByEmail.docs.forEach(pushAppointment);
      } catch (appointmentErr) {
        console.error("[Clients] Appointment email lookup failed:", appointmentErr);
      }

      const byEmail = await db().collection("listings").where("clientEmail", "==", identity.email).limit(HOME_LIMIT).get();
      if (byEmail.size >= HOME_LIMIT) listingsTruncated = true;
      byEmail.docs.forEach(pushListing);
    }

    const requestIds = appointmentDocs
      .map((entry) => entry.data().orderRequestId)
      .filter((id): id is string => typeof id === "string" && id.trim().length > 0);
    const orderRequests = await orderRequestsById(requestIds);
    const appointments = appointmentDocs.map((entry) => {
      const data = asRecord(jsonSafe(entry.data()));
      const orderRequestId = typeof data.orderRequestId === "string" ? data.orderRequestId : "";
      return buildClientAppointment(entry.id, data, orderRequests.get(orderRequestId) || null);
    });
    const listings = sortNewestFirst(projects);
    const invoiceRows = sortNewestFirst(invoices);

    return res.json({
      profile: jsonSafe(identity.profile),
      appointments,
      orders,
      galleries,
      invoices: invoiceRows,
      listings,
      projects: listings,
      listingsTruncated,
      invoicesTruncated,
      appointmentsTruncated,
    });
  } catch (err) {
    console.error("[Clients] Home error:", err);
    return res.status(500).json({ error: "Failed to load your portal." });
  }
});

// GET /api/clients/me/listings/:id — listing file inside the client portal
router.get("/me/listings/:id", requireAuth, handleGetPortalListing);
router.patch("/me/listings/:id/media", requireAuth, handlePatchPortalMedia);
router.patch("/me/listings/:id/website", requireAuth, handlePatchPortalWebsite);

// GET /api/clients/me — client gets their own profile
router.get("/me", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    // Try direct UID lookup first
    const directDoc = await db().collection("clients").doc(req.user!.uid).get();
    if (directDoc.exists) {
      const data = directDoc.data()!;
      // Handle redirect pointer
      if (data._redirect) {
        const realDoc = await db().collection("clients").doc(data._redirect).get();
        if (realDoc.exists) return res.json({ id: realDoc.id, ...realDoc.data() });
      }
      return res.json({ id: directDoc.id, ...data });
    }

    return res.status(404).json({ error: "Client profile not found." });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch profile." });
  }
});

// GET /api/clients/:id
router.get("/:id", requireStaff, async (req, res) => {
  try {
    const doc = await db().collection("clients").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: "Client not found." });

    const [orders, invoices] = await Promise.all([
      db().collection("orders").where("clientId", "==", req.params.id)
        .orderBy("createdAt", "desc").limit(10).get(),
      db().collection("invoices").where("clientId", "==", req.params.id)
        .orderBy("createdAt", "desc").limit(10).get(),
    ]);

    return res.json({
      client: { id: doc.id, ...doc.data() },
      orders: orders.docs.map((d) => ({ id: d.id, ...d.data() })),
      invoices: invoices.docs.map((d) => ({ id: d.id, ...d.data() })),
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch client." });
  }
});

// POST /api/clients — create client manually
router.post("/", requireCoordinator, async (req, res) => {
  try {
    const { firstName, lastName, email, phone, address, notes, tags } = req.body;
    if (!firstName || !lastName || !email) {
      return res.status(400).json({ error: "firstName, lastName, and email required." });
    }

    const existing = await db().collection("clients")
      .where("email", "==", email.toLowerCase()).limit(1).get();
    if (!existing.empty) {
      return res.status(409).json({ error: "Client with this email already exists.", id: existing.docs[0].id });
    }

    const ref = await db().collection("clients").add({
      firstName, lastName,
      email: email.toLowerCase().trim(),
      phone: phone || "",
      address: address || "",
      totalOrders: 0, totalSpend: 0,
      status: "active", portalAccess: false,
      notes: notes || "", tags: tags || [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(201).json({ id: ref.id });
  } catch (err) {
    return res.status(500).json({ error: "Failed to create client." });
  }
});

// PATCH /api/clients/:id
router.patch("/:id", requireCoordinator, async (req, res) => {
  try {
    const allowed = ["firstName","lastName","phone","address","status","notes","tags","company"];
    const updates: Record<string, unknown> = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    allowed.forEach((k) => { if (k in req.body) updates[k] = req.body[k]; });
    await db().collection("clients").doc(req.params.id).update(updates);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to update client." });
  }
});

async function orderRequestsById(ids: string[]): Promise<Map<string, Record<string, unknown>>> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))].slice(0, HOME_LIMIT);
  const map = new Map<string, Record<string, unknown>>();
  if (unique.length === 0) return map;
  try {
    const snaps = await db().getAll(...unique.map((id) => db().collection("orderRequests").doc(id)));
    snaps.forEach((snap) => {
      if (!snap.exists) return;
      map.set(snap.id, asRecord(jsonSafe(snap.data() || {})));
    });
  } catch (err) {
    console.error("[Clients] Order request schedule lookup failed:", err);
  }
  return map;
}

export default router;
