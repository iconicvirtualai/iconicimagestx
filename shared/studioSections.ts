/**
 * Staff Studio information architecture.
 * One Studio home, three subsections. Photo editing is the existing scratch pad.
 * Job-specific Iconic Studio links stay on /admin/iconic-studio/:listingId.
 */

import { STUDIO_SCRATCH_PATH } from "./studioScratch";

export const STUDIO_HOME_PATH = "/admin/studio";
export const STUDIO_PHOTO_EDITING_ALIAS = "/admin/studio/editing";
export const STUDIO_PROJECTS_PATH = "/admin/studio/projects";
export const STUDIO_MARKETING_PATH = "/admin/studio/marketing";

/** Previous operations upload screen. Not a top-level nav item. */
export const STUDIO_OPERATIONS_PATH = "/admin/studio/operations";

export const STUDIO_DELIVERY_PATH = "/admin/delivery";
export const STUDIO_LISTINGS_PATH = "/admin/listings";

/** Bare Iconic Studio index. Listing ids are not redirected. */
export const ICONIC_STUDIO_INDEX_PATH = "/admin/iconic-studio";

export type StudioSectionId = "editing" | "projects" | "marketing";

export interface StudioSection {
  id: StudioSectionId;
  label: string;
  href: string;
  /** Pathnames that belong to this subsection, including aliases. */
  match: readonly string[];
  detail: string;
}

export const STUDIO_SECTIONS: readonly StudioSection[] = [
  {
    id: "editing",
    label: "Photo editing",
    href: STUDIO_SCRATCH_PATH,
    match: [STUDIO_SCRATCH_PATH, STUDIO_PHOTO_EDITING_ALIAS],
    detail: "Scratch pad. The editor on this path is unchanged.",
  },
  {
    id: "projects",
    label: "Projects",
    href: STUDIO_PROJECTS_PATH,
    match: [STUDIO_PROJECTS_PATH],
    detail: "Client jobs after approve and submit. Galleries and the delivery hold stay on the existing screens.",
  },
  {
    id: "marketing",
    label: "Marketing kits",
    href: STUDIO_MARKETING_PATH,
    match: [STUDIO_MARKETING_PATH],
    detail: "Social graphics, listing-site packs, and extras. Not wired yet.",
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
    detail: "Gallery hold and the download gate. Pending, undelivered, and delivered stay on this queue.",
  },
  {
    id: "listings",
    label: "Client projects",
    href: STUDIO_LISTINGS_PATH,
    detail: "Open a job to manage the gallery lock and the rest of the project file.",
  },
] as const;

export const STUDIO_MARKETING_KITS = [
  { id: "social", label: "Social graphics", detail: "Posts and stories for a listing." },
  { id: "listing-sites", label: "Listing-site packs", detail: "Graphics sized for listing sites." },
  { id: "extras", label: "Extras", detail: "Other marketing files that are not the photo edit." },
] as const;

export function studioSectionForPath(pathname: string): StudioSectionId | null {
  const path = pathname.split("?")[0].split("#")[0];
  const match = STUDIO_SECTIONS.find((section) =>
    section.match.some((href) => path === href || path.startsWith(`${href}/`)),
  );
  return match?.id ?? null;
}
