import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { BUSINESS_CONTACT_LINE } from "@shared/businessContact";
import { sampleDeliveryDraft, sampleDeliveryPresentation } from "@shared/clientDelivery";
import { SendToClientButton, SendToClientModal } from "./SendToClientModal";
import { ClientDeliveryView } from "@/pages/ClientDelivery";

const ENV = { PUBLIC_SITE_URL: "https://links.example" };

describe("send to client modal", () => {
  it("shows the button and a prefilled preview", () => {
    const button = renderToString(<SendToClientButton onClick={() => undefined} />);
    expect(button).toContain("Send to Client");
    expect(button).toContain('data-testid="send-to-client"');
    const html = renderToString(
      <SendToClientModal open draft={sampleDeliveryDraft(ENV)} onClose={() => undefined} onSend={async () => ({ note: "" })} />,
    );
    expect(html).toContain("Safe preview");
    expect(html).toContain("jordan.hale@example.com");
    expect(html).toContain("Your gallery is ready: 1842 Live Oak Lane, Spring, TX 77380");
    expect(html).toContain("https://links.example/deliver/preview");
    expect(html).toContain("INV-1042");
    expect(html).toContain("Unpaid");
    expect(html).toContain(BUSINESS_CONTACT_LINE);
    expect(html.toLowerCase()).not.toContain("cadi@");
    expect(html).toContain("Preview send (no email)");
    expect(html).toContain("Test send to QA");
    expect(html).not.toContain("/l/");
  });
});

describe("client delivery page", () => {
  it("shows a watermarked unpaid delivery with the invoice pay button", () => {
    const page = sampleDeliveryPresentation("preview");
    if (!page) throw new Error("missing sample");
    const html = renderToString(<ClientDeliveryView presentation={page} />);
    expect(html).toContain('data-paid="false"');
    expect(html).toContain("1842 Live Oak Lane, Spring, TX 77380");
    expect(html).toContain("#1042");
    expect(html).toContain("order-number");
    expect(html).not.toContain("text-5xl");
    expect(html).not.toContain("text-6xl");
    expect(html).toContain("Pay invoice to unlock watermark-free downloads");
    expect(html).toContain('data-watermarked="true"');
    expect(html).toContain("Pay Now");
    expect(html).toContain("INV-1042");
    expect(html).toContain(BUSINESS_CONTACT_LINE);
    expect(html).not.toContain("variant=print");
    expect(html).not.toContain("High-Res (Print)");
  });

  it("shows paid downloads without a watermark", () => {
    const page = sampleDeliveryPresentation("preview-paid");
    if (!page) throw new Error("missing sample");
    const html = renderToString(<ClientDeliveryView presentation={page} />);
    expect(html).toContain('data-paid="true"');
    expect(html).toContain('data-watermarked="false"');
    expect(html).toContain("High-Res (Print)");
    expect(html).toContain("Web / MLS");
    expect(html).toContain("Download all · High-Res (Print)");
    expect(html).toContain("Download all · Web / MLS");
    expect(html).toContain("Paid at booking");
    expect(html).not.toContain("Pay invoice to unlock");
  });
});
