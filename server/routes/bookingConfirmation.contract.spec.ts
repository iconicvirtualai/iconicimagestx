import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const bookings = readFileSync(new URL("./bookings.ts", import.meta.url), "utf8");
const email = readFileSync(new URL("../services/email.ts", import.meta.url), "utf8");

function sendBlocks(source: string, template: string): string[] {
  const pattern = new RegExp(
    `await sendEmail\\(\\{[\\s\\S]*?template:\\s*"${template}"[\\s\\S]*?\\}\\)`,
    "g",
  );
  return source.match(pattern) ?? [];
}

describe("live order confirmation emails", () => {
  it("still sends booking_received to the client and the office", () => {
    const blocks = sendBlocks(bookings, "booking_received");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toContain("to: email");
    expect(blocks[1]).toContain('to: "photos@iconicimagestx.com"');
    for (const block of blocks) {
      expect(block).toContain("clientName");
      expect(block).toContain("address: displayAddress");
      expect(block).toContain("total: money(total)");
      expect(block).toContain("requestId: docRef.id");
      expect(block).toContain("dashboardUrl:");
    }
  });

  it("still sends order_confirmed to the client on booking confirm", () => {
    const blocks = sendBlocks(bookings, "order_confirmed");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain("to: requestEmail");
    expect(blocks[0]).toContain("clientName: requestClientName");
    expect(blocks[0]).toContain("address: requestAddressLabel");
    expect(blocks[0]).toContain("orderId: orderRef.id");
    expect(blocks[0]).toContain("portalUrl:");
  });

  it("still resolves those categories through the shared email sender", () => {
    expect(email).toContain('.where("category", "==", template)');
    expect(email).toContain('.where("isActive", "==", true)');
    expect(email).toContain("getFallbackTemplate(template, variables)");
    expect(email).toContain("await transporter.sendMail");
    expect(email).toContain("from: `\"Iconic Images\" <${process.env.EMAIL_FROM || process.env.SMTP_USER}>`");
  });
});
