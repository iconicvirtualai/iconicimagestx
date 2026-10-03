export interface BookingSubmitResult {
  accountCreated?: boolean;
  notifications?: {
    appointmentEmail?: string;
    sms?: string;
    passwordSetup?: string;
    accountAttached?: boolean;
    accountSkipReason?: string | null;
  } | null;
}

export function bookingFollowUp(result: BookingSubmitResult) {
  const notes = ["We saved your appointment request."];
  const emailStatus = result.notifications?.appointmentEmail;
  if (emailStatus === "sent") notes.push("A confirmation email is on its way.");
  else notes.push("If the confirmation email does not arrive in a few minutes, call 281-356-0965.");
  if (result.notifications?.sms === "sent") {
    notes.push("A text confirmation was sent to the phone number on this form.");
  }
  if (result.accountCreated && result.notifications?.passwordSetup === "sent") {
    notes.push("A separate email has the link to set your portal password.");
  } else if (result.accountCreated && result.notifications?.passwordSetup === "gated") {
    notes.push("Your portal login was created. The password-setup email stays off until client notifications are live.");
  } else if (result.accountCreated) {
    notes.push("Your portal account was created. The password-setup email could not be sent.");
  } else if (result.notifications?.accountAttached) {
    notes.push("This request is on the portal account for this email.");
  }
  return notes.join(" ");
}
