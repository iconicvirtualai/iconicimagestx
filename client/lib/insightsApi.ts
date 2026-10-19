import type { InsightPost, InsightTemplate, PublicInsight } from "@shared/insights";

async function readError(response: Response, fallback: string): Promise<string> {
  const data = await response.json().catch(() => ({})) as { error?: string };
  return data.error || fallback;
}

export async function fetchPublicInsights(): Promise<PublicInsight[]> {
  const response = await fetch("/api/insights");
  if (!response.ok) throw new Error(await readError(response, "Insights could not be loaded."));
  const data = await response.json() as { posts?: PublicInsight[] };
  return data.posts || [];
}

export async function fetchPublicInsight(slug: string): Promise<PublicInsight | null> {
  const response = await fetch(`/api/insights/${encodeURIComponent(slug)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await readError(response, "This insight could not be opened."));
  const data = await response.json() as { post?: PublicInsight };
  return data.post || null;
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export async function fetchAdminInsights(token: string): Promise<InsightPost[]> {
  const response = await fetch("/api/insights/admin/posts", { headers: authHeaders(token) });
  if (!response.ok) throw new Error(await readError(response, "The insight list could not be loaded."));
  const data = await response.json() as { posts?: InsightPost[] };
  return data.posts || [];
}

export async function createInsight(token: string, template: InsightTemplate): Promise<InsightPost> {
  const response = await fetch("/api/insights/admin/posts", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ template }),
  });
  if (!response.ok) throw new Error(await readError(response, "The draft could not be created."));
  const data = await response.json() as { post: InsightPost };
  return data.post;
}

export async function saveInsight(token: string, post: InsightPost): Promise<InsightPost> {
  const response = await fetch(`/api/insights/admin/posts/${encodeURIComponent(post.id)}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(post),
  });
  if (!response.ok) throw new Error(await readError(response, "The draft could not be saved."));
  const data = await response.json() as { post: InsightPost };
  return data.post;
}

export async function publishInsight(token: string, post: InsightPost): Promise<InsightPost> {
  const response = await fetch(`/api/insights/admin/posts/${encodeURIComponent(post.id)}/publish`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(post),
  });
  if (!response.ok) throw new Error(await readError(response, "The insight could not be published."));
  const data = await response.json() as { post: InsightPost };
  return data.post;
}

export async function unpublishInsight(token: string, id: string): Promise<InsightPost> {
  const response = await fetch(`/api/insights/admin/posts/${encodeURIComponent(id)}/unpublish`, {
    method: "POST",
    headers: authHeaders(token),
    body: "{}",
  });
  if (!response.ok) throw new Error(await readError(response, "The insight could not be unpublished."));
  const data = await response.json() as { post: InsightPost };
  return data.post;
}

export async function deleteInsight(token: string, id: string): Promise<void> {
  const response = await fetch(`/api/insights/admin/posts/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!response.ok) throw new Error(await readError(response, "The insight could not be deleted."));
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export async function uploadInsightFile(token: string, file: File): Promise<{ url: string; kind: "image" | "video" }> {
  const response = await fetch("/api/site-content/media", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ pageId: "insights", dataBase64: await fileToBase64(file) }),
  });
  if (!response.ok) throw new Error(await readError(response, "The file could not be uploaded."));
  return response.json() as Promise<{ url: string; kind: "image" | "video" }>;
}

export async function importInsightLink(token: string, url: string): Promise<{ url: string; kind: "image" | "video" }> {
  const response = await fetch("/api/site-content/dropbox", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ pageId: "insights", url }),
  });
  if (!response.ok) throw new Error(await readError(response, "That Dropbox link could not be imported."));
  return response.json() as Promise<{ url: string; kind: "image" | "video" }>;
}

export async function downloadSocialPack(token: string, post: InsightPost): Promise<void> {
  const response = await fetch(`/api/insights/admin/posts/${encodeURIComponent(post.id)}/social.zip`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(await readError(response, "The pack could not be downloaded."));
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${post.slug}-social.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
