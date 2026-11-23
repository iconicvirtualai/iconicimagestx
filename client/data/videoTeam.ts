/**
 * Public media for /video-team.
 * Paths, categories, and sample titles follow the staged handoff manifest.
 * Only team-reels/ and samples/ are published.
 */

export type TeamReel = {
  id: string;
  title: string;
  src: string;
  poster: string;
};

export type VideoSample = {
  id: string;
  title: string;
  src: string;
  poster: string;
  width: number;
  height: number;
};

export type SampleCategory = {
  id: string;
  label: string;
  samples: VideoSample[];
};

export type CrewMember = {
  name: string;
  image: string;
  initials: string;
};

const MEDIA = "/media/video-team";

export const TEAM_REELS: readonly TeamReel[] = [
  {
    id: "team-here",
    title: "Your Video Team Is Here",
    src: `${MEDIA}/team-reels/your-video-team-is-here-clean.mp4`,
    poster: `${MEDIA}/team-reels/your-video-team-is-here-clean.jpg`,
  },
  {
    id: "team-waiting",
    title: "Your Video Team Is Waiting",
    src: `${MEDIA}/team-reels/your-video-team-is-waiting-v3-clean.mp4`,
    poster: `${MEDIA}/team-reels/your-video-team-is-waiting-v3-clean.jpg`,
  },
  {
    id: "team-booked",
    title: "Your Video Team Is Booked",
    src: `${MEDIA}/team-reels/your-video-team-is-booked-v2-clean.mp4`,
    poster: `${MEDIA}/team-reels/your-video-team-is-booked-v2-clean.jpg`,
  },
  {
    id: "team-hype",
    title: "Your Video Team Is Hype",
    src: `${MEDIA}/team-reels/your-video-team-is-hype-v1-clean.mp4`,
    poster: `${MEDIA}/team-reels/your-video-team-is-hype-v1-clean.jpg`,
  },
];

export const SAMPLE_CATEGORIES: readonly SampleCategory[] = [
  {
    id: "on-camera",
    label: "On Camera",
    samples: [
      {
        id: "oc-emily",
        title: "Emily Aguilar",
        src: `${MEDIA}/samples/on-camera/emily-aguilar-stonecrop.mp4`,
        poster: `${MEDIA}/samples/on-camera/emily-aguilar-stonecrop.jpg`,
        width: 608,
        height: 1080,
      },
      {
        id: "oc-brittany",
        title: "Brittany Cabrera",
        src: `${MEDIA}/samples/on-camera/brittany-cabrera-ivy-wood.mp4`,
        poster: `${MEDIA}/samples/on-camera/brittany-cabrera-ivy-wood.jpg`,
        width: 608,
        height: 1080,
      },
      {
        id: "oc-catie",
        title: "Catie Fuller",
        src: `${MEDIA}/samples/on-camera/catie-fuller-spring-trails.mp4`,
        poster: `${MEDIA}/samples/on-camera/catie-fuller-spring-trails.jpg`,
        width: 608,
        height: 1080,
      },
    ],
  },
  {
    id: "branding",
    label: "Branding",
    samples: [
      {
        id: "pr-branding",
        title: "Branding Web Clip",
        src: `${MEDIA}/samples/branding/branding-web-clip.mp4`,
        poster: `${MEDIA}/samples/branding/branding-web-clip.jpg`,
        width: 1080,
        height: 608,
      },
    ],
  },
  {
    id: "events",
    label: "Events",
    samples: [
      {
        id: "ev-webclip",
        title: "Events Web Clip",
        src: `${MEDIA}/samples/events/events-web-clip.mp4`,
        poster: `${MEDIA}/samples/events/events-web-clip.jpg`,
        width: 1080,
        height: 608,
      },
      {
        id: "ev-apprec",
        title: "Client Appreciation Holiday Photoshoot 2023",
        src: `${MEDIA}/samples/events/client-appreciation-2023.mp4`,
        poster: `${MEDIA}/samples/events/client-appreciation-2023.jpg`,
        width: 1080,
        height: 608,
      },
      {
        id: "ev-cookoff",
        title: "KW Chili Cook Off 2022",
        src: `${MEDIA}/samples/events/kw-chili-cookoff-2022.mp4`,
        poster: `${MEDIA}/samples/events/kw-chili-cookoff-2022.jpg`,
        width: 720,
        height: 406,
      },
    ],
  },
  {
    id: "real-estate",
    label: "Real Estate",
    samples: [
      {
        id: "re-nubenbrook",
        title: "Nubenbrook Lake",
        src: `${MEDIA}/samples/real-estate/nubenbrook-lake-listing.mp4`,
        poster: `${MEDIA}/samples/real-estate/nubenbrook-lake-listing.jpg`,
        width: 1080,
        height: 608,
      },
      {
        id: "re-chateau",
        title: "Chateau Creek",
        src: `${MEDIA}/samples/real-estate/chateau-creek-unbranded.mp4`,
        poster: `${MEDIA}/samples/real-estate/chateau-creek-unbranded.jpg`,
        width: 608,
        height: 1080,
      },
      {
        id: "re-bluelake",
        title: "Blue Lake",
        src: `${MEDIA}/samples/real-estate/blue-lake-unbranded.mp4`,
        poster: `${MEDIA}/samples/real-estate/blue-lake-unbranded.jpg`,
        width: 608,
        height: 1080,
      },
      {
        id: "re-fawn",
        title: "Lakefront Aerial",
        src: `${MEDIA}/samples/real-estate/fawn-rd-aerial.mp4`,
        poster: `${MEDIA}/samples/real-estate/fawn-rd-aerial.jpg`,
        width: 1080,
        height: 608,
      },
    ],
  },
  {
    id: "commercial",
    label: "Commercial",
    samples: [
      {
        id: "co-a1",
        title: "A1 Commercial",
        src: `${MEDIA}/samples/commercial/a1-commercial.mp4`,
        poster: `${MEDIA}/samples/commercial/a1-commercial.jpg`,
        width: 1080,
        height: 608,
      },
      {
        id: "co-king",
        title: "King Metals and Cores",
        src: `${MEDIA}/samples/commercial/king-metals.mp4`,
        poster: `${MEDIA}/samples/commercial/king-metals.jpg`,
        width: 1080,
        height: 608,
      },
    ],
  },
  {
    id: "product",
    label: "Product",
    samples: [
      {
        id: "pr-product",
        title: "Product Photography",
        src: `${MEDIA}/samples/product/product-photography.mp4`,
        poster: `${MEDIA}/samples/product/product-photography.jpg`,
        width: 1080,
        height: 608,
      },
    ],
  },
  {
    id: "twilight",
    label: "Twilight",
    samples: [
      {
        id: "pr-twilight",
        title: "Product Twilight",
        src: `${MEDIA}/samples/twilight/product-twilight-video-v2.mp4`,
        poster: `${MEDIA}/samples/twilight/product-twilight-video-v2.jpg`,
        width: 1080,
        height: 608,
      },
    ],
  },
];

export const CREW: readonly CrewMember[] = [
  { name: "Cadi Torres", image: "/holiday-2026/crew-cadi.jpg", initials: "CT" },
  { name: "Mike Luna", image: "/holiday-2026/crew-mike.jpg", initials: "ML" },
  { name: "Armando Martinez", image: "/holiday-2026/crew-armando.jpg", initials: "AM" },
  { name: "Daniel Adaclog", image: "/holiday-2026/crew-daniel.jpg", initials: "DA" },
  { name: "Steven Banda", image: "/holiday-2026/crew-steven.jpg", initials: "SB" },
  { name: "Pedro Hernandez", image: "/holiday-2026/crew-pedro.jpg", initials: "PH" },
  { name: "David Gonzalez", image: "/holiday-2026/crew-david.jpg", initials: "DG" },
];
