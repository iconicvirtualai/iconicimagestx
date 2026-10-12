/**
 * PATCH /api/admin/orders/:id/approval
 * Owner session or an admin staff role. Stores approval on the order document.
 */

import type { RequestHandler } from "express";
import { orderApprovalError, type OrderApproval } from "../../shared/orderApproval";
import { requireAdmin, type AuthenticatedRequest } from "../middleware/auth";
import { resolveOwnerIdentity } from "../services/ownerGate";
import { writeOrderApproval } from "../services/orderApprovalStore";

export const handleOrderApproval: RequestHandler = async (req, res) => {
  const owner = await resolveOwnerIdentity(req.headers);
  if (owner) return save(req, res, owner.email);
  return requireAdmin(req as AuthenticatedRequest, res, () => {
    const email = (req as AuthenticatedRequest).user?.email || "Admin";
    void save(req, res, email);
  });
};

async function save(req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1], by: string) {
  const error = orderApprovalError(req.body?.status, req.body?.note ?? "");
  if (error) return res.status(400).json({ error });
  const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
  const approval: OrderApproval = {
    status: req.body.status,
    note,
    by,
    at: new Date().toISOString(),
  };
  const saved = await writeOrderApproval(String(req.params.id || ""), approval);
  if (!saved) return res.status(404).json({ error: "Order not found." });
  return res.json({ approval: saved });
}
