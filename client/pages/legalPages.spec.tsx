import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import Privacy from "./Privacy";
import Terms from "./Terms";
import { legalPageContainerClassName, legalScrollMarginClassName } from "@/components/LegalDocument";
import { LEGAL } from "@/lib/legal";

function renderPage(node: ReactNode) {
  return renderToString(<MemoryRouter>{node}</MemoryRouter>);
}

function sectionAttrs(html: string) {
  return [...html.matchAll(/<section\b([^>]*)>/g)].map((match) => match[1]);
}

describe("privacy and terms clear the fixed nav", () => {
  it("clears the fixed nav with contact's desktop padding and a taller mobile offset", () => {
    expect(legalPageContainerClassName).toContain("container mx-auto px-4");
    expect(legalPageContainerClassName).toContain("pt-28");
    expect(legalPageContainerClassName).toContain("pb-16");
    expect(legalPageContainerClassName).toContain("md:pt-32");
    expect(legalPageContainerClassName).toContain("md:pb-24");
    expect(legalPageContainerClassName).not.toContain("py-16");
  });

  it("gives headings scroll-margin-top so anchors clear the nav", () => {
    expect(legalScrollMarginClassName).toBe("scroll-mt-28 md:scroll-mt-32");
  });

  it("renders privacy with a visible heading offset and anchored sections", () => {
    const html = renderPage(<Privacy />);
    expect(html).toContain("Privacy Policy");
    expect(html).toContain(legalPageContainerClassName);
    expect(html).toContain('id="privacy-policy"');
    expect(html).toContain(legalScrollMarginClassName);
    expect(html).toContain(LEGAL.email);
    expect(html).toContain(LEGAL.phoneDisplay);
    expect(html).toContain(LEGAL.entity);

    const sections = sectionAttrs(html);
    expect(sections).toHaveLength(12);
    expect(sections.map((attrs) => attrs.match(/id="([^"]+)"/)?.[1])).toEqual([
      "introduction",
      "information-we-collect",
      "how-we-use-your-information",
      "sms-and-email",
      "sharing-your-information",
      "data-retention",
      "cookies-and-tracking",
      "security",
      "your-rights",
      "childrens-privacy",
      "changes",
      "contact",
    ]);
    for (const attrs of sections) {
      expect(attrs).toContain(legalScrollMarginClassName);
    }
  });

  it("renders terms with a visible heading offset and anchored sections", () => {
    const html = renderPage(<Terms />);
    expect(html).toContain("Terms and Conditions");
    expect(html).toContain(legalPageContainerClassName);
    expect(html).toContain('id="terms-and-conditions"');
    expect(html).toContain(LEGAL.email);
    expect(html).toContain(LEGAL.phoneDisplay);
    expect(html).toContain(LEGAL.entity);

    const sections = sectionAttrs(html);
    expect(sections).toHaveLength(13);
    expect(sections.map((attrs) => attrs.match(/id="([^"]+)"/)?.[1])).toEqual([
      "agreement",
      "services",
      "booking-requests",
      "fees-and-payment",
      "changes-rescheduling-cancellation",
      "deliverables-and-license",
      "sms-and-email",
      "acceptable-use",
      "disclaimers",
      "limitation-of-liability",
      "governing-law",
      "changes",
      "contact",
    ]);
    for (const attrs of sections) {
      expect(attrs).toContain(legalScrollMarginClassName);
    }
  });
});
