import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const formSource = readFileSync(new URL("./BookingForm.tsx", import.meta.url), "utf8");
const consent = readFileSync(new URL("./SmsConsentField.tsx", import.meta.url), "utf8");

describe("booking consent", () => {
  it("does not require the SMS checkbox and starts marketing permission unchecked", () => {
    const submit = formSource.slice(
      formSource.indexOf("const handleBookNow"),
      formSource.indexOf("const selectedServiceData"),
    );
    expect(submit).not.toContain("smsConsent");
    expect(submit).not.toContain("Check the box to agree");
    expect(formSource).toContain("socialMarketingPermission: false");
    expect(formSource).not.toContain("socialMarketingPermission: true");
    expect(formSource).toContain("<SmsConsentField");
    expect(consent).not.toMatch(/\srequired(?:\s|=|>)/);
  });
});
