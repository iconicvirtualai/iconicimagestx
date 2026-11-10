/**
 * Web Push for the Shooter app.
 * VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY stay on the server.
 * The browser asks GET /api/team-chat/push/public-key for the public key.
 */

import webpush from "web-push";
import type { PushSubscriptionRecord } from "./teamChatRepo.ts";

export interface TeamPushPayload {
  title: string;
  body: string;
  url: string;
}

let configured = false;

export function vapidPublicKey(env: Record<string, string | undefined> = process.env): string {
  return env.VAPID_PUBLIC_KEY?.trim() || "";
}

function configure(env: Record<string, string | undefined>): boolean {
  const publicKey = vapidPublicKey(env);
  const privateKey = env.VAPID_PRIVATE_KEY?.trim() || "";
  if (!publicKey || !privateKey) return false;
  if (!configured) {
    webpush.setVapidDetails(env.VAPID_SUBJECT?.trim() || "mailto:photos@iconicimagestx.com", publicKey, privateKey);
    configured = true;
  }
  return true;
}

export async function sendTeamPush(
  sub: PushSubscriptionRecord,
  payload: TeamPushPayload,
  env: Record<string, string | undefined> = process.env,
): Promise<boolean> {
  if (!configure(env)) return false;
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify(payload),
    );
    return true;
  } catch (error) {
    console.warn("[team-push] Delivery failed.", error instanceof Error ? error.message : "push failed");
    return false;
  }
}
