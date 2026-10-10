import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  PASSWORD_RESET_FORMAT_MESSAGE,
  PASSWORD_RESET_NOTICE,
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

  it("uses one notice for success, an unknown address, and Firebase invalid-email", async () => {
    const log = vi.fn();
    const sent = vi.fn().mockResolvedValue(undefined);
    await expect(requestPasswordReset("ada@example.com", sent, log)).resolves.toBeUndefined();
    expect(sent).toHaveBeenCalledWith("ada@example.com");
    expect(log).not.toHaveBeenCalled();

    for (const code of ["auth/user-not-found", "auth/invalid-email", "auth/user-disabled"]) {
      const send = vi.fn().mockRejectedValue({ code, message: `Firebase: Error (${code}).` });
      await expect(requestPasswordReset("ada@example.com", send, log)).resolves.toBeUndefined();
      expect(passwordResetFailureMessage({ code })).toBe(PASSWORD_RESET_NOTICE);
      expect(passwordResetLogLine({ code })).toBe(`[Auth] Password reset failed: ${code}`);
    }
    expect(log.mock.calls.map((call) => String(call[0]))).toEqual([
      "[Auth] Password reset failed: auth/user-not-found",
      "[Auth] Password reset failed: auth/invalid-email",
      "[Auth] Password reset failed: auth/user-disabled",
    ]);
    expect(PASSWORD_RESET_NOTICE).not.toMatch(/no portal account|no account|not found|disabled|invalid email/i);
  });

  it("maps delivery failures to friendly copy and keeps the code in the log", () => {
    expect(passwordResetFailureMessage({ code: "auth/too-many-requests" })).toMatch(/Wait a few minutes/);
    expect(passwordResetFailureMessage({ code: "auth/network-request-failed" })).toMatch(/connection/);
    expect(passwordResetFailureMessage({ code: "auth/invalid-continue-uri" })).toMatch(/not authorized yet/);
    expect(passwordResetFailureMessage({ code: "auth/missing-continue-uri" })).toMatch(/not authorized yet/);
    expect(passwordResetFailureMessage({ code: "auth/internal-error" })).toMatch(/Try again in a few minutes/);
    expect(passwordResetFailureMessage(new Error("smtp down"))).not.toMatch(/smtp|auth\//);
    expect(passwordResetLogLine(new Error("nope"))).toBe("[Auth] Password reset failed: unknown");
  });

  it("rejects a malformed address before calling Firebase", async () => {
    const send = vi.fn();
    const log = vi.fn();
    await expect(requestPasswordReset("   ", send, log)).rejects.toThrow(PASSWORD_RESET_FORMAT_MESSAGE);
    await expect(requestPasswordReset("not-an-email", send, log)).rejects.toThrow(PASSWORD_RESET_FORMAT_MESSAGE);
    expect(send).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });
});

describe("login password reset wiring", () => {
  it("does not consult the client-notify gate or our mailer", () => {
    expect(loginSource).not.toContain("/api/client-notify");
    expect(loginSource).not.toContain("CLIENT_NOTIFY_LIVE");
    expect(loginSource).not.toContain("sendEmail");
    expect(loginSource).not.toContain("generatePasswordResetLink");
    expect(loginSource).toContain("await resetPassword(resetEmail)");
    expect(loginSource).toContain("toast.success(PASSWORD_RESET_NOTICE)");
    expect(loginSource).not.toContain("Failed to send reset email.");
    expect(loginSource).not.toContain("Reset email sent. Check your inbox.");
    expect(loginSource).not.toContain("No portal account");
    expect(loginSource).not.toContain("No account found");

    expect(adminLoginSource).not.toContain("/api/client-notify");
    expect(adminLoginSource).not.toContain("Failed to send reset email.");
    expect(adminLoginSource).toContain("toast.success(PASSWORD_RESET_NOTICE)");
    expect(adminLoginSource).not.toContain("Reset email sent. Check your inbox.");
    expect(adminLoginSource).not.toContain("No portal account");
    expect(adminLoginSource).not.toContain("No account found");
    expect(authSource).not.toContain("No portal account uses that email");

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
