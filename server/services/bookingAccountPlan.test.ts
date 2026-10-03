import { describe, expect, it } from "vitest";
import { planBookingAccount } from "./bookingAccountPlan";

describe("planBookingAccount", () => {
  it("creates a portal login and a password-setup email for a new client", () => {
    expect(planBookingAccount({ staffMatch: false, authUid: null })).toEqual({
      createAuthUser: true,
      sendPasswordSetup: true,
      attachToUid: null,
      skipReason: null,
    });
  });

  it("attaches an existing Auth user without another password email", () => {
    expect(planBookingAccount({ staffMatch: false, authUid: "uid-1" })).toEqual({
      createAuthUser: false,
      sendPasswordSetup: false,
      attachToUid: "uid-1",
      skipReason: null,
    });
  });

  it("does not turn a staff login into a client or send a password reset", () => {
    expect(planBookingAccount({ staffMatch: true, authUid: "staff-1" })).toEqual({
      createAuthUser: false,
      sendPasswordSetup: false,
      attachToUid: null,
      skipReason: "staff_email",
    });
  });
});
