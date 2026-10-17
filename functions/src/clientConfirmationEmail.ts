/** Client order email. Same document id and {{name}} placeholders as sendEmail. */
export const CLIENT_CONFIRMATION_DOC_ID = "clientConfirmation";

export function fillEmailPlaceholders(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => (
    Object.prototype.hasOwnProperty.call(variables, key) && variables[key] != null
      ? variables[key]
      : `{{${key}}}`
  ));
}

export function readEmailTemplateOverride(data: unknown): { subject: string; htmlBody: string } | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  if (typeof row.subject !== "string" || !row.subject.trim()) return null;
  if (typeof row.htmlBody !== "string" || !row.htmlBody.trim()) return null;
  return { subject: row.subject.trim(), htmlBody: row.htmlBody };
}

/** #NNN only. The Firestore document id is not the client-facing order number. */
export function displayOrderNumber(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return /^#\d{3,}$/.test(trimmed) ? trimmed : "";
}

export function clientConfirmationSubject(orderNumber: string): string {
  return orderNumber ? `We received your Iconic order ${orderNumber}` : "We received your Iconic order";
}

export function orderConfirmationTags(order: Record<string, unknown>): Record<string, string> {
  const lineItems = Array.isArray(order.lineItems)
    ? order.lineItems
      .map((item) => {
        if (!item || typeof item !== "object") return "";
        const row = item as { name?: unknown; price?: unknown };
        const name = typeof row.name === "string" ? row.name : "Service";
        const price = row.price == null ? "" : `$${row.price}`;
        return price ? `${name} — ${price}` : name;
      })
      .filter(Boolean)
      .join("\n")
    : "";
  const services = Array.isArray(order.services)
    ? order.services.map((item) => String(item)).join(", ")
    : typeof order.services === "string"
      ? order.services
      : "";
  const property = [order.addressLabel, order.propertyAddress, order.address]
    .find((value) => typeof value === "string" && value.trim()) as string | undefined;
  return {
    clientName: typeof order.clientName === "string" ? order.clientName : "",
    clientEmail: typeof order.clientEmail === "string" ? order.clientEmail : "",
    clientPhone: typeof order.clientPhone === "string" ? order.clientPhone : "",
    propertyAddress: property || "",
    services,
    lineItems,
    total: String(order.total || (order.pricing as { total?: unknown } | undefined)?.total || 0),
    notes: typeof order.notes === "string" ? order.notes : "",
    orderNumber: displayOrderNumber(order.orderNumber),
  };
}

export function resolveClientConfirmation(order: Record<string, unknown>, stored: unknown): { subject: string; html: string } {
  const tags = orderConfirmationTags(order);
  const override = readEmailTemplateOverride(stored);
  if (!override) {
    return {
      subject: clientConfirmationSubject(tags.orderNumber),
      html: fillEmailPlaceholders(CLIENT_CONFIRMATION_HTML, tags),
    };
  }
  return {
    subject: fillEmailPlaceholders(override.subject, tags),
    html: fillEmailPlaceholders(override.htmlBody, tags),
  };
}

export const CLIENT_CONFIRMATION_SUBJECT = "We received your Iconic order {{orderNumber}}";
export const CLIENT_CONFIRMATION_HTML = "\n    <div style=\"font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;\">\n      <div style=\"background: #000; padding: 20px; text-align: center; margin-bottom: 30px;\">\n        <h1 style=\"color: #fff; margin: 0; font-size: 24px;\">ICONIC IMAGES</h1>\n        <p style=\"color: #ccc; margin: 5px 0 0; font-size: 12px; letter-spacing: 2px;\">REAL ESTATE MEDIA</p>\n      </div>\n      \n      <h2 style=\"color:#0d9488;\">We received your order</h2>\n      <p>Hi {{clientName}},</p>\n      <p>Thank you for booking with Iconic Images. Your order number is <strong>{{orderNumber}}</strong>.</p>\n      <table style=\"width:100%;border-collapse:collapse;margin:20px 0;font-size:14px;border:1px solid #eee;\">\n        <tr style=\"background:#f8fafc;\"><td style=\"padding:10px 14px;font-weight:bold;width:42%;color:#555;border-bottom:1px solid #eee;\">Order</td><td style=\"padding:10px 14px;border-bottom:1px solid #eee;\">{{orderNumber}}</td></tr>\n        <tr><td style=\"padding:10px 14px;font-weight:bold;color:#555;border-bottom:1px solid #eee;\">Property</td><td style=\"padding:10px 14px;border-bottom:1px solid #eee;\">{{propertyAddress}}</td></tr>\n        <tr style=\"background:#f8fafc;\"><td style=\"padding:10px 14px;font-weight:bold;color:#555;border-bottom:1px solid #eee;\">Services</td><td style=\"padding:10px 14px;border-bottom:1px solid #eee;\">{{services}}</td></tr>\n        <tr><td style=\"padding:10px 14px;font-weight:bold;color:#555;border-bottom:1px solid #eee;\">Details</td><td style=\"padding:10px 14px;border-bottom:1px solid #eee;\">{{lineItems}}</td></tr>\n        <tr style=\"background:#f8fafc;\"><td style=\"padding:10px 14px;font-weight:bold;color:#555;\">Notes</td><td style=\"padding:10px 14px;\">{{notes}}</td></tr>\n      </table>\n      <p>Total: <strong>{{total}}</strong></p>\n      <p>We'll be in touch to confirm your shoot time.</p>\n    \n      <div style=\"border-top: 1px solid #eee; margin-top: 30px; padding-top: 20px; text-align: center; color: #999; font-size: 12px;\">\n        <p>26410 Oakridge Dr. Ste 105 - 108, Spring, TX 77380 | <a href=\"tel:+12813560965\" style=\"color:#666666;text-decoration:underline;\">281.356.0965</a> | <a href=\"mailto:photos@iconicimagestx.com\" style=\"color:#666666;text-decoration:underline;\">photos@iconicimagestx.com</a></p>\n        <p>Iconic Images Photography, LLC</p>\n        <p><a href=\"https://iconicimagestx.vercel.app\" style=\"color:#999999;text-decoration:underline;\">iconicimagestx.vercel.app</a></p>\n        <p>Questions? Reply to this email or message us through your client portal.</p>\n      </div>\n    </div>\n  ";
