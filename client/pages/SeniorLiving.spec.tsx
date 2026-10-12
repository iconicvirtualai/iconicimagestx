/**
 * @vitest-environment happy-dom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import path from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { seniorCheckoutNavigation } from "@/components/SeniorLivingOrder";
import SeniorLiving, { SENIOR_LIVING_CTA } from "./SeniorLiving";
import {
  publishedSeniorLivingPhotos,
  SENIOR_LIVING_FAMILY_PHOTO,
  SENIOR_LIVING_PHOTOS,
  SENIOR_LIVING_WIDTHS,
  SENIOR_LIVING_MATTERPORT_ALLOW,
  SENIOR_LIVING_MATTERPORT_SRC,
  SENIOR_LIVING_MATTERPORT_TITLE,
} from "@/content/seniorLiving";
import { BUSINESS_CONTACT, LEGAL_BUSINESS_NAME } from "@shared/businessContact";
import {
  SENIOR_FACILITY_RATE_PER_SQFT,
  SENIOR_LIVING_DEPOSIT_LINE,
  SENIOR_LIVING_DEPOSIT_LINE_ONLINE,
  SENIOR_LIVING_DEPOSIT_RECEIVED,
  SENIOR_LIVING_PAY_STEP,
  SENIOR_ROOM_RATES,
  SENIOR_TOUR_PRICE,
  SENIOR_TOUR_SQFT_CAP,
  SENIOR_LIVING_HOSTING_NOTE,
  SENIOR_LIVING_HOSTING_OPTIONS,
  formatSeniorFacilityRate,
  seniorFacilityExampleLine,
  seniorFacilityRateLine,
  formatUsd,
} from "@shared/seniorLiving";
import { TRAVEL_ZONES } from "@shared/travelZones";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const fetchMock = vi.fn();
let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function renderPage() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <MemoryRouter>
        <SeniorLiving />
      </MemoryRouter>,
    );
  });
}

function setValue(id: string, value: string) {
  const input = container?.querySelector<
    HTMLInputElement | HTMLTextAreaElement
  >(`#${id}`);
  if (!input) throw new Error(`Missing #${id}`);
  const prototype =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function callsTo(fragment: string) {
  return fetchMock.mock.calls.filter((call) => String(call[0]).includes(fragment));
}

async function click(testId: string) {
  await act(async () => {
    container?.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)?.click();
  });
}

async function fillOrder() {
  await act(async () => {
    container?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click();
    container?.querySelector<HTMLInputElement>('input[name="hosting"]')?.click();
  });
  await click("senior-next");
  await act(async () => {
    setValue("senior-community", "A Woodlands-area senior living community");
    setValue("senior-address", "100 Oak St, Spring, TX 77380");
    setValue("senior-name", "Ada Lovelace");
    setValue("senior-title", "Director");
    setValue("senior-phone", "281-555-0199");
    setValue("senior-email", "ada@community.example");
    setValue("senior-onsite", "Front desk");
  });
  await click("senior-next");
  await click("senior-next");
}

beforeEach(async () => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  document.body.innerHTML = "";
  await renderPage();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

describe("senior living page", () => {
  it("renders the route sections, Matterport tour, and business footer", () => {
    const html = container?.innerHTML || "";
    expect(html).toContain("Virtual tours for");
    expect(html).toContain("senior living");
    expect(html).toContain("Spring");
    expect(html).toContain("The Woodlands");
    expect(html).toContain("Houston");
    expect(html).toContain("Schedule");
    expect(html).toContain("Shoot");
    expect(html).toContain("Content Ready");
    expect(html).toContain(SENIOR_LIVING_DEPOSIT_LINE);
    expect(
      container?.querySelector('[data-testid="senior-deposit"]')?.textContent,
    ).toBe(SENIOR_LIVING_DEPOSIT_LINE);
    expect(
      container?.querySelector('[data-testid="senior-steps"]')?.textContent,
    ).toContain(SENIOR_LIVING_DEPOSIT_LINE);
    expect(
      container?.querySelector('[data-testid="senior-pricing"]')?.textContent,
    ).toContain(SENIOR_LIVING_DEPOSIT_LINE);
    expect(
      container?.querySelector('[data-testid="senior-summary"]')?.textContent,
    ).toContain(SENIOR_LIVING_DEPOSIT_LINE);
    expect(
      container
        ?.querySelector('[data-testid="senior-cta"]')
        ?.getAttribute("href"),
    ).toBe("#schedule");
    expect(
      container?.querySelector('[data-testid="senior-cta"]')?.textContent,
    ).toBe(SENIOR_LIVING_CTA);
    expect(SENIOR_LIVING_CTA).toBe(
      "Schedule when you're ready for us to come!",
    );
    expect(html).not.toContain("/book?service=");
    expect(html).not.toContain("/book?package=");

    const frame = container?.querySelector("iframe");
    expect(frame?.getAttribute("src")).toBe(SENIOR_LIVING_MATTERPORT_SRC);
    expect(SENIOR_LIVING_MATTERPORT_SRC).toBe(
      "https://my.matterport.com/show/?m=PNCyedKDjvi&play=1",
    );
    expect(frame?.getAttribute("allow")).toBe(SENIOR_LIVING_MATTERPORT_ALLOW);
    expect(SENIOR_LIVING_MATTERPORT_ALLOW).toBe(
      "fullscreen; xr-spatial-tracking",
    );
    expect(frame?.getAttribute("title")).toBe(SENIOR_LIVING_MATTERPORT_TITLE);
    expect(html.toLowerCase()).not.toContain(["sun", "dale"].join(""));
    expect(frame?.getAttribute("loading")).toBe("lazy");
    expect(frame?.hasAttribute("allowfullscreen")).toBe(true);
    expect(html).not.toMatch(/leave this site|you are leaving|opens in a new/i);

    expect(html).toContain(LEGAL_BUSINESS_NAME);
    expect(html).toContain(BUSINESS_CONTACT.email);
    expect(html).toContain(BUSINESS_CONTACT.phoneDisplay);
    expect(html).toContain(BUSINESS_CONTACT.address);
    expect(
      container?.querySelector("[data-testid='senior-call']")?.getAttribute("href"),
    ).toBe(BUSINESS_CONTACT.phoneHref);
    expect(html.toLowerCase()).not.toContain(["cadi", "@"].join(""));
    expect(BUSINESS_CONTACT.email).toBe("photos@iconicimagestx.com");
  });

  it("shows the hero and the gallery from the manifest, without the hero duplicate", () => {
    const photos = publishedSeniorLivingPhotos();
    expect(SENIOR_LIVING_PHOTOS).toHaveLength(11);
    expect(photos.map((photo) => photo.stem)).toEqual(
      SENIOR_LIVING_PHOTOS.map((photo) => photo.stem),
    );
    expect(photos[0]?.stem).toBe("senior-living-01-hero");
    expect(photos.map((photo) => photo.stem).join(" ")).not.toContain(
      "entrance",
    );
    expect(SENIOR_LIVING_WIDTHS).toEqual([1600, 1024, 640]);
    expect(publishedSeniorLivingPhotos([])).toEqual([]);

    const hero = container?.querySelector(
      '[data-testid="senior-hero"] img',
    ) as HTMLImageElement | null;
    expect(hero?.getAttribute("src")).toBe(
      "/senior-living/senior-living-01-hero.jpg",
    );
    expect(hero?.getAttribute("alt")).toBe(photos[0]?.alt);
    expect(hero?.className).toContain("object-top");
    expect(hero?.className).toContain("sm:object-center");

    const gallery = container?.querySelector('[data-testid="senior-gallery"]');
    const images = [
      ...((gallery?.querySelectorAll("img") || []) as unknown as HTMLImageElement[]),
    ];
    expect(images).toHaveLength(10);
    expect(images.map((img) => img.getAttribute("alt"))).toEqual(
      photos.slice(1).map((photo) => photo.alt),
    );
    expect(images.map((img) => img.getAttribute("src"))).toEqual(
      photos.slice(1).map((photo) => `/senior-living/${photo.stem}.jpg`),
    );
    expect(gallery?.innerHTML).not.toContain("senior-living-01-hero");
    expect(gallery?.innerHTML).not.toContain("senior-living-family");
    expect(gallery?.innerHTML).not.toContain("residents");

    const family = container?.querySelector(
      '[data-testid="senior-family"] img',
    ) as HTMLImageElement | null;
    expect(family?.getAttribute("alt")).toBe(SENIOR_LIVING_FAMILY_PHOTO.alt);
    expect(family?.getAttribute("src")).toBe(
      `/senior-living/${SENIOR_LIVING_FAMILY_PHOTO.stem}.jpg`,
    );
    const steps = container?.querySelector('[data-testid="senior-steps"]');
    expect(
      family &&
        steps &&
        family.compareDocumentPosition(steps) &
          Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(container?.innerHTML).not.toMatch(
      /unsplash|picsum|coming soon|stock photo|via\.placeholder/i,
    );

    const tour = container?.querySelector('[data-testid="matterport-tour"]');
    expect(
      gallery &&
        tour &&
        gallery.compareDocumentPosition(tour) &
          Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders pricing and travel from config, not from page literals", () => {
    const pricing =
      container?.querySelector('[data-testid="senior-pricing"]')?.textContent ||
      "";
    expect(pricing).toContain(formatUsd(SENIOR_TOUR_PRICE));
    expect(pricing).toContain(
      `Up to ${SENIOR_TOUR_SQFT_CAP.toLocaleString("en-US")} sq ft`,
    );
    for (const tier of SENIOR_ROOM_RATES) {
      expect(pricing).toContain(formatUsd(tier.each));
    }
    expect(pricing).toContain("Up to 10");
    expect(pricing).toContain("11 to 20");
    expect(pricing).toContain(seniorFacilityRateLine());
    expect(pricing).toContain(seniorFacilityExampleLine());
    expect(pricing).toContain(
      formatSeniorFacilityRate(SENIOR_FACILITY_RATE_PER_SQFT),
    );
    for (const option of SENIOR_LIVING_HOSTING_OPTIONS) {
      expect(pricing).toContain(option.label);
    }
    expect(pricing).toContain(SENIOR_LIVING_HOSTING_NOTE);
    expect(pricing).not.toMatch(/\$0\.0[5-7]|from\s+\$0\.|\/ sq ft/);
    expect(pricing).not.toContain("Monthly hosting, or a transfer of ownership.");
    expect(pricing).not.toMatch(/2\.8%|processing fee/i);

    const travel =
      container?.querySelector('[data-testid="travel-zones"]')?.textContent ||
      "";
    const free = TRAVEL_ZONES.find((zone) => zone.feeCents === 0);
    expect(travel).toContain(`free within ${free?.outerMiles} miles`);
    const paid = TRAVEL_ZONES.filter((zone) => zone.feeCents > 0).map((zone) =>
      formatUsd(zone.feeCents / 100),
    );
    for (const amount of paid) expect(travel).toContain(amount);
    expect(travel).toContain("by zone");
    const last = TRAVEL_ZONES[TRAVEL_ZONES.length - 1];
    expect(travel).toContain(`Quoted beyond ${last.outerMiles} miles`);
    expect(
      container?.querySelector('[data-testid="senior-hero"]')?.textContent ||
        "",
    ).not.toContain(paid[0]);

    const pricingNode = container?.querySelector(
      '[data-testid="senior-pricing"]',
    );
    const travelNode = container?.querySelector('[data-testid="travel-zones"]');
    expect(
      pricingNode &&
        travelNode &&
        pricingNode.compareDocumentPosition(travelNode) &
          Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    const source = readFileSync(
      path.join(process.cwd(), "client/pages/SeniorLiving.tsx"),
      "utf8",
    );
    expect(source).toContain("TRAVEL_ZONES");
    expect(source).toContain("SENIOR_FACILITY_RATE_PER_SQFT");
    expect(source).toContain("MoneyAmount");
    expect(source).not.toMatch(/\$50|\$75|\$100|\$125|\$150|\$250|\$199|\$175/);
    expect(source).not.toMatch(/\b0\.0[5-7]\b/);
    const orderSource = readFileSync(
      path.join(process.cwd(), "client/components/SeniorLivingOrder.tsx"),
      "utf8",
    );
    expect(orderSource).not.toMatch(/\b0\.0[5-7]\b|\$0\.0[5-7]/);
    expect(orderSource).toContain("deposit-checkout");
    expect(orderSource).toContain("window.location.assign");
    expect(orderSource).toContain("depositCheckoutLive");
    expect(orderSource).toContain("SENIOR_LIVING_DEPOSIT_RECEIVED");
    expect(source).not.toMatch(/\b17\b|\b84\b/);
    expect(source).not.toMatch(/\bfont-serif\b|Cormorant|Garamond|cursive/);
    expect(source).toContain("object-top");
    expect(source).toContain("photos.slice(1)");
    expect(source).toContain("text-[#FFE14A]");
    expect(source).toContain('className="bg-[#FFE14A] text-[#1A1A1A]"');
    expect(source).not.toContain("residents");
    const communityName = ["sun", "dale"].join("");
    expect(source.toLowerCase()).not.toContain(communityName);
    expect(source).not.toContain(["cadi", "@"].join(""));
    const manifest = readFileSync(
      path.join(process.cwd(), "client/content/seniorLiving.ts"),
      "utf8",
    );
    expect(manifest.toLowerCase()).not.toContain(communityName);
  });

  it("walks the order form and confirms the order number without promising email", async () => {
    await act(async () => {
      container?.querySelector<HTMLFormElement>("form")?.requestSubmit();
    });
    expect(container?.querySelector("[role='alert']")?.textContent).toBe(
      "Choose at least one service.",
    );
    expect(callsTo("/api/senior-living/order")).toHaveLength(0);
    expect(callsTo("deposit-checkout")).toHaveLength(0);

    await fillOrder();
    expect(
      container?.querySelector("[data-testid='senior-hosting']")?.textContent,
    ).toBe(`Monthly hosting. ${SENIOR_LIVING_HOSTING_NOTE}`);
    expect(
      container?.querySelector("[data-testid='senior-hosting']")?.textContent,
    ).not.toMatch(/\$/);
    expect(container?.textContent).toContain("Deposit due today (50%)");
    expect(container?.textContent).toContain("Balance due after the shoot");
    expect(container?.textContent).toContain("Processing fee (2.8%)");
    expect(container?.textContent).toContain("Request booking");
    expect(container?.querySelector("[data-testid='senior-pay']")).toBeNull();
    expect(container?.textContent).not.toMatch(/Pay deposit/);

    await click("senior-back");
    await click("senior-back");
    await act(async () => {
      setValue("senior-email", "not-an-email");
    });
    await click("senior-next");
    expect(container?.querySelector("[role='alert']")?.textContent).toBe(
      "Enter a valid email.",
    );
    expect(callsTo("/api/senior-living/order")).toHaveLength(0);
    expect(callsTo("deposit-checkout")).toHaveLength(0);

    await act(async () => {
      setValue("senior-email", "ada@community.example");
    });
    await click("senior-next");
    await click("senior-next");
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        orderNumber: "ORD - L - 10001",
        invoiceId: "inv1",
        payToken: "tok",
        confirmationEmail: false,
      }),
    });
    await click("senior-request-booking");
    expect(callsTo("/api/senior-living/order")).toHaveLength(1);
    expect(callsTo("deposit-checkout")).toHaveLength(0);
    const [url, init] = callsTo("/api/senior-living/order")[0];
    expect(url).toBe("/api/senior-living/order");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.tour).toBe(true);
    expect(body.hosting).toBe("monthly-hosting");
    expect(body.email).toBe("ada@community.example");
    expect(body.scheduledTime).toBe("9:00 AM");
    expect(body.companyWebsite).toBe("");
    expect(
      container?.querySelector("[data-testid='senior-order-number']")?.textContent,
    ).toBe("ORD - L - 10001");
    expect(container?.textContent).toContain(SENIOR_LIVING_DEPOSIT_LINE);
    expect(container?.textContent).not.toMatch(
      /check your email|emailed you|confirmation email|we will email/i,
    );
    expect(container?.textContent).not.toContain("Invoice the 50% deposit manually");
    expect(container?.textContent).not.toContain(SENIOR_LIVING_DEPOSIT_RECEIVED);
  });

  it("pays the deposit online when checkout is live and shows deposit received after Square returns", async () => {
    const assign = vi.spyOn(seniorCheckoutNavigation, "assign").mockImplementation(() => undefined);
    let checkoutOk = true;
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/senior-living/config")) {
        return { ok: true, json: async () => ({ depositCheckoutLive: true }) };
      }
      if (url.includes("/api/senior-living/order")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            orderNumber: "ORD - L - 10001",
            invoiceId: "inv1",
            payToken: "tok",
            confirmationEmail: false,
          }),
        };
      }
      if (url.includes("deposit-checkout")) {
        return checkoutOk
          ? { ok: true, json: async () => ({ checkoutUrl: "https://square.test/pay" }) }
          : { ok: false, status: 500, json: async () => ({ error: "Square is unavailable." }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    act(() => {
      root?.unmount();
    });
    container?.remove();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <MemoryRouter>
          <SeniorLiving />
        </MemoryRouter>,
      );
      await new Promise((resolve) => setTimeout(resolve, 30));
    });

    expect(
      container?.querySelector('[data-testid="senior-deposit"]')?.textContent,
    ).toBe(SENIOR_LIVING_DEPOSIT_LINE_ONLINE);
    expect(container?.textContent).toContain(SENIOR_LIVING_DEPOSIT_LINE_ONLINE);
    expect(container?.textContent).not.toContain(SENIOR_LIVING_DEPOSIT_LINE);

    checkoutOk = false;
    await fillOrder();
    expect(container?.textContent).toContain(SENIOR_LIVING_PAY_STEP);
    expect(container?.querySelector("[data-testid='senior-request-booking']")).toBeNull();
    expect(container?.querySelector("[data-testid='senior-pay-deposit']")?.textContent).toBe(
      SENIOR_LIVING_PAY_STEP,
    );
    expect(
      container?.querySelector("[data-testid='senior-hosting']")?.textContent,
    ).toBe(`Monthly hosting. ${SENIOR_LIVING_HOSTING_NOTE}`);
    await click("senior-pay-deposit");
    expect(container?.querySelector("[role='alert']")?.textContent).toBe("Square is unavailable.");
    expect(assign).not.toHaveBeenCalled();
    expect(container?.textContent).not.toContain(SENIOR_LIVING_DEPOSIT_RECEIVED);
    expect(callsTo("/api/senior-living/order")).toHaveLength(1);
    expect(callsTo("deposit-checkout")).toHaveLength(1);

    checkoutOk = true;
    await click("senior-pay-deposit");
    expect(callsTo("/api/senior-living/order")).toHaveLength(1);
    expect(callsTo("deposit-checkout")).toHaveLength(2);
    const checkoutCall = callsTo("deposit-checkout")[1];
    expect(String(checkoutCall[0])).toBe("/api/payments/invoice/inv1/deposit-checkout");
    expect(JSON.parse(String(checkoutCall[1].body))).toEqual({ t: "tok" });
    expect(assign).toHaveBeenCalledWith("https://square.test/pay");
    expect(container?.textContent).not.toContain(SENIOR_LIVING_DEPOSIT_RECEIVED);

    act(() => {
      root?.unmount();
    });
    container?.remove();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <MemoryRouter
          initialEntries={["/senior-living?deposit=received&order=ORD%20-%20L%20-%2010001"]}
        >
          <SeniorLiving />
        </MemoryRouter>,
      );
    });
    expect(
      container?.querySelector("[data-testid='senior-order-number']")?.textContent,
    ).toBe("ORD - L - 10001");
    expect(container?.textContent).toContain(SENIOR_LIVING_DEPOSIT_RECEIVED);
    expect(container?.querySelector("[data-testid='senior-order']")).toBeNull();
    expect(container?.querySelector("[data-testid='senior-pay-deposit']")).toBeNull();
    assign.mockRestore();
  });
});
