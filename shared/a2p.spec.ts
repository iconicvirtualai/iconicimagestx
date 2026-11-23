import { describe, expect, it } from "vitest";
import {
  MARKETING_SMS_CONSENT_TEXT,
  MARKETING_SMS_NO_SHARE_TEXT,
  SMS_HELP_REPLY,
  TRANSACTIONAL_SMS_CONSENT_TEXT,
  explicitMarketingSmsOptIn,
  hasTransactionalSmsConsent,
  phoneDigits10,
  transactionalSmsBlockReason,
} from "./a2p";
import { bookConsentCrawlHtml, privacyCrawlHtml, smsOptInCrawlHtml, termsCrawlHtml } from "./a2pPages";
import { LEGAL_LAST_UPDATED } from "./a2p";

describe("A2P crawlable pages", () => {
  it("prints the full privacy policy in the first HTML response", () => {
    const html = privacyCrawlHtml();
    expect(html).toContain("Privacy Policy");
    expect(html).toContain(`Last updated: ${LEGAL_LAST_UPDATED}`);
    expect(html).toContain("Message frequency varies");
    expect(html).toContain("Message and data rates may apply");
    expect(html).toContain("Reply <strong>STOP</strong>");
    expect(html).toContain("reply <strong>HELP</strong>");
    expect(html).toContain("Consent to receive text messages is not a condition of purchase");
    expect(html).toContain("does not share mobile phone numbers or messaging consent with third parties or affiliates for marketing");
    expect(html).toContain("No mobile information will be shared with third parties or affiliates for marketing");
    expect(html).toContain("1. Introduction");
    expect(html).toContain("12. Contact Us");
    expect(html).not.toContain('id="root"');
  });

  it("prints the full terms in the first HTML response", () => {
    const html = termsCrawlHtml();
    expect(html).toContain(`Last updated: ${LEGAL_LAST_UPDATED}`);
    expect(html).toContain("This page is published at /terms");
    expect(html).toContain("The Privacy Policy is published at /privacy");
    expect(html).toContain("Message frequency varies");
    expect(html).toContain("Message and data rates may apply");
    expect(html).toContain("Consent to texts is not required to purchase services");
    expect(html).toContain("7. SMS and Email Program");
    expect(html).toContain("13. Contact");
    expect(html).toContain('href="/privacy"');
  });

  it("prints an unchecked marketing opt-in form", () => {
    const html = smsOptInCrawlHtml();
    expect(html).toContain('name="name"');
    expect(html).toContain('name="phone"');
    expect(html).toContain('type="checkbox"');
    expect(html).not.toMatch(/<input[^>]*checkbox[^>]*\schecked/);
    expect(html).toContain(MARKETING_SMS_CONSENT_TEXT.split(" View our")[0]);
    expect(html).toContain('href="https://www.iconicimagestx.com/privacy"');
    expect(html).toContain('href="https://www.iconicimagestx.com/terms"');
    expect(html).toContain(MARKETING_SMS_NO_SHARE_TEXT);
    expect(html).toContain('action="/api/sms/marketing-opt-in"');
  });

  it("prints the booking consent checkbox unchecked", () => {
    const html = bookConsentCrawlHtml();
    expect(html).toContain('name="smsConsent"');
    expect(html).toContain('type="checkbox"');
    expect(html).not.toMatch(/<input[^>]*checkbox[^>]*\schecked/);
    expect(html).toContain("Message frequency varies");
    expect(html).toContain("Consent is not a condition of purchase");
    expect(html).toContain('href="https://www.iconicimagestx.com/privacy"');
    expect(html).toContain('href="https://www.iconicimagestx.com/terms"');
    expect(TRANSACTIONAL_SMS_CONSENT_TEXT).toContain("Reply STOP to opt out");
    expect(TRANSACTIONAL_SMS_CONSENT_TEXT).toContain("Reply HELP for help");
  });
});

describe("A2P consent gates", () => {
  it("requires an explicit marketing opt-in and a checked booking box", () => {
    expect(explicitMarketingSmsOptIn({})).toBe(false);
    expect(explicitMarketingSmsOptIn({ smsOptIn: false })).toBe(false);
    expect(explicitMarketingSmsOptIn({ smsOptIn: true })).toBe(true);
    expect(explicitMarketingSmsOptIn({ marketingSmsOptIn: true, smsStopped: true })).toBe(false);
    expect(explicitMarketingSmsOptIn({ marketingSmsOptIn: true, doNotContact: true })).toBe(false);
    expect(hasTransactionalSmsConsent({ smsConsent: false })).toBe(false);
    expect(hasTransactionalSmsConsent({})).toBe(false);
    expect(transactionalSmsBlockReason({ smsConsent: true, stopped: false })).toBeNull();
    expect(transactionalSmsBlockReason({ smsConsent: true, stopped: true })).toBe("sms_stopped");
    expect(phoneDigits10("+1 (281) 555-0100")).toBe("2815550100");
    expect(SMS_HELP_REPLY).toBe(
      "Iconic Images Photography, LLC. Help: photos@iconicimagestx.com or 281.356.0965. Msg & data rates may apply. Reply STOP to opt out.",
    );
  });
});
