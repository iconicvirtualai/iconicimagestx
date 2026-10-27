/**
 * Read-only photographer portal preview.
 * Demo jobs are seeded in the browser. A real photographer is loaded with GET
 * only. This module does not upload, reply, or send email or SMS.
 */

import { buildPhotographerPortal, chicagoDateKey, type PhotographerJobCard } from "./photographerPortal.ts";

export const DEMO_PHOTOGRAPHER_ID = "demo-photographer";
export const DEMO_PHOTOGRAPHER_FIRST_NAME = "Demo";
export const DEMO_PHOTOGRAPHER_LABEL = "Demo photographer";
export const DEMO_PHOTOGRAPHER_PAY_RATE = 75;

export function isDemoPhotographer(id: string | null | undefined): boolean {
  return !id || id === DEMO_PHOTOGRAPHER_ID;
}

export function demoPhotographerJobs(today = chicagoDateKey(new Date())): PhotographerJobCard[] {
  return buildPhotographerPortal({
    today,
    listings: [
      {
        id: "demo-today-shoot",
        status: "scheduled",
        address: "18 Pecan Street, Austin, TX",
        clientName: "Sample Client",
        apptDate: today,
        apptTime: "11:00 AM",
        appointmentDuration: 60,
        services: ["Showcase"],
        accessInfo: "Meet the agent at the front door",
        notes: "Twilight is on the order.",
        images: [],
      },
      {
        id: "demo-upcoming-shoot",
        status: "scheduled",
        address: "401 Barton Springs, Austin, TX",
        clientName: "Sample Client",
        apptDate: "2026-12-01",
        apptTime: "9:00 AM",
        images: [],
      },
      {
        id: "demo-editing-shoot",
        status: "uploaded",
        address: "90 Lakeview Court, Austin, TX",
        clientName: "Sample Client",
        apptDate: "2026-10-01",
        images: [{ name: "front.jpg" }],
      },
    ],
    studioJobs: [
      {
        listingId: "demo-editing-shoot",
        status: "processing",
        origin: "order",
        type: "photo",
        sourcePath: "listings/demo-editing-shoot/photos/front.jpg",
      },
    ],
  });
}
