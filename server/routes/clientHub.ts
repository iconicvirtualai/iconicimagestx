/**
 * Client hub settings API. Mounted before /api/clients so /me/hub does not
 * fall through to the staff client record route.
 */

import { Router } from "express";
import admin from "firebase-admin";
import { contactsToCsv, containsRawCard, parseContactsCsv, sanitizeBilling } from "../../shared/clientHubSettings";
import { requireAuth, requireCoordinator, type AuthenticatedRequest } from "../middleware/auth";
import { saveSquareCardOnFile } from "../services/clientHubCard";
import { addClientFile, listClientFiles, readClientFile } from "../services/clientFiles";
import {
  HubError,
  addTeamMember,
  deleteContact,
  getBilling,
  getProfile,
  getStaffBilling,
  getTeam,
  importContacts,
  listContacts,
  loadActor,
  readClientHubMemory,
  removeTeamMember,
  saveBilling,
  saveCard,
  saveContact,
  readProfileMedia,
  saveProfile,
  saveProfileAsset,
  saveStaffCard,
  saveStaffProfileAsset,
  saveTeam,
  sendTeamInvite,
  updateTeamMember,
} from "../services/clientHubStore";

const router = Router();

function guard(handler: (req: AuthenticatedRequest, res: import("express").Response) => Promise<unknown>) {
  return async (req: AuthenticatedRequest, res: import("express").Response) => {
    try {
      await handler(req, res);
    } catch (err) {
      if (err instanceof HubError) return res.status(err.status).json({ error: err.message });
      console.error("[Client hub]", err);
      return res.status(500).json({ error: "Settings could not be saved." });
    }
  };
}

function testClient(req: AuthenticatedRequest): boolean {
  return process.env.CLIENT_HUB_TEST_AUTH === "1" && typeof req.headers["x-client-hub-uid"] === "string";
}

function testStaff(req: AuthenticatedRequest): boolean {
  return process.env.CLIENT_HUB_TEST_AUTH === "1" && typeof req.headers["x-staff-uid"] === "string";
}

router.use((req: AuthenticatedRequest, res, next) => {
  const clientPath = req.path.startsWith("/me/hub") || req.path.startsWith("/me/files");
  if (clientPath && testClient(req)) {
    req.user = {
      uid: String(req.headers["x-client-hub-uid"]),
      email: typeof req.headers["x-client-hub-email"] === "string" ? req.headers["x-client-hub-email"] : "",
    } as admin.auth.DecodedIdToken;
    return next();
  }
  if (!clientPath) return next();
  return requireAuth(req, res, next);
});

function coordinatorOrTest(req: AuthenticatedRequest, res: import("express").Response, next: import("express").NextFunction) {
  if (testStaff(req)) {
    req.user = {
      uid: String(req.headers["x-staff-uid"]),
      email: "staff@example.com",
    } as admin.auth.DecodedIdToken;
    return next();
  }
  return requireCoordinator(req, res, next);
}

router.get("/profile-media/:token", async (req, res) => {
  try {
    const media = await readProfileMedia(String(req.params.token || ""));
    if (!media) return res.status(404).end();
    res.setHeader("Content-Type", media.contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.send(media.bytes);
  } catch (err) {
    console.error("[Client hub] Profile media", err);
    return res.status(404).end();
  }
});

router.get("/me/hub/profile", guard(async (req, res) => {
  if (!req.user) throw new HubError(401, "Sign in to open settings.");
  res.json(await getProfile(await loadActor(req.user.uid, req.user.email || "")));
}));

router.patch("/me/hub/profile", guard(async (req, res) => {
  if (!req.user) throw new HubError(401, "Sign in to open settings.");
  res.json(await saveProfile(await loadActor(req.user.uid, req.user.email || ""), req.body));
}));

router.post("/me/hub/profile/asset", guard(async (req, res) => {
  if (!req.user) throw new HubError(401, "Sign in to open settings.");
  const kind = typeof req.body?.kind === "string" ? req.body.kind : "";
  const dataUrl = typeof req.body?.dataUrl === "string" ? req.body.dataUrl : "";
  res.json(await saveProfileAsset(await loadActor(req.user.uid, req.user.email || ""), kind, dataUrl));
}));

router.get("/me/hub/team", guard(async (req, res) => {
  if (!req.user) throw new HubError(401, "Sign in to open settings.");
  res.json(await getTeam(await loadActor(req.user.uid, req.user.email || "")));
}));

router.post("/me/hub/team", guard(async (req, res) => {
  if (!req.user) throw new HubError(401, "Sign in to open settings.");
  res.json(await saveTeam(await loadActor(req.user.uid, req.user.email || ""), req.body));
}));

router.patch("/me/hub/team", guard(async (req, res) => {
  if (!req.user) throw new HubError(401, "Sign in to open settings.");
  res.json(await saveTeam(await loadActor(req.user.uid, req.user.email || ""), req.body));
}));

router.post("/me/hub/team/members", guard(async (req, res) => {
  if (!req.user) throw new HubError(401, "Sign in to open settings.");
  res.status(201).json(await addTeamMember(await loadActor(req.user.uid, req.user.email || ""), req.body, req.body?.invite === true));
}));

router.patch("/me/hub/team/members/:id", guard(async (req, res) => {
  if (!req.user) throw new HubError(401, "Sign in to open settings.");
  res.json(await updateTeamMember(await loadActor(req.user.uid, req.user.email || ""), req.params.id, req.body));
}));

router.delete("/me/hub/team/members/:id", guard(async (req, res) => {
  if (!req.user) throw new HubError(401, "Sign in to open settings.");
  res.json(await removeTeamMember(await loadActor(req.user.uid, req.user.email || ""), req.params.id));
}));

router.post("/me/hub/team/members/:id/invite", guard(async (req, res) => {
  if (!req.user) throw new HubError(401, "Sign in to open settings.");
  res.json(await sendTeamInvite(await loadActor(req.user.uid, req.user.email || ""), req.params.id));
}));

router.get("/me/hub/clients.csv", guard(async (req, res) => {
  if (!req.user) throw new HubError(401, "Sign in to open settings.");
  const { contacts } = await listContacts(await loadActor(req.user.uid, req.user.email || ""));
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=\"example-clients.csv\"");
  res.send(contactsToCsv(contacts));
}));

router.get("/me/hub/clients", guard(async (req, res) => {
  if (!req.user) throw new HubError(401, "Sign in to open settings.");
  res.json(await listContacts(await loadActor(req.user.uid, req.user.email || "")));
}));

router.post("/me/hub/clients/import", guard(async (req, res) => {
  if (!req.user) throw new HubError(401, "Sign in to open settings.");
  const csv = typeof req.body?.csv === "string" ? req.body.csv : "";
  const parsed = parseContactsCsv(csv);
  if (parsed.contacts.length === 0) return res.status(400).json({ error: parsed.errors[0] || "Nothing to import.", errors: parsed.errors });
  const actor = await loadActor(req.user.uid, req.user.email || "");
  const saved = await importContacts(actor, parsed.contacts.map((contact) => ({ ...contact, ownerClientId: actor.clientId, teamId: "" })));
  res.status(201).json({ ...saved, errors: parsed.errors });
}));

router.post("/me/hub/clients", guard(async (req, res) => {
  if (!req.user) throw new HubError(401, "Sign in to open settings.");
  res.status(201).json(await saveContact(await loadActor(req.user.uid, req.user.email || ""), null, req.body));
}));

router.patch("/me/hub/clients/:id", guard(async (req, res) => {
  if (!req.user) throw new HubError(401, "Sign in to open settings.");
  res.json(await saveContact(await loadActor(req.user.uid, req.user.email || ""), req.params.id, req.body));
}));

router.delete("/me/hub/clients/:id", guard(async (req, res) => {
  if (!req.user) throw new HubError(401, "Sign in to open settings.");
  res.json(await deleteContact(await loadActor(req.user.uid, req.user.email || ""), req.params.id));
}));

router.get("/me/hub/billing", guard(async (req, res) => {
  if (!req.user) throw new HubError(401, "Sign in to open settings.");
  const owner = typeof req.query.account === "string" ? req.query.account : "";
  res.json(await getBilling(await loadActor(req.user.uid, req.user.email || ""), owner));
}));

router.patch("/me/hub/billing", guard(async (req, res) => {
  if (!req.user) throw new HubError(401, "Sign in to open settings.");
  const owner = typeof req.query.account === "string" ? req.query.account : "";
  res.json(await saveBilling(await loadActor(req.user.uid, req.user.email || ""), owner, req.body));
}));

router.get("/me/files", guard(async (req, res) => {
  if (!req.user) throw new HubError(401, "Sign in to open your files.");
  const actor = await loadActor(req.user.uid, req.user.email || "");
  const files = await listClientFiles({ firebaseUids: [actor.uid, ...actor.clientIds], clientIds: actor.clientIds });
  res.json({ files });
}));

router.post("/me/files", guard(async (req, res) => {
  if (!req.user) throw new HubError(401, "Sign in to upload a file.");
  const actor = await loadActor(req.user.uid, req.user.email || "");
  const file = await addClientFile({
    firebaseUid: actor.uid,
    clientId: actor.clientId,
    uploadedByUid: actor.uid,
    direction: "client",
    fileName: req.body?.fileName,
    contentType: req.body?.contentType,
    dataUrl: req.body?.dataUrl,
  });
  res.status(201).json({ file });
}));

router.get("/me/files/:fileId/raw", guard(async (req, res) => {
  if (!req.user) throw new HubError(401, "Sign in to open your files.");
  const actor = await loadActor(req.user.uid, req.user.email || "");
  const found = await readClientFile(req.params.fileId, { firebaseUids: [actor.uid, ...actor.clientIds], clientIds: actor.clientIds });
  if (!found) throw new HubError(404, "That file is not in your portal.");
  res.setHeader("Content-Type", found.file.contentType);
  res.setHeader("Content-Disposition", `inline; filename="${found.file.name.replace(/"/g, "")}"`);
  res.send(found.bytes);
}));

router.post("/me/hub/billing/card", guard(async (req, res) => {
  if (!req.user) throw new HubError(401, "Sign in to open settings.");
  if (containsRawCard(req.body)) throw new HubError(400, "Card numbers are not stored. Use the Square card form.");
  const sourceId = typeof req.body?.sourceId === "string" ? req.body.sourceId : "";
  const actor = await loadActor(req.user.uid, req.user.email || "");
  const owner = typeof req.query.account === "string" ? req.query.account : "";
  const current = await getBilling(actor, owner);
  const billing = sanitizeBilling(current.billing);
  const saved = await saveSquareCardOnFile({
    sourceId,
    customerId: "",
    email: billing.email || actor.profile.email,
    name: `${actor.profile.firstName} ${actor.profile.lastName}`.trim(),
    phone: billing.phone || actor.profile.phone,
    billing,
  });
  if ("error" in saved) throw new HubError(502, saved.error);
  res.json(await saveCard(actor, owner, saved.card));
}));

function clientIdParam(value: unknown): string {
  const id = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9_-]{4,128}$/.test(id)) throw new HubError(400, "Client not found.");
  return id;
}

router.get("/:id/hub/profile", requireCoordinator, guard(async (req, res) => {
  const billing = await getStaffBilling(clientIdParam(req.params.id));
  res.json({ profile: billing.profile });
}));

router.post("/:id/hub/profile/asset", requireCoordinator, guard(async (req, res) => {
  const kind = typeof req.body?.kind === "string" ? req.body.kind : "";
  const dataUrl = typeof req.body?.dataUrl === "string" ? req.body.dataUrl : "";
  res.json(await saveStaffProfileAsset(clientIdParam(req.params.id), kind, dataUrl));
}));

router.get("/:id/hub/billing", requireCoordinator, guard(async (req, res) => {
  res.json(await getStaffBilling(clientIdParam(req.params.id)));
}));

async function staffFileScope(clientId: string) {
  let data: Record<string, unknown> | null = null;
  if (!admin.apps.length || process.env.CLIENT_HUB_STORE === "memory") {
    data = readClientHubMemory("clients", clientId);
  } else {
    const snap = await admin.firestore().collection("clients").doc(clientId).get();
    data = snap.exists ? (snap.data() as Record<string, unknown>) || {} : null;
  }
  if (!data) throw new HubError(404, "Client not found.");
  const uid = typeof data.firebaseUid === "string" && data.firebaseUid ? data.firebaseUid : clientId;
  const linked = typeof data.linkedClientId === "string" ? data.linkedClientId : "";
  return {
    firebaseUids: [...new Set([uid, clientId])],
    clientIds: [...new Set([clientId, uid, linked].filter(Boolean))],
    firebaseUid: uid,
    clientId,
  };
}

router.get("/:id/files", coordinatorOrTest, guard(async (req, res) => {
  const scope = await staffFileScope(clientIdParam(req.params.id));
  res.json({ files: await listClientFiles(scope) });
}));

router.post("/:id/files", coordinatorOrTest, guard(async (req, res) => {
  const scope = await staffFileScope(clientIdParam(req.params.id));
  const file = await addClientFile({
    firebaseUid: scope.firebaseUid,
    clientId: scope.clientId,
    uploadedByUid: req.user?.uid || "staff",
    direction: "admin",
    fileName: req.body?.fileName,
    contentType: req.body?.contentType,
    dataUrl: req.body?.dataUrl,
  });
  res.status(201).json({ file });
}));

router.get("/:id/files/:fileId/raw", coordinatorOrTest, guard(async (req, res) => {
  const scope = await staffFileScope(clientIdParam(req.params.id));
  const found = await readClientFile(req.params.fileId, scope);
  if (!found) throw new HubError(404, "That file is not on this client.");
  res.setHeader("Content-Type", found.file.contentType);
  res.setHeader("Content-Disposition", `inline; filename="${found.file.name.replace(/"/g, "")}"`);
  res.send(found.bytes);
}));

router.post("/:id/hub/billing/card", requireCoordinator, guard(async (req, res) => {
  if (containsRawCard(req.body)) throw new HubError(400, "Card numbers are not stored. Use the Square card form.");
  const clientId = clientIdParam(req.params.id);
  const sourceId = typeof req.body?.sourceId === "string" ? req.body.sourceId : "";
  const current = await getStaffBilling(clientId);
  const saved = await saveSquareCardOnFile({
    sourceId,
    customerId: "",
    email: current.billing.email || current.profile.email,
    name: `${current.profile.firstName} ${current.profile.lastName}`.trim(),
    phone: current.billing.phone || current.profile.phone,
    billing: sanitizeBilling(current.billing),
  });
  if ("error" in saved) throw new HubError(502, saved.error);
  res.json(await saveStaffCard(clientId, saved.card));
}));

router.use((req, res, next) => {
  if (req.path.startsWith("/me/hub") || req.path.startsWith("/me/files")) {
    return res.status(404).json({ error: "Settings path not found." });
  }
  return next();
});

export default router;
