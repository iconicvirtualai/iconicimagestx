import { isOwnerEmail } from "../ownerAccess.ts";

/** Grok and OpenAI panes are limited to an owner login or an admin role. */
export function canUseAssistants(input: {
  role?: string | null;
  email?: string | null;
  ownerEmails: readonly string[];
}): boolean {
  if (input.role === "admin") return true;
  return isOwnerEmail(input.email, input.ownerEmails);
}
