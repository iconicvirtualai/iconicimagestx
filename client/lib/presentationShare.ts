export interface PresentationLinkResult {
  url: string;
  path: string;
  photoCount: number;
  notified: boolean;
  created: boolean;
  previewPath?: string;
}

export async function createPresentationLink(listingId: string, token: string): Promise<PresentationLinkResult> {
  const res = await fetch(`/api/listings/${encodeURIComponent(listingId)}/presentation`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || "The presentation link could not be created.");
    (error as Error & { previewPath?: string; status?: number }).previewPath = data.previewPath;
    (error as Error & { status?: number }).status = res.status;
    throw error;
  }
  return data as PresentationLinkResult;
}
