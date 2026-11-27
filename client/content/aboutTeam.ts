/**
 * About page roster.
 *
 * Video-team headshots come from the same CREW list as /video-team.
 * Steven keeps that approved portrait. Pedro and David have no approved
 * portrait in public/media/about/, so their cards use circular initials.
 * Cadi's bar photo is only on /about/cadi.
 *
 * Roles come from the crew cards in public/thankful.html.
 * "Video team" is added for Mike, Daniel, and Armando.
 * Join years are the verified dates. No personal bio was invented.
 */

import { CREW } from "@/data/videoTeam";

export const CADI_PHOTO = "/media/about/cadi-torres.webp";
export const OWNER_PATH = "/about/cadi";

export const OWNER_STORY = [
  "Cadi didn't just start a photography studio; she engineered a media powerhouse. Obsessed with the friction agents face daily, she built Iconic to solve one problem: How to make agents more money with less effort.",
  'She doesn\'t just direct the operation; she directs the strategy. By mirroring her high-energy hustle into our AI-driven workflows, she ensures that every client receives a "Celebrity Agent" experience.',
] as const;

export type AboutTeamMember = {
  id: string;
  name: string;
  role: string;
  roleIsPlaceholder: boolean;
  blurb: string;
  bioIsPlaceholder: boolean;
  /** Null when the card shows a circular monogram instead of a photo. */
  photo: string | null;
  initials: string;
};

function crewPhoto(name: string): string {
  const person = CREW.find((item) => item.name === name);
  if (!person?.image) throw new Error(`Missing video-team photo for ${name}`);
  return person.image;
}

export const ABOUT_TEAM: readonly AboutTeamMember[] = [
  {
    id: "cadi",
    name: "Cadi Torres",
    role: "Owner",
    roleIsPlaceholder: false,
    blurb: "Founded Iconic in 2016.",
    bioIsPlaceholder: false,
    photo: crewPhoto("Cadi Torres"),
    initials: "CT",
  },
  {
    id: "mike",
    name: "Mike Luna",
    role: "Media Producer · Videographer · Video\u00a0team",
    roleIsPlaceholder: false,
    blurb: "Joined in 2019.",
    bioIsPlaceholder: false,
    photo: crewPhoto("Mike Luna"),
    initials: "ML",
  },
  {
    id: "armando",
    name: "Armando Martinez",
    role: "Photographer · Videographer · Bilingual · Video\u00a0team",
    roleIsPlaceholder: false,
    blurb: "Joined in 2021.",
    bioIsPlaceholder: false,
    photo: crewPhoto("Armando Martinez"),
    initials: "AM",
  },
  {
    id: "daniel",
    name: "Daniel Adaclog",
    role: "Photographer · Videographer · Video\u00a0team",
    roleIsPlaceholder: false,
    blurb: "Joined in 2021.",
    bioIsPlaceholder: false,
    photo: crewPhoto("Daniel Adaclog"),
    initials: "DA",
  },
  {
    id: "steven",
    name: "Steven Banda",
    role: "Bilingual Photographer · 20-Yr\u00a0Chef",
    roleIsPlaceholder: false,
    blurb: "Joined in 2026.",
    bioIsPlaceholder: false,
    photo: crewPhoto("Steven Banda"),
    initials: "SB",
  },
  {
    id: "pedro",
    name: "Pedro Hernandez",
    role: "Photographer · Bilingual",
    roleIsPlaceholder: false,
    blurb: "Joined in 2018.",
    bioIsPlaceholder: false,
    photo: null,
    initials: "PH",
  },
  {
    id: "david",
    name: "David Gonzalez",
    role: "Photographer · Videographer",
    roleIsPlaceholder: false,
    blurb: "2023 · Part-Time",
    bioIsPlaceholder: false,
    photo: null,
    initials: "DG",
  },
];
