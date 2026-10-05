/**
 * Follow-up kick for the order edit queue.
 * One OpenAI edit fits a request. When APP_URL (or URL) and CRON_SECRET
 * are set, the server starts the next tick as its own request.
 * The upload page, My Jobs, and Iconic Studio already advance the queue
 * from the browser. A photo register must not start a second queue.
 * This does not send client email or SMS.
 */

/**
 * AdminUpload and AdminPhotographer call drainOrderEditQueue after a
 * successful photo register. While that is true, the upload route does
 * not call kickStudioQueue.
 */
export const PHOTOGRAPHER_UPLOAD_BROWSER_DRAINS_QUEUE = true;

/**
 * Kick the existing server queue only when the browser is not already
 * draining and at least one pending order edit has a source photo.
 * Waiting slots with no source photo do not kick.
 */
export function uploadQueueKickDecision(input: {
  browserDrainsQueue: boolean;
  pendingWithSourcePhoto: number;
}): { kick: boolean } {
  if (input.browserDrainsQueue) return { kick: false };
  const pending = input.pendingWithSourcePhoto;
  if (!Number.isFinite(pending) || pending <= 0) return { kick: false };
  return { kick: true };
}

export function studioQueueTickRequest(
  env: Record<string, string | undefined>,
  listingId: string,
): { url: string; init: { method: "POST"; headers: Record<string, string>; body: string } } | null {
  const secret = typeof env.CRON_SECRET === "string" ? env.CRON_SECRET.trim() : "";
  const base = String(env.APP_URL || env.URL || "").trim().replace(/\/$/, "");
  const id = listingId.trim();
  if (!secret || !base || !id) return null;
  return {
    url: `${base}/api/studio/order-queue/tick`,
    init: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ listingId: id, chain: true }),
    },
  };
}

export function kickStudioQueue(listingId: string, env: NodeJS.ProcessEnv = process.env) {
  const request = studioQueueTickRequest(env, listingId);
  if (!request) return { dispatched: false as const };
  void fetch(request.url, request.init).catch((err) => {
    console.error("[Studio queue] Follow-up tick failed:", err instanceof Error ? err.message : err);
  });
  return { dispatched: true as const };
}
