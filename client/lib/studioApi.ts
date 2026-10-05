import type { GalleryReleaseReport } from "@shared/galleryRelease";
import type { StudioAdjustments } from "@shared/iconicStudio";
import type { MediaDeliveryStatus } from "@shared/mediaDelivery";
import type { OrderEditPlan } from "@shared/orderEditPlan";

type TokenGetter = () => Promise<string>;

export interface StudioWorkspaceResponse {
  flags: {
    teamStudio: boolean;
    agentUpsell: boolean;
    outsidePhotographerSaas: boolean;
    canvaBrand: boolean;
  };
  listings: Array<{ id: string; address: string; status: string; imageCount: number }>;
  jobs: Array<Record<string, unknown>>;
  listing: {
    id: string;
    address: string;
    status: string;
    galleryId?: string;
    iconicPolish?: boolean;
    editPlan?: OrderEditPlan | null;
    release?: GalleryReleaseReport | null;
    delivery?: {
      galleryId: string;
      galleryStatus: string;
      deliveryStatus: MediaDeliveryStatus;
      label: string;
    } | null;
    images: Array<Record<string, unknown>>;
  } | null;
}

export interface OrderQueueTickResult {
  prepared: number;
  remaining: number;
  waiting: number;
  shouldFollowUp: boolean;
  ran: {
    jobId: string;
    status: string;
    note: string;
    slot?: string;
    type?: string;
    beforeUrl?: string;
    afterUrl?: string;
    placeholder?: boolean;
  } | null;
}

async function authorizedHeaders(getToken: TokenGetter) {
  const token = await getToken();
  if (!token) throw new Error("Sign in again before opening Iconic Studio.");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function readJson(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || `Iconic Studio request failed (${res.status}).`);
    (error as Error & { status?: number }).status = res.status;
    throw error;
  }
  return data;
}

export async function fetchStudioWorkspace(listingId: string | undefined, getToken: TokenGetter) {
  const headers = await authorizedHeaders(getToken);
  const query = listingId ? `?listingId=${encodeURIComponent(listingId)}` : "";
  const res = await fetch(`/api/studio/workspace${query}`, { headers });
  return readJson(res) as Promise<StudioWorkspaceResponse>;
}

export async function postStudioOrderEdits(getToken: TokenGetter, listingId: string) {
  const headers = await authorizedHeaders(getToken);
  const res = await fetch("/api/studio/order-edits", {
    method: "POST",
    headers,
    body: JSON.stringify({ listingId }),
  });
  return readJson(res) as Promise<{
    plan: Record<string, unknown>;
    prepared: number;
    remaining: number;
    waiting: number;
    ran: {
      jobId: string;
      status: string;
      beforeUrl: string;
      afterUrl: string;
      placeholder: boolean;
      note: string;
    } | null;
  }>;
}

export async function postStudioOrderQueueTick(getToken: TokenGetter, listingId: string) {
  const headers = await authorizedHeaders(getToken);
  const res = await fetch("/api/studio/order-queue/tick", {
    method: "POST",
    headers,
    body: JSON.stringify({ listingId }),
  });
  return readJson(res) as Promise<OrderQueueTickResult>;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** One OpenAI edit per request, then the next, until the listing queue is idle. */
export async function drainOrderEditQueue(
  getToken: TokenGetter,
  listingId: string,
  onStep?: (result: OrderQueueTickResult) => void,
  shouldStop?: () => boolean,
) {
  let latest: OrderQueueTickResult | null = null;
  for (let step = 0; step < 120; step += 1) {
    if (shouldStop?.()) return latest;
    latest = await postStudioOrderQueueTick(getToken, listingId);
    onStep?.(latest);
    if (!latest.shouldFollowUp) return latest;
    if (!latest.ran) await wait(1500);
  }
  return latest;
}

export async function postIconicPolish(getToken: TokenGetter, body: { listingId: string; iconicPolish: boolean }) {
  const headers = await authorizedHeaders(getToken);
  const res = await fetch("/api/studio/iconic-polish", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return readJson(res) as Promise<{ iconicPolish: boolean }>;
}

export async function postStudioReject(getToken: TokenGetter, body: { listingId: string; jobId: string }) {
  const headers = await authorizedHeaders(getToken);
  const res = await fetch("/api/studio/reject", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return readJson(res) as Promise<{ success: boolean; note?: string }>;
}

export async function postStudioAiEdit(getToken: TokenGetter, body: {
  listingId: string;
  type: string;
  prompt: string;
  imageUrl: string;
  sourcePath: string;
}) {
  const headers = await authorizedHeaders(getToken);
  const res = await fetch("/api/studio/ai-edit", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return readJson(res) as Promise<{
    jobId: string;
    status: string;
    provider: string;
    beforeUrl: string;
    afterUrl: string;
    placeholder: boolean;
    note: string;
  }>;
}

export async function postStudioAdjust(getToken: TokenGetter, body: {
  listingId: string;
  sourcePath: string;
  fileName: string;
  adjustments: StudioAdjustments;
  dataBase64: string;
}) {
  const headers = await authorizedHeaders(getToken);
  const res = await fetch("/api/studio/adjust", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return readJson(res);
}

export async function postStudioApprove(getToken: TokenGetter, body: {
  listingId: string;
  sourcePath?: string;
  fileName?: string;
  jobId?: string;
}) {
  const headers = await authorizedHeaders(getToken);
  const res = await fetch("/api/studio/approve", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return readJson(res) as Promise<{ success: boolean; note?: string; galleries?: string[] }>;
}
