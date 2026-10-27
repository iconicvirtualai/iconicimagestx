import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  advancePhotoEditRequest,
  attachPhotoEditReplacement,
  createPhotoEditRequest,
  openPhotoEditForPhoto,
  photoEditStatusLabel,
  readPhotoEditRequests,
  type PhotoEditRequest,
} from "./photoEditRequest";

const at = "2026-04-02T15:00:00.000Z";
const later = "2026-04-02T16:00:00.000Z";
const listingId = "listing1234";

function filed(note = "Warm the sky on the left."): PhotoEditRequest {
  const result = createPhotoEditRequest({
    id: "req-front1",
    listingId,
    photoId: "front",
    photoName: "front.jpg",
    note,
    clientId: "client123",
    at,
    knownPhotoIds: ["front", "back"],
    existing: [],
  });
  if (result.ok === false) throw new Error(result.error);
  return result.request;
}

describe("photo edit requests", () => {
  it("accepts the uuid id the server assigns", () => {
    const result = createPhotoEditRequest({
      id: "550e8400-e29b-41d4-a716-446655440000",
      listingId,
      photoId: "front",
      photoName: "front.jpg",
      photoUrl: "https://cdn.example/front.jpg",
      note: "Warm the sky on the left.",
      clientId: "client123",
      at,
      knownPhotoIds: ["front"],
      existing: [],
    });
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.request.photoUrl).toBe("https://cdn.example/front.jpg");
  });

  it("stores the photo id, note, and a requested timeline entry", () => {
    const request = filed();
    expect(request.photoId).toBe("front");
    expect(request.note).toBe("Warm the sky on the left.");
    expect(request.status).toBe("requested");
    expect(request.timeline).toEqual([
      { status: "requested", at, actor: "client", actorId: "client123" },
    ]);
    expect(request.replacement).toBeNull();
    expect(JSON.stringify(request)).not.toMatch(/invoice|square|twilio|cubicasa/i);
  });

  it("rejects an empty note, an unknown photo, and a second open request", () => {
    expect(createPhotoEditRequest({
      id: "req-front1",
      listingId,
      photoId: "front",
      photoName: "front.jpg",
      note: "   ",
      clientId: "client123",
      at,
      knownPhotoIds: ["front"],
      existing: [],
    })).toMatchObject({ ok: false, status: 400 });

    expect(createPhotoEditRequest({
      id: "req-front1",
      listingId,
      photoId: "missing",
      photoName: "missing.jpg",
      note: "Lift the shadows.",
      clientId: "client123",
      at,
      knownPhotoIds: ["front"],
      existing: [],
    })).toMatchObject({ ok: false, error: "That file is not on this listing." });

    const again = createPhotoEditRequest({
      id: "req-front2",
      listingId,
      photoId: "front",
      photoName: "front.jpg",
      note: "A second pass.",
      clientId: "client123",
      at: later,
      knownPhotoIds: ["front"],
      existing: [filed()],
    });
    expect(again).toMatchObject({ ok: false, status: 409 });
    expect(openPhotoEditForPhoto([filed()], "front")?.id).toBe("req-front1");
  });

  it("files a video and a 3D tour into the same queue as a photo", () => {
    const known = ["front", "walkthrough", "matterport"];
    const video = createPhotoEditRequest({
      id: "req-video1",
      listingId,
      photoId: "walkthrough",
      photoName: "walkthrough.mp4",
      photoUrl: "https://cdn.example/walkthrough.mp4",
      note: "Trim the opening pan.",
      clientId: "client123",
      at,
      knownPhotoIds: known,
      existing: [filed()],
    });
    expect(video.ok).toBe(true);
    if (video.ok === false) return;
    const tour = createPhotoEditRequest({
      id: "req-tour01",
      listingId,
      photoId: "matterport",
      photoName: "3D tour",
      photoUrl: "https://my.matterport.com/show/?m=abc12345",
      note: "Start the tour in the kitchen.",
      clientId: "client123",
      at: later,
      knownPhotoIds: known,
      existing: video.requests,
    });
    expect(tour.ok).toBe(true);
    if (tour.ok === false) return;
    expect(tour.requests.map((request) => request.photoId).sort()).toEqual(["front", "matterport", "walkthrough"]);
  });

  it("reuses the photo edit route for video, tours, floor plans, and files", () => {
    const source = readFileSync(new URL("../server/routes/portalListing.ts", import.meta.url), "utf8");
    const handler = source.slice(source.indexOf("export const handleCreatePhotoEditRequest"));
    expect(handler).toContain("detail.videos");
    expect(handler).toContain("detail.tours");
    expect(handler).toContain("detail.floorplans");
    expect(handler).toContain("detail.clientFiles");
    expect(handler).not.toMatch(/sendMail|sendSms|twilio|CLIENT_NOTIFY|BOOKING_NOTIFY/);
  });

  it("marks sent out and then received back, in that order", () => {
    const sent = advancePhotoEditRequest({
      requests: [filed()],
      requestId: "req-front1",
      to: "sent_out",
      actorId: "staff123",
      at: later,
    });
    expect(sent.ok).toBe(true);
    if (sent.ok === false) return;
    expect(sent.request.status).toBe("sent_out");
    expect(sent.request.timeline.map((entry) => entry.status)).toEqual(["requested", "sent_out"]);
    expect(photoEditStatusLabel(sent.request.status)).toBe("Sent out");

    const early = advancePhotoEditRequest({
      requests: [filed()],
      requestId: "req-front1",
      to: "received_back",
      actorId: "staff123",
      at: later,
    });
    expect(early).toMatchObject({
      ok: false,
      error: "Mark this request sent out before marking it received back.",
    });

    const received = advancePhotoEditRequest({
      requests: sent.requests,
      requestId: "req-front1",
      to: "received_back",
      actorId: "staff123",
      at: "2026-04-02T17:00:00.000Z",
    });
    expect(received.ok).toBe(true);
    if (received.ok === false) return;
    expect(received.request.status).toBe("received_back");
    expect(received.request.timeline.map((entry) => entry.status)).toEqual([
      "requested",
      "sent_out",
      "received_back",
    ]);
    expect(advancePhotoEditRequest({
      requests: received.requests,
      requestId: "req-front1",
      to: "sent_out",
      actorId: "staff123",
      at: "2026-04-02T18:00:00.000Z",
    })).toMatchObject({ ok: false, status: 400 });
  });

  it("attaches one replacement file without changing the status", () => {
    const sent = advancePhotoEditRequest({
      requests: [filed()],
      requestId: "req-front1",
      to: "sent_out",
      actorId: "staff123",
      at: later,
    });
    if (sent.ok === false) throw new Error(sent.error);
    const attached = attachPhotoEditReplacement({
      requests: sent.requests,
      requestId: "req-front1",
      listingId,
      replacement: {
        name: "front-edit.jpg",
        url: "https://cdn.example/front-edit.jpg",
        path: `listings/${listingId}/replacements/1_front-edit.jpg`,
        contentType: "image/jpeg",
        attachedAt: "2026-04-02T18:00:00.000Z",
        attachedBy: "staff123",
      },
    });
    expect(attached.ok).toBe(true);
    if (attached.ok === false) return;
    expect(attached.request.status).toBe("sent_out");
    expect(attached.request.timeline).toHaveLength(2);
    expect(attached.request.replacement).toMatchObject({
      name: "front-edit.jpg",
      contentType: "image/jpeg",
    });
    expect(attachPhotoEditReplacement({
      requests: sent.requests,
      requestId: "req-front1",
      listingId,
      replacement: {
        name: "notes.txt",
        url: "http://cdn.example/notes.txt",
        path: `listings/other/replacements/notes.txt`,
        contentType: "image/jpeg",
        attachedAt: later,
        attachedBy: "staff123",
      },
    })).toMatchObject({ ok: false, status: 400 });
  });

  it("reads stored requests and drops a row that is not a photo edit", () => {
    const request = filed();
    const read = readPhotoEditRequests([
      request,
      { id: "invoice", note: "Pay now", status: "sent" },
    ]);
    expect(read).toEqual([request]);
  });
});
