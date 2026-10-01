import { describe, expect, it } from "vitest";
import {
  INITIAL_AUTH_SESSION,
  isActiveStaffRecord,
  isStaffRole,
  reduceAuthSession,
  sessionFromProfiles,
  staffHomePath,
  staffLoginAction,
} from "./staffAccess";
import { isHostedDeployment, isLocalAdminHost, isTempAdminClientEnabled, isTempAdminEnabled } from "./tempAdmin";
import { amountStillDue, invoiceAllowsDownload, invoiceIdFromSquareNote, publicMediaItem, squarePaymentNote } from "./paymentAccess";

describe("temp admin gates", () => {
  it("stays off unless the explicit flag is set", () => {
    expect(isTempAdminEnabled({})).toBe(false);
    expect(isTempAdminEnabled({ NODE_ENV: "development" })).toBe(false);
    expect(isTempAdminEnabled({ ENABLE_TEMP_ADMIN: "true" })).toBe(true);
  });

  it("never turns on for hosted or production runtimes", () => {
    expect(isTempAdminEnabled({ ENABLE_TEMP_ADMIN: "true", NODE_ENV: "production" })).toBe(false);
    expect(isTempAdminEnabled({ ENABLE_TEMP_ADMIN: "true", VERCEL: "1" })).toBe(false);
    expect(isTempAdminEnabled({ ENABLE_TEMP_ADMIN: "true", VERCEL_ENV: "preview" })).toBe(false);
    expect(isHostedDeployment({ VERCEL_ENV: "production" })).toBe(true);
  });

  it("client flag only works on local hosts", () => {
    expect(isLocalAdminHost("localhost")).toBe(true);
    expect(isTempAdminClientEnabled({ flag: "true", hostname: "localhost" })).toBe(true);
    expect(isTempAdminClientEnabled({ flag: "true", hostname: "iconicimagestx.vercel.app" })).toBe(false);
    expect(isTempAdminClientEnabled({ flag: undefined, hostname: "localhost" })).toBe(false);
  });
});

describe("staff roles", () => {
  it("accepts only active ops roles", () => {
    expect(isStaffRole("editor")).toBe(true);
    expect(isStaffRole("owner")).toBe(false);
    expect(isActiveStaffRecord({ role: "photographer", isActive: true })).toBe(true);
    expect(isActiveStaffRecord({ role: "admin", isActive: false })).toBe(false);
    expect(isActiveStaffRecord({ role: "admin" })).toBe(true);
    expect(isActiveStaffRecord({ role: "guest", isActive: true })).toBe(false);
  });

  it("sends photographers and editors to their own home", () => {
    expect(staffHomePath("photographer")).toBe("/admin/photographer");
    expect(staffHomePath("editor")).toBe("/admin/editor");
    expect(staffHomePath("coordinator")).toBe("/admin/dashboard");
  });
});

describe("staff login session", () => {
  it("does not reject a signed-in user while profiles are still loading", () => {
    const signedIn = reduceAuthSession(INITIAL_AUTH_SESSION, { type: "signed-in", userId: "staff-1" });
    expect(signedIn.loading).toBe(true);
    expect(signedIn.userType).toBeNull();
    expect(
      staffLoginAction({
        loading: signedIn.loading,
        hasUser: signedIn.userId != null,
        isStaff: signedIn.userType === "staff",
      }),
    ).toEqual({ type: "pending" });
  });

  it("redirects an active staff profile after it resolves", () => {
    const signedIn = reduceAuthSession({ userId: null, userType: null, loading: false }, {
      type: "signed-in",
      userId: "staff-1",
    });
    const admin = sessionFromProfiles({ staff: { role: "admin", isActive: true }, hasClient: false });
    const resolved = reduceAuthSession(signedIn, {
      type: "profiles-resolved",
      userId: "staff-1",
      userType: admin.userType,
      role: admin.role,
    });
    expect(resolved.loading).toBe(false);
    expect(
      staffLoginAction({
        loading: resolved.loading,
        hasUser: true,
        isStaff: resolved.userType === "staff",
        role: resolved.role,
      }),
    ).toEqual({ type: "redirect", path: "/admin/dashboard" });

    const photographer = sessionFromProfiles({ staff: { role: "photographer", isActive: true }, hasClient: false });
    expect(staffHomePath(photographer.role)).toBe("/admin/photographer");
    const editor = sessionFromProfiles({ staff: { role: "editor" }, hasClient: false });
    expect(staffHomePath(editor.role)).toBe("/admin/editor");
  });

  it("rejects non-staff only after profile resolution", () => {
    const signedIn = reduceAuthSession({ userId: null, userType: null, loading: false }, {
      type: "signed-in",
      userId: "client-1",
    });
    const missing = sessionFromProfiles({ staff: null, hasClient: false });
    const resolved = reduceAuthSession(signedIn, {
      type: "profiles-resolved",
      userId: "client-1",
      userType: missing.userType,
    });
    expect(
      staffLoginAction({
        loading: resolved.loading,
        hasUser: true,
        isStaff: resolved.userType === "staff",
      }),
    ).toEqual({ type: "not-staff" });

    const inactive = sessionFromProfiles({
      staff: { role: "admin", isActive: false },
      hasClient: true,
    });
    expect(inactive.userType).toBe("client");
  });

  it("drops a profile result that finishes after sign-out or a newer user", () => {
    const signedIn = reduceAuthSession(INITIAL_AUTH_SESSION, { type: "signed-in", userId: "staff-1" });
    const signedOut = reduceAuthSession(signedIn, { type: "signed-out" });
    expect(
      reduceAuthSession(signedOut, {
        type: "profiles-resolved",
        userId: "staff-1",
        userType: "staff",
        role: "admin",
      }),
    ).toBe(signedOut);

    const switched = reduceAuthSession(signedIn, { type: "signed-in", userId: "staff-2" });
    expect(
      reduceAuthSession(switched, {
        type: "profiles-resolved",
        userId: "staff-1",
        userType: "staff",
        role: "admin",
      }),
    ).toBe(switched);
    expect(switched.loading).toBe(true);
  });
});

describe("invoice download gate", () => {
  it("keeps missing and unpaid invoices locked", () => {
    expect(invoiceAllowsDownload(null)).toBe(false);
    expect(invoiceAllowsDownload({ status: "sent", total: 250, amountPaid: 0, amountDue: 250 })).toBe(false);
    expect(invoiceAllowsDownload({ status: "sent", total: 250, amountPaid: 0 })).toBe(false);
    expect(invoiceAllowsDownload({ status: "sent", total: 250, amountPaid: 0, amountDue: 0 })).toBe(false);
    expect(invoiceAllowsDownload({ status: "partial", total: 250, amountPaid: 100, amountDue: 150 })).toBe(false);
  });

  it("unlocks paid, comped, and zero-dollar invoices", () => {
    expect(invoiceAllowsDownload({ status: "paid", total: 250, amountPaid: 250, amountDue: 0 })).toBe(true);
    expect(invoiceAllowsDownload({ status: "paid", total: 250, amountDue: 250 })).toBe(true);
    expect(invoiceAllowsDownload({ status: "sent", total: 0, amountPaid: 0, amountDue: 0 })).toBe(true);
    expect(invoiceAllowsDownload({ status: "void", total: 0, amountDue: 0 })).toBe(false);
  });

  it("charges the real balance when amountDue was left at 0", () => {
    expect(amountStillDue({ status: "sent", total: 180, amountPaid: 0, amountDue: 0 })).toBe(180);
    expect(amountStillDue({ status: "paid", total: 180, amountPaid: 180, amountDue: 0 })).toBe(0);
  });

  it("embeds and reads the invoice id on Square notes", () => {
    const note = squarePaymentNote("inv_123", "1042");
    expect(invoiceIdFromSquareNote(note)).toBe("inv_123");
    expect(invoiceIdFromSquareNote("no id here")).toBeNull();
  });

  it("strips delivery URLs until payment is recorded", () => {
    const item = { id: "1", type: "photo", url: "https://files.example/photo.jpg", fileName: "photo.jpg" };
    expect(publicMediaItem(item, false).url).toBeNull();
    expect(publicMediaItem(item, true).url).toBe("https://files.example/photo.jpg");
    const tour = { id: "2", type: "tour", shareUrl: "https://my.matterport.com/show/?m=abc", title: "Tour" };
    expect(publicMediaItem(tour, false).shareUrl).toBeNull();
    expect(publicMediaItem(tour, true).shareUrl).toContain("matterport");
  });
});
