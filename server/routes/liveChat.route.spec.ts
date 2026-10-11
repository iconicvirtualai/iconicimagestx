import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/email", () => ({
  sendEmail: vi.fn(),
}));

vi.mock("../services/sms", () => ({
  sendSMS: vi.fn(),
}));

import { createServer } from "../index";
import { sendEmail } from "../services/email";
import { sendSMS } from "../services/sms";
import { LIVE_CHAT_MAX_PER_WINDOW } from "../services/liveChat";

const sendEmailMock = vi.mocked(sendEmail);
const sendSMSMock = vi.mocked(sendSMS);

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  const app = createServer();
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a port.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

beforeEach(() => {
  sendEmailMock.mockReset();
  sendSMSMock.mockReset();
  sendEmailMock.mockResolvedValue({ sent: true, delivery: "sent" });
  sendSMSMock.mockResolvedValue({ sid: "SM123", status: "queued" });
});

function postChat(body: unknown, ip = "203.0.113.10") {
  return fetch(`${baseUrl}/api/contact/live-chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": ip,
    },
    body: JSON.stringify(body),
  });
}

const validBody = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  phone: "281-555-0199",
  message: "Can you shoot a listing on Thursday?",
};

describe("POST /api/contact/live-chat", () => {
  it("rejects a message with no way to reply", async () => {
    const res = await postChat({ name: "Ada", message: "Hello" }, "203.0.113.20");
    expect(res.status).toBe(400);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(sendSMSMock).not.toHaveBeenCalled();
  });

  it("emails the office and texts Google Voice, not the visitor", async () => {
    const res = await postChat(validBody, "203.0.113.21");
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.emailDelivered).toBe(true);
    expect(data.smsDelivered).toBe(true);
    expect(data.message).toMatch(/We got your message/);

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const email = sendEmailMock.mock.calls[0][0];
    expect(email.to).toBe(process.env.CONTACT_FORM_EMAIL || "photos@iconicimagestx.com");
    expect(email.to).not.toBe(validBody.email);
    expect(email.template).toBe("live_chat");
    expect(email.audience).toBe("staff");
    expect(email.variables).toMatchObject({
      senderName: "Ada Lovelace",
      senderEmail: "ada@example.com",
      senderPhone: "281-555-0199",
    });

    expect(sendSMSMock).toHaveBeenCalledTimes(1);
    const sms = sendSMSMock.mock.calls[0][0];
    expect(sms.to).toBe("+12813560965");
    expect(sms.to).not.toBe(validBody.phone);
    expect(sms.kind).toBe("staff_inbound");
    expect(sms.body).toContain("Ada Lovelace");
    expect(sms.body).toContain("Thursday");
  });

  it("still reports delivered when staff SMS fails", async () => {
    sendSMSMock.mockRejectedValue(new Error("A2P 10DLC not registered"));
    const res = await postChat(validBody, "203.0.113.22");
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.emailDelivered).toBe(true);
    expect(data.smsDelivered).toBe(false);
  });

  it("still delivers when email fails and the office text goes out", async () => {
    sendEmailMock.mockResolvedValue({ sent: false, delivery: "suppressed" });
    const res = await postChat(validBody, "203.0.113.23");
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.emailDelivered).toBe(false);
    expect(data.smsDelivered).toBe(true);
    expect(sendSMSMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the send as a failure when neither email nor SMS goes out", async () => {
    sendEmailMock.mockResolvedValue({ sent: false, delivery: "suppressed" });
    sendSMSMock.mockResolvedValue({ sid: "", status: "suppressed", suppressed: true });
    const res = await postChat(validBody, "203.0.113.25");
    const data = await res.json();
    expect(res.status).toBe(500);
    expect(data.success).toBeUndefined();
    expect(data.error).toMatch(/couldn't deliver/i);
  });

  it("rate-limits a single IP before it can spam SMS", async () => {
    const ip = "203.0.113.24";
    for (let i = 0; i < LIVE_CHAT_MAX_PER_WINDOW; i += 1) {
      const ok = await postChat({ ...validBody, message: `Message ${i}` }, ip);
      expect(ok.status).toBe(200);
    }
    const blocked = await postChat(validBody, ip);
    const data = await blocked.json();
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
    expect(data.error).toMatch(/Too many messages/);
    expect(sendEmailMock).toHaveBeenCalledTimes(LIVE_CHAT_MAX_PER_WINDOW);
  });
});
