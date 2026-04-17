/**
 * Iconic Images — Places / Geocoding Routes
 *
 * GET /api/places/autocomplete?input=123+Main+St
 *   → Proxies to Google Places Autocomplete (if GOOGLE_MAPS_API_KEY is set)
 *   → Falls back to Nominatim / OpenStreetMap (free, no key required)
 *
 * GET /api/places/distance?origin=ADDRESS&destination=ADDRESS
 *   → Google Distance Matrix to calculate trip fee mileage
 *   → Returns { distanceMiles, distanceText, durationText }
 */

import { Router } from "express";

const router = Router();

const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY || "";

// ─── Normalise a Google Places prediction ────────────────────────────────────

function fromGoogle(p: any) {
  return {
    place_id:    p.place_id,
    description: p.description,
    main_text:   p.structured_formatting?.main_text   || p.description,
    secondary:   p.structured_formatting?.secondary_text || "",
  };
}

// ─── Normalise a Nominatim result ────────────────────────────────────────────

function fromNominatim(r: any, idx: number) {
  const parts: string[] = [];
  const a = r.address || {};

  if (a.house_number && a.road) parts.push(`${a.house_number} ${a.road}`);
  else if (a.road)              parts.push(a.road);

  if (a.city || a.town || a.village || a.county)
    parts.push(a.city || a.town || a.village || a.county);
  if (a.state)   parts.push(a.state);
  if (a.postcode) parts.push(a.postcode);

  const description = parts.length ? parts.join(", ") : r.display_name;

  return {
    place_id:    `nominatim_${idx}`,
    description,
    main_text:   parts[0] || description,
    secondary:   parts.slice(1).join(", "),
  };
}

// ─── GET /api/places/autocomplete ────────────────────────────────────────────

router.get("/autocomplete", async (req, res) => {
  const input = (req.query.input as string || "").trim();

  if (!input || input.length < 2) {
    return res.json({ suggestions: [] });
  }

  // ── Try Google first ───────────────────────────────────────────────────────
  if (GOOGLE_KEY) {
    try {
      const url =
        `https://maps.googleapis.com/maps/api/place/autocomplete/json` +
        `?input=${encodeURIComponent(input)}` +
        `&components=country:us` +
        `&types=address` +
        `&key=${GOOGLE_KEY}`;

      const r = await fetch(url);
      const data = await r.json() as { status: string; predictions?: any[] };

      if (data.status === "OK" && data.predictions?.length) {
        return res.json({ suggestions: data.predictions.map(fromGoogle), source: "google" });
      }
    } catch (err) {
      console.warn("[Places] Google autocomplete failed, falling back to Nominatim:", err);
    }
  }

  // ── Fallback: Nominatim (OpenStreetMap) — no key required ─────────────────
  try {
    const url =
      `https://nominatim.openstreetmap.org/search` +
      `?q=${encodeURIComponent(input)}` +
      `&format=json` +
      `&countrycodes=us` +
      `&addressdetails=1` +
      `&limit=6`;

    const r = await fetch(url, {
      headers: { "User-Agent": "IconicImages/1.0 (iconicimagestx.com)" },
    });

    const data = await r.json() as any[];

    // Filter to results that look like real street addresses
    const filtered = data.filter((d) => {
      const a = d.address || {};
      return a.house_number || a.road;
    });

    return res.json({
      suggestions: (filtered.length ? filtered : data.slice(0, 5)).map(fromNominatim),
      source: "nominatim",
    });
  } catch (err) {
    console.error("[Places] Nominatim failed:", err);
    return res.json({ suggestions: [] });
  }
});

// ─── GET /api/places/distance ─────────────────────────────────────────────────
// Used to calculate trip fee based on distance from studio to property.
// STUDIO_ADDRESS env var (default: The Woodlands, TX area).

router.get("/distance", async (req, res) => {
  const destination = (req.query.destination as string || "").trim();
  const origin = (req.query.origin as string || process.env.STUDIO_ADDRESS || "The Woodlands, TX 77380").trim();

  if (!destination) {
    return res.status(400).json({ error: "destination is required" });
  }

  if (!GOOGLE_KEY) {
    return res.status(503).json({ error: "Distance calculation requires a Google Maps API key." });
  }

  try {
    const url =
      `https://maps.googleapis.com/maps/api/distancematrix/json` +
      `?origins=${encodeURIComponent(origin)}` +
      `&destinations=${encodeURIComponent(destination)}` +
      `&units=imperial` +
      `&key=${GOOGLE_KEY}`;

    const r = await fetch(url);
    const data = await r.json() as any;

    const element = data.rows?.[0]?.elements?.[0];
    if (!element || element.status !== "OK") {
      return res.json({ distanceMiles: null, distanceText: null, durationText: null });
    }

    const meters      = element.distance.value;
    const distanceMiles = Math.round((meters / 1609.34) * 10) / 10;
    const distanceText  = element.distance.text;
    const durationText  = element.duration.text;

    return res.json({ distanceMiles, distanceText, durationText });
  } catch (err) {
    console.error("[Places] Distance matrix error:", err);
    return res.status(500).json({ error: "Failed to calculate distance." });
  }
});

export default router;
