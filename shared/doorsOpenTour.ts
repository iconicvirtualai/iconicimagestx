/**
 * Doors Open Tour introduction. Owner copy stays exact.
 * The public site link is https://doorsopentour.com with no query and no redirect.
 */

export const DOORS_OPEN_TOUR_URL = "https://doorsopentour.com";

export const DOT_BOOKING_CHECKBOX_LABEL =
  "Do you want your Open House listed on DoorsOpenTour.com by Iconic?";

export const DOT_DELIVERY_LINE =
  "Check out our new interactive Open House Tour by zone - As an Iconic Client, you receive an automatic upgrade on DoorsOpenTour.com when it's your time to shine!";

export const DOT_RECEIPT_LINE =
  "Payment received - Thanks for that! Let us know if you want your Open House listed on DoorsOpenTour.com and we'll upgrade your door for free!";

export const DOT_OPT_IN_ACTION_LABEL = "Yes, list my open house";

const DOORS_OPEN_TOUR_NAME = "DoorsOpenTour.com";

/** Persist only an explicit boolean. Missing or other values stay off. */
export function dotOptInSelected(value: unknown): boolean {
  return value === true;
}

/** Tokenized one-click path. The token is the only query. */
export function dotOptInPath(token: string): string {
  const params = new URLSearchParams();
  params.set("t", token);
  return `/api/orders/dot-opt-in?${params.toString()}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Wrap the one DoorsOpenTour.com mention in a direct link. */
export function linkDoorsOpenTour(sentence: string): string {
  const at = sentence.indexOf(DOORS_OPEN_TOUR_NAME);
  if (at < 0) return escapeHtml(sentence);
  return (
    escapeHtml(sentence.slice(0, at))
    + `<a href="${DOORS_OPEN_TOUR_URL}" rel="noreferrer" style="color:#111111;font-weight:600;">${DOORS_OPEN_TOUR_NAME}</a>`
    + escapeHtml(sentence.slice(at + DOORS_OPEN_TOUR_NAME.length))
  );
}

const noteStyle =
  "font-family:Inter,ui-sans-serif,system-ui,sans-serif;font-size:15px;line-height:1.5;color:#333333;margin:16px 0;";

export function doorsOpenDeliveryEmailHtml(): string {
  return `<p style="${noteStyle}">${linkDoorsOpenTour(DOT_DELIVERY_LINE)}</p>`;
}

export function doorsOpenReceiptEmailHtml(optInUrl: string): string {
  const sentence = `<p style="${noteStyle}">${linkDoorsOpenTour(DOT_RECEIPT_LINE)}</p>`;
  const url = optInUrl.trim();
  if (!url.startsWith("https://") || url.includes(" ")) return sentence;
  return (
    sentence
    + `<p style="margin:16px 0;"><a href="${escapeHtml(url)}" style="font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#000000;color:#ffffff;padding:12px 24px;text-decoration:none;display:inline-block;border-radius:4px;">${DOT_OPT_IN_ACTION_LABEL}</a></p>`
  );
}

export function dotOptInResultHtml(ok: boolean | "wait"): string {
  const title = ok === true
    ? "Your open house is listed."
    : ok === "wait"
      ? "Please try that link again in a moment."
      : "This link is not valid.";
  const body = ok === true
    ? `We'll upgrade your door on <a href="${DOORS_OPEN_TOUR_URL}" rel="noreferrer" style="color:#171717;font-weight:600;">${DOORS_OPEN_TOUR_NAME}</a>.`
    : ok === "wait"
      ? "Your open house listing was not changed."
      : "Reply to your Iconic email and we'll list your Open House.";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>Doors Open Tour</title>
</head>
<body style="margin:0;background:#ffffff;color:#171717;font-family:Inter,ui-sans-serif,system-ui,sans-serif;">
  <main style="box-sizing:border-box;max-width:32rem;margin:0 auto;padding:2.5rem 1.25rem;">
    <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#737373;">Iconic Images</p>
    <h1 style="margin:0.75rem 0 0;font-size:1.5rem;line-height:1.25;font-weight:700;">${title}</h1>
    <p style="margin:1rem 0 0;font-size:1rem;line-height:1.5;">${body}</p>
  </main>
</body>
</html>`;
}
