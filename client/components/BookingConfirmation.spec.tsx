import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BookingConfirmation } from "./BookingConfirmation";

const INTERNAL_NOTE = "password-setup email stays off until client notifications are live";

function visibleText(html: string) {
  return html.replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
}

describe("booking confirmation screen", () => {
  it("shows the order number and hides the email promise and the internal note", () => {
    const html = renderToStaticMarkup(
      <BookingConfirmation
        result={{
          requestId: "6y4F0RVWBQw5z5IJxbWe",
          orderNumber: "ORD - L - 00534",
          accountCreated: true,
          clientNotificationsLive: false,
          notifications: { appointmentEmail: "sent", sms: "failed", passwordSetup: "gated" },
        }}
        onBookAnother={() => undefined}
      />,
    );
    const text = visibleText(html);
    expect(text).toContain("YOU'RE IN");
    expect(text).toContain("Order number");
    expect(text).toContain("ORD - L - 00534");
    expect(text).toContain("Save your order number. We'll reach out to confirm your shoot time.");
    expect(text).not.toMatch(/confirmation email/i);
    expect(text).not.toContain(INTERNAL_NOTE);
    expect(text).not.toContain("password-setup");
    expect(text).not.toContain("client notifications are live");
    expect(html).toContain('data-order-number=""');
    expect(html).toContain("break-all");
    expect(html).toContain("flex-col");
  });

  it("promises the confirmation email only when client notifications are live", () => {
    const html = renderToStaticMarkup(
      <BookingConfirmation
        result={{
          orderNumber: "ORD - B - 22017",
          accountCreated: true,
          clientNotificationsLive: true,
          notifications: { appointmentEmail: "sent", sms: "sent", passwordSetup: "sent" },
        }}
        onBookAnother={() => undefined}
      />,
    );
    expect(html).toContain("ORD - B - 22017");
    expect(html).toContain("A confirmation email is on its way.");
    expect(html).toContain("A separate email has the link to set your portal password.");
    expect(html).not.toContain("password-setup");
    expect(html).not.toContain(INTERNAL_NOTE);
  });
});
