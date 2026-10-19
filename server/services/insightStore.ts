/**
 * Iconic Insights posts.
 * Tests and machines without Firebase use memory. Production uses the
 * insightPosts collection. Drafts stay out of the public list.
 */

import admin from "firebase-admin";
import {
  INSIGHT_COLLECTION,
  type InsightPost,
  normalizeStoredInsight,
} from "../../shared/insights.ts";

const memory = new Map<string, InsightPost>();

export function insightsUseMemory(): boolean {
  return process.env.NODE_ENV === "test"
    || process.env.INSIGHTS_STORE === "memory"
    || !admin.apps.length;
}

export function resetInsightMemory(): void {
  memory.clear();
}

function clone(post: InsightPost): InsightPost {
  return JSON.parse(JSON.stringify(post)) as InsightPost;
}

function byUpdated(posts: InsightPost[]): InsightPost[] {
  return posts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listInsights(): Promise<InsightPost[]> {
  if (insightsUseMemory()) return byUpdated([...memory.values()].map(clone));
  const snap = await admin.firestore().collection(INSIGHT_COLLECTION).get();
  const posts: InsightPost[] = [];
  for (const doc of snap.docs) {
    const post = normalizeStoredInsight(doc.id, doc.data());
    if (post) posts.push(post);
  }
  return byUpdated(posts);
}

export async function listPublishedInsights(): Promise<InsightPost[]> {
  if (insightsUseMemory()) {
    return [...memory.values()]
      .filter((post) => post.status === "published")
      .sort((a, b) => (b.publishedAt || "").localeCompare(a.publishedAt || ""))
      .map(clone);
  }
  const snap = await admin.firestore().collection(INSIGHT_COLLECTION).where("status", "==", "published").get();
  const posts: InsightPost[] = [];
  for (const doc of snap.docs) {
    const post = normalizeStoredInsight(doc.id, doc.data());
    if (post?.status === "published") posts.push(post);
  }
  return posts.sort((a, b) => (b.publishedAt || "").localeCompare(a.publishedAt || ""));
}

export async function getInsight(id: string): Promise<InsightPost | null> {
  if (insightsUseMemory()) {
    const post = memory.get(id);
    return post ? clone(post) : null;
  }
  const doc = await admin.firestore().collection(INSIGHT_COLLECTION).doc(id).get();
  if (!doc.exists) return null;
  return normalizeStoredInsight(doc.id, doc.data());
}

export async function getPublishedInsightBySlug(slug: string): Promise<InsightPost | null> {
  if (insightsUseMemory()) {
    const post = [...memory.values()].find((item) => item.status === "published" && item.slug === slug);
    return post ? clone(post) : null;
  }
  const snap = await admin.firestore().collection(INSIGHT_COLLECTION).where("slug", "==", slug).limit(5).get();
  for (const doc of snap.docs) {
    const post = normalizeStoredInsight(doc.id, doc.data());
    if (post?.status === "published") return post;
  }
  return null;
}

export async function saveInsight(post: InsightPost): Promise<void> {
  const stored = clone(post);
  if (insightsUseMemory()) {
    memory.set(stored.id, stored);
    return;
  }
  await admin.firestore().collection(INSIGHT_COLLECTION).doc(stored.id).set(stored);
}

export async function deleteInsight(id: string): Promise<void> {
  if (insightsUseMemory()) {
    memory.delete(id);
    return;
  }
  await admin.firestore().collection(INSIGHT_COLLECTION).doc(id).delete();
}
