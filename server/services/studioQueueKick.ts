/**
 * Follow-up kick for the order edit queue.
 * One OpenAI edit fits a request. When APP_URL (or URL) and CRON_SECRET
 * are set, the server starts the next tick as its own request.
 * The upload page and Iconic Studio also advance the queue from the browser.
 * This does not send client email or SMS.
 */

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
