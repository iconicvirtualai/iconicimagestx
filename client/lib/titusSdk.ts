/**
 * Loads Titus’s browser SDK and opens the estimate modal.
 * The modal is an iframe, not a popup: https://docs.gotitus.com/guide/developer-resources/browser-sdk
 */

import {
  TITUS_BROWSER_SDK_URL,
  titusPayAtCloseBusinessId,
} from "@shared/titusEstimate";

export interface TitusEstimateModalOptions {
  businessId?: string;
  businessShortCode?: string;
  platformId?: string;
  externalId?: string;
  /** Order total in dollars. Omit for a rate-only estimate. */
  amount?: number;
}

type TitusBrowser = {
  showEstimateModal: (options?: TitusEstimateModalOptions) => void;
};

function titusGlobal(): TitusBrowser | undefined {
  if (typeof window === "undefined") return undefined;
  const sdk = (window as Window & { titus?: TitusBrowser }).titus;
  return sdk && typeof sdk.showEstimateModal === "function" ? sdk : undefined;
}

let loading: Promise<void> | null = null;

export function loadTitusBrowserSdk(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  if (titusGlobal()) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    let script = document.querySelector("script[data-titus-sdk='1']") as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.src = TITUS_BROWSER_SDK_URL;
      script.async = true;
      script.dataset.titusSdk = "1";
      document.head.appendChild(script);
    }
    const finish = () => {
      if (titusGlobal()) resolve();
      else {
        loading = null;
        reject(new Error("Titus estimate could not be loaded."));
      }
    };
    if (titusGlobal()) {
      finish();
      return;
    }
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", () => {
      loading = null;
      reject(new Error("Titus estimate could not be loaded."));
    }, { once: true });
  });
  return loading;
}

/** Opens Titus’s live estimate. Pass the catalog total when a package price is known. */
export async function openTitusEstimateModal(amount?: number | null): Promise<void> {
  await loadTitusBrowserSdk();
  const sdk = titusGlobal();
  if (!sdk) throw new Error("Titus estimate could not be loaded.");
  const dollars = Number(amount);
  const options: TitusEstimateModalOptions = {
    businessId: titusPayAtCloseBusinessId(import.meta.env.VITE_TITUS_BUSINESS_ID),
  };
  if (Number.isFinite(dollars) && dollars > 0) {
    options.amount = Math.round(dollars * 100) / 100;
  }
  sdk.showEstimateModal(options);
}
