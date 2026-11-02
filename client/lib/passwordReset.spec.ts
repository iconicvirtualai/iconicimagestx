import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendPasswordResetEmail } from "firebase/auth";
import { FORGOT_PASSWORD_NOTICE, ENTER_EMAIL_NOTICE } from "@shared/passwordAccount";
import { requestPasswordReset } from "./passwordReset";

vi.mock("firebase/auth", () => ({
  sendPasswordResetEmail: vi.fn(),
}));

vi.mock("./firebase", () => ({
  auth: { app: "test-auth" },
}));

const send = vi.mocked(sendPasswordResetEmail);

beforeEach(() => {
  send.mockReset();
});

describe("requestPasswordReset", () => {
  it("asks Firebase to continue on this origin's /login and does not consult client notify", async () => {
    send.mockResolvedValue(undefined);
    const notice = await requestPasswordReset("cadi@caditorres.com", "https://www.iconicimagestx.com");
    expect(notice).toBe(FORGOT_PASSWORD_NOTICE);
    expect(send).toHaveBeenCalledWith(
      { app: "test-auth" },
      "cadi@caditorres.com",
      { url: "https://www.iconicimagestx.com/login", handleCodeInApp: false },
    );
  });

  it("returns the same notice when the address is unknown or Firebase rejects the send", async () => {
    send.mockRejectedValueOnce(Object.assign(new Error("missing"), { code: "auth/user-not-found" }));
    await expect(requestPasswordReset("nobody@example.com", "https://iconicimagestx.vercel.app")).resolves.toBe(FORGOT_PASSWORD_NOTICE);

    send.mockRejectedValueOnce(Object.assign(new Error("domain"), { code: "auth/unauthorized-continue-uri" }));
    await expect(requestPasswordReset("cadi@caditorres.com", "https://iconicimagestx.com")).resolves.toBe(FORGOT_PASSWORD_NOTICE);
    expect(send).toHaveBeenLastCalledWith(
      { app: "test-auth" },
      "cadi@caditorres.com",
      { url: "https://iconicimagestx.com/login", handleCodeInApp: false },
    );
  });

  it("rejects a blank address before calling Firebase", async () => {
    await expect(requestPasswordReset("  ", "https://iconicimagestx.vercel.app")).resolves.toBe(ENTER_EMAIL_NOTICE);
    await expect(requestPasswordReset("not-an-email", "https://iconicimagestx.vercel.app")).resolves.toBe(ENTER_EMAIL_NOTICE);
    expect(send).not.toHaveBeenCalled();
  });
});
