/**
 * About page roster.
 *
 * Photos are the circular holiday crew headshots, except Cadi.
 * Her card uses the portrait that was on the live About page, saved at
 * public/media/about/cadi-torres.webp. That file is only used on her card.
 * /video-team is not a route on main, so About does not link there.
 *
 * Roles come from the crew cards in public/thankful.html.
 * "Video team" is added for Mike, Daniel, and Armando because that is a known fact.
 * Cadi founded Iconic in 2016, which matches the "Est. 2016" line already on About.
 * That is the only line on her card. There is no separate owner section.
 *
 * Armando's blurb is shortened from the published /aboutarmando profile
 * (born in Mexico, raised in Houston, UT Austin Television and Film Production, photographer since 2013).
 * Cadi's card line is only the founding year. Every remaining blurb is PLACEHOLDER_BIO.
 */

export const PLACEHOLDER_BIO = "Part of the Iconic crew.";

export type AboutTeamMember = {
  id: string;
  name: string;
  role: string;
  roleIsPlaceholder: boolean;
  blurb: string;
  bioIsPlaceholder: boolean;
  photo: string;
  /** Tailwind object-position. Cadi's source is a tall portrait, so the circle keeps her face. */
  photoPosition?: string;
};

export const CADI_PHOTO = "/media/about/cadi-torres.webp";

export const ABOUT_TEAM: readonly AboutTeamMember[] = [
  {
    id: "cadi",
    name: "Cadi Torres",
    role: "Owner",
    roleIsPlaceholder: false,
    blurb: "Founded Iconic in 2016.",
    bioIsPlaceholder: false,
    photo: CADI_PHOTO,
    photoPosition: "object-top",
  },
  {
    id: "mike",
    name: "Mike Luna",
    role: "Media Producer · Videographer · Video\u00a0team",
    roleIsPlaceholder: false,
    blurb: PLACEHOLDER_BIO,
    bioIsPlaceholder: true,
    photo: "/holiday-2026/crew-mike.jpg",
  },
  {
    id: "armando",
    name: "Armando Martinez",
    role: "Photographer · Videographer · Bilingual · Video\u00a0team",
    roleIsPlaceholder: false,
    blurb:
      "Born in Mexico and raised in Houston. He studied Television and Film Production at the University of Texas at Austin and has been a professional photographer since 2013.",
    bioIsPlaceholder: false,
    photo: "/holiday-2026/crew-armando.jpg",
  },
  {
    id: "daniel",
    name: "Daniel Adaclog",
    role: "Photographer · Videographer · Video\u00a0team",
    roleIsPlaceholder: false,
    blurb: PLACEHOLDER_BIO,
    bioIsPlaceholder: true,
    photo: "/holiday-2026/crew-daniel.jpg",
  },
  {
    id: "steven",
    name: "Steven Banda",
    role: "Bilingual Photographer · 20-Yr\u00a0Chef",
    roleIsPlaceholder: false,
    blurb: PLACEHOLDER_BIO,
    bioIsPlaceholder: true,
    photo: "/holiday-2026/crew-steven.jpg",
  },
  {
    id: "pedro",
    name: "Pedro Hernandez",
    role: "Photographer · Bilingual",
    roleIsPlaceholder: false,
    blurb: PLACEHOLDER_BIO,
    bioIsPlaceholder: true,
    photo: "/holiday-2026/crew-pedro.jpg",
  },
  {
    id: "david",
    name: "David Gonzalez",
    role: "Photographer · Videographer",
    roleIsPlaceholder: false,
    blurb: PLACEHOLDER_BIO,
    bioIsPlaceholder: true,
    photo: "/holiday-2026/crew-david.jpg",
  },
];
