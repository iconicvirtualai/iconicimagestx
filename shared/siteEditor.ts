/**
 * Site editor content, permissions, and Dropbox link checks.
 * Public pages keep their hardcoded copy until a published document exists.
 */

import { isOwnerEmail } from "./ownerAccess.ts";

export type FieldKind = "text" | "textarea" | "link" | "image" | "video";

export interface ContentField {
  id: string;
  label: string;
  kind: FieldKind;
  value: string;
  href?: string;
}

export interface ContentItem {
  id: string;
  fields: ContentField[];
}

export interface ContentBlock {
  id: string;
  label: string;
  hidden: boolean;
  fields: ContentField[];
  items?: ContentItem[];
}

export interface ContentPage {
  id: string;
  path: string;
  label: string;
  seoTitle: string;
  seoDescription: string;
  blocks: ContentBlock[];
}

export interface SiteRevision {
  id: string;
  at: string;
  byUid: string;
  byName: string;
  snapshot: ContentPage;
}

export interface StoredPage extends ContentPage {
  revisions?: SiteRevision[];
  publishedAt?: string;
  publishedByUid?: string;
  publishedByName?: string;
}

export interface SiteEditorFlags {
  view: boolean;
  edit: boolean;
  publish: boolean;
}

export interface SiteEditorAccess extends SiteEditorFlags {
  locked: boolean;
}

const HISTORY_LIMIT = 10;

export function textField(id: string, label: string, value: string): ContentField {
  return { id, label, kind: "text", value };
}

export function areaField(id: string, label: string, value: string): ContentField {
  return { id, label, kind: "textarea", value };
}

export function linkField(id: string, label: string, value: string, href: string): ContentField {
  return { id, label, kind: "link", value, href };
}

export function imageField(id: string, label: string, value: string): ContentField {
  return { id, label, kind: "image", value };
}

export function videoField(id: string, label: string, value: string): ContentField {
  return { id, label, kind: "video", value };
}

export function block(
  id: string,
  label: string,
  fields: ContentField[],
  items?: ContentItem[],
): ContentBlock {
  return { id, label, hidden: false, fields, ...(items ? { items } : {}) };
}

export function contentPage(
  id: string,
  path: string,
  label: string,
  seoTitle: string,
  seoDescription: string,
  blocks: ContentBlock[],
): ContentPage {
  return { id, path, label, seoTitle, seoDescription, blocks };
}

export function normalizeSiteEditorFlags(input: Partial<SiteEditorFlags> | null | undefined): SiteEditorFlags {
  let view = input?.view === true;
  let edit = input?.edit === true;
  let publish = input?.publish === true;
  if (publish) edit = true;
  if (edit) view = true;
  if (!view) {
    edit = false;
    publish = false;
  }
  return { view, edit, publish };
}

/** Owner emails and the admin role always have view, edit, and publish. */
export function siteEditorAccess(input: {
  role?: string | null;
  email?: string | null;
  flags?: Partial<SiteEditorFlags> | null;
  ownerEmails: readonly string[];
}): SiteEditorAccess {
  if (input.role === "admin" || isOwnerEmail(input.email, input.ownerEmails)) {
    return { view: true, edit: true, publish: true, locked: true };
  }
  return { ...normalizeSiteEditorFlags(input.flags), locked: false };
}

export function allows(access: SiteEditorFlags, level: keyof SiteEditorFlags): boolean {
  if (level === "view") return access.view;
  if (level === "edit") return access.edit;
  return access.publish;
}

export function stripPage(page: StoredPage | ContentPage): ContentPage {
  const { id, path, label, seoTitle, seoDescription, blocks } = page;
  return { id, path, label, seoTitle, seoDescription, blocks: blocks.map(cloneBlock) };
}

function cloneBlock(blockValue: ContentBlock): ContentBlock {
  return {
    id: blockValue.id,
    label: blockValue.label,
    hidden: blockValue.hidden === true,
    fields: blockValue.fields.map((field) => ({ ...field })),
    ...(blockValue.items ? { items: blockValue.items.map((item) => ({ id: item.id, fields: item.fields.map((field) => ({ ...field })) })) } : {}),
  };
}

export function findField(page: ContentPage | null | undefined, blockId: string, fieldId: string): ContentField | null {
  const found = page?.blocks.find((item) => item.id === blockId)?.fields.find((field) => field.id === fieldId);
  return found ?? null;
}

export function itemField(item: ContentItem | null | undefined, fieldId: string): ContentField | null {
  return item?.fields.find((field) => field.id === fieldId) ?? null;
}

export function pageIsHidden(page: ContentPage | null | undefined, blockId: string): boolean {
  return page?.blocks.find((item) => item.id === blockId)?.hidden === true;
}

export function pushRevision(existing: StoredPage | null, next: ContentPage, actor: { uid: string; name: string }, now = new Date().toISOString()): SiteRevision[] {
  const prior = existing ? stripPage(existing) : null;
  const revisions = [...(existing?.revisions ?? [])];
  if (prior) {
    revisions.unshift({
      id: `rev_${now}`,
      at: existing?.publishedAt || now,
      byUid: existing?.publishedByUid || actor.uid,
      byName: existing?.publishedByName || actor.name,
      snapshot: prior,
    });
  }
  return revisions.slice(0, HISTORY_LIMIT);
}

export function revertTo(page: StoredPage, revisionId: string, actor: { uid: string; name: string }, now = new Date().toISOString()): StoredPage | null {
  const revision = page.revisions?.find((item) => item.id === revisionId);
  if (!revision) return null;
  const current = stripPage(page);
  const revisions = [
    {
      id: `rev_${now}`,
      at: page.publishedAt || now,
      byUid: page.publishedByUid || actor.uid,
      byName: page.publishedByName || actor.name,
      snapshot: current,
    },
    ...(page.revisions ?? []).filter((item) => item.id !== revisionId),
  ].slice(0, HISTORY_LIMIT);
  return {
    ...revision.snapshot,
    revisions,
    publishedAt: now,
    publishedByUid: actor.uid,
    publishedByName: actor.name,
  };
}

const DROPBOX_HOSTS = new Set(["dropbox.com", "www.dropbox.com", "dl.dropboxusercontent.com"]);

export function isAllowedDropboxHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.+$/, "");
  if (!host || host.includes("..")) return false;
  if (isIpLiteral(host)) return false;
  if (DROPBOX_HOSTS.has(host)) return true;
  return host.endsWith(".dropboxusercontent.com") && host.length > ".dropboxusercontent.com".length;
}

function isIpLiteral(host: string): boolean {
  if (host.startsWith("[") || host.includes(":")) return true;
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

export function isPrivateAddress(ip: string): boolean {
  const value = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (value === "::1" || value === "0.0.0.0") return true;
  if (value.startsWith("fe80:") || value.startsWith("fc") || value.startsWith("fd")) return true;
  const parts = value.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return value.includes(":");
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

export function prepareDropboxUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (!isAllowedDropboxHost(url.hostname)) return null;
  if (url.pathname.includes("/scl/fo/") || url.pathname.includes("/sh/")) return null;
  url.searchParams.set("dl", "1");
  if (url.pathname.includes("/scl/fi/")) url.searchParams.set("raw", "1");
  return url;
}

export const SITE_IMAGE_BYTES = 25 * 1024 * 1024;
export const SITE_VIDEO_BYTES = 80 * 1024 * 1024;

export function sniffMedia(bytes: Uint8Array): "image" | "video" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image";
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image";
  if (bytes.length >= 12) {
    const brand = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
    if (brand === "ftyp") return "video";
  }
  return null;
}
