/**
 * The public contact line inside client email HTML.
 * Visible text is BUSINESS_CONTACT.line. Phone and email are direct tel: and mailto: links.
 */

import { BUSINESS_CONTACT } from "./businessContact.ts";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Address | phone | email. Phone and email use tel: and mailto: only. */
export function clientEmailContactLineHtml(color = "#666666"): string {
  const style = `color:${color};text-decoration:underline;`;
  return [
    escapeHtml(BUSINESS_CONTACT.address),
    `<a href="${BUSINESS_CONTACT.phoneHref}" style="${style}">${escapeHtml(BUSINESS_CONTACT.phoneDisplay)}</a>`,
    `<a href="${BUSINESS_CONTACT.emailHref}" style="${style}">${escapeHtml(BUSINESS_CONTACT.email)}</a>`,
  ].join(" | ");
}
