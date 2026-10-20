/**
 * Small static Texas ZIP centroid table.
 *
 * Used only when a booking has a ZIP and no Places pin. Coordinates are the
 * Zippopotam.us place point for that ZIP (one representative point, not a
 * rooftop). A ZIP that is not listed cannot be resolved, and the quote stays
 * "Travel quoted" rather than $0.
 *
 * Add a row here when a ZIP-only booking should price. Do not put zone radii
 * or fees in this file — those live in travelZones.ts.
 */

export interface ZipCentroid {
  lat: number;
  lng: number;
}

export const TX_ZIP_CENTROIDS: Readonly<Record<string, ZipCentroid>> = {
  // Spring / The Woodlands — studio ZIP
  "77380": { lat: 30.1441, lng: -95.4703 },
  // The Woodlands — $75 apprentice service area. Zippopotam place points.
  "77381": { lat: 30.1716, lng: -95.4985 },
  "77382": { lat: 30.2106, lng: -95.5257 },
  "77384": { lat: 30.2257, lng: -95.4924 },
  "77385": { lat: 30.1877, lng: -95.4288 },
  // Spring
  "77373": { lat: 30.0532, lng: -95.3773 },
  "77379": { lat: 30.0377, lng: -95.5326 },
  "77386": { lat: 30.1288, lng: -95.4239 },
  "77388": { lat: 30.0505, lng: -95.4695 },
  "77389": { lat: 30.1044, lng: -95.5066 },
  // Conroe
  "77301": { lat: 30.3125, lng: -95.4527 },
  "77302": { lat: 30.2238, lng: -95.3577 },
  "77303": { lat: 30.3814, lng: -95.3749 },
  "77304": { lat: 30.3217, lng: -95.5285 },
  "77306": { lat: 30.2277, lng: -95.2851 },
  // Willis and Cypress. The $75 page does not charge these until travel is decided.
  "77318": { lat: 30.4416, lng: -95.5394 },
  "77378": { lat: 30.4441, lng: -95.4506 },
  "77410": { lat: 29.834, lng: -95.4342 },
  "77429": { lat: 29.9766, lng: -95.6358 },
  "77433": { lat: 29.8836, lng: -95.7025 },
  // Downtown Houston
  "77002": { lat: 29.7594, lng: -95.3594 },
  // Katy
  "77494": { lat: 29.7404, lng: -95.8304 },
  // Huntsville
  "77340": { lat: 30.6448, lng: -95.5798 },
  // Galveston
  "77550": { lat: 29.2983, lng: -94.793 },
  // Beaumont
  "77701": { lat: 30.0688, lng: -94.1039 },
  // Austin — past zone 6, so the quote is "Travel quoted"
  "78701": { lat: 30.2713, lng: -97.7426 },
};
