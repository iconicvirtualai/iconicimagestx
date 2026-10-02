import { describe, expect, it } from "vitest";
import {
  ADMIN_LOGIN_PATH,
  PORTAL_LOGIN_PATH,
  PRODUCTION_RESET_HANDLER_URL,
  parseAuthActionParams,
  passwordResetActionCodeSettings,
  passwordResetConfirmError,
  passwordResetContinueUrl,
  passwordResetSendError,
  safePasswordResetReturnPath,
  validateNewPassword,
} from "./passwordReset";

describe("password reset continue URL", () => {
  it("returns staff to admin login and portal users to the portal", () => {
    expect(passwordResetContinueUrl("https://iconicimagestx.vercel.app", "admin")).toBe(
      "https://iconicimagestx.vercel.app/admin/login",
    );
    expect(passwordResetContinueUrl("https://iconicimagestx.vercel.app/", "portal")).toBe(
      "https://iconicimagestx.vercel.app/portal",
    );
  });

  it("keeps the reset on the web and does not ask a mobile app to open the link", () => {
    expect(passwordResetActionCodeSettings("http://localhost:8080", "admin")).toEqual({
      url: "http://localhost:8080/admin/login",
      handleCodeInApp: false,
    });
  });

  it("names the in-app handler that Firebase must use as the action URL", () => {
    expect(PRODUCTION_RESET_HANDLER_URL).toBe("https://iconicimagestx.vercel.app/reset-password");
  });
});

describe("auth action link parsing", () => {
  it("reads the Firebase reset query", () => {
    const parsed = parseAuthActionParams(
      "?mode=resetPassword&oobCode=abc123&continueUrl=https%3A%2F%2Ficonicimagestx.vercel.app%2Fadmin%2Flogin&lang=en",
    );
    expect(parsed).toEqual({
      mode: "resetPassword",
      oobCode: "abc123",
      continueUrl: "https://iconicimagestx.vercel.app/admin/login",
    });
  });

  it("reads params from the hash when the query is empty", () => {
    expect(parseAuthActionParams("", "#mode=resetPassword&oobCode=from-hash")).toEqual({
      mode: "resetPassword",
      oobCode: "from-hash",
      continueUrl: null,
    });
  });
});

describe("safe return path", () => {
  const origin = "https://iconicimagestx.vercel.app";

  it("allows the staff and portal sign-in routes on this site", () => {
    expect(safePasswordResetReturnPath(`${origin}/admin/login`, origin)).toBe(ADMIN_LOGIN_PATH);
    expect(safePasswordResetReturnPath(`${origin}/portal?from=reset`, origin)).toBe("/portal?from=reset");
    expect(safePasswordResetReturnPath("/login", origin)).toBe("/login");
  });

  it("rejects other sites and in-app pages that are not sign-in", () => {
    expect(safePasswordResetReturnPath("https://evil.example/admin/login", origin)).toBe(ADMIN_LOGIN_PATH);
    expect(safePasswordResetReturnPath("https://iconicimagestx.vercel.app.evil.example/admin/login", origin)).toBe(
      ADMIN_LOGIN_PATH,
    );
    expect(safePasswordResetReturnPath(`${origin}/admin/dashboard`, origin)).toBe(ADMIN_LOGIN_PATH);
    expect(safePasswordResetReturnPath("javascript:alert(1)", origin)).toBe(ADMIN_LOGIN_PATH);
    expect(safePasswordResetReturnPath(null, origin, PORTAL_LOGIN_PATH)).toBe(PORTAL_LOGIN_PATH);
  });
});

describe("password reset messages", () => {
  it("requires a matching password of at least 6 characters", () => {
    expect(validateNewPassword("short", "short")).toMatch(/at least 6/);
    expect(validateNewPassword("long-enough", "different")).toBe("Passwords do not match.");
    expect(validateNewPassword("long-enough", "long-enough")).toBeNull();
  });

  it("explains an unauthorized continue domain and a dead reset link", () => {
    expect(passwordResetSendError("auth/unauthorized-continue-uri", "iconicimagestx.vercel.app")).toBe(
      "Password reset is not enabled for iconicimagestx.vercel.app yet. Add iconicimagestx.vercel.app under Firebase Authentication → Settings → Authorized domains, then try again.",
    );
    expect(passwordResetSendError("auth/user-not-found")).toMatch(/No account/);
    expect(passwordResetConfirmError("auth/expired-action-code")).toMatch(/expired/);
    expect(passwordResetConfirmError("auth/invalid-action-code")).toMatch(/already been used/);
  });
});
