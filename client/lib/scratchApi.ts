import {
  SCRATCH_ACTION_HEADER,
  SCRATCH_NAME_HEADER,
  SCRATCH_PROMPT_HEADER,
  STUDIO_SCRATCH_API,
  type ScratchAction,
} from "@shared/studioScratch";

type TokenGetter = () => Promise<string>;

export interface ScratchStatus {
  grass: { ready: boolean; publicPath: string; note: string };
  twilightPrompt: string;
}

async function tokenOrThrow(getToken: TokenGetter) {
  const token = await getToken();
  if (!token) throw new Error("Sign in again before using the scratch pad.");
  return token;
}

export async function fetchScratchStatus(getToken: TokenGetter): Promise<ScratchStatus> {
  const token = await tokenOrThrow(getToken);
  const res = await fetch(STUDIO_SCRATCH_API, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Scratch pad status failed (${res.status}).`);
  return data as ScratchStatus;
}

export async function postScratchEdit(
  getToken: TokenGetter,
  input: { body: Blob; action: ScratchAction; prompt: string; fileName: string },
): Promise<{ bytes: Uint8Array; downloadName: string }> {
  const token = await tokenOrThrow(getToken);
  const res = await fetch(STUDIO_SCRATCH_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "image/jpeg",
      [SCRATCH_ACTION_HEADER]: input.action,
      [SCRATCH_PROMPT_HEADER]: encodeURIComponent(input.prompt),
      [SCRATCH_NAME_HEADER]: encodeURIComponent(input.fileName),
    },
    body: input.body,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Scratch edit failed (${res.status}).`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="([^"]+)"/);
  return { bytes, downloadName: match?.[1] || "scratch-edit.jpg" };
}
