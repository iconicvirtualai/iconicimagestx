/**
 * Send to Client.
 * Preview ids and flag-off sends never touch SMTP or Firestore.
 * A test addresses only the internal QA sink.
 * A live send uses the existing gallery delivery writer and skips SMS.
 */

import { CLIENT_EMAIL_NOTIFY_TEST_SINK } from "../../shared/aryeoEmailNotify";
import {
  clientDeliveryPresentationUrl,
  isClientDeliveryPreview,
  prepareDeliveryMessage,
  clientDeliveryNotifyMode,
  deliveryEmailList,
  type ClientDeliveryDraft,
} from "../../shared/clientDelivery";
import { deliverGalleryToClient } from "./galleryDeliver";
import { sendEmail } from "./email";

export interface ClientDeliverySendInput {
  id: string;
  action: "send" | "test";
  to: string;
  cc?: string;
  subject: string;
  message: string;
  actor?: { email?: string | null; name?: string | null; uid?: string | null };
}

export interface ClientDeliverySendResult {
  ok: boolean;
  sent: boolean;
  mode: "preview" | "test" | "live";
  delivery: "sent" | "suppressed" | "allowlist" | "skipped";
  presentationUrl: string;
  note: string;
}

function previewResult(id: string, note: string): ClientDeliverySendResult {
  return {
    ok: true,
    sent: false,
    mode: "preview",
    delivery: "skipped",
    presentationUrl: clientDeliveryPresentationUrl(id),
    note,
  };
}

export async function sendClientDelivery(input: ClientDeliverySendInput): Promise<ClientDeliverySendResult> {
  const id = input.id.trim();
  const prepared = prepareDeliveryMessage(input.message);
  if (prepared.ok === false) {
    return { ...previewResult(id, prepared.error), ok: false };
  }
  const subject = input.subject.trim() || "Your gallery is ready";
  if (/cadi@/i.test(subject)) {
    return { ...previewResult(id, "Client delivery mail uses photos@iconicimagestx.com."), ok: false };
  }
  const presentationUrl = clientDeliveryPresentationUrl(id);

  if (isClientDeliveryPreview(id)) {
    return previewResult(id, "Sample delivery. No email was sent and nothing was saved.");
  }

  const notify = clientDeliveryNotifyMode();
  if (input.action === "test") {
    if (!notify.clientNotifyLive) {
      return previewResult(
        id,
        `Safe preview. No email was sent. A test would go only to ${CLIENT_EMAIL_NOTIFY_TEST_SINK}, and the notify flags are off.`,
      );
    }
    const result = await sendEmail({
      to: CLIENT_EMAIL_NOTIFY_TEST_SINK,
      template: "gallery_delivery",
      subject,
      html: prepared.html,
      text: prepared.text,
      lockHtml: true,
      variables: { galleryUrl: presentationUrl, address: "" },
    });
    return {
      ok: true,
      sent: result.sent,
      mode: "test",
      delivery: result.delivery,
      presentationUrl,
      note: result.sent
        ? `Test sent only to ${CLIENT_EMAIL_NOTIFY_TEST_SINK}. The client was not emailed.`
        : `Test stayed inside the notify gate. Nothing was sent to the client. QA sink: ${CLIENT_EMAIL_NOTIFY_TEST_SINK}.`,
    };
  }

  if (!notify.live) {
    return previewResult(
      id,
      "Safe preview. CLIENT_NOTIFY_LIVE and CLIENT_EMAIL_NOTIFY_LIVE are off, so no client email was sent. Copy the presentation link for internal QA.",
    );
  }

  const recipients = deliveryEmailList(input.to);
  if (recipients.length !== 1 || recipients[0] !== input.to.trim()) {
    return { ...previewResult(id, "Enter one client email before sending."), ok: false };
  }
  const cc = (input.cc || "").trim();
  if (cc && deliveryEmailList(cc).length === 0) {
    return { ...previewResult(id, "The CC address is not a valid email."), ok: false };
  }
  if (/cadi@/i.test(input.to) || /cadi@/i.test(cc)) {
    return { ...previewResult(id, "Client delivery mail uses photos@iconicimagestx.com."), ok: false };
  }

  try {
    await deliverGalleryToClient(id, {
      actor: input.actor,
      deliveryUrl: presentationUrl,
      skipSms: true,
      notice: {
        to: recipients[0],
        cc: cc || undefined,
        subject,
        text: prepared.text,
        html: prepared.html,
      },
    });
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 404) {
      const mailed = await sendEmail({
        to: recipients[0],
        cc: cc || undefined,
        template: "gallery_delivery",
        subject,
        html: prepared.html,
        text: prepared.text,
        lockHtml: true,
        variables: { galleryUrl: presentationUrl },
      });
      return {
        ok: true,
        sent: mailed.sent,
        mode: "live",
        delivery: mailed.delivery,
        presentationUrl,
        note: mailed.sent
          ? "Delivery email sent. This project has no gallery record yet, so the gallery status was left unchanged."
          : "The notify gate held the email. No message was sent.",
      };
    }
    const message = err instanceof Error ? err.message : "Could not send this delivery.";
    return { ...previewResult(id, message), ok: false };
  }

  return {
    ok: true,
    sent: true,
    mode: "live",
    delivery: "sent",
    presentationUrl,
    note: "Delivery email sent.",
  };
}

export function draftLooksSafe(draft: ClientDeliveryDraft): boolean {
  return !/cadi@/i.test(draft.message) && draft.message.includes("photos@iconicimagestx.com");
}
