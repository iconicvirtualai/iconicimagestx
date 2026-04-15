/**
 * Iconic Images — Virtual Staging AI Routes
 */

import { Router } from "express";
import admin from "firebase-admin";
import Stripe from "stripe";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";

const router = Router();
const db = () => admin.firestore();

const VSAI_API_BASE = "https://api.virtualstagingai.app/v1";
const VSAI_API_KEY =
  process.env.VSAI_API_KEY || process.env.VIRTUAL_STAGING_AI_API_KEY || "";

const VSAI_PRICE_CENTS = parseInt(process.env.VSAI_PRICE_CENTS || "1500", 10); // $15.00 default

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-06-20",
});

// ─── POST /api/vsai/create ────────────────────────────────────────────────────

router.post("/create", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!VSAI_API_KEY) {
      console.error("[VSAI] VSAI_API_KEY is not set");
      return res.status(500).json({ error: "VSAI API key not configured." });
    }

    const {
      imageUrl,
      roomType = "living",
      style = "modern",
    } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: "imageUrl is required." });
    }

    const userId = req.user!.uid;

    const payload = {
      image_url: imageUrl,
      room_type: roomType,
      style,
      wait_for_completion: false,
      add_virtually_staged_watermark: false,
    };

    console.log("[VSAI] Creating render:", JSON.stringify(payload));

    const vsaiResponse = await fetch(`${VSAI_API_BASE}/render/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Api-Key ${VSAI_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const responseText = await vsaiResponse.text();
    console.log(`[VSAI] Create response ${vsaiResponse.status}:`, responseText);

    if (!vsaiResponse.ok) {
      return res.status(vsaiResponse.status).json({
        error: `VSAI API error: ${responseText}`,
      });
    }

    // Parse response — VSAI may use "id", "render_id", or "renderId"
    let vsaiData: Record<string, unknown>;
    try {
      vsaiData = JSON.parse(responseText);
    } catch {
      return res.status(500).json({ error: "Invalid VSAI response format." });
    }

    const vsaiRenderId =
      (vsaiData.id as string) ||
      (vsaiData.render_id as string) ||
      (vsaiData.renderId as string) ||
      null;

    if (!vsaiRenderId) {
      console.error("[VSAI] No render ID in response:", vsaiData);
      return res.status(500).json({
        error: `VSAI returned no render ID. Response: ${responseText}`,
      });
    }

    const jobRef = await db().collection("vsaiJobs").add({
      userId,
      imageUrl,
      roomType,
      style,
      vsaiRenderId,
      status: "processing",
      isPaid: false,
      resultUrl: null,
      resultUrls: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`[VSAI] Job created: ${jobRef.id} → vsaiRenderId: ${vsaiRenderId}`);

    return res.status(200).json({
      jobId: jobRef.id,
      vsaiRenderId,
      status: "processing",
    });
  } catch (err) {
    console.error("[VSAI] Create error:", err);
    return res.status(500).json({ error: String(err) });
  }
});

// ─── GET /api/vsai/result/:jobId ──────────────────────────────────────────────

router.get("/result/:jobId", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const jobDoc = await db().collection("vsaiJobs").doc(req.params.jobId).get();
    if (!jobDoc.exists) return res.status(404).json({ error: "Job not found." });

    const job = jobDoc.data()!;

    if (job.userId !== req.user!.uid) {
      return res.status(403).json({ error: "Access denied." });
    }

    // Already settled — no need to hit VSAI again
    if (job.status === "completed" && job.resultUrl) {
      return res.json({
        jobId: req.params.jobId,
        status: "completed",
        resultUrl: job.resultUrl,
        resultUrls: job.resultUrls || [job.resultUrl],
      });
    }

    if (job.status === "failed") {
      return res.json({
        jobId: req.params.jobId,
        status: "failed",
        error: job.error || "Render failed.",
      });
    }

    if (!VSAI_API_KEY) {
      return res.status(500).json({ error: "VSAI API key not configured." });
    }

    // Poll VSAI — correct endpoint: GET /v1/render?render_id={id}
    const pollUrl = `${VSAI_API_BASE}/render?render_id=${encodeURIComponent(job.vsaiRenderId)}`;
    const vsaiResponse = await fetch(pollUrl, {
      headers: { Authorization: `Api-Key ${VSAI_API_KEY}` },
    });

    const responseText = await vsaiResponse.text();
    console.log(`[VSAI] Poll ${job.vsaiRenderId} → ${vsaiResponse.status}: ${responseText}`);

    if (!vsaiResponse.ok) {
      return res.status(vsaiResponse.status).json({
        error: `VSAI poll error (${vsaiResponse.status}): ${responseText}`,
      });
    }

    let vsaiData: {
      render_id?: string;
      status?: string;
      // VSAI v1 response: outputs[] array when done
      outputs?: string[];
      // Fallback field names just in case
      output_url?: string;
      output_urls?: string[];
      rendered_image?: string;
      result_url?: string;
      error?: string;
      message?: string;
    };

    try {
      vsaiData = JSON.parse(responseText);
    } catch {
      return res.status(500).json({ error: "Invalid VSAI response format." });
    }

    // VSAI v1 statuses: "rendering" | "done" | "error"
    const rawStatus = (vsaiData.status || "").toLowerCase();
    const isComplete = rawStatus === "done" || rawStatus === "completed";
    const isFailed   = rawStatus === "error" || rawStatus === "failed";
    const normalizedStatus = isComplete ? "completed" : isFailed ? "failed" : "processing";

    // VSAI v1 puts result URLs in the "outputs" array
    const resultUrl =
      (vsaiData.outputs && vsaiData.outputs[0]) ||
      vsaiData.output_url ||
      vsaiData.rendered_image ||
      vsaiData.result_url ||
      (vsaiData.output_urls && vsaiData.output_urls[0]) ||
      null;

    const resultUrls: string[] =
      vsaiData.outputs ||
      vsaiData.output_urls ||
      (resultUrl ? [resultUrl] : []);

    const updates: Record<string, unknown> = {
      status: normalizedStatus,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (isComplete && resultUrl) {
      updates.resultUrl = resultUrl;
      updates.resultUrls = resultUrls;
    }

    if (isFailed) {
      updates.error =
        vsaiData.error || vsaiData.message || "Render failed on VSAI.";
    }

    await jobDoc.ref.update(updates);

    return res.json({
      jobId: req.params.jobId,
      status: normalizedStatus,
      resultUrl: resultUrl || null,
      resultUrls: resultUrls.length ? resultUrls : null,
      error: isFailed
        ? (vsaiData.error || vsaiData.message || "Render failed.")
        : undefined,
    });
  } catch (err) {
    console.error("[VSAI] Poll error:", err);
    return res.status(500).json({ error: String(err) });
  }
});

// ─── POST /api/vsai/variation ─────────────────────────────────────────────────
// Re-renders the same original image with the same (or new) params.
// "Variation" = same room/style but different AI seed — new furniture arrangement.

router.post("/variation", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { jobId, style, roomType } = req.body;

    if (!jobId) {
      return res.status(400).json({ error: "jobId required." });
    }

    const jobDoc = await db().collection("vsaiJobs").doc(jobId).get();
    if (!jobDoc.exists) return res.status(404).json({ error: "Job not found." });

    const job = jobDoc.data()!;
    if (job.userId !== req.user!.uid) {
      return res.status(403).json({ error: "Access denied." });
    }

    const newStyle = style || job.style;
    const newRoomType = roomType || job.roomType;

    const payload = {
      image_url: job.imageUrl,
      room_type: newRoomType,
      style: newStyle,
      wait_for_completion: false,
      add_virtually_staged_watermark: false,
    };

    console.log("[VSAI] Creating variation:", JSON.stringify(payload));

    const vsaiResponse = await fetch(`${VSAI_API_BASE}/render/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Api-Key ${VSAI_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const responseText = await vsaiResponse.text();
    console.log(`[VSAI] Variation response ${vsaiResponse.status}:`, responseText);

    if (!vsaiResponse.ok) {
      return res.status(vsaiResponse.status).json({
        error: `VSAI variation error: ${responseText}`,
      });
    }

    const vsaiData: Record<string, unknown> = JSON.parse(responseText);
    const vsaiRenderId =
      (vsaiData.id as string) ||
      (vsaiData.render_id as string) ||
      (vsaiData.renderId as string) ||
      null;

    if (!vsaiRenderId) {
      return res.status(500).json({ error: `VSAI returned no render ID: ${responseText}` });
    }

    const variationRef = await db().collection("vsaiJobs").add({
      userId: req.user!.uid,
      imageUrl: job.imageUrl,
      roomType: newRoomType,
      style: newStyle,
      vsaiRenderId,
      status: "processing",
      isPaid: false,
      parentJobId: jobId,
      resultUrl: null,
      resultUrls: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({
      jobId: variationRef.id,
      vsaiRenderId,
      status: "processing",
    });
  } catch (err) {
    console.error("[VSAI] Variation error:", err);
    return res.status(500).json({ error: String(err) });
  }
});

// ─── POST /api/vsai/checkout ──────────────────────────────────────────────────
// Creates a Stripe Checkout session for one or more completed VSAI renders.

router.post("/checkout", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { jobIds, successUrl, cancelUrl } = req.body as {
      jobIds: string[];
      successUrl?: string;
      cancelUrl?: string;
    };

    if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
      return res.status(400).json({ error: "jobIds array required." });
    }

    const userId = req.user!.uid;

    // Verify all jobs exist, belong to this user, and are completed
    const jobDocs = await Promise.all(
      jobIds.map((id) => db().collection("vsaiJobs").doc(id).get())
    );

    for (let i = 0; i < jobDocs.length; i++) {
      const doc = jobDocs[i];
      if (!doc.exists) {
        return res.status(404).json({ error: `Job ${jobIds[i]} not found.` });
      }
      const data = doc.data()!;
      if (data.userId !== userId) {
        return res.status(403).json({ error: "Access denied." });
      }
      if (data.status !== "completed") {
        return res.status(400).json({ error: `Job ${jobIds[i]} is not completed yet.` });
      }
      if (data.isPaid) {
        return res.status(400).json({ error: `Job ${jobIds[i]} is already paid.` });
      }
    }

    const origin =
      process.env.FRONTEND_URL ||
      req.headers.origin ||
      "https://iconicimagestx.com";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: jobDocs.map((doc) => {
        const job = doc.data()!;
        return {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Virtual Staging — ${capitalize(job.roomType)} (${capitalize(job.style)})`,
              description: "AI-staged photo delivered in full resolution",
              images: job.resultUrl ? [job.resultUrl] : undefined,
            },
            unit_amount: VSAI_PRICE_CENTS,
          },
          quantity: 1,
        };
      }),
      mode: "payment",
      success_url:
        successUrl ||
        `${origin}/services/virtual-staging/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:
        cancelUrl ||
        `${origin}/services/virtual-staging`,
      metadata: {
        jobIds: JSON.stringify(jobIds),
        userId,
        type: "vsai_renders",
      },
      customer_email: req.user!.email || undefined,
    });

    // Record pending payment on each job
    await Promise.all(
      jobDocs.map((doc) =>
        doc.ref.update({
          stripeSessionId: session.id,
          paymentStatus: "pending",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        })
      )
    );

    return res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error("[VSAI] Checkout error:", err);
    return res.status(500).json({ error: String(err) });
  }
});

// ─── POST /api/vsai/webhook/stripe ───────────────────────────────────────────
// Marks jobs as paid after successful Stripe payment.

router.post(
  "/webhook/stripe",
  // Raw body needed — mount before express.json() parses it
  async (req, res) => {
    const sig = req.headers["stripe-signature"] as string;
    const webhookSecret = process.env.STRIPE_VSAI_WEBHOOK_SECRET || "";

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        (req as any).rawBody || req.body,
        sig,
        webhookSecret
      );
    } catch (err) {
      console.error("[VSAI Webhook] Signature verification failed:", err);
      return res.status(400).send("Webhook signature failed.");
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      if (session.metadata?.type === "vsai_renders") {
        const jobIds: string[] = JSON.parse(session.metadata.jobIds || "[]");

        await Promise.all(
          jobIds.map((id) =>
            db().collection("vsaiJobs").doc(id).update({
              isPaid: true,
              paymentStatus: "paid",
              stripeSessionId: session.id,
              paidAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            })
          )
        );

        console.log(`[VSAI Webhook] Marked ${jobIds.length} jobs as paid for session ${session.id}`);
      }
    }

    res.json({ received: true });
  }
);

// ─── GET /api/vsai/options ────────────────────────────────────────────────────

router.get("/options", (_req, res) => {
  // Values are exact VSAI v1 API accepted values
  return res.json({
    roomTypes: [
      { value: "living",      label: "Living Room" },
      { value: "bed",         label: "Bedroom" },
      { value: "dining",      label: "Dining Room" },
      { value: "kitchen",     label: "Kitchen" },
      { value: "home_office", label: "Home Office" },
      { value: "bathroom",    label: "Bathroom" },
      { value: "outdoor",     label: "Outdoor / Patio" },
      { value: "kids_room",   label: "Kids Room" },
    ],
    styles: [
      { value: "modern",             label: "Modern" },
      { value: "scandinavian",       label: "Scandinavian" },
      { value: "industrial",         label: "Industrial" },
      { value: "mid-century modern", label: "Mid-Century" },
      { value: "coastal",            label: "Coastal" },
      { value: "american",           label: "American" },
      { value: "southwestern",       label: "Southwestern" },
      { value: "farmhouse",          label: "Farmhouse" },
      { value: "luxury",             label: "Luxury" },
      { value: "standard",           label: "Standard" },
    ],
    pricePerPhoto: VSAI_PRICE_CENTS / 100,
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

export default router;
