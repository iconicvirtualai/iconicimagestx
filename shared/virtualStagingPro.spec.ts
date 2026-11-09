import { describe, expect, it } from "vitest";
import { VIRTUAL_STAGING_UNIT_PRICE } from "./bookingCatalog";
import { classifyTestData } from "./testDataCleanup";
import {
  VIRTUAL_STAGING_PRO_UNIT_PRICE,
  parseVirtualStagingProOrder,
  quoteVirtualStagingPro,
  virtualStagingProQaFlags,
} from "./virtualStagingPro";

function order(extra: Record<string, unknown> = {}) {
  return {
    name: "Ada Lovelace",
    email: "ada@woodlandsrealty.com",
    phone: "281-555-0199",
    address: "100 Oak St, Spring, TX 77380",
    style: "Modern",
    instructions: "Dark wood in the living room.",
    photos: [{
      fileName: "living.jpg",
      contentType: "image/jpeg",
      roomType: "Living Room",
      byteSize: 240000,
    }],
    ...extra,
  };
}

describe("virtual staging pro pricing", () => {
  it("quotes the pro page rate and ignores a posted total", () => {
    const parsed = parseVirtualStagingProOrder(order({
      total: 1,
      unitPrice: 1,
      price: 999,
      photos: [{
        fileName: "living.jpg",
        contentType: "image/jpeg",
        roomType: "Living Room",
        byteSize: 240000,
        price: 1,
        unitPrice: 1,
      }],
    }));
    expect(parsed.ok).toBe(true);
    if (parsed.ok === false) return;
    expect(parsed.value).not.toHaveProperty("total");
    const quote = quoteVirtualStagingPro(parsed.value.photos.length);
    expect(VIRTUAL_STAGING_PRO_UNIT_PRICE).toBe(25);
    expect(VIRTUAL_STAGING_PRO_UNIT_PRICE).not.toBe(VIRTUAL_STAGING_UNIT_PRICE);
    expect(quote).toMatchObject({
      unitPrice: 25,
      qty: 1,
      total: 25,
      lineItems: [{ id: "virtual-staging-pro", qty: 1, unitPrice: 25, price: 25 }],
    });
  });

  it("flags a QA TEST order so cleanup can archive it", () => {
    const flags = virtualStagingProQaFlags({
      name: "QA TEST Dana",
      email: "dana@woodlandsrealty.com",
      notes: "",
    });
    expect(flags).toEqual({ qaOnly: true, playtest: true, testData: true });
    const report = classifyTestData([{
      collection: "orders",
      id: "order-qa",
      data: { orderNumber: "#441", clientName: "QA TEST Dana", ...flags },
    }]);
    expect(report.matched).toEqual([
      expect.objectContaining({ collection: "orders", id: "order-qa", archive: true }),
    ]);
    expect(report.borderline).toEqual([]);
    expect(virtualStagingProQaFlags({
      name: "Ada Lovelace",
      email: "ada@woodlandsrealty.com",
      notes: "Dark wood.",
    })).toEqual({});
  });
});
