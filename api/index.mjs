import "dotenv/config";
import express, { Router } from "express";
import cors from "cors";
import fs from "fs/promises";
import path from "path";
import admin from "firebase-admin";
import nodemailer from "nodemailer";
import Stripe from "stripe";
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No authentication token provided." });
  }
  const token = authHeader.split("Bearer ")[1];
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    console.error("[Auth Middleware] Token verification failed:", err);
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}
async function requireStaff(req, res, next) {
  await requireAuth(req, res, async () => {
    try {
      const staffDoc = await admin.firestore().collection("staff").doc(req.user.uid).get();
      if (!staffDoc.exists) {
        return res.status(403).json({ error: "Staff access required." });
      }
      const staffData = staffDoc.data();
      req.staffRole = staffData.role;
      req.isAdmin = staffData.role === "admin";
      req.isCoordinator = staffData.role === "admin" || staffData.role === "coordinator";
      next();
    } catch (err) {
      console.error("[Auth Middleware] Staff lookup error:", err);
      return res.status(500).json({ error: "Server error during authorization." });
    }
  });
}
async function requireAdmin(req, res, next) {
  await requireStaff(req, res, () => {
    if (!req.isAdmin) {
      return res.status(403).json({ error: "Admin access required." });
    }
    next();
  });
}
async function requireCoordinator(req, res, next) {
  await requireStaff(req, res, () => {
    if (!req.isCoordinator) {
      return res.status(403).json({ error: "Coordinator access required." });
    }
    next();
  });
}
async function requirePhotographer(req, res, next) {
  await requireStaff(req, res, () => {
    const allowed = ["admin", "coordinator", "photographer"];
    if (!req.staffRole || !allowed.includes(req.staffRole)) {
      return res.status(403).json({ error: "Photographer access required." });
    }
    next();
  });
}
const db$a = () => admin.firestore();
function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER || process.env.EMAIL_FROM,
      pass: process.env.SMTP_PASS
    }
  });
}
async function sendEmail(options) {
  const { to, template, variables = {}, subject: subjectOverride, attachments } = options;
  if (!to) {
    console.warn("[Email] No recipient specified, skipping.");
    return;
  }
  try {
    const templateDoc = await db$a().collection("emailTemplates").where("category", "==", template).where("isActive", "==", true).limit(1).get();
    let subject = subjectOverride || `Message from Iconic Images`;
    let htmlBody = getFallbackTemplate(template, variables);
    if (!templateDoc.empty) {
      const tmpl = templateDoc.docs[0].data();
      subject = subjectOverride || interpolate(tmpl.subject, variables);
      htmlBody = interpolate(tmpl.htmlBody, variables);
    }
    const transporter = getTransporter();
    await transporter.sendMail({
      from: `"Iconic Images" <${process.env.EMAIL_FROM || process.env.SMTP_USER}>`,
      to,
      subject,
      html: htmlBody,
      attachments
    });
    console.log(`[Email] Sent '${template}' to ${to}`);
  } catch (err) {
    console.error(`[Email] Failed to send '${template}' to ${to}:`, err);
    throw err;
  }
}
function interpolate(template, variables) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`);
}
function getFallbackTemplate(type, vars) {
  const base = (content) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #000; padding: 20px; text-align: center; margin-bottom: 30px;">
        <h1 style="color: #fff; margin: 0; font-size: 24px;">ICONIC IMAGES</h1>
        <p style="color: #ccc; margin: 5px 0 0; font-size: 12px; letter-spacing: 2px;">REAL ESTATE MEDIA</p>
      </div>
      ${content}
      <div style="border-top: 1px solid #eee; margin-top: 30px; padding-top: 20px; text-align: center; color: #999; font-size: 12px;">
        <p>Iconic Images TX | iconicimagestx.com</p>
        <p>Questions? Reply to this email or message us through your client portal.</p>
      </div>
    </div>
  `;
  const templates = {
    booking_received: base(`
      <h2>We received your booking request!</h2>
      <p>Hi ${vars.clientName},</p>
      <p>Thank you for choosing Iconic Images. We've received your booking request for <strong>${vars.address}</strong>.</p>
      <p>Our team will review and confirm your appointment within 1 business day. You'll receive a confirmation email once everything is set.</p>
      <p>Your order ID is: <strong>${vars.requestId}</strong></p>
    `),
    order_confirmed: base(`
      <h2>Your appointment is confirmed!</h2>
      <p>Hi ${vars.clientName},</p>
      <p>Great news — your shoot at <strong>${vars.address}</strong> is confirmed!</p>
      <p><strong>Date:</strong> ${vars.scheduledDate}<br>
      <strong>Time:</strong> ${vars.scheduledTime}<br>
      <strong>Photographer:</strong> ${vars.photographerName}</p>
      <p><a href="${vars.portalUrl}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;display:inline-block;border-radius:4px;">View Your Portal</a></p>
    `),
    gallery_delivery: base(`
      <h2>Your gallery is ready! 🎉</h2>
      <p>Hi ${vars.clientName},</p>
      <p>Your photos for <strong>${vars.address}</strong> are edited and ready for download.</p>
      ${vars.invoiceAmount ? `<p>Please complete your payment of <strong>${vars.invoiceAmount}</strong> to download your files.</p>` : ""}
      <p><a href="${vars.galleryUrl}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;display:inline-block;border-radius:4px;">View Gallery & Download</a></p>
      <p style="color:#999;font-size:12px;">Gallery available for ${vars.expiresAt}.</p>
    `),
    invoice: base(`
      <h2>Invoice from Iconic Images</h2>
      <p>Hi ${vars.clientName},</p>
      <p>Your invoice <strong>${vars.invoiceNumber}</strong> for <strong>${vars.amount}</strong> is ready.</p>
      ${vars.dueDate ? `<p>Due: <strong>${vars.dueDate}</strong></p>` : ""}
      <p><a href="${vars.paymentUrl}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;display:inline-block;border-radius:4px;">Pay Invoice</a></p>
    `),
    payment_receipt: base(`
      <h2>Payment received ✓</h2>
      <p>Hi ${vars.clientName},</p>
      <p>We've received your payment of <strong>${vars.amount}</strong> for invoice ${vars.invoiceNumber}.</p>
      ${vars.balance && vars.balance !== "$0.00" ? `<p>Remaining balance: <strong>${vars.balance}</strong></p>` : "<p>Your account is paid in full. Thank you!</p>"}
    `),
    new_booking_alert: base(`
      <h2>🔔 New Booking Request</h2>
      <p><strong>Client:</strong> ${vars.clientName}<br>
      <strong>Email:</strong> ${vars.email}<br>
      <strong>Phone:</strong> ${vars.phone}<br>
      <strong>Address:</strong> ${vars.address}<br>
      <strong>Total:</strong> ${vars.total}</p>
      <p><a href="${vars.dashboardUrl}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;display:inline-block;border-radius:4px;">Review in Dashboard</a></p>
    `)
  };
  return templates[type] || base(`<p>You have a new notification from Iconic Images.</p>`);
}
const router$9 = Router();
const db$9 = () => admin.firestore();
router$9.post("/", async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      address,
      lineItems,
      pricing,
      total,
      vibeNote,
      promoCode,
      promoDiscount,
      scheduledDate,
      scheduledTime,
      photographerPreference,
      squareFootage,
      accessMethod,
      propertyStatus,
      furnishingStatus
    } = req.body;
    if (!firstName || !lastName || !email || !phone || !address) {
      return res.status(400).json({ error: "Missing required fields." });
    }
    if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
      return res.status(400).json({ error: "No services selected." });
    }
    const clientName = `${firstName} ${lastName}`.trim();
    const orderRequest = {
      firstName,
      lastName,
      clientName,
      email: email.toLowerCase().trim(),
      phone,
      address,
      lineItems,
      pricing: pricing || {},
      total: Number(total) || 0,
      vibeNote: vibeNote || "",
      promoCode: promoCode || null,
      promoDiscount: Number(promoDiscount) || 0,
      scheduledDate: scheduledDate || null,
      scheduledTime: scheduledTime || null,
      photographerPreference: photographerPreference || null,
      squareFootage: squareFootage || null,
      accessMethod: accessMethod || null,
      propertyStatus: propertyStatus || null,
      furnishingStatus: furnishingStatus || null,
      status: "new",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    const docRef = await db$9().collection("orderRequests").add(orderRequest);
    await sendEmail({
      to: email,
      template: "booking_received",
      variables: {
        clientName,
        address,
        total: `$${Number(total).toFixed(2)}`,
        requestId: docRef.id
      }
    }).catch((err) => console.error("[Bookings] Confirmation email failed:", err));
    await sendEmail({
      to: process.env.COORDINATOR_EMAIL || process.env.ADMIN_EMAIL || "",
      template: "new_booking_alert",
      variables: {
        clientName,
        email,
        phone,
        address,
        total: `$${Number(total).toFixed(2)}`,
        requestId: docRef.id,
        dashboardUrl: `${process.env.APP_URL}/admin/orders/${docRef.id}`
      }
    }).catch((err) => console.error("[Bookings] Coordinator alert failed:", err));
    return res.status(201).json({
      success: true,
      requestId: docRef.id,
      message: "Booking request received. We'll confirm shortly!"
    });
  } catch (err) {
    console.error("[Bookings] Submission error:", err);
    return res.status(500).json({ error: "Failed to submit booking request." });
  }
});
router$9.get("/", requireCoordinator, async (_req, res) => {
  try {
    const snapshot = await db$9().collection("orderRequests").orderBy("createdAt", "desc").limit(100).get();
    const requests = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));
    return res.json(requests);
  } catch (err) {
    console.error("[Bookings] List error:", err);
    return res.status(500).json({ error: "Failed to fetch booking requests." });
  }
});
router$9.get("/:id", requireCoordinator, async (req, res) => {
  try {
    const doc = await db$9().collection("orderRequests").doc(req.params.id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Booking request not found." });
    }
    return res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    console.error("[Bookings] Fetch error:", err);
    return res.status(500).json({ error: "Failed to fetch booking request." });
  }
});
router$9.patch("/:id/confirm", requireCoordinator, async (req, res) => {
  try {
    const { assignedPhotographerId, assignedPhotographerName, scheduledDate, scheduledTime, internalNotes } = req.body;
    const requestDoc = await db$9().collection("orderRequests").doc(req.params.id).get();
    if (!requestDoc.exists) {
      return res.status(404).json({ error: "Booking request not found." });
    }
    const request = requestDoc.data();
    let clientId;
    const existingClients = await db$9().collection("clients").where("email", "==", request.email).limit(1).get();
    if (!existingClients.empty) {
      clientId = existingClients.docs[0].id;
      await existingClients.docs[0].ref.update({
        totalOrders: admin.firestore.FieldValue.increment(1),
        lastOrderAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } else {
      const clientRef = await db$9().collection("clients").add({
        firstName: request.firstName,
        lastName: request.lastName,
        email: request.email,
        phone: request.phone,
        address: request.address,
        totalOrders: 1,
        totalSpend: 0,
        lastOrderAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "active",
        portalAccess: false,
        tags: [],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      clientId = clientRef.id;
    }
    const orderData = {
      orderRequestId: req.params.id,
      clientId,
      clientName: request.clientName,
      clientEmail: request.email,
      clientPhone: request.phone,
      address: request.address,
      services: request.lineItems || [],
      addOns: [],
      pricing: request.pricing || {},
      total: request.total || 0,
      depositPaid: 0,
      balanceDue: request.total || 0,
      status: "confirmed",
      assignedPhotographerId: assignedPhotographerId || null,
      assignedPhotographerName: assignedPhotographerName || null,
      scheduledDate: scheduledDate ? admin.firestore.Timestamp.fromDate(new Date(scheduledDate)) : null,
      scheduledTime: scheduledTime || request.scheduledTime || null,
      squareFootage: request.squareFootage || null,
      accessMethod: request.accessMethod || null,
      propertyStatus: request.propertyStatus || null,
      furnishingStatus: request.furnishingStatus || null,
      notes: request.vibeNote || "",
      internalNotes: internalNotes || "",
      confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    const orderRef = await db$9().collection("orders").add(orderData);
    await db$9().collection("appointments").add({
      orderId: orderRef.id,
      clientId,
      clientName: request.clientName,
      address: request.address,
      scheduledDate: scheduledDate ? admin.firestore.Timestamp.fromDate(new Date(scheduledDate)) : null,
      scheduledTime: scheduledTime || request.scheduledTime || null,
      photographerId: assignedPhotographerId || null,
      photographerName: assignedPhotographerName || null,
      services: request.lineItems || [],
      status: "confirmed",
      notes: request.vibeNote || "",
      internalNotes: internalNotes || "",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    await db$9().collection("galleries").add({
      orderId: orderRef.id,
      clientId,
      clientName: request.clientName,
      address: request.address,
      title: `${request.address} — Gallery`,
      status: "pending_upload",
      mediaItems: [],
      downloadEnabled: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    await db$9().collection("invoices").add({
      orderId: orderRef.id,
      clientId,
      clientName: request.clientName,
      clientEmail: request.email,
      invoiceNumber: await generateInvoiceNumber(),
      lineItems: request.lineItems || [],
      subtotal: request.pricing?.subtotal || request.total || 0,
      tax: request.pricing?.tax || 0,
      total: request.total || 0,
      amountPaid: 0,
      amountDue: request.total || 0,
      status: "draft",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    await requestDoc.ref.update({
      status: "confirmed",
      convertedToOrderId: orderRef.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    await sendEmail({
      to: request.email,
      template: "order_confirmed",
      variables: {
        clientName: request.clientName,
        address: request.address,
        scheduledDate: scheduledDate || "To be confirmed",
        scheduledTime: scheduledTime || "To be confirmed",
        photographerName: assignedPhotographerName || "Our team",
        orderId: orderRef.id,
        portalUrl: `${process.env.APP_URL}/portal`
      }
    }).catch((err) => console.error("[Bookings] Confirmation email failed:", err));
    return res.json({
      success: true,
      orderId: orderRef.id,
      clientId,
      message: "Booking confirmed and order created."
    });
  } catch (err) {
    console.error("[Bookings] Confirm error:", err);
    return res.status(500).json({ error: "Failed to confirm booking." });
  }
});
router$9.patch("/:id/decline", requireCoordinator, async (req, res) => {
  try {
    const { reason } = req.body;
    const doc = await db$9().collection("orderRequests").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: "Not found." });
    await doc.ref.update({
      status: "declined",
      declineReason: reason || "",
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to decline booking." });
  }
});
async function generateInvoiceNumber() {
  const year = (/* @__PURE__ */ new Date()).getFullYear();
  const snapshot = await db$9().collection("invoices").where("invoiceNumber", ">=", `INV-${year}-`).orderBy("invoiceNumber", "desc").limit(1).get();
  if (snapshot.empty) {
    return `INV-${year}-0001`;
  }
  const last = snapshot.docs[0].data().invoiceNumber;
  const num = parseInt(last.split("-")[2] || "0") + 1;
  return `INV-${year}-${String(num).padStart(4, "0")}`;
}
const router$8 = Router();
const db$8 = () => admin.firestore();
router$8.get("/", requireStaff, async (req, res) => {
  try {
    const { status, photographerId, limit = "50", startAfter } = req.query;
    let query = db$8().collection("orders").orderBy("createdAt", "desc");
    if (status) query = query.where("status", "==", status);
    if (photographerId) {
      query = query.where("assignedPhotographerId", "==", photographerId);
    }
    const limitNum = Math.min(Number(limit), 200);
    query = query.limit(limitNum);
    if (startAfter) {
      const cursorDoc = await db$8().collection("orders").doc(startAfter).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }
    const snapshot = await query.get();
    const orders = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    return res.json({
      orders,
      hasMore: orders.length === limitNum,
      lastId: orders[orders.length - 1]?.id || null
    });
  } catch (err) {
    console.error("[Orders] List error:", err);
    return res.status(500).json({ error: "Failed to fetch orders." });
  }
});
router$8.get("/dashboard", requireStaff, async (_req, res) => {
  try {
    const now = /* @__PURE__ */ new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [allOrders, todayOrders, monthTransactions, pendingRequests] = await Promise.all([
      db$8().collection("orders").get(),
      db$8().collection("orders").where("createdAt", ">=", admin.firestore.Timestamp.fromDate(todayStart)).get(),
      db$8().collection("transactions").where("createdAt", ">=", admin.firestore.Timestamp.fromDate(monthStart)).where("status", "==", "completed").get(),
      db$8().collection("orderRequests").where("status", "==", "new").get()
    ]);
    const statusCounts = {};
    allOrders.docs.forEach((d) => {
      const s = d.data().status;
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    });
    const monthRevenue = monthTransactions.docs.reduce(
      (sum, d) => sum + (d.data().amount || 0),
      0
    );
    return res.json({
      totalOrders: allOrders.size,
      todayOrders: todayOrders.size,
      pendingRequests: pendingRequests.size,
      monthRevenue,
      statusBreakdown: statusCounts,
      activeOrders: (statusCounts["confirmed"] || 0) + (statusCounts["scheduled"] || 0) + (statusCounts["in_progress"] || 0)
    });
  } catch (err) {
    console.error("[Orders] Dashboard error:", err);
    return res.status(500).json({ error: "Failed to fetch dashboard stats." });
  }
});
router$8.get("/:id", requireStaff, async (req, res) => {
  try {
    const orderDoc = await db$8().collection("orders").doc(req.params.id).get();
    if (!orderDoc.exists) return res.status(404).json({ error: "Order not found." });
    const order = { id: orderDoc.id, ...orderDoc.data() };
    const [gallery, invoice, appointment, messages] = await Promise.all([
      db$8().collection("galleries").where("orderId", "==", req.params.id).limit(1).get(),
      db$8().collection("invoices").where("orderId", "==", req.params.id).limit(1).get(),
      db$8().collection("appointments").where("orderId", "==", req.params.id).limit(1).get(),
      db$8().collection("messages").where("orderId", "==", req.params.id).orderBy("createdAt", "desc").limit(20).get()
    ]);
    return res.json({
      order,
      gallery: gallery.empty ? null : { id: gallery.docs[0].id, ...gallery.docs[0].data() },
      invoice: invoice.empty ? null : { id: invoice.docs[0].id, ...invoice.docs[0].data() },
      appointment: appointment.empty ? null : { id: appointment.docs[0].id, ...appointment.docs[0].data() },
      messages: messages.docs.map((d) => ({ id: d.id, ...d.data() }))
    });
  } catch (err) {
    console.error("[Orders] Fetch error:", err);
    return res.status(500).json({ error: "Failed to fetch order." });
  }
});
router$8.patch("/:id", requireCoordinator, async (req, res) => {
  try {
    const allowed = [
      "status",
      "assignedPhotographerId",
      "assignedPhotographerName",
      "scheduledDate",
      "scheduledTime",
      "internalNotes",
      "notes",
      "accessMethod",
      "squareFootage"
    ];
    const updates = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    allowed.forEach((key) => {
      if (key in req.body) updates[key] = req.body[key];
    });
    if (updates.scheduledDate && typeof updates.scheduledDate === "string") {
      updates.scheduledDate = admin.firestore.Timestamp.fromDate(
        new Date(updates.scheduledDate)
      );
    }
    await db$8().collection("orders").doc(req.params.id).update(updates);
    return res.json({ success: true });
  } catch (err) {
    console.error("[Orders] Update error:", err);
    return res.status(500).json({ error: "Failed to update order." });
  }
});
const VALID_TRANSITIONS = {
  confirmed: ["scheduled", "cancelled"],
  scheduled: ["in_progress", "cancelled"],
  in_progress: ["shot_complete", "cancelled"],
  shot_complete: ["editing"],
  editing: ["ready_for_delivery"],
  ready_for_delivery: ["delivered"],
  delivered: ["completed"],
  completed: [],
  cancelled: []
};
router$8.patch("/:id/status", requireCoordinator, async (req, res) => {
  try {
    const { status, note } = req.body;
    const orderDoc = await db$8().collection("orders").doc(req.params.id).get();
    if (!orderDoc.exists) return res.status(404).json({ error: "Order not found." });
    const currentStatus = orderDoc.data().status;
    const validNext = VALID_TRANSITIONS[currentStatus] || [];
    if (!validNext.includes(status)) {
      return res.status(400).json({
        error: `Cannot transition from '${currentStatus}' to '${status}'.`,
        validTransitions: validNext
      });
    }
    const updates = {
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    if (status === "completed") {
      updates.completedAt = admin.firestore.FieldValue.serverTimestamp();
    }
    await orderDoc.ref.update(updates);
    const apptSnapshot = await db$8().collection("appointments").where("orderId", "==", req.params.id).limit(1).get();
    if (!apptSnapshot.empty) {
      const apptStatus = status === "in_progress" ? "in_progress" : status === "shot_complete" || status === "editing" ? "completed" : status === "cancelled" ? "cancelled" : void 0;
      if (apptStatus) {
        await apptSnapshot.docs[0].ref.update({ status: apptStatus });
      }
    }
    await db$8().collection("agentLogs").add({
      agent: "nora",
      action: `Order status changed: ${currentStatus} → ${status}`,
      summary: `Order ${req.params.id} transitioned to ${status}`,
      status: "completed",
      relatedId: req.params.id,
      relatedType: "order",
      priority: "low",
      requiresHumanReview: false,
      details: note || "",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.json({ success: true, status });
  } catch (err) {
    console.error("[Orders] Status update error:", err);
    return res.status(500).json({ error: "Failed to update order status." });
  }
});
router$8.get("/:id/timeline", requireStaff, async (req, res) => {
  try {
    const [messages, editRequests, agentLogs] = await Promise.all([
      db$8().collection("messages").where("orderId", "==", req.params.id).orderBy("createdAt", "asc").get(),
      db$8().collection("editRequests").where("orderId", "==", req.params.id).orderBy("createdAt", "asc").get(),
      db$8().collection("agentLogs").where("relatedId", "==", req.params.id).orderBy("createdAt", "asc").get()
    ]);
    const timeline = [
      ...messages.docs.map((d) => ({ type: "message", ...d.data(), id: d.id })),
      ...editRequests.docs.map((d) => ({ type: "editRequest", ...d.data(), id: d.id })),
      ...agentLogs.docs.map((d) => ({ type: "agentLog", ...d.data(), id: d.id }))
    ].sort((a, b) => {
      const aTime = a.createdAt?.toMillis() || 0;
      const bTime = b.createdAt?.toMillis() || 0;
      return aTime - bTime;
    });
    return res.json(timeline);
  } catch (err) {
    console.error("[Orders] Timeline error:", err);
    return res.status(500).json({ error: "Failed to fetch timeline." });
  }
});
const router$7 = Router();
const db$7 = () => admin.firestore();
const storage = () => admin.storage().bucket();
router$7.get("/", requireStaff, async (req, res) => {
  try {
    const { status, orderId } = req.query;
    let query = db$7().collection("galleries").orderBy("createdAt", "desc");
    if (status) query = query.where("status", "==", status);
    if (orderId) query = query.where("orderId", "==", orderId);
    const snapshot = await query.limit(100).get();
    return res.json(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch galleries." });
  }
});
router$7.get("/:id", requireAuth, async (req, res) => {
  try {
    const doc = await db$7().collection("galleries").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: "Gallery not found." });
    const gallery = doc.data();
    const staffDoc = await db$7().collection("staff").doc(req.user.uid).get();
    if (!staffDoc.exists) {
      if (gallery.clientId !== req.user.uid) {
        return res.status(403).json({ error: "Access denied." });
      }
      if (!["delivered", "approved"].includes(gallery.status)) {
        return res.status(403).json({ error: "Gallery not yet available." });
      }
    }
    return res.json({ id: doc.id, ...gallery });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch gallery." });
  }
});
router$7.post("/:id/upload-url", requirePhotographer, async (req, res) => {
  try {
    const { fileName, fileType, isRaw = false } = req.body;
    if (!fileName || !fileType) {
      return res.status(400).json({ error: "fileName and fileType required." });
    }
    const galleryDoc = await db$7().collection("galleries").doc(req.params.id).get();
    if (!galleryDoc.exists) return res.status(404).json({ error: "Gallery not found." });
    const folder = isRaw ? "raw" : "edited";
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path2 = `galleries/${req.params.id}/${folder}/${Date.now()}_${safeName}`;
    const file = storage().file(path2);
    const [uploadUrl] = await file.getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + 15 * 60 * 1e3,
      // 15 minutes
      contentType: fileType
    });
    return res.json({ uploadUrl, path: path2, fileName: safeName });
  } catch (err) {
    console.error("[Galleries] Upload URL error:", err);
    return res.status(500).json({ error: "Failed to generate upload URL." });
  }
});
router$7.post("/:id/media", requirePhotographer, async (req, res) => {
  try {
    const {
      storagePath,
      fileName,
      type = "photo",
      width,
      height,
      fileSize,
      isRaw = false
    } = req.body;
    if (!storagePath || !fileName) {
      return res.status(400).json({ error: "storagePath and fileName required." });
    }
    const galleryDoc = await db$7().collection("galleries").doc(req.params.id).get();
    if (!galleryDoc.exists) return res.status(404).json({ error: "Gallery not found." });
    const file = storage().file(storagePath);
    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 7 * 24 * 60 * 60 * 1e3
    });
    const mediaItem = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      url,
      storagePath,
      fileName,
      type,
      width: width || null,
      height: height || null,
      fileSize: fileSize || null,
      isRaw,
      isEdited: !isRaw,
      uploadedBy: req.user.uid,
      uploadedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    await galleryDoc.ref.update({
      mediaItems: admin.firestore.FieldValue.arrayUnion(mediaItem),
      status: isRaw ? "raw_uploaded" : "editing",
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.json({ success: true, mediaItem });
  } catch (err) {
    console.error("[Galleries] Media register error:", err);
    return res.status(500).json({ error: "Failed to register media." });
  }
});
router$7.patch("/:id/status", requireCoordinator, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ["pending_upload", "raw_uploaded", "editing", "ready_for_review", "approved", "delivered"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status." });
    }
    await db$7().collection("galleries").doc(req.params.id).update({
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to update gallery status." });
  }
});
router$7.post("/:id/deliver", requireCoordinator, async (req, res) => {
  try {
    const galleryDoc = await db$7().collection("galleries").doc(req.params.id).get();
    if (!galleryDoc.exists) return res.status(404).json({ error: "Gallery not found." });
    const gallery = galleryDoc.data();
    const { downloadEnabled = true, expiresInDays = 30 } = req.body;
    const expiresAt = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1e3)
    );
    const deliveryUrl = `${process.env.APP_URL}/gallery/${req.params.id}`;
    await galleryDoc.ref.update({
      status: "delivered",
      deliveryUrl,
      downloadEnabled,
      expiresAt,
      deliveredAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    if (gallery.orderId) {
      await db$7().collection("orders").doc(gallery.orderId).update({
        status: "delivered",
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    const clientDoc = await db$7().collection("clients").doc(gallery.clientId).get();
    const client = clientDoc.data();
    if (client?.email) {
      const invoiceSnap = await db$7().collection("invoices").where("orderId", "==", gallery.orderId).limit(1).get();
      const invoice = invoiceSnap.empty ? null : invoiceSnap.docs[0].data();
      await sendEmail({
        to: client.email,
        template: "gallery_delivery",
        variables: {
          clientName: gallery.clientName,
          address: gallery.address,
          galleryUrl: deliveryUrl,
          invoiceAmount: invoice ? `$${invoice.total.toFixed(2)}` : "",
          paymentUrl: invoice ? `${process.env.APP_URL}/invoice/${invoiceSnap.docs[0].id}` : "",
          expiresAt: `${expiresInDays} days`
        }
      });
    }
    return res.json({ success: true, deliveryUrl });
  } catch (err) {
    console.error("[Galleries] Deliver error:", err);
    return res.status(500).json({ error: "Failed to deliver gallery." });
  }
});
router$7.delete("/:id/media/:mediaId", requireCoordinator, async (req, res) => {
  try {
    const galleryDoc = await db$7().collection("galleries").doc(req.params.id).get();
    if (!galleryDoc.exists) return res.status(404).json({ error: "Gallery not found." });
    const gallery = galleryDoc.data();
    const mediaItems = (gallery.mediaItems || []).filter(
      (item) => item.id !== req.params.mediaId
    );
    await galleryDoc.ref.update({
      mediaItems,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to remove media item." });
  }
});
const router$6 = Router();
const db$6 = () => admin.firestore();
const stripe$1 = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-06-20"
});
router$6.post("/create-intent", requireAuth, async (req, res) => {
  try {
    const { invoiceId, amount, currency = "usd" } = req.body;
    if (!invoiceId || !amount) {
      return res.status(400).json({ error: "invoiceId and amount required." });
    }
    const invoiceDoc = await db$6().collection("invoices").doc(invoiceId).get();
    if (!invoiceDoc.exists) return res.status(404).json({ error: "Invoice not found." });
    const invoice = invoiceDoc.data();
    let stripeCustomerId = invoice.stripeCustomerId;
    if (!stripeCustomerId) {
      const clientDoc = await db$6().collection("clients").doc(invoice.clientId).get();
      const client = clientDoc.data();
      if (client) {
        const customer = await stripe$1.customers.create({
          email: invoice.clientEmail,
          name: invoice.clientName,
          metadata: {
            clientId: invoice.clientId,
            firebaseUid: client.firebaseUid || ""
          }
        });
        stripeCustomerId = customer.id;
        await db$6().collection("clients").doc(invoice.clientId).update({
          stripeCustomerId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    }
    const paymentIntent = await stripe$1.paymentIntents.create({
      amount: Math.round(amount * 100),
      // cents
      currency,
      customer: stripeCustomerId || void 0,
      metadata: {
        invoiceId,
        orderId: invoice.orderId || "",
        clientId: invoice.clientId || "",
        clientName: invoice.clientName || ""
      },
      description: `Iconic Images — Invoice ${invoice.invoiceNumber}`,
      receipt_email: invoice.clientEmail
    });
    await invoiceDoc.ref.update({
      stripePaymentIntentId: paymentIntent.id,
      status: "sent",
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (err) {
    console.error("[Payments] Create intent error:", err);
    return res.status(500).json({ error: "Failed to create payment intent." });
  }
});
router$6.post("/send-invoice", requireCoordinator, async (req, res) => {
  try {
    const { invoiceId } = req.body;
    if (!invoiceId) return res.status(400).json({ error: "invoiceId required." });
    const invoiceDoc = await db$6().collection("invoices").doc(invoiceId).get();
    if (!invoiceDoc.exists) return res.status(404).json({ error: "Invoice not found." });
    const invoice = invoiceDoc.data();
    const paymentUrl = `${process.env.APP_URL}/invoice/${invoiceId}`;
    await sendEmail({
      to: invoice.clientEmail,
      template: "invoice",
      variables: {
        clientName: invoice.clientName,
        invoiceNumber: invoice.invoiceNumber,
        amount: `$${invoice.total.toFixed(2)}`,
        paymentUrl,
        dueDate: invoice.dueDate ? invoice.dueDate.toDate().toLocaleDateString() : "Upon receipt"
      }
    });
    await invoiceDoc.ref.update({
      status: "sent",
      paymentUrl,
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.json({ success: true, paymentUrl });
  } catch (err) {
    console.error("[Payments] Send invoice error:", err);
    return res.status(500).json({ error: "Failed to send invoice." });
  }
});
router$6.get("/invoice/:id", async (req, res) => {
  try {
    const invoiceDoc = await db$6().collection("invoices").doc(req.params.id).get();
    if (!invoiceDoc.exists) return res.status(404).json({ error: "Invoice not found." });
    const invoice = invoiceDoc.data();
    return res.json({
      id: invoiceDoc.id,
      invoiceNumber: invoice.invoiceNumber,
      clientName: invoice.clientName,
      lineItems: invoice.lineItems,
      subtotal: invoice.subtotal,
      tax: invoice.tax,
      total: invoice.total,
      amountPaid: invoice.amountPaid,
      amountDue: invoice.amountDue,
      status: invoice.status,
      stripePaymentIntentId: invoice.stripePaymentIntentId
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch invoice." });
  }
});
router$6.post(
  "/webhook",
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
    let event;
    try {
      event = stripe$1.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error("[Payments] Webhook signature verification failed:", err);
      return res.status(400).json({ error: "Invalid webhook signature." });
    }
    try {
      switch (event.type) {
        case "payment_intent.succeeded": {
          const intent = event.data.object;
          await handlePaymentSucceeded(intent);
          break;
        }
        case "payment_intent.payment_failed": {
          const intent = event.data.object;
          await handlePaymentFailed(intent);
          break;
        }
        case "charge.refunded": {
          const charge = event.data.object;
          await handleRefund(charge);
          break;
        }
      }
      return res.json({ received: true });
    } catch (err) {
      console.error("[Payments] Webhook handler error:", err);
      return res.status(500).json({ error: "Webhook handler failed." });
    }
  }
);
router$6.get("/transactions", requireCoordinator, async (req, res) => {
  try {
    const { startDate, endDate, limit = "50" } = req.query;
    let query = db$6().collection("transactions").orderBy("createdAt", "desc");
    if (startDate) {
      query = query.where(
        "createdAt",
        ">=",
        admin.firestore.Timestamp.fromDate(new Date(startDate))
      );
    }
    if (endDate) {
      query = query.where(
        "createdAt",
        "<=",
        admin.firestore.Timestamp.fromDate(new Date(endDate))
      );
    }
    const snapshot = await query.limit(Number(limit)).get();
    const transactions = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    const totalRevenue = transactions.filter((t) => t.status === "completed" && t.type === "payment").reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    return res.json({ transactions, totalRevenue });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch transactions." });
  }
});
async function handlePaymentSucceeded(intent) {
  const { invoiceId, orderId, clientId, clientName } = intent.metadata;
  if (!invoiceId) return;
  const amount = intent.amount_received / 100;
  const invoiceRef = db$6().collection("invoices").doc(invoiceId);
  const invoiceDoc = await invoiceRef.get();
  if (!invoiceDoc.exists) return;
  const invoice = invoiceDoc.data();
  const newAmountPaid = (invoice.amountPaid || 0) + amount;
  const newAmountDue = Math.max(0, invoice.total - newAmountPaid);
  await invoiceRef.update({
    amountPaid: newAmountPaid,
    amountDue: newAmountDue,
    status: newAmountDue <= 0 ? "paid" : "partial",
    paidAt: newAmountDue <= 0 ? admin.firestore.FieldValue.serverTimestamp() : null,
    paymentMethod: "stripe",
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  await db$6().collection("transactions").add({
    type: "payment",
    orderId: orderId || invoice.orderId,
    invoiceId,
    clientId: clientId || invoice.clientId,
    clientName: clientName || invoice.clientName,
    amount,
    paymentMethod: "stripe",
    status: "completed",
    stripePaymentIntentId: intent.id,
    processedAt: admin.firestore.FieldValue.serverTimestamp(),
    processedBy: "system",
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  if (orderId) {
    await db$6().collection("orders").doc(orderId).update({
      depositPaid: admin.firestore.FieldValue.increment(amount),
      balanceDue: admin.firestore.FieldValue.increment(-amount),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }
  if (clientId) {
    await db$6().collection("clients").doc(clientId).update({
      totalSpend: admin.firestore.FieldValue.increment(amount),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }
  if (invoice.clientEmail) {
    await sendEmail({
      to: invoice.clientEmail,
      template: "payment_receipt",
      variables: {
        clientName: invoice.clientName,
        amount: `$${amount.toFixed(2)}`,
        invoiceNumber: invoice.invoiceNumber,
        balance: `$${newAmountDue.toFixed(2)}`
      }
    }).catch(console.error);
  }
}
async function handlePaymentFailed(intent) {
  const { invoiceId } = intent.metadata;
  if (!invoiceId) return;
  await db$6().collection("agentLogs").add({
    agent: "travis",
    action: "Payment failed",
    summary: `Payment failed for invoice ${invoiceId}`,
    status: "flagged",
    relatedId: invoiceId,
    relatedType: "invoice",
    priority: "high",
    requiresHumanReview: true,
    details: intent.last_payment_error?.message || "Unknown error",
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
}
async function handleRefund(charge) {
  if (!charge.payment_intent) return;
  const intentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent.id;
  const invoiceSnap = await db$6().collection("invoices").where("stripePaymentIntentId", "==", intentId).limit(1).get();
  if (invoiceSnap.empty) return;
  const invoiceDoc = invoiceSnap.docs[0];
  const refundAmount = charge.amount_refunded / 100;
  await db$6().collection("transactions").add({
    type: "refund",
    invoiceId: invoiceDoc.id,
    clientId: invoiceDoc.data().clientId,
    clientName: invoiceDoc.data().clientName,
    amount: -refundAmount,
    paymentMethod: "stripe",
    status: "completed",
    stripePaymentIntentId: intentId,
    processedAt: admin.firestore.FieldValue.serverTimestamp(),
    processedBy: "system",
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
}
const router$5 = Router();
const db$5 = () => admin.firestore();
const VSAI_API_BASE = "https://api.virtualstagingai.app/v1";
const VSAI_API_KEY = process.env.VSAI_API_KEY || process.env.VIRTUAL_STAGING_AI_API_KEY || "";
const VSAI_PRICE_CENTS = parseInt(process.env.VSAI_PRICE_CENTS || "1500", 10);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-06-20"
});
router$5.post("/create", requireAuth, async (req, res) => {
  try {
    if (!VSAI_API_KEY) {
      console.error("[VSAI] VSAI_API_KEY is not set");
      return res.status(500).json({ error: "VSAI API key not configured." });
    }
    const {
      imageUrl,
      roomType = "living",
      style = "modern"
    } = req.body;
    if (!imageUrl) {
      return res.status(400).json({ error: "imageUrl is required." });
    }
    const userId = req.user.uid;
    const payload = {
      image_url: imageUrl,
      room_type: roomType,
      style,
      wait_for_completion: false,
      add_virtually_staged_watermark: false
    };
    console.log("[VSAI] Creating render:", JSON.stringify(payload));
    const vsaiResponse = await fetch(`${VSAI_API_BASE}/render/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Api-Key ${VSAI_API_KEY}`
      },
      body: JSON.stringify(payload)
    });
    const responseText = await vsaiResponse.text();
    console.log(`[VSAI] Create response ${vsaiResponse.status}:`, responseText);
    if (!vsaiResponse.ok) {
      return res.status(vsaiResponse.status).json({
        error: `VSAI API error: ${responseText}`
      });
    }
    let vsaiData;
    try {
      vsaiData = JSON.parse(responseText);
    } catch {
      return res.status(500).json({ error: "Invalid VSAI response format." });
    }
    const jobRef = await db$5().collection("vsaiJobs").add({
      userId,
      imageUrl,
      roomType,
      style,
      vsaiRenderId: vsaiData.id,
      status: "processing",
      isPaid: false,
      resultUrl: null,
      resultUrls: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`[VSAI] Job created: ${jobRef.id} → vsaiRenderId: ${vsaiData.id}`);
    return res.status(200).json({
      jobId: jobRef.id,
      vsaiRenderId: vsaiData.id,
      status: "processing"
    });
  } catch (err) {
    console.error("[VSAI] Create error:", err);
    return res.status(500).json({ error: String(err) });
  }
});
router$5.get("/result/:jobId", requireAuth, async (req, res) => {
  try {
    const jobDoc = await db$5().collection("vsaiJobs").doc(req.params.jobId).get();
    if (!jobDoc.exists) return res.status(404).json({ error: "Job not found." });
    const job = jobDoc.data();
    if (job.userId !== req.user.uid) {
      return res.status(403).json({ error: "Access denied." });
    }
    if (job.status === "completed" && job.resultUrl) {
      return res.json({
        jobId: req.params.jobId,
        status: "completed",
        resultUrl: job.resultUrl,
        resultUrls: job.resultUrls || [job.resultUrl]
      });
    }
    if (job.status === "failed") {
      return res.json({
        jobId: req.params.jobId,
        status: "failed",
        error: job.error || "Render failed."
      });
    }
    if (!VSAI_API_KEY) {
      return res.status(500).json({ error: "VSAI API key not configured." });
    }
    const vsaiResponse = await fetch(
      `${VSAI_API_BASE}/render/${job.vsaiRenderId}`,
      { headers: { Authorization: `Api-Key ${VSAI_API_KEY}` } }
    );
    const responseText = await vsaiResponse.text();
    console.log(`[VSAI] Poll ${job.vsaiRenderId} → ${vsaiResponse.status}: ${responseText}`);
    if (!vsaiResponse.ok) {
      return res.status(vsaiResponse.status).json({
        error: `VSAI poll error: ${responseText}`
      });
    }
    let vsaiData;
    try {
      vsaiData = JSON.parse(responseText);
    } catch {
      return res.status(500).json({ error: "Invalid VSAI response format." });
    }
    const rawStatus = (vsaiData.status || "").toLowerCase();
    const isComplete = rawStatus === "done" || rawStatus === "completed";
    const isFailed = rawStatus === "error" || rawStatus === "failed";
    const normalizedStatus = isComplete ? "completed" : isFailed ? "failed" : "processing";
    const resultUrl = vsaiData.output_url || vsaiData.rendered_image || vsaiData.result_url || vsaiData.output_urls && vsaiData.output_urls[0] || null;
    const resultUrls = vsaiData.output_urls || (resultUrl ? [resultUrl] : []);
    const updates = {
      status: normalizedStatus,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    if (isComplete && resultUrl) {
      updates.resultUrl = resultUrl;
      updates.resultUrls = resultUrls;
    }
    if (isFailed) {
      updates.error = vsaiData.error || vsaiData.message || "Render failed on VSAI.";
    }
    await jobDoc.ref.update(updates);
    return res.json({
      jobId: req.params.jobId,
      status: normalizedStatus,
      resultUrl: resultUrl || null,
      resultUrls: resultUrls.length ? resultUrls : null,
      error: isFailed ? vsaiData.error || vsaiData.message || "Render failed." : void 0
    });
  } catch (err) {
    console.error("[VSAI] Poll error:", err);
    return res.status(500).json({ error: String(err) });
  }
});
router$5.post("/variation", requireAuth, async (req, res) => {
  try {
    const { jobId, style, roomType } = req.body;
    if (!jobId) {
      return res.status(400).json({ error: "jobId required." });
    }
    const jobDoc = await db$5().collection("vsaiJobs").doc(jobId).get();
    if (!jobDoc.exists) return res.status(404).json({ error: "Job not found." });
    const job = jobDoc.data();
    if (job.userId !== req.user.uid) {
      return res.status(403).json({ error: "Access denied." });
    }
    const newStyle = style || job.style;
    const newRoomType = roomType || job.roomType;
    const payload = {
      image_url: job.imageUrl,
      room_type: newRoomType,
      style: newStyle,
      wait_for_completion: false,
      add_virtually_staged_watermark: false
    };
    console.log("[VSAI] Creating variation:", JSON.stringify(payload));
    const vsaiResponse = await fetch(`${VSAI_API_BASE}/render/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Api-Key ${VSAI_API_KEY}`
      },
      body: JSON.stringify(payload)
    });
    const responseText = await vsaiResponse.text();
    console.log(`[VSAI] Variation response ${vsaiResponse.status}:`, responseText);
    if (!vsaiResponse.ok) {
      return res.status(vsaiResponse.status).json({
        error: `VSAI variation error: ${responseText}`
      });
    }
    const vsaiData = JSON.parse(responseText);
    const variationRef = await db$5().collection("vsaiJobs").add({
      userId: req.user.uid,
      imageUrl: job.imageUrl,
      roomType: newRoomType,
      style: newStyle,
      vsaiRenderId: vsaiData.id,
      status: "processing",
      isPaid: false,
      parentJobId: jobId,
      resultUrl: null,
      resultUrls: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.json({
      jobId: variationRef.id,
      vsaiRenderId: vsaiData.id,
      status: "processing"
    });
  } catch (err) {
    console.error("[VSAI] Variation error:", err);
    return res.status(500).json({ error: String(err) });
  }
});
router$5.post("/checkout", requireAuth, async (req, res) => {
  try {
    const { jobIds, successUrl, cancelUrl } = req.body;
    if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
      return res.status(400).json({ error: "jobIds array required." });
    }
    const userId = req.user.uid;
    const jobDocs = await Promise.all(
      jobIds.map((id) => db$5().collection("vsaiJobs").doc(id).get())
    );
    for (let i = 0; i < jobDocs.length; i++) {
      const doc = jobDocs[i];
      if (!doc.exists) {
        return res.status(404).json({ error: `Job ${jobIds[i]} not found.` });
      }
      const data = doc.data();
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
    const origin = process.env.FRONTEND_URL || req.headers.origin || "https://iconicimagestx.com";
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: jobDocs.map((doc) => {
        const job = doc.data();
        return {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Virtual Staging — ${capitalize(job.roomType)} (${capitalize(job.style)})`,
              description: "AI-staged photo delivered in full resolution",
              images: job.resultUrl ? [job.resultUrl] : void 0
            },
            unit_amount: VSAI_PRICE_CENTS
          },
          quantity: 1
        };
      }),
      mode: "payment",
      success_url: successUrl || `${origin}/services/virtual-staging/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${origin}/services/virtual-staging`,
      metadata: {
        jobIds: JSON.stringify(jobIds),
        userId,
        type: "vsai_renders"
      },
      customer_email: req.user.email || void 0
    });
    await Promise.all(
      jobDocs.map(
        (doc) => doc.ref.update({
          stripeSessionId: session.id,
          paymentStatus: "pending",
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        })
      )
    );
    return res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error("[VSAI] Checkout error:", err);
    return res.status(500).json({ error: String(err) });
  }
});
router$5.post(
  "/webhook/stripe",
  // Raw body needed — mount before express.json() parses it
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_VSAI_WEBHOOK_SECRET || "";
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody || req.body,
        sig,
        webhookSecret
      );
    } catch (err) {
      console.error("[VSAI Webhook] Signature verification failed:", err);
      return res.status(400).send("Webhook signature failed.");
    }
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      if (session.metadata?.type === "vsai_renders") {
        const jobIds = JSON.parse(session.metadata.jobIds || "[]");
        await Promise.all(
          jobIds.map(
            (id) => db$5().collection("vsaiJobs").doc(id).update({
              isPaid: true,
              paymentStatus: "paid",
              stripeSessionId: session.id,
              paidAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            })
          )
        );
        console.log(`[VSAI Webhook] Marked ${jobIds.length} jobs as paid for session ${session.id}`);
      }
    }
    res.json({ received: true });
  }
);
router$5.get("/options", (_req, res) => {
  return res.json({
    roomTypes: [
      { value: "living", label: "Living Room" },
      { value: "bed", label: "Bedroom" },
      { value: "dining", label: "Dining Room" },
      { value: "kitchen", label: "Kitchen" },
      { value: "home_office", label: "Home Office" },
      { value: "bathroom", label: "Bathroom" },
      { value: "outdoor", label: "Outdoor / Patio" },
      { value: "kids_room", label: "Kids Room" }
    ],
    styles: [
      { value: "modern", label: "Modern" },
      { value: "scandinavian", label: "Scandinavian" },
      { value: "industrial", label: "Industrial" },
      { value: "mid-century modern", label: "Mid-Century" },
      { value: "coastal", label: "Coastal" },
      { value: "american", label: "American" },
      { value: "southwestern", label: "Southwestern" },
      { value: "farmhouse", label: "Farmhouse" },
      { value: "luxury", label: "Luxury" },
      { value: "standard", label: "Standard" }
    ],
    pricePerPhoto: VSAI_PRICE_CENTS / 100
  });
});
function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}
const router$4 = Router();
const db$4 = () => admin.firestore();
router$4.get("/:orderId", requireAuth, async (req, res) => {
  try {
    const orderDoc = await db$4().collection("orders").doc(req.params.orderId).get();
    if (!orderDoc.exists) return res.status(404).json({ error: "Order not found." });
    const order = orderDoc.data();
    const staffDoc = await db$4().collection("staff").doc(req.user.uid).get();
    const isStaff = staffDoc.exists;
    if (!isStaff && order.clientId !== req.user.uid) {
      return res.status(403).json({ error: "Access denied." });
    }
    const snapshot = await db$4().collection("messages").where("orderId", "==", req.params.orderId).orderBy("createdAt", "asc").limit(100).get();
    const messages = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    const unread = snapshot.docs.filter(
      (d) => !d.data().isRead && d.data().senderId !== req.user.uid
    );
    const batch = db$4().batch();
    unread.forEach((d) => {
      batch.update(d.ref, {
        isRead: true,
        readAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });
    if (unread.length > 0) await batch.commit();
    return res.json(messages);
  } catch (err) {
    console.error("[Messages] Fetch error:", err);
    return res.status(500).json({ error: "Failed to fetch messages." });
  }
});
router$4.post("/:orderId", requireAuth, async (req, res) => {
  try {
    const { content, attachments } = req.body;
    if (!content?.trim()) {
      return res.status(400).json({ error: "Message content required." });
    }
    const orderDoc = await db$4().collection("orders").doc(req.params.orderId).get();
    if (!orderDoc.exists) return res.status(404).json({ error: "Order not found." });
    const order = orderDoc.data();
    const staffDoc = await db$4().collection("staff").doc(req.user.uid).get();
    const isStaff = staffDoc.exists;
    if (!isStaff && order.clientId !== req.user.uid) {
      return res.status(403).json({ error: "Access denied." });
    }
    let senderName = "Unknown";
    let senderType = "client";
    if (isStaff) {
      const staff = staffDoc.data();
      senderName = `${staff.firstName} ${staff.lastName}`.trim();
      senderType = "staff";
    } else {
      const clientDoc = await db$4().collection("clients").doc(order.clientId).get();
      if (clientDoc.exists) {
        const client = clientDoc.data();
        senderName = `${client.firstName} ${client.lastName}`.trim();
      }
    }
    const message = {
      orderId: req.params.orderId,
      senderId: req.user.uid,
      senderType,
      senderName,
      content: content.trim(),
      attachments: attachments || [],
      isRead: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    const docRef = await db$4().collection("messages").add(message);
    await db$4().collection("agentLogs").add({
      agent: "nora",
      action: "New message",
      summary: `New message on order ${req.params.orderId} from ${senderName}`,
      status: "completed",
      relatedId: req.params.orderId,
      relatedType: "order",
      priority: "low",
      requiresHumanReview: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.status(201).json({ id: docRef.id, ...message });
  } catch (err) {
    console.error("[Messages] Send error:", err);
    return res.status(500).json({ error: "Failed to send message." });
  }
});
router$4.get("/unread/count", requireStaff, async (_req, res) => {
  try {
    const snapshot = await db$4().collection("messages").where("isRead", "==", false).where("senderType", "==", "client").get();
    return res.json({ unreadCount: snapshot.size });
  } catch (err) {
    return res.status(500).json({ error: "Failed to get unread count." });
  }
});
const router$3 = Router();
const db$3 = () => admin.firestore();
router$3.get("/", requireStaff, async (req, res) => {
  try {
    const { status, search, limit = "50" } = req.query;
    let query = db$3().collection("clients").orderBy("createdAt", "desc");
    if (status) query = query.where("status", "==", status);
    const snapshot = await query.limit(Number(limit)).get();
    let clients = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (search) {
      const s = search.toLowerCase();
      clients = clients.filter((c) => {
        const name = `${c.firstName} ${c.lastName}`.toLowerCase();
        const email = (c.email || "").toLowerCase();
        return name.includes(s) || email.includes(s);
      });
    }
    return res.json(clients);
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch clients." });
  }
});
router$3.get("/me", requireAuth, async (req, res) => {
  try {
    const directDoc = await db$3().collection("clients").doc(req.user.uid).get();
    if (directDoc.exists) {
      const data = directDoc.data();
      if (data._redirect) {
        const realDoc = await db$3().collection("clients").doc(data._redirect).get();
        if (realDoc.exists) return res.json({ id: realDoc.id, ...realDoc.data() });
      }
      return res.json({ id: directDoc.id, ...data });
    }
    return res.status(404).json({ error: "Client profile not found." });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch profile." });
  }
});
router$3.get("/:id", requireStaff, async (req, res) => {
  try {
    const doc = await db$3().collection("clients").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: "Client not found." });
    const [orders, invoices] = await Promise.all([
      db$3().collection("orders").where("clientId", "==", req.params.id).orderBy("createdAt", "desc").limit(10).get(),
      db$3().collection("invoices").where("clientId", "==", req.params.id).orderBy("createdAt", "desc").limit(10).get()
    ]);
    return res.json({
      client: { id: doc.id, ...doc.data() },
      orders: orders.docs.map((d) => ({ id: d.id, ...d.data() })),
      invoices: invoices.docs.map((d) => ({ id: d.id, ...d.data() }))
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch client." });
  }
});
router$3.post("/", requireCoordinator, async (req, res) => {
  try {
    const { firstName, lastName, email, phone, address, notes, tags } = req.body;
    if (!firstName || !lastName || !email) {
      return res.status(400).json({ error: "firstName, lastName, and email required." });
    }
    const existing = await db$3().collection("clients").where("email", "==", email.toLowerCase()).limit(1).get();
    if (!existing.empty) {
      return res.status(409).json({ error: "Client with this email already exists.", id: existing.docs[0].id });
    }
    const ref = await db$3().collection("clients").add({
      firstName,
      lastName,
      email: email.toLowerCase().trim(),
      phone: phone || "",
      address: address || "",
      totalOrders: 0,
      totalSpend: 0,
      status: "active",
      portalAccess: false,
      notes: notes || "",
      tags: tags || [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.status(201).json({ id: ref.id });
  } catch (err) {
    return res.status(500).json({ error: "Failed to create client." });
  }
});
router$3.patch("/:id", requireCoordinator, async (req, res) => {
  try {
    const allowed = ["firstName", "lastName", "phone", "address", "status", "notes", "tags", "company"];
    const updates = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    allowed.forEach((k) => {
      if (k in req.body) updates[k] = req.body[k];
    });
    await db$3().collection("clients").doc(req.params.id).update(updates);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to update client." });
  }
});
const router$2 = Router();
const db$2 = () => admin.firestore();
router$2.get("/", requireStaff, async (_req, res) => {
  try {
    const snapshot = await db$2().collection("staff").where("isActive", "==", true).orderBy("firstName").get();
    return res.json(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch staff." });
  }
});
router$2.post("/", requireAdmin, async (req, res) => {
  try {
    const { firstName, lastName, email, phone, role, tempPassword } = req.body;
    if (!firstName || !lastName || !email || !role || !tempPassword) {
      return res.status(400).json({ error: "All fields required." });
    }
    const userRecord = await admin.auth().createUser({
      email: email.toLowerCase().trim(),
      password: tempPassword,
      displayName: `${firstName} ${lastName}`
    });
    await db$2().collection("staff").doc(userRecord.uid).set({
      firebaseUid: userRecord.uid,
      firstName,
      lastName,
      email: email.toLowerCase().trim(),
      phone: phone || "",
      role,
      isActive: true,
      assignedOrders: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.status(201).json({
      id: userRecord.uid,
      message: "Staff member created. They must change their password on first login."
    });
  } catch (err) {
    const code = err.code;
    if (code === "auth/email-already-exists") {
      return res.status(409).json({ error: "Email already in use." });
    }
    console.error("[Staff] Create error:", err);
    return res.status(500).json({ error: "Failed to create staff member." });
  }
});
router$2.patch("/:id", requireAdmin, async (req, res) => {
  try {
    const allowed = ["firstName", "lastName", "phone", "role", "isActive"];
    const updates = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    allowed.forEach((k) => {
      if (k in req.body) updates[k] = req.body[k];
    });
    await db$2().collection("staff").doc(req.params.id).update(updates);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to update staff member." });
  }
});
router$2.post("/setup", async (req, res) => {
  try {
    const existing = await db$2().collection("staff").limit(1).get();
    if (!existing.empty) {
      return res.status(403).json({ error: "Staff already configured." });
    }
    const { firstName, lastName, email, password } = req.body;
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ error: "All fields required." });
    }
    const userRecord = await admin.auth().createUser({
      email: email.toLowerCase().trim(),
      password,
      displayName: `${firstName} ${lastName}`
    });
    await db$2().collection("staff").doc(userRecord.uid).set({
      firebaseUid: userRecord.uid,
      firstName,
      lastName,
      email: email.toLowerCase().trim(),
      phone: "",
      role: "admin",
      isActive: true,
      assignedOrders: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.status(201).json({
      message: "Admin account created successfully.",
      uid: userRecord.uid
    });
  } catch (err) {
    console.error("[Staff] Setup error:", err);
    return res.status(500).json({ error: "Setup failed." });
  }
});
const router$1 = Router();
const db$1 = () => admin.firestore();
router$1.get("/", requireCoordinator, async (_req, res) => {
  try {
    const snapshot = await db$1().collection("campaigns").orderBy("createdAt", "desc").limit(50).get();
    return res.json(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch campaigns." });
  }
});
router$1.post("/", requireCoordinator, async (req, res) => {
  try {
    const { name, type, subject, body, audience, audienceIds, scheduledAt } = req.body;
    if (!name || !body || !audience) {
      return res.status(400).json({ error: "name, body, and audience required." });
    }
    const ref = await db$1().collection("campaigns").add({
      name,
      type: type || "email",
      status: "draft",
      subject: subject || "",
      body,
      audience,
      audienceIds: audienceIds || [],
      scheduledAt: scheduledAt ? admin.firestore.Timestamp.fromDate(new Date(scheduledAt)) : null,
      stats: { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0 },
      createdBy: req.user.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.status(201).json({ id: ref.id });
  } catch (err) {
    return res.status(500).json({ error: "Failed to create campaign." });
  }
});
router$1.post("/:id/send", requireCoordinator, async (req, res) => {
  try {
    const campaignDoc = await db$1().collection("campaigns").doc(req.params.id).get();
    if (!campaignDoc.exists) return res.status(404).json({ error: "Campaign not found." });
    const campaign = campaignDoc.data();
    if (campaign.status === "sent") {
      return res.status(400).json({ error: "Campaign already sent." });
    }
    let recipientQuery = db$1().collection("clients").where("status", "==", "active");
    if (campaign.audience === "vip") {
      recipientQuery = db$1().collection("clients").where("status", "==", "vip");
    }
    const clientsSnap = await recipientQuery.get();
    let clients = clientsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (campaign.audience === "custom" && campaign.audienceIds?.length) {
      clients = clients.filter((c) => campaign.audienceIds.includes(c.id));
    }
    await campaignDoc.ref.update({ status: "sending", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    let sentCount = 0;
    for (const client of clients) {
      if (!client.email) continue;
      try {
        await sendEmail({
          to: client.email,
          template: "marketing",
          subject: campaign.subject,
          variables: {
            clientName: `${client.firstName} ${client.lastName}`,
            body: campaign.body
          }
        });
        sentCount++;
      } catch {
      }
    }
    await campaignDoc.ref.update({
      status: "sent",
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      "stats.sent": sentCount,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.json({ success: true, sent: sentCount });
  } catch (err) {
    console.error("[Campaigns] Send error:", err);
    await db$1().collection("campaigns").doc(req.params.id).update({ status: "draft" }).catch(() => {
    });
    return res.status(500).json({ error: "Failed to send campaign." });
  }
});
const router = Router();
const db = () => admin.firestore();
router.get("/briefing", requireStaff, async (_req, res) => {
  try {
    const today = /* @__PURE__ */ new Date();
    today.setHours(0, 0, 0, 0);
    const todayTs = admin.firestore.Timestamp.fromDate(today);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayTs = admin.firestore.Timestamp.fromDate(yesterday);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowTs = admin.firestore.Timestamp.fromDate(tomorrow);
    const [
      pendingRequests,
      todayAppointments,
      tomorrowAppointments,
      unreviewedFlags,
      urgentFlags,
      pendingGalleries,
      overdueInvoices,
      recentLogs
    ] = await Promise.all([
      db().collection("orderRequests").where("status", "==", "new").get(),
      db().collection("appointments").where("scheduledDate", ">=", todayTs).where("scheduledDate", "<", tomorrowTs).where("status", "in", ["confirmed", "scheduled"]).get(),
      db().collection("appointments").where("scheduledDate", ">=", tomorrowTs).where("scheduledDate", "<", admin.firestore.Timestamp.fromDate(
        new Date(tomorrow.getTime() + 24 * 60 * 60 * 1e3)
      )).where("status", "in", ["confirmed", "scheduled"]).get(),
      db().collection("agentLogs").where("requiresHumanReview", "==", true).where("reviewedAt", "==", null).orderBy("createdAt", "desc").limit(20).get(),
      db().collection("agentLogs").where("priority", "==", "urgent").where("requiresHumanReview", "==", true).orderBy("createdAt", "desc").limit(5).get(),
      db().collection("galleries").where("status", "in", ["raw_uploaded", "editing"]).get(),
      db().collection("invoices").where("status", "==", "overdue").get(),
      db().collection("agentLogs").where("createdAt", ">=", yesterdayTs).orderBy("createdAt", "desc").limit(50).get()
    ]);
    const agentSummaries = {
      nora: {
        name: "Nora",
        role: "Operations",
        emoji: "⚙️",
        items: [
          `${pendingRequests.size} pending booking request${pendingRequests.size !== 1 ? "s" : ""} awaiting review`,
          `${todayAppointments.size} appointment${todayAppointments.size !== 1 ? "s" : ""} scheduled today`,
          `${tomorrowAppointments.size} appointment${tomorrowAppointments.size !== 1 ? "s" : ""} tomorrow`,
          `${pendingGalleries.size} galler${pendingGalleries.size !== 1 ? "ies" : "y"} in editing pipeline`
        ],
        flags: unreviewedFlags.docs.filter((d) => d.data().agent === "nora").map((d) => ({ id: d.id, ...d.data() }))
      },
      travis: {
        name: "Travis",
        role: "Accounting & Finance",
        emoji: "💰",
        items: [
          `${overdueInvoices.size} overdue invoice${overdueInvoices.size !== 1 ? "s" : ""}`
        ],
        flags: unreviewedFlags.docs.filter((d) => d.data().agent === "travis").map((d) => ({ id: d.id, ...d.data() }))
      },
      brady: {
        name: "Brady",
        role: "Quality Control",
        emoji: "🔍",
        items: [],
        flags: unreviewedFlags.docs.filter((d) => d.data().agent === "brady").map((d) => ({ id: d.id, ...d.data() }))
      },
      lena: {
        name: "Lena",
        role: "Sales",
        emoji: "🎯",
        items: [],
        flags: unreviewedFlags.docs.filter((d) => d.data().agent === "lena").map((d) => ({ id: d.id, ...d.data() }))
      },
      remmi: {
        name: "Remmi",
        role: "Marketing & Social",
        emoji: "📱",
        items: [],
        flags: unreviewedFlags.docs.filter((d) => d.data().agent === "remmi").map((d) => ({ id: d.id, ...d.data() }))
      },
      grant: {
        name: "Grant",
        role: "Training & Onboarding",
        emoji: "📚",
        items: [],
        flags: unreviewedFlags.docs.filter((d) => d.data().agent === "grant").map((d) => ({ id: d.id, ...d.data() }))
      }
    };
    return res.json({
      briefingDate: (/* @__PURE__ */ new Date()).toISOString(),
      urgentCount: urgentFlags.size,
      urgentItems: urgentFlags.docs.map((d) => ({ id: d.id, ...d.data() })),
      agents: agentSummaries,
      recentActivity: recentLogs.docs.slice(0, 10).map((d) => ({ id: d.id, ...d.data() })),
      todayAppointments: todayAppointments.docs.map((d) => ({ id: d.id, ...d.data() }))
    });
  } catch (err) {
    console.error("[Agents] Briefing error:", err);
    return res.status(500).json({ error: "Failed to generate briefing." });
  }
});
router.get("/logs", requireStaff, async (req, res) => {
  try {
    const { agent, status, requiresReview, limit = "50" } = req.query;
    let query = db().collection("agentLogs").orderBy("createdAt", "desc");
    if (agent) query = query.where("agent", "==", agent);
    if (status) query = query.where("status", "==", status);
    if (requiresReview === "true") {
      query = query.where("requiresHumanReview", "==", true);
    }
    const snapshot = await query.limit(Number(limit)).get();
    return res.json(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch agent logs." });
  }
});
router.patch("/logs/:id/resolve", requireCoordinator, async (req, res) => {
  try {
    const { notes } = req.body;
    await db().collection("agentLogs").doc(req.params.id).update({
      requiresHumanReview: false,
      status: "completed",
      reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
      reviewedBy: req.user.uid,
      resolvedNotes: notes || ""
    });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to resolve flag." });
  }
});
router.post("/log", async (req, res) => {
  try {
    const serviceKey = req.headers["x-agent-key"];
    if (serviceKey !== process.env.AGENT_SERVICE_KEY) {
      return res.status(401).json({ error: "Invalid agent key." });
    }
    const {
      agent,
      action,
      summary,
      status,
      relatedId,
      relatedType,
      priority,
      requiresHumanReview,
      details
    } = req.body;
    if (!agent || !action || !summary) {
      return res.status(400).json({ error: "agent, action, and summary required." });
    }
    const ref = await db().collection("agentLogs").add({
      agent,
      action,
      summary,
      status: status || "completed",
      relatedId: relatedId || null,
      relatedType: relatedType || null,
      priority: priority || "normal",
      requiresHumanReview: requiresHumanReview || false,
      details: details || "",
      reviewedAt: null,
      reviewedBy: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.status(201).json({ id: ref.id });
  } catch (err) {
    return res.status(500).json({ error: "Failed to log agent action." });
  }
});
const SETTINGS_FILE = path.join(process.cwd(), "site_settings.json");
if (!admin.apps.length) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET
    });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET
    });
  } else {
    console.warn(
      "[Server] WARNING: No Firebase service account configured. Set FIREBASE_SERVICE_ACCOUNT env var with your service account JSON."
    );
  }
}
function createServer() {
  const app = express();
  app.use(cors({
    origin: process.env.APP_URL || "*",
    credentials: true
  }));
  app.use("/api/payments/webhook", express.raw({ type: "application/json" }));
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.get("/api/ping", (_req, res) => {
    res.json({
      status: "ok",
      message: process.env.PING_MESSAGE ?? "Iconic Images API",
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  app.get("/api/settings", async (_req, res) => {
    try {
      const data = await fs.readFile(SETTINGS_FILE, "utf-8");
      res.json(JSON.parse(data));
    } catch {
      res.status(404).json({ error: "Settings not found" });
    }
  });
  app.post("/api/settings", async (req, res) => {
    try {
      await fs.writeFile(SETTINGS_FILE, JSON.stringify(req.body, null, 2));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to save settings" });
    }
  });
  app.use("/api/bookings", router$9);
  app.use("/api/orders", router$8);
  app.use("/api/galleries", router$7);
  app.use("/api/payments", router$6);
  app.use("/api/vsai", router$5);
  app.use("/api/messages", router$4);
  app.use("/api/clients", router$3);
  app.use("/api/staff", router$2);
  app.use("/api/campaigns", router$1);
  app.use("/api/agents", router);
  app.use(
    (err, _req, res, _next) => {
      console.error("[Server] Unhandled error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  );
  return app;
}
const vercelHandler = createServer();
export {
  vercelHandler as default
};
