/**
 * Placeholder listing for the template preview and tests.
 * This is not a client record and it is never written to Firestore.
 */

import {
  buildListingSiteModel,
  defaultListingWebsite,
  sanitizeListingWebsite,
  type ListingSiteInput,
  type ListingSiteModel,
  type ListingSiteTemplateId,
  type PortalWebsiteSettings,
} from "./listingSite";

const photo = (id: string, name: string, file: string, polishedFile = "") => ({
  id,
  name,
  url: `/listing-site/${file}`,
  polishedUrl: polishedFile ? `/listing-site/${polishedFile}` : "",
});

export const DEMO_LISTING_ADDRESS = "18 Lantern Oak Pl";

const HERO: Record<ListingSiteTemplateId, string> = {
  "two-up": "arrival",
  "golden-hour": "pool",
  "stories-deck": "facade",
};

export function demoListingWebsite(templateId: ListingSiteTemplateId = "two-up"): PortalWebsiteSettings {
  return sanitizeListingWebsite({
    ...defaultListingWebsite(),
    templateId,
    price: "$1,185,000",
    tagline: "Glass, cedar and dark steel set back under mature pines. The left side of this page follows you through the house as you read.",
    heroPhotoIds: [HERO[templateId]],
    collagePhotoIds: ["kitchen", "range", "great", "primary", "bath", "lawn", "nook", "pool", "evening", "twilight"],
    photoVersions: { lawn: "polished" },
    agent: {
      name: "Agent Name",
      brokerage: "Brokerage Name",
      license: "000000",
      phone: "(281) 555-0100",
      email: "agent@example.com",
      office: "The Woodlands, TX",
      headshotUrl: "",
    },
  });
}

export function demoListingInput(website: PortalWebsiteSettings = demoListingWebsite()): ListingSiteInput {
  return {
    addressLine: DEMO_LISTING_ADDRESS,
    city: "The Woodlands",
    state: "TX",
    zip: "77380",
    facts: [
      { id: "beds", label: "Bedrooms", value: "4" },
      { id: "baths", label: "Baths", value: "3.5" },
      { id: "sqft", label: "Sq ft", value: "3412" },
      { id: "lotSize", label: "Lot", value: "0.31 ac" },
    ],
    website,
    sample: true,
    runtime: "2:14",
    chapters: [
      { time: "0:00", label: "Arrival" },
      { time: "0:28", label: "Kitchen" },
      { time: "0:51", label: "Great room" },
      { time: "1:20", label: "Primary suite" },
      { time: "1:48", label: "Back yard at dusk" },
    ],
    photos: [
      photo("arrival", "Arrival", "arrival.jpg"),
      photo("kitchen", "Kitchen", "kitchen.jpg"),
      photo("range", "Kitchen range", "range.jpg"),
      photo("great", "Great Room", "great.jpg"),
      photo("primary", "Primary Suite", "primary.jpg"),
      photo("bath", "Primary Bath", "bath.jpg"),
      photo("lawn", "Front lawn", "lawn.jpg", "lawn-new.jpg"),
      photo("nook", "Breakfast nook", "nook.jpg"),
      photo("pool", "Pool", "pool.jpg"),
      photo("evening", "Evening", "evening.jpg"),
      photo("twilight", "Twilight", "twilight.jpg"),
      photo("facade", "Cover", "facade.jpg"),
      photo("film-still", "Noon film", "film.jpg"),
    ],
    videos: [{ id: "film", name: "Listing film", url: "/listing-site/film.mp4" }],
    tours: [{
      id: "matterport",
      name: "Matterport",
      url: "https://my.matterport.com/show/?m=sampledemo1",
      embedUrl: "https://my.matterport.com/show/?m=sampledemo1",
      provider: "Matterport",
    }],
    floorplans: [{ id: "level1", name: "Level 1", url: "/listing-site/floorplan.svg" }],
    rooms: [
      { name: "Kitchen", caption: "Waterfall island, six-burner range, walk-in pantry. Opens to the great room.", size: "18×16", photoIds: ["kitchen", "range", "nook"] },
      { name: "Great Room", caption: "Double-height glass wall to the back yard.", size: "20×22", photoIds: ["great", "pool"] },
      { name: "Primary Suite", caption: "Ground floor, separate patio door.", size: "16×18", photoIds: ["primary"] },
      { name: "Primary Bath", caption: "Freestanding tub, walk-through shower.", size: "—", photoIds: ["bath"] },
    ],
    dayParts: [
      { time: "7:15 am", label: "Morning", caption: "East light lands on the island first. Coffee happens here.", photoIds: ["kitchen", "nook"] },
      { time: "1:30 pm", label: "Afternoon", caption: "Glass wall open, pool in full sun, shade under the overhang.", photoIds: ["great", "pool", "lawn"] },
      { time: "7:05 pm", label: "Evening", caption: "Lamps on, long table, primary suite turns warm.", photoIds: ["evening", "primary"] },
    ],
  };
}

export function demoListingModel(templateId: ListingSiteTemplateId = "two-up"): ListingSiteModel {
  return buildListingSiteModel(demoListingInput(demoListingWebsite(templateId)));
}
