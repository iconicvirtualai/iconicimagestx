import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import Pricing from "./Pricing";

function headingTag(html: string, text: string): string {
  const at = html.indexOf(text);
  expect(at, text).toBeGreaterThan(-1);
  const open = html.lastIndexOf("<h3", at);
  const close = html.indexOf("</h3>", at);
  expect(open, text).toBeGreaterThan(-1);
  expect(close, text).toBeGreaterThan(at);
  return html.slice(open, close + 5);
}

describe("pricing section headings", () => {
  it("lets the lifecycle headings wrap inside a phone viewport", () => {
    const html = renderToString(
      <MemoryRouter>
        <Pricing />
      </MemoryRouter>,
    );

    for (const text of [
      "THE 7-TIER LIFECYCLE MANAGEMENT",
      "PHASE 2: THE &quot;MONEY OVER TIME&quot; TRACK",
    ]) {
      const tag = headingTag(html, text);
      expect(tag).not.toContain("whitespace-nowrap");
      expect(tag).not.toContain("anywhere");
      expect(tag).toContain("break-words");
      expect(tag).toContain("tracking-[0.12em]");
      expect(tag).toContain("min-w-0");
    }

    expect(html).toContain(">$<!-- -->249<");
    expect(html).toContain(">$<!-- -->1,599<");
    expect(html).toContain(">$<!-- -->4,500<");
  });
});
