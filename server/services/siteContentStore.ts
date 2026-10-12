/**
 * Published pages and drafts.
 * Tests and machines without Firebase use memory. Production uses Firestore.
 * Drafts are never written onto the published documents' public payload.
 */

import fs from "fs/promises";
import os from "os";
import path from "path";
import admin from "firebase-admin";
import type { ContentPage, SiteRevision, StoredPage } from "../../shared/siteEditor.ts";
import { stripPage } from "../../shared/siteEditor.ts";

type MemoryShape = { published: Record<string, StoredPage>; drafts: Record<string, ContentPage> };

const memory: MemoryShape = { published: {}, drafts: {} };
const filePath = path.join(os.tmpdir(), "iconic-site-content.json");

export function siteContentUsesMemory(): boolean {
  return process.env.NODE_ENV === "test"
    || process.env.SITE_CONTENT_STORE === "memory"
    || !admin.apps.length;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function readFileStore(): Promise<MemoryShape> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as MemoryShape;
    return { published: parsed.published || {}, drafts: parsed.drafts || {} };
  } catch {
    return { published: {}, drafts: {} };
  }
}

async function writeFileStore(next: MemoryShape) {
  await fs.writeFile(filePath, JSON.stringify(next));
}

export async function listPublished(): Promise<ContentPage[]> {
  if (siteContentUsesMemory()) {
    if (process.env.NODE_ENV === "test" || process.env.SITE_CONTENT_STORE === "memory") {
      return Object.values(memory.published).map((page) => stripPage(page));
    }
    const stored = await readFileStore();
    return Object.values(stored.published).map((page) => stripPage(page));
  }
  const snap = await admin.firestore().collection("siteContent").get();
  return snap.docs.map((doc) => stripPage(doc.data() as StoredPage));
}

export async function readPublished(id: string): Promise<StoredPage | null> {
  if (siteContentUsesMemory()) {
    if (process.env.NODE_ENV === "test" || process.env.SITE_CONTENT_STORE === "memory") {
      return memory.published[id] ? clone(memory.published[id]) : null;
    }
    const stored = await readFileStore();
    return stored.published[id] ? clone(stored.published[id]) : null;
  }
  const doc = await admin.firestore().collection("siteContent").doc(id).get();
  return doc.exists ? (doc.data() as StoredPage) : null;
}

export async function writePublished(page: StoredPage) {
  if (siteContentUsesMemory()) {
    if (process.env.NODE_ENV === "test" || process.env.SITE_CONTENT_STORE === "memory") {
      memory.published[page.id] = clone(page);
      return;
    }
    const stored = await readFileStore();
    stored.published[page.id] = page;
    await writeFileStore(stored);
    return;
  }
  await admin.firestore().collection("siteContent").doc(page.id).set(page);
}

export async function readDraft(id: string): Promise<ContentPage | null> {
  if (siteContentUsesMemory()) {
    if (process.env.NODE_ENV === "test" || process.env.SITE_CONTENT_STORE === "memory") {
      return memory.drafts[id] ? clone(memory.drafts[id]) : null;
    }
    const stored = await readFileStore();
    return stored.drafts[id] ? clone(stored.drafts[id]) : null;
  }
  const doc = await admin.firestore().collection("siteContentDrafts").doc(id).get();
  return doc.exists ? stripPage(doc.data() as ContentPage) : null;
}

export async function writeDraft(page: ContentPage, meta: { at: string; byUid: string; byName: string }) {
  const stored = { ...stripPage(page), savedAt: meta.at, savedByUid: meta.byUid, savedByName: meta.byName };
  if (siteContentUsesMemory()) {
    if (process.env.NODE_ENV === "test" || process.env.SITE_CONTENT_STORE === "memory") {
      memory.drafts[page.id] = clone(stripPage(page));
      return;
    }
    const file = await readFileStore();
    file.drafts[page.id] = stripPage(page);
    await writeFileStore(file);
    return;
  }
  await admin.firestore().collection("siteContentDrafts").doc(page.id).set(stored);
}

export async function deleteDraft(id: string) {
  if (siteContentUsesMemory()) {
    if (process.env.NODE_ENV === "test" || process.env.SITE_CONTENT_STORE === "memory") {
      delete memory.drafts[id];
      return;
    }
    const stored = await readFileStore();
    delete stored.drafts[id];
    await writeFileStore(stored);
    return;
  }
  await admin.firestore().collection("siteContentDrafts").doc(id).delete();
}

export async function listDraftIds(): Promise<string[]> {
  if (siteContentUsesMemory()) {
    if (process.env.NODE_ENV === "test" || process.env.SITE_CONTENT_STORE === "memory") return Object.keys(memory.drafts);
    const stored = await readFileStore();
    return Object.keys(stored.drafts);
  }
  const snap = await admin.firestore().collection("siteContentDrafts").get();
  return snap.docs.map((doc) => doc.id);
}

export function historyOf(page: StoredPage | null): SiteRevision[] {
  return (page?.revisions ?? []).slice(0, 10).map((revision) => ({
    id: revision.id,
    at: revision.at,
    byUid: revision.byUid,
    byName: revision.byName,
    snapshot: stripPage(revision.snapshot),
  }));
}

export function resetSiteContentMemory() {
  memory.published = {};
  memory.drafts = {};
}
