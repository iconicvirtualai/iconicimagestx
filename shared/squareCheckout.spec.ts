import { describe, expect, it } from "vitest";
import { BUSINESS_CONTACT } from "./businessContact";
import {
  readSquareErrors,
  scrubSquareLogText,
  SQUARE_DEPOSIT_CHECKOUT_FAILURE,
  squareBuyerAddress,
  squareBuyerPhone,
  squarePaymentLinkIdempotencyKey,
  squarePrefillRejected,
} from "./squareCheckout";
import { squareBuyerPrefill } from "./clientHubSettings";

describe("square buyer phone", () => {
  it("normalizes the QA phone 281.356.0965 to E.164", () => {
    expect(squareBuyerPhone("281.356.0965")).toBe("+12813560965");
    expect(squareBuyerPhone("(281) 356-0965")).toBe("+12813560965");
    expect(squareBuyerPhone("2813560965")).toBe("+12813560965");
    expect(squareBuyerPhone("+1 281 356 0965")).toBe("+12813560965");
    expect(squareBuyerPhone("+12813560965")).toBe("+12813560965");
  });

  it("omits a phone that cannot be E.164", () => {
    expect(squareBuyerPhone("12345")).toBe("");
    expect(squareBuyerPhone("not a phone")).toBe("");
    expect(squareBuyerPhone("")).toBe("");
    expect(squareBuyerPhone("555")).toBe("");
    expect(squareBuyerPhone("+123")).toBe("");
  });

  it("keeps an international number that already starts with +", () => {
    expect(squareBuyerPhone("+44 20 7946 0958")).toBe("+442079460958");
  });
});

describe("square buyer address", () => {
  it("splits a full US address instead of jamming it into address_line_1", () => {
    expect(
      squareBuyerAddress("100 Example Street, Suite 200, Spring, TX 77373"),
    ).toEqual({
      address_line_1: "100 Example Street, Suite 200",
      locality: "Spring",
      administrative_district_level_1: "TX",
      postal_code: "77373",
      country: "US",
    });
    expect(squareBuyerAddress("1 Main, Austin, TX, 78701")).toEqual({
      address_line_1: "1 Main",
      locality: "Austin",
      administrative_district_level_1: "TX",
      postal_code: "78701",
      country: "US",
    });
  });

  it("sends a street-only line and omits an address that cannot be valid", () => {
    expect(squareBuyerAddress("9 Navy Way")).toEqual({
      address_line_1: "9 Navy Way",
      country: "US",
    });
    expect(squareBuyerAddress("not, a, valid, address")).toBeNull();
    expect(squareBuyerAddress("100 Main Street Spring TX 77373")).toBeNull();
    expect(squareBuyerAddress("100 Main Street 😀")).toBeNull();
    expect(squareBuyerAddress("")).toBeNull();
  });
});

describe("square buyer prefill", () => {
  it("uses E.164 for the senior-living phone and omits a non-billing address", () => {
    expect(
      squareBuyerPrefill({
        clientEmail: "ada@community.example",
        clientPhone: "281.356.0965",
        address: "100 Oak Street, Spring, TX 77380",
        depositAmount: 128.5,
      }),
    ).toEqual({
      buyer_email: "ada@community.example",
      buyer_phone_number: "+12813560965",
    });
  });

  it("drops an invalid phone and an unparseable bill-to address", () => {
    expect(
      squareBuyerPrefill({
        clientEmail: "ada@community.example",
        clientPhone: "12345",
        billToAddress: "not, a, valid, address",
      }),
    ).toEqual({
      buyer_email: "ada@community.example",
    });
  });
});

describe("square payment link idempotency", () => {
  it("changes the key when the attempt or amount changes", () => {
    const first = squarePaymentLinkIdempotencyKey({
      invoiceId: "inv-sl",
      purpose: "deposit",
      amountCents: 12850,
      attempt: 0,
    });
    const retry = squarePaymentLinkIdempotencyKey({
      invoiceId: "inv-sl",
      purpose: "deposit",
      amountCents: 12850,
      attempt: 1,
    });
    const otherAmount = squarePaymentLinkIdempotencyKey({
      invoiceId: "inv-sl",
      purpose: "deposit",
      amountCents: 12851,
      attempt: 0,
    });
    expect(first).not.toBe(retry);
    expect(first).not.toBe(otherAmount);
    expect(first).not.toBe("inv-sl-deposit");
    expect(first).toBe(
      squarePaymentLinkIdempotencyKey({
        invoiceId: "inv-sl",
        purpose: "deposit",
        amountCents: 12850,
        attempt: 0,
      }),
    );
    expect(first.length).toBeLessThanOrEqual(192);
    expect(retry).toContain("-a1-");
    expect(first).toContain("-12850-a0-");
  });
});

describe("square error logs", () => {
  it("keeps code, category, field, and detail and drops phone, email, and tokens", () => {
    const errors = readSquareErrors({
      errors: [
        {
          category: "INVALID_REQUEST_ERROR",
          code: "INVALID_PHONE_NUMBER",
          detail:
            "Invalid phone number 281.356.0965 for ada@example.com bearer sq-test-token",
          field: "pre_populated_data.buyer_phone_number",
        },
      ],
    });
    expect(errors).toEqual([
      {
        category: "INVALID_REQUEST_ERROR",
        code: "INVALID_PHONE_NUMBER",
        field: "pre_populated_data.buyer_phone_number",
        detail: "Invalid phone number [phone] for [email] Bearer [redacted]",
      },
    ]);
    expect(JSON.stringify(errors)).not.toContain("281.356.0965");
    expect(JSON.stringify(errors)).not.toContain("ada@example.com");
    expect(JSON.stringify(errors)).not.toContain("sq-test-token");
    expect(squarePrefillRejected({ errors })).toBe(true);
    expect(
      squarePrefillRejected({
        errors: [
          {
            category: "INVALID_REQUEST_ERROR",
            code: "INVALID_VALUE",
            detail: "The value is invalid.",
            field: "quick_pay.price_money.amount",
          },
        ],
      }),
    ).toBe(false);
    expect(squarePrefillRejected({})).toBe(false);
    expect(scrubSquareLogText("The provided phone number is invalid.")).toBe(
      "The provided phone number is invalid.",
    );
  });

  it("tells the buyer to call the office without a stack", () => {
    expect(SQUARE_DEPOSIT_CHECKOUT_FAILURE).toContain(
      BUSINESS_CONTACT.phoneDisplay,
    );
    expect(SQUARE_DEPOSIT_CHECKOUT_FAILURE).not.toMatch(
      /stack|INVALID_PHONE_NUMBER/,
    );
  });
});
