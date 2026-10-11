/**
 * @vitest-environment happy-dom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import path from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SeniorLiving, { SENIOR_LIVING_CTA } from "./SeniorLiving";
import {
  publishedSeniorLivingPhotos,
  SENIOR_LIVING_PHOTOS,
  SENIOR_LIVING_WIDTHS,
  SENIOR_LIVING_MATTERPORT_ALLOW,
  SENIOR_LIVING_MATTERPORT_SRC,
  SENIOR_LIVING_MATTERPORT_TITLE,
} from "@/content/seniorLiving";
import { BUSINESS_CONTACT, LEGAL_BUSINESS_NAME } from "@shared/businessContact";
import {
  SENIOR_FACILITY_RATE_PER_SQFT,
  SENIOR_FACILITY_SQFT_CAP,
  SENIOR_ROOM_RATES,
  SENIOR_TOUR_PRICE,
  SENIOR_TOUR_SQFT_CAP,
  formatSeniorFacilityRate,
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

async function fillValid() {
  await act(async () => {
    setValue("senior-name", "Ada Lovelace");
    setValue("senior-community", "A Woodlands-area senior living community");
    setValue("senior-email", "ada@community.example");
    setValue("senior-phone", "281-555-0199");
    setValue("senior-address", "100 Oak St, Spring, TX 77380");
    setValue("senior-dates", "April 14 or 15");
    container
      ?.querySelector<HTMLInputElement>('input[value="tour-3d"]')
      ?.click();
  });
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
    expect(html).toContain("Virtual tours and photography");
    expect(html).toContain("Spring");
    expect(html).toContain("The Woodlands");
    expect(html).toContain("Houston");
    expect(html).toContain("Schedule");
    expect(html).toContain("Shoot");
    expect(html).toContain("Content Ready");
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
    expect(pricing).toContain(
      formatSeniorFacilityRate(SENIOR_FACILITY_RATE_PER_SQFT),
    );
    expect(pricing).toContain(
      `Up to ${SENIOR_FACILITY_SQFT_CAP.toLocaleString("en-US")} sq ft`,
    );
    expect(pricing).toContain("/ sq ft");
    expect(pricing).toContain("Monthly hosting, or a transfer of ownership.");
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
    expect(source).not.toMatch(/\b0\.05\b/);
    expect(source).not.toMatch(/\b17\b|\b84\b/);
    expect(source).not.toMatch(/\bfont-serif\b|Cormorant|Garamond|cursive/);
    expect(source).toContain("object-top");
    expect(source).toContain("photos.slice(1)");
    expect(source.match(/#FFE14A/g)).toHaveLength(1);
    const communityName = ["sun", "dale"].join("");
    expect(source.toLowerCase()).not.toContain(communityName);
    expect(source).not.toContain(["cadi", "@"].join(""));
    const manifest = readFileSync(
      path.join(process.cwd(), "client/content/seniorLiving.ts"),
      "utf8",
    );
    expect(manifest.toLowerCase()).not.toContain(communityName);
  });

  it("validates the form before sending and shows success without a client email", async () => {
    await act(async () => {
      container?.querySelector<HTMLFormElement>("form")?.requestSubmit();
    });
    expect(container?.querySelector("[role='alert']")?.textContent).toBe(
      "Enter your name.",
    );
    expect(fetchMock).not.toHaveBeenCalled();

    await fillValid();
    await act(async () => {
      setValue("senior-email", "not-an-email");
    });
    await act(async () => {
      container?.querySelector<HTMLFormElement>("form")?.requestSubmit();
    });
    expect(container?.querySelector("[role='alert']")?.textContent).toBe(
      "Enter a valid email.",
    );
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      setValue("senior-email", "ada@community.example");
    });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, message: "Request received." }),
    });
    await act(async () => {
      container?.querySelector<HTMLFormElement>("form")?.requestSubmit();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/senior-living");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.services).toEqual(["tour-3d"]);
    expect(body.email).toBe("ada@community.example");
    expect(body.companyWebsite).toBe("");
    expect(
      container?.querySelector("[data-testid='senior-success']")?.textContent,
    ).toContain("Request received.");
    expect(container?.textContent).not.toMatch(
      /check your email|emailed you|confirmation email/i,
    );
  });
});
