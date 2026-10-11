/**
 * Links a client opens from a receipt.
 * The listing presentation URL is Rex's clientPresentationLinkFor from #134,
 * which is not on this branch. Do not import it.
 */

export interface ReceiptListingRef {
  id?: unknown;
}

/**
 * Presentation button on the payment receipt.
 * Returns null until #134 is merged. While null, the receipt omits that
 * button and uses /gallery/:id as the primary button.
 *
 * TODO(#134): one-line swap after clientPresentationLinkFor lands:
 *   return clientPresentationLinkFor(listing);
 */
export function presentationLinkForReceipt(listing: ReceiptListingRef | null | undefined): string | null {
  void listing;
  return null;
}
