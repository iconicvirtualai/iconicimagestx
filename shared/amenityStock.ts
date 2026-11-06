/**
 * Public amenity stock cards.
 * One covered front photo per neighborhood. The rest of each set is not
 * listed here, so the client bundle cannot advertise unpaid files.
 */

export const AMENITY_STOCK_PRICE = 49.99;

export const AMENITY_STOCK_INTRO =
  "Neighborhood amenity photos from Iconic Images. Pay for a set and Iconic sends the files to you.";

export type AmenityStockCard = {
  id: string;
  neighborhood: string;
  price: number;
  imageCount: number;
  coverFile: string;
  coverAlt: string;
};

export const AMENITY_STOCK_CARDS: readonly AmenityStockCard[] = [
  {
    id: "artavia",
    neighborhood: "Artavia",
    price: AMENITY_STOCK_PRICE,
    imageCount: 6,
    coverFile: "A7303322.jpg",
    coverAlt: "Artavia entrance with a large letter A sculpture",
  },
  {
    id: "benders-landing",
    neighborhood: "Bender's Landing",
    price: AMENITY_STOCK_PRICE,
    imageCount: 6,
    coverFile: "DJI_0002_edits.jpg",
    coverAlt: "Aerial view of a Bender's Landing playground",
  },
  {
    id: "carlton-woods",
    neighborhood: "Carlton Woods",
    price: AMENITY_STOCK_PRICE,
    imageCount: 6,
    coverFile: "MLU07984.jpg",
    coverAlt: "Carlton Woods outdoor basketball court",
  },
  {
    id: "east-shore",
    neighborhood: "East Shore",
    price: AMENITY_STOCK_PRICE,
    imageCount: 6,
    coverFile: "A6509322.jpg",
    coverAlt: "East Shore clubhouse and the East Shore Club sign",
  },
  {
    id: "woodlands-waterway",
    neighborhood: "The Woodlands Waterway",
    price: AMENITY_STOCK_PRICE,
    imageCount: 6,
    coverFile: "DJI_0100.jpg",
    coverAlt: "The Woodlands Waterway with glass towers, a bridge, and a fountain",
  },
  {
    id: "woodforest",
    neighborhood: "Woodforest",
    price: AMENITY_STOCK_PRICE,
    imageCount: 6,
    coverFile: "DJI_0088.jpg",
    coverAlt: "Aerial view of the Woodforest pool and water slides",
  },
];

const CARDS_BY_ID = new Map(AMENITY_STOCK_CARDS.map((card) => [card.id, card]));

export function amenityStockById(id: string): AmenityStockCard | null {
  return CARDS_BY_ID.get(id) ?? null;
}

export function amenityCoverUrl(card: Pick<AmenityStockCard, "id" | "coverFile">): string {
  return `/media/amenities/${card.id}/${card.coverFile}`;
}

export function amenityCoverWebpUrl(card: Pick<AmenityStockCard, "id" | "coverFile">): string {
  return amenityCoverUrl(card).replace(/\.jpe?g$/i, ".webp");
}

const PUBLIC_AMENITY_FILES = new Set(
  AMENITY_STOCK_CARDS.flatMap((card) => [amenityCoverUrl(card), amenityCoverWebpUrl(card)]),
);

function decodePath(pathname: string): string | null {
  const pathOnly = pathname.split("?")[0]?.split("#")[0] ?? "";
  if (!pathOnly.startsWith("/")) return null;
  try {
    return decodeURIComponent(pathOnly);
  } catch {
    return null;
  }
}

function isAmenityMediaPath(pathname: string): boolean {
  return pathname === "/media/amenities" || pathname.startsWith("/media/amenities/");
}

/**
 * Anonymous visitors may request only the published cover still.
 * Every other amenity path stays closed, including directory listings.
 */
export function amenityMediaRequestAllowed(pathname: string): boolean {
  const decoded = decodePath(pathname);
  if (!decoded || decoded.includes("\\") || decoded.includes("\0")) return false;
  const normalized = decoded.replace(/\/{2,}/g, "/");
  if (!isAmenityMediaPath(normalized)) return true;
  if (normalized.includes("..")) return false;
  return PUBLIC_AMENITY_FILES.has(normalized);
}

export function amenityStockReturnPath(setId: string, orderNumber: string): string {
  const params = new URLSearchParams({
    paid: "1",
    set: setId,
    order: orderNumber,
  });
  return `/stock-footage?${params.toString()}`;
}

const SQUARE_HOST = /(^|\.)((square\.link)|(square\.site)|(squareup\.com)|(squareupsandbox\.com))$/i;

/** Square-hosted checkout only. Rejects anything else before a browser redirect. */
export function isSquareCheckoutUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  return SQUARE_HOST.test(url.hostname);
}

/** Drop the old instant-license sentence if a published page still has it. */
export function amenityStockIntro(stored: string): string {
  const text = stored.trim();
  if (!text || /license instantly|unlimited downloads|download link/i.test(text)) return AMENITY_STOCK_INTRO;
  return stored;
}
