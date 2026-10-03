/**
 * Decides whether a public booking should create a portal login.
 * Existing Auth users are attached. Brand-new emails get a login plus a
 * separate password-setup email. Staff emails are left alone.
 */

export interface BookingAccountPlan {
  createAuthUser: boolean;
  sendPasswordSetup: boolean;
  attachToUid: string | null;
  skipReason: "staff_email" | null;
}

export function planBookingAccount(input: {
  staffMatch: boolean;
  authUid: string | null;
}): BookingAccountPlan {
  if (input.staffMatch) {
    return {
      createAuthUser: false,
      sendPasswordSetup: false,
      attachToUid: null,
      skipReason: "staff_email",
    };
  }

  if (input.authUid) {
    return {
      createAuthUser: false,
      sendPasswordSetup: false,
      attachToUid: input.authUid,
      skipReason: null,
    };
  }

  return {
    createAuthUser: true,
    sendPasswordSetup: true,
    attachToUid: null,
    skipReason: null,
  };
}
