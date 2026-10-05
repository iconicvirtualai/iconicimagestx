import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { createPhotoEditRequest, advancePhotoEditRequest } from "@shared/photoEditRequest";
import { PhotoEditRequestStaffView } from "./PhotoEditRequestStaff";

const at = "2026-04-02T15:00:00.000Z";

function request() {
  const created = createPhotoEditRequest({
    id: "req-front1",
    listingId: "listing1234",
    photoId: "front",
    photoName: "front.jpg",
    note: "Warm the sky on the left.",
    clientId: "client123",
    at,
    knownPhotoIds: ["front"],
    existing: [],
  });
  if (created.ok === false) throw new Error(created.error);
  return created.request;
}

function render(requests = [request()]) {
  return renderToString(
    <PhotoEditRequestStaffView
      requests={requests}
      busyId={null}
      onSent={() => undefined}
      onReceived={() => undefined}
      onReplacement={() => undefined}
    />,
  );
}

describe("staff photo edit requests", () => {
  it("offers sent out while the request is new, and keeps received back closed", () => {
    const html = render();
    expect(html).toContain("Warm the sky on the left.");
    expect(html).toContain("front.jpg");
    expect(html).toContain('data-testid="staff-photo-edit-sent-req-front1"');
    expect(html).toContain('data-enabled="true"');
    expect(html).toContain('data-testid="staff-photo-edit-received-req-front1"');
    expect(html).toContain('data-enabled="false"');
    expect(html).toContain('data-testid="staff-photo-edit-file-req-front1"');
    expect(html).toContain("This does not message the client.");
    expect(html).not.toContain("Pay now");
    expect(html).not.toContain("Invoice");
  });

  it("opens received back only after the request is sent out", () => {
    const sent = advancePhotoEditRequest({
      requests: [request()],
      requestId: "req-front1",
      to: "sent_out",
      actorId: "staff123",
      at: "2026-04-02T16:00:00.000Z",
    });
    if (sent.ok === false) throw new Error(sent.error);
    const html = render(sent.requests);
    expect(html).toContain("Sent out");
    expect(html).toContain('data-testid="staff-photo-edit-sent-req-front1" data-enabled="false"');
    expect(html).toContain('data-testid="staff-photo-edit-received-req-front1" data-enabled="true"');
  });
});
