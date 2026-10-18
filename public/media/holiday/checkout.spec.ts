import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./checkout.js", import.meta.url), "utf8");

function loadCheckout() {
  const window = new Window();
  const opened: Array<{ href: string; closed: boolean; opener: unknown; close: () => void }> = [];
  window.open = ((url?: string) => {
    const tab = {
      href: "",
      closed: false,
      opener: window,
      close() { tab.closed = true; },
      location: {
        set href(value: string) { tab.href = value; },
        get href() { return tab.href; },
      },
    };
    if (url) tab.href = url;
    opened.push(tab);
    return tab;
  }) as typeof window.open;
  window.eval(source);
  return { window, opened, checkout: window.HolidayCheckout as {
    httpsUrl: (url: unknown) => string;
    openTab: () => (typeof opened)[number] | null;
    closeTab: (tab: (typeof opened)[number] | null) => void;
    follow: (tab: (typeof opened)[number] | null, url: string) => boolean;
    showResult: (el: HTMLElement, url: string) => boolean;
  } };
}

describe("holiday checkout tab", () => {
  it("opens a blank tab during the click and sends Square there", () => {
    const { opened, checkout } = loadCheckout();
    const tab = checkout.openTab();
    expect(opened).toHaveLength(1);
    expect(tab?.href || "").not.toMatch(/^https:/);
    expect(checkout.follow(tab, "https://square.link/u/holiday")).toBe(true);
    expect(tab?.href).toBe("https://square.link/u/holiday");
  });

  it("shows a real checkout link when Square returned a url", () => {
    const { window, checkout } = loadCheckout();
    const el = window.document.createElement("div");
    expect(checkout.showResult(el, "https://square.link/u/holiday")).toBe(true);
    const link = el.querySelector("a");
    expect(link?.textContent).toBe("Continue to secure checkout");
    expect(link?.getAttribute("href")).toBe("https://square.link/u/holiday");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noopener");
    expect(el.textContent).not.toMatch(/text your secure payment link/i);
  });

  it("shows the text fallback only when there is no checkout url", () => {
    const { window, opened, checkout } = loadCheckout();
    const tab = checkout.openTab();
    expect(checkout.follow(tab, "")).toBe(false);
    expect(opened[0]?.closed).toBe(true);
    const el = window.document.createElement("div");
    expect(checkout.showResult(el, "http://evil.example/pay")).toBe(false);
    expect(el.querySelector(".checkout-continue")).toBeNull();
    expect(el.textContent).toMatch(/text your secure payment link/i);
    expect(el.textContent).toContain("281.356.0965");
  });

  it("is what both holiday pages use, with no top navigation", () => {
    for (const file of ["thankful.html", "tis-the-season.html"]) {
      const html = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
      expect(html).toContain('src="/media/holiday/checkout.js"');
      expect(html).toContain("HolidayCheckout.openTab()");
      expect(html).toContain("paidCheckouts.get(");
      expect(html).not.toContain("window.top");
      const pay = html.slice(html.indexOf("HolidayCheckout.openTab()"));
      expect(pay.indexOf("HolidayCheckout.openTab()")).toBeLessThan(pay.indexOf("await sendOrder"));
    }
  });
});
