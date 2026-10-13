/**
 * @vitest-environment happy-dom
 */
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DOT_BOOKING_CHECKBOX_LABEL,
  DOT_DELIVERY_LINE,
  DOT_OPT_IN_ACTION_LABEL,
  DOT_RECEIPT_LINE,
} from "@shared/doorsOpenTour";
import {
  DoorsOpenDeliveryNote,
  DoorsOpenReceiptNote,
  DoorsOpenTourCheckbox,
  DotOptInBadge,
} from "./DoorsOpenTour";

function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&");
}

describe("Doors Open Tour surfaces", () => {
  it("renders an unchecked booking checkbox with the exact label", () => {
    const html = renderToString(
      <DoorsOpenTourCheckbox checked={false} onChange={() => undefined} />,
    );
    expect(html).toContain('data-testid="dot-opt-in"');
    expect(html).toContain('type="checkbox"');
    expect(html).not.toContain("checked");
    expect(html).not.toContain("required");
    expect(text(html)).toContain(DOT_BOOKING_CHECKBOX_LABEL);
    expect(html).toContain('href="https://doorsopentour.com"');
    expect(html).toContain("font-sans");
  });

  it("renders the delivery line and the receipt yes link", () => {
    const delivery = renderToString(<DoorsOpenDeliveryNote />);
    expect(text(delivery)).toContain(DOT_DELIVERY_LINE);
    expect(delivery).toContain('href="https://doorsopentour.com"');
    expect(delivery).toContain('data-testid="doors-open-delivery"');

    const yes = "https://iconicimagestx.vercel.app/api/orders/dot-opt-in?t=tok";
    const receipt = renderToString(<DoorsOpenReceiptNote optInUrl={yes} />);
    expect(text(receipt)).toContain(DOT_RECEIPT_LINE);
    expect(receipt).toContain(`href="${yes}"`);
    expect(text(receipt)).toContain(DOT_OPT_IN_ACTION_LABEL);
    expect(receipt).toContain("min-h-11");
    expect(receipt).toContain("w-full");

    const bare = renderToString(<DoorsOpenReceiptNote />);
    expect(text(bare)).toContain(DOT_RECEIPT_LINE);
    expect(bare).not.toContain(DOT_OPT_IN_ACTION_LABEL);
  });

  it("shows a small badge for either stored boolean", () => {
    const yes = renderToString(<DotOptInBadge value={true} />);
    const no = renderToString(<DotOptInBadge value={false} />);
    const missing = renderToString(<DotOptInBadge value={undefined} />);
    expect(yes).toContain('data-dot-opt-in="true"');
    expect(text(yes)).toContain("Doors Open Tour");
    expect(no).toContain('data-dot-opt-in="false"');
    expect(text(no)).toContain("DOT not listed");
    expect(missing).toBe("");
  });
});
