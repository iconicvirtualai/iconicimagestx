/**
 * Public About page roster.
 *
 * Names: public booking photographer list (server/services/bookingPhotographers.ts).
 * Roles: the holiday crew cards (public/thankful.html).
 * Photos: public/holiday-2026/crew-*.jpg. The same Cadi and Mike portraits
 * also live at public/media/portal-v2/cadi.jpg and mike.jpg.
 *
 * Bios on the team cards are placeholders. No public bio exists for these
 * people. Edit names, roles, bios, photos, and order in this array. The site
 * editor About → Meet the team block copies these fields, including Order.
 *
 * Do not point photo at about-banner/ref/cadi_1.jpg, cadi_2.jpg, or cadi_3.jpg.
 * Those files are Jazmin, not Cadi.
 */

export type AboutPerson = {
  id: string;
  name: string;
  role: string;
  photo: string;
};

export type AboutTeamMember = AboutPerson & {
  bio: string;
  /** Lower numbers render first. */
  order: number;
  /** True when this bio was written for the page because no public bio exists. */
  bioIsPlaceholder: boolean;
};

export const ABOUT_OWNER_BODY_LEAD =
  "Cadi didn't just start a photography studio; she engineered a media powerhouse. Obsessed with the friction agents face daily, she built Iconic to solve one problem: How to make agents more money with less effort.";

export const ABOUT_OWNER_BODY_FOLLOW =
  "She doesn't just direct the operation; she directs the strategy. By mirroring her high-energy hustle into our AI-driven workflows, she ensures that every client receives a \"Celebrity Agent\" experience.";

export const ABOUT_OWNER: AboutPerson & {
  kicker: string;
  bodyLead: string;
  bodyFollow: string;
} = {
  id: "cadi",
  name: "Cadi Torres",
  role: "Owner",
  photo: "/holiday-2026/crew-cadi.jpg",
  kicker: "About the owner",
  bodyLead: ABOUT_OWNER_BODY_LEAD,
  bodyFollow: ABOUT_OWNER_BODY_FOLLOW,
};

export const ABOUT_TEAM_KICKER = "Meet the team";
export const ABOUT_TEAM_TITLE = "The people behind the lens.";
export const ABOUT_TEAM_LINE = "Photographers and producers who shoot for Iconic.";

export const ABOUT_TEAM: readonly AboutTeamMember[] = [
  {
    id: "mike",
    name: "Mike Luna",
    role: "Media Producer · Videographer",
    bio: "Mike produces media and shoots video with the Iconic crew.",
    photo: "/holiday-2026/crew-mike.jpg",
    order: 1,
    bioIsPlaceholder: true,
  },
  {
    id: "armando",
    name: "Armando Martinez",
    role: "Photographer · Videographer · Bilingual",
    bio: "Armando photographs and films for Iconic, in English and Spanish.",
    photo: "/holiday-2026/crew-armando.jpg",
    order: 2,
    bioIsPlaceholder: true,
  },
  {
    id: "daniel",
    name: "Daniel Adaclog",
    role: "Photographer · Videographer",
    bio: "Daniel photographs and films for Iconic.",
    photo: "/holiday-2026/crew-daniel.jpg",
    order: 3,
    bioIsPlaceholder: true,
  },
  {
    id: "steven",
    name: "Steven Banda",
    role: "Bilingual Photographer · 20-Yr Chef",
    bio: "Steven photographs for Iconic, in English and Spanish.",
    photo: "/holiday-2026/crew-steven.jpg",
    order: 4,
    bioIsPlaceholder: true,
  },
  {
    id: "pedro",
    name: "Pedro Hernandez",
    role: "Photographer · Bilingual",
    bio: "Pedro photographs for Iconic, in English and Spanish.",
    photo: "/holiday-2026/crew-pedro.jpg",
    order: 5,
    bioIsPlaceholder: true,
  },
  {
    id: "david",
    name: "David Gonzalez",
    role: "Photographer · Videographer",
    bio: "David photographs and films for Iconic.",
    photo: "/holiday-2026/crew-david.jpg",
    order: 6,
    bioIsPlaceholder: true,
  },
];

const BANNED_ABOUT_PHOTO = /(?:^|\/)(?:about-banner\/ref\/)?cadi_[123]\.jpg(?:$|[?#])/i;

/** Drop the Jazmin reference photos. An empty result means show a monogram. */
export function safeAboutPhoto(photo: string): string {
  const value = String(photo || "").trim();
  if (!value) return "";
  const path = value.split(/[?#]/)[0];
  if (/about-banner\/ref\//i.test(path)) return "";
  if (BANNED_ABOUT_PHOTO.test(path)) return "";
  return value;
}

export function aboutMonogram(name: string): string {
  const first = name.trim().split(/\s+/)[0] || "";
  const letter = first.replace(/[^A-Za-z]/g, "").charAt(0);
  return (letter || "I").toUpperCase();
}

export function orderedAboutTeam(members: readonly AboutTeamMember[]): AboutTeamMember[] {
  return [...members].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

type LooseField = { id: string; value?: string };

/** Site-editor items win when present. Missing blocks fall back to ABOUT_TEAM. */
export function aboutTeamFromItems(items: { id: string; fields?: LooseField[] }[] | null | undefined): AboutTeamMember[] {
  if (!items?.length) return orderedAboutTeam(ABOUT_TEAM);
  const rows = items.flatMap((item, index) => {
    const fields = item.fields || [];
    const read = (id: string) => fields.find((field) => field.id === id)?.value ?? "";
    const has = (id: string) => fields.some((field) => field.id === id);
    const fallback = ABOUT_TEAM.find((member) => member.id === item.id);
    const name = (has("name") ? read("name") : fallback?.name || "").trim();
    if (!name) return [];
    const orderText = has("order") ? read("order").trim() : "";
    const order = Number(orderText);
    return [{
      id: item.id,
      name,
      role: (has("role") ? read("role") : fallback?.role || "").trim(),
      bio: (has("bio") ? read("bio") : fallback?.bio || "").trim(),
      photo: safeAboutPhoto(has("photo") ? read("photo") : fallback?.photo || ""),
      order: orderText && Number.isFinite(order) ? order : (fallback?.order ?? index + 1),
      bioIsPlaceholder: fallback?.bioIsPlaceholder ?? true,
    }];
  });
  return orderedAboutTeam(rows);
}
