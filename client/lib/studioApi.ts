import type { StudioAdjustments } from "@shared/iconicStudio";

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
    images: Array<Record<string, unknown>>;
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
