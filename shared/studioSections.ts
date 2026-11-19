/**
 * Staff Studio is the scratch pad at /admin/studio.
 * Delivery and client projects stay reachable from that desk.
 * The old marketing-kit placeholder is retired.
 */

import { STUDIO_EDITOR_PATH } from "./studioEditorHref";

export const STUDIO_HOME_PATH = STUDIO_EDITOR_PATH;
export const STUDIO_PHOTO_EDITING_ALIAS = "/admin/studio/editing";
/** Retired route. It redirects to Studio. */
export const STUDIO_PROJECTS_PATH = "/admin/studio/projects";
/** Retired route. It redirects to Studio. */
export const STUDIO_MARKETING_PATH = "/admin/studio/marketing";

/** Previous operations upload screen. The route redirects to Studio. */
export const STUDIO_OPERATIONS_PATH = "/admin/studio/operations";

export const STUDIO_DELIVERY_PATH = "/admin/delivery";
export const STUDIO_LISTINGS_PATH = "/admin/listings";

/** Previous Iconic Studio index. The route redirects to Studio. */
export const ICONIC_STUDIO_INDEX_PATH = "/admin/iconic-studio";

export type StudioSectionId = "editing";

export interface StudioSection {
  id: StudioSectionId;
  label: string;
  href: string;
  match: readonly string[];
  detail: string;
}

export const STUDIO_SECTIONS: readonly StudioSection[] = [
  {
    id: "editing",
    label: "Studio",
    href: STUDIO_HOME_PATH,
    match: [STUDIO_HOME_PATH, "/admin/studio/scratch", STUDIO_PHOTO_EDITING_ALIAS],
    detail: "Edits, media, and the export to the client gallery.",
  },
] as const;

export interface StudioPathway {
  id: string;
  label: string;
  href: string;
  detail: string;
}

export const STUDIO_PROJECT_PATHWAYS: readonly StudioPathway[] = [
  {
    id: "delivery",
    label: "Delivery",
    href: STUDIO_DELIVERY_PATH,
    detail: "Gallery hold and the download gate.",
  },
  {
    id: "listings",
    label: "Client projects",
    href: STUDIO_LISTINGS_PATH,
    detail: "Open a job to manage the project file.",
  },
] as const;

export function studioSectionForPath(pathname: string): StudioSectionId | null {
  const path = pathname.split("?")[0].split("#")[0];
  if (path === STUDIO_PROJECTS_PATH || path === STUDIO_MARKETING_PATH) return null;
  const match = STUDIO_SECTIONS.find((section) =>
    section.match.some((href) => path === href || (href !== STUDIO_HOME_PATH && path.startsWith(`${href}/`))),
  );
  return match?.id ?? null;
}
