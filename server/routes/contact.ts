import express, { Router } from "express";
import { sendEmail } from "../services/email";

const router = Router();

/**
 * POST /api/contact
 * Sends a contact form email to the provided email address
 * and sends a confirmation to the sender
 */
router.post("/", async (req, res) => {
  try {
    const { name, email, subject, message, phone } = req.body;

    // Validation
    if (!name || !email || !subject || !message) {
      return res.status(400).json({
        error: "Missing required fields: name, email, subject, message"
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Invalid email address" });
    }

    // Get the admin email to send the contact to
    const adminEmail = process.env.CONTACT_FORM_EMAIL || "photos@iconicimagestx.com";

    // Send email to admin with the contact form data
    await sendEmail({
      to: adminEmail,
      template: "contact_form",
      subject: `New Contact Form: ${subject}`,
      variables: {
        senderName: name,
        senderEmail: email,
        senderPhone: phone || "Not provided",
        subject: subject,
        message: message,
      },
    });

    // Send confirmation email to the sender
    await sendEmail({
      to: email,
      template: "contact_confirmation",
      subject: "We received your message",
      variables: {
        name: name,
      },
    });

    res.json({
      success: true,
      message: "Your message has been sent successfully. We'll get back to you soon!",
    });
  } catch (error) {
    console.error("[Contact] Error:", error);
    res.status(500).json({
      error: "Failed to send message. Please try again later.",
    });
  }
});

export default router;
