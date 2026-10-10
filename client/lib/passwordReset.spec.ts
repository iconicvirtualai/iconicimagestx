import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  passwordResetFailureMessage,
  passwordResetLogLine,
  requestPasswordReset,
} from "./passwordReset";

const loginSource = readFileSync(new URL("../pages/Login.tsx", import.meta.url), "utf8");
const adminLoginSource = readFileSync(new URL("../pages/AdminLogin.tsx", import.meta.url), "utf8");
const authSource = readFileSync(new URL("../contexts/AuthContext.tsx", import.meta.url), "utf8");
const bookingsSource = readFileSync(new URL("../../server/routes/bookings.ts", import.meta.url), "utf8");

describe("requestPasswordReset", () => {
  it("sends through the injected Firebase function and does not call mail", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const log = vi.fn();
    await requestPasswordReset("  Ada@Example.com ", send, log);
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith("Ada@Example.com");
    expect(log).not.toHaveBeenCalled();
  });

  it("logs the Firebase code and hides it from the client", async () => {
    const send = vi.fn().mockRejectedValue({
      code: "auth/unauthorized-continue-uri",
      message: "Firebase: Error (auth/unauthorized-continue-uri).",
    });
    const log = vi.fn();
    await expect(requestPasswordReset("ada@example.com", send, log)).rejects.toThrow(
      /not authorized yet/,
    );
    expect(log).toHaveBeenCalledOnce();
    const logged = String(log.mock.calls[0]?.[0]);
    expect(logged).toContain("auth/unauthorized-continue-uri");
    expect(logged).toContain("authorized domains");
    await expect(requestPasswordReset("ada@example.com", send, log)).rejects.toThrow(
      /^((?!auth\/).)*$/,
    );
  });

  it("maps the other Firebase failures to friendly copy", () => {
    expect(passwordResetFailureMessage({ code: "auth/invalid-email" })).toBe("Enter a valid email address.");
    expect(passwordResetFailureMessage({ code: "auth/user-not-found" })).toMatch(/No portal account/);
    expect(passwordResetFailureMessage({ code: "auth/too-many-requests" })).toMatch(/Wait a few minutes/);
    expect(passwordResetFailureMessage({ code: "auth/network-request-failed" })).toMatch(/connection/);
    expect(passwordResetFailureMessage({ code: "auth/invalid-continue-uri" })).toMatch(/not authorized yet/);
    expect(passwordResetFailureMessage({ code: "auth/missing-continue-uri" })).toMatch(/not authorized yet/);
    expect(passwordResetFailureMessage({ code: "auth/internal-error" })).toMatch(/Try again in a few minutes/);
    expect(passwordResetFailureMessage(new Error("smtp down"))).not.toMatch(/smtp|auth\//);
    expect(passwordResetLogLine({ code: "auth/user-not-found" })).toBe(
      "[Auth] Password reset failed: auth/user-not-found",
    );
    expect(passwordResetLogLine(new Error("nope"))).toBe("[Auth] Password reset failed: unknown");
  });

  it("does not send when the email is blank", async () => {
    const send = vi.fn();
    await expect(requestPasswordReset("   ", send)).rejects.toThrow(/Enter the email/);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("login password reset wiring", () => {
  it("does not consult the client-notify gate or our mailer", () => {
    expect(loginSource).not.toContain("/api/client-notify");
    expect(loginSource).not.toContain("CLIENT_NOTIFY_LIVE");
    expect(loginSource).not.toContain("sendEmail");
    expect(loginSource).not.toContain("generatePasswordResetLink");
    expect(loginSource).toContain("await resetPassword(resetEmail)");
    expect(loginSource).not.toContain("Failed to send reset email.");

    expect(adminLoginSource).not.toContain("/api/client-notify");
    expect(adminLoginSource).not.toContain("Failed to send reset email.");

    expect(authSource).toContain("sendPasswordResetEmail(auth, address)");
    expect(authSource).not.toMatch(/sendPasswordResetEmail\([\s\S]*actionCodeSettings/);
    expect(authSource).not.toContain("generatePasswordResetLink");
    expect(authSource).not.toContain("/api/client-notify");
  });

  it("keeps booking password-setup on the mailer gate", () => {
    expect(bookingsSource).toContain('template: "account_password_setup"');
    expect(bookingsSource).toContain("if (!clientNotifyLive())");
    expect(bookingsSource).toContain("sendFirebasePasswordEmail");
  });
});
