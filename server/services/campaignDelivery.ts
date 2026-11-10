import crypto from "node:crypto";
import { deliverRawEmail } from "./email";
import { deliverCampaignSms } from "./sms";

export interface OutboundMail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

type Mailer = (message: OutboundMail) => Promise<void>;
type Texter = (to: string, body: string) => Promise<{ sid: string }>;

let mailer: Mailer | null = null;
let texter: Texter | null = null;

export function setCampaignDeliveryForTests(next: { mailer?: Mailer | null; texter?: Texter | null }): void {
  if ("mailer" in next) mailer = next.mailer ?? null;
  if ("texter" in next) texter = next.texter ?? null;
}

export async function sendCampaignEmail(message: OutboundMail): Promise<void> {
  if (mailer) {
    await mailer(message);
    return;
  }
  await deliverRawEmail(message);
}

export async function sendCampaignText(to: string, body: string): Promise<{ sid: string }> {
  if (texter) return texter(to, body);
  const result = await deliverCampaignSms(to, body);
  return { sid: result.sid };
}

export function trackToken(secret: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function addClickTracking(html: string, origin: string, campaignId: string, email: string, secret: string): string {
  if (!secret) return html;
  return html.replace(/href="(https?:\/\/[^"]+)"/g, (full, url: string) => {
    if (url.includes("/unsubscribe")) return full;
    const token = trackToken(secret, `${campaignId}|${email}|${url}`);
    const dest = `${origin}/api/channel-campaigns/t/click?c=${encodeURIComponent(campaignId)}&e=${encodeURIComponent(email)}&u=${encodeURIComponent(url)}&t=${token}`;
    return `href="${dest}"`;
  });
}

export function openPixel(origin: string, campaignId: string, email: string, secret: string): string {
  if (!secret) return "";
  const token = trackToken(secret, `${campaignId}|${email}|open`);
  const src = `${origin}/api/channel-campaigns/t/open.gif?c=${encodeURIComponent(campaignId)}&e=${encodeURIComponent(email)}&t=${token}`;
  return `<img src="${src}" width="1" height="1" alt="" />`;
}
