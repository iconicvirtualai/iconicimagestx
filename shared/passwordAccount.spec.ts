import { describe, expect, it } from "vitest";
import { firstMatchingRewrite, matchingRedirect } from "./spaRouting";
import {
  CHANGE_PASSWORD_PATH,
  ENTER_EMAIL_NOTICE,
  FORGOT_PASSWORD_NOTICE,
  PASSWORD_RESET_HOSTS,
  generateTemporaryPassword,
  nextPathAfterSignIn,
  passwordChoiceError,
  passwordPolicyError,
  passwordResetActionSettings,
  passwordResetContinueUrl,
} from "./passwordAccount";

describe("account password policy", () => {
  it("requires 8 characters and a matching confirmation", () => {
    expect(passwordPolicyError("short")).toMatch(/at least 8/);
    expect(passwordPolicyError("long-enough")).toBeNull();
    expect(passwordChoiceError("long-enough", "different")).toBe("Passwords do not match.");
    expect(passwordChoiceError("long-enough", "long-enough")).toBeNull();
  });

  it("generates a password the create form can hand to a photographer", () => {
    const password = generateTemporaryPassword();
    expect(password.length).toBeGreaterThanOrEqual(8);
    expect(passwordPolicyError(password)).toBeNull();
    expect(password).toMatch(/^[A-Za-z0-9]+$/);
  });
});

describe("must-change flow", () => {
  it("sends a photographer to change password before the portal", () => {
    expect(nextPathAfterSignIn({
      mustChangePassword: true,
      userType: "staff",
      role: "photographer",
    })).toBe(CHANGE_PASSWORD_PATH);
    expect(nextPathAfterSignIn({
      mustChangePassword: false,
      userType: "staff",
      role: "photographer",
    })).toBe("/admin/photographer");
  });

  it("uses the same gate for every other role", () => {
    expect(nextPathAfterSignIn({
      mustChangePassword: true,
      userType: "client",
    })).toBe(CHANGE_PASSWORD_PATH);
    expect(nextPathAfterSignIn({
      mustChangePassword: false,
      userType: "client",
      clientDestination: "/portal/listings/listing-1",
    })).toBe("/portal/listings/listing-1");
    expect(nextPathAfterSignIn({
      mustChangePassword: false,
      userType: "staff",
      role: "editor",
    })).toBe("/admin/editor");
    expect(nextPathAfterSignIn({
      mustChangePassword: false,
      userType: null,
    })).toBeNull();
  });
});

describe("forgot-password continue URL", () => {
  it("returns each live host to that host's /login", () => {
    for (const host of PASSWORD_RESET_HOSTS) {
      const origin = `https://${host}`;
      expect(passwordResetContinueUrl(origin)).toBe(`${origin}/login`);
      expect(passwordResetActionSettings(origin)).toEqual({
        url: `${origin}/login`,
        handleCodeInApp: false,
      });
    }
  });

  it("serves /forgot-password on vercel.app, www, and the apex without sending vercel.app away", () => {
    for (const host of PASSWORD_RESET_HOSTS) {
      expect(firstMatchingRewrite("/forgot-password", undefined, host)?.destination).toBe("/seo/private.html");
      expect(firstMatchingRewrite("/change-password", undefined, host)?.destination).toBe("/seo/private.html");
    }
    expect(matchingRedirect("/forgot-password", "iconicimagestx.vercel.app")).toBeUndefined();
    expect(matchingRedirect("/change-password", "iconicimagestx.vercel.app")).toBeUndefined();
    expect(FORGOT_PASSWORD_NOTICE).toBe("If that email has an account, a reset link is on its way.");
    expect(ENTER_EMAIL_NOTICE).toBe("Enter a valid email address.");
  });
});
