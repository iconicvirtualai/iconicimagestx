/**
 * Iconic Images — Virtual Staging AI Routes
 * Ported from iconic-virtual-vsai-demo/pages/api/vsai-*.ts
 * Converted from Next.js API routes to Express routes.
 * Place at: server/routes/vsai.ts
 */

import { Router } from "express";
import admin from "firebase-admin";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";

const router = Router();
const db = () => admin.firestore();

const VSAI_API_BASE = "https://api.virtualstagingai.app/v1";
const VSAI_API_KEY =
  process.env.VSAI_API_KEY || process.env.VIRTUAL_STAGING_AI_API_KEY || "";

// ─── POST /api/vsai/create — Start a staging render job ──────────────────────

router.post("/create", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!VSAI_API_KEY) {
      return res.status(500).json({ error: "VSAI API key not configured." });
    }

    const {
      imageUrl,
      roomType = "living",
      style = "standard",
      orderId,
      generateVariations = false,
    } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: "imageUrl is required." });
    }

    const userId = req.user!.uid;

    // Call VSAI API
    const vsaiResponse = await fetch(`${VSAI_API_BASE}/render/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Api-Key ${VSAI_API_KEY}`,
      },
      body: JSON.stringify({
        image_url: imageUrl,
        room_type: roomType,
        style,
        wait_for_completion: false,
        add_virtually_staged_watermark: false,
      }),
    });

    if (!vsaiResponse.ok) {
      const error = await vsaiResponse.text();
      console.error("[VSAI] API error:", error);
      return res.status(vsaiResponse.status).json({ error: "VSAI render failed." });
    }

    const vsaiData = await vsaiResponse.json() as { id: string; status: string };

    // Save job to Firestore
    const jobRef = await db().collection("vsaiJobs").add({
      userId,
      orderId: orderId || null,
      imageUrl,
      roomType,
      style,
      vsaiRenderId: vsaiData.id,
      status: "processing",
      isPaid: false,
      generateVariations,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).json({
      jobId: jobRef.id,
      vsaiRenderId: vsaiData.id,
      status: "processing",
    });
  } catch (err) {
    console.error("[VSAI] Create error:", err);
    return res.status(500).json({ error: "Failed to start render job." });
  }
});

// ─── GET /api/vsai/result/:jobId — Poll render status ────────────────────────

router.get("/result/:jobId", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const jobDoc = await db().collection("vsaiJobs").doc(req.params.jobId).get();
    if (!jobDoc.exists) return res.status(404).json({ error: "Job not found." });

    const job = jobDoc.data()!;

    // Verify ownership
    if (job.userId !== req.user!.uid) {
      return res.status(403).json({ error: "Access denied." });
    }

    // If already completed, return stored result
    if (job.status === "completed" && job.resultUrl) {
      return res.json({
        jobId: req.params.jobId,
        status: "completed",
        resultUrl: job.resultUrl,
        resultUrls: job.resultUrls || [job.resultUrl],
      });
    }

    if (job.status === "failed") {
      return res.json({ jobId: req.params.jobId, status: "failed", error: job.error });
    }

    // Poll VSAI API
    const vsaiResponse = await fetch(`${VSAI_API_BASE}/render/${job.vsaiRenderId}`, {
      headers: { Authorization: `Api-Key ${VSAI_API_KEY}` },
    });

    if (!vsaiResponse.ok) {
      return res.status(vsaiResponse.status).json({ error: "Failed to check render status." });
    }

    const vsaiData = await vsaiResponse.json() as {
      status: string;
      output_url?: string;
      output_urls?: string[];
      error?: string;
    };

    // Update job in Firestore
    const updates: Record<string, unknown> = {
      status: vsaiData.status === "done" ? "completed" :
              vsaiData.status === "error" ? "failed" : "processing",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (vsaiData.status === "done" && vsaiData.output_url) {
      updates.resultUrl = vsaiData.output_url;
      updates.resultUrls = vsaiData.output_urls || [vsaiData.output_url];
    }

    if (vsaiData.status === "error") {
      updates.error = vsaiData.error || "Render failed";
    }

    await jobDoc.ref.update(updates);

    return res.json({
      jobId: req.params.jobId,
      status: updates.status,
      resultUrl: vsaiData.output_url || null,
      resultUrls: vsaiData.output_urls || null,
    });
  } catch (err) {
    console.error("[VSAI] Result poll error:", err);
    return res.status(500).json({ error: "Failed to check render status." });
  }
});

// ─── POST /api/vsai/variation — Generate variation of staged image ────────────

router.post("/variation", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { jobId, style } = req.body;

    if (!jobId || !style) {
      return res.status(400).json({ error: "jobId and style required." });
    }

    const jobDoc = await db().collection("vsaiJobs").doc(jobId).get();
    if (!jobDoc.exists) return res.status(404).json({ error: "Job not found." });

    const job = jobDoc.data()!;

    if (job.userId !== req.user!.uid) {
      return res.status(403).json({ error: "Access denied." });
    }

    if (!job.resultUrl) {
      return res.status(400).json({ error: "Job not yet completed." });
    }

    // Create new render with different style
    const vsaiResponse = await fetch(`${VSAI_API_BASE}/render/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Api-Key ${VSAI_API_KEY}`,
      },
      body: JSON.stringify({
        image_url: job.imageUrl,
        room_type: job.roomType,
        style,
        wait_for_completion: false,
        add_virtually_staged_watermark: false,
      }),
    });

    if (!vsaiResponse.ok) {
      return res.status(vsaiResponse.status).json({ error: "VSAI variation failed." });
    }

    const vsaiData = await vsaiResponse.json() as { id: string };

    const variationRef = await db().collection("vsaiJobs").add({
      userId: req.user!.uid,
      orderId: job.orderId,
      imageUrl: job.imageUrl,
      roomType: job.roomType,
      style,
      vsaiRenderId: vsaiData.id,
      status: "processing",
      isPaid: job.isPaid,
      parentJobId: jobId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({
      jobId: variationRef.id,
      vsaiRenderId: vsaiData.id,
      status: "processing",
    });
  } catch (err) {
    console.error("[VSAI] Variation error:", err);
    return res.status(500).json({ error: "Failed to create variation." });
  }
});

// ─── GET /api/vsai/options — Available room types and styles ──────────────────

router.get("/options", (_req, res) => {
  return res.json({
    roomTypes: [
      { value: "living", label: "Living Room" },
      { value: "bedroom", label: "Bedroom" },
      { value: "dining", label: "Dining Room" },
      { value: "kitchen", label: "Kitchen" },
      { value: "office", label: "Home Office" },
      { value: "bathroom", label: "Bathroom" },
      { value: "outdoor", label: "Outdoor / Patio" },
      { value: "empty", label: "Empty Room" },
    ],
    styles: [
      { value: "standard", label: "Standard" },
      { value: "modern", label: "Modern" },
      { value: "contemporary", label: "Contemporary" },
      { value: "scandinavian", label: "Scandinavian" },
      { value: "farmhouse", label: "Farmhouse" },
      { value: "coastal", label: "Coastal" },
      { value: "transitional", label: "Transitional" },
      { value: "industrial", label: "Industrial" },
      { value: "luxury", label: "Luxury" },
    ],
  });
});

// ─── GET /api/vsai/jobs — List user's VSAI jobs ───────────────────────────────

router.get("/jobs", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const snapshot = await db()
      .collection("vsaiJobs")
      .where("userId", "==", req.user!.uid)
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    return res.json(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch jobs." });
  }
});

export default router;
