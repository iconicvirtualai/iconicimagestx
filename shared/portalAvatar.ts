/** Headshot, then a logo, then initials. Shared by the portal and the admin client view. */

export type PortalAvatarKind = "headshot" | "logo" | "initials";

export interface PortalAvatarInput {
  headshotUrl?: string | null;
  photoUrl?: string | null;
  companyLogoUrl?: string | null;
  brokerageLogoUrl?: string | null;
}

export interface PortalPortrait {
  url: string;
  kind: PortalAvatarKind;
}

function clean(value: string | null | undefined): string {
  return String(value || "").trim();
}

export function portalPortrait(input: PortalAvatarInput = {}): PortalPortrait {
  const headshot = clean(input.headshotUrl);
  const photo = clean(input.photoUrl);
  const company = clean(input.companyLogoUrl);
  const brokerage = clean(input.brokerageLogoUrl);
  const logos = new Set([company, brokerage].filter(Boolean));
  if (headshot) return { url: headshot, kind: "headshot" };
  if (photo && !logos.has(photo)) return { url: photo, kind: "headshot" };
  const logo = company || brokerage || photo;
  if (logo) return { url: logo, kind: "logo" };
  return { url: "", kind: "initials" };
}
