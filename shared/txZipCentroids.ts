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
  // Spring
  "77373": { lat: 30.0532, lng: -95.3773 },
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
  // Austin — outside zone 6 with the provisional radii
  "78701": { lat: 30.2713, lng: -97.7426 },
};
