import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Mail = { to?: string; cc?: string; subject?: string; html?: string; text?: string; lockHtml?: boolean };
const sendEmail = vi.fn(async (_message: Mail) => ({ sent: true, delivery: "sent" as const }));
const deliverGalleryToClient = vi.fn(async () => ({ deliveryUrl: "https://links.example/deliver/gal-1" }));

vi.mock("./email", () => ({
  sendEmail: (message: Mail) => sendEmail(message),
}));
vi.mock("./galleryDeliver", () => ({
  deliverGalleryToClient: () => deliverGalleryToClient(),
}));

import { sendClientDelivery } from "./clientDeliverySend";

const message = [
  "Hi Jordan,",
  "",
  "Your photos are ready.",
  "https://links.example/deliver/preview",
  "",
  "26410 Oakridge Dr. Ste 105 - 108, Spring, TX 77380 | 281.356.0965 | photos@iconicimagestx.com",
].join("\n");

describe("send client delivery", () => {
  afterEach(() => {
    delete process.env.CLIENT_NOTIFY_LIVE;
    delete process.env.CLIENT_EMAIL_NOTIFY_LIVE;
  });

  beforeEach(() => {
    sendEmail.mockClear();
    deliverGalleryToClient.mockClear();
    delete process.env.CLIENT_NOTIFY_LIVE;
    delete process.env.CLIENT_EMAIL_NOTIFY_LIVE;
  });

  it("does not email or write when the id is a sample", async () => {
    const result = await sendClientDelivery({
      id: "preview",
      action: "send",
      to: "jordan.hale@example.com",
      subject: "Your gallery is ready",
      message,
    });
    expect(result.sent).toBe(false);
    expect(result.mode).toBe("preview");
    expect(result.note).toContain("No email");
    expect(sendEmail).not.toHaveBeenCalled();
    expect(deliverGalleryToClient).not.toHaveBeenCalled();
  });

  it("holds a real send while the notify flags are off", async () => {
    const result = await sendClientDelivery({
      id: "gallery1234",
      action: "send",
      to: "jordan.hale@example.com",
      subject: "Your gallery is ready",
      message,
    });
    expect(result.mode).toBe("preview");
    expect(result.sent).toBe(false);
    expect(result.note).toContain("Safe preview");
    expect(sendEmail).not.toHaveBeenCalled();
    expect(deliverGalleryToClient).not.toHaveBeenCalled();
  });

  it("keeps a test on the QA sink and off the client when live email is on", async () => {
    process.env.CLIENT_NOTIFY_LIVE = "true";
    process.env.CLIENT_EMAIL_NOTIFY_LIVE = "true";
    const result = await sendClientDelivery({
      id: "gallery1234",
      action: "test",
      to: "jordan.hale@example.com",
      subject: "Your gallery is ready",
      message,
    });
    expect(result.mode).toBe("test");
    expect(deliverGalleryToClient).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mailed = sendEmail.mock.calls[0]?.[0];
    expect(mailed?.to).toBe("ops+deliveryqa@iconicimagestx.com");
    expect(mailed?.lockHtml).toBe(true);
    const body = JSON.stringify(mailed || {});
    expect(body).not.toContain("jordan.hale@example.com");
    expect(body.toLowerCase()).not.toContain("cadi@");
  });
});
