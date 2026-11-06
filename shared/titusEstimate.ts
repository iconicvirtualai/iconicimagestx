/**
 * Public Pay at Close estimate, via Titus’s browser SDK.
 * Docs: https://docs.gotitus.com/guide/developer-resources/browser-sdk
 * and https://docs.gotitus.com/guide/integrate-as-a-business/2-add-browser-sdk
 *
 * showEstimateModal({ businessId, amount }) is the only estimate. Do not
 * calculate rates, terms, or fees on the page. Titus’s modal is live.
 *
 * The business id is public (it is sent from the browser). Override it with
 * VITE_TITUS_BUSINESS_ID so it can change without a code edit.
 * PAY_AT_CLOSE_API_KEY stays server-only and is not this value.
 */

/** https://docs.gotitus.com/guide/integrate-as-a-business/2-add-browser-sdk */
export const TITUS_BROWSER_SDK_URL = "https://assets.gotitus.com/sdk/v1/titus.js";

/** Iconic Images on Titus. Nick Narodny, November 2026. */
export const TITUS_PAY_AT_CLOSE_BUSINESS_ID = "550ccb3e-4384-4441-90f1-20456bce82e6";

/** Required under the packages on /pay-at-close. Do not paraphrase. */
export const PAY_AT_CLOSE_PACKAGES_FOOTNOTE = "$0 due until closing with financing arranged by Titus.";

/** Official prompt pill. Opens the same estimate modal. */
export const TITUS_PAY_AT_CLOSE_PILL_SRC = "/media/pay-at-close/titus-pay-at-close-pill.svg";

export function titusPayAtCloseBusinessId(override?: string | null): string {
  const trimmed = String(override ?? "").trim();
  return trimmed || TITUS_PAY_AT_CLOSE_BUSINESS_ID;
}
