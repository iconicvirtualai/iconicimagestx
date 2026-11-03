import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { PresentationView } from "./ListingPresentation";
import { PresentationSharePanel } from "@/components/PresentationSharePanel";
import { copiedPresentationUrl, presentationClipboardUrl, seededPresentation } from "@shared/presentation";

describe("listing presentation page", () => {
  it("renders a private photo feed without an agent or street on the sample", () => {
    const html = renderToString(
      <MemoryRouter>
        <PresentationView
          presentation={seededPresentation("https://iconicimagestx.com")}
          shareUrl="https://iconicimagestx.com/present/preview"
          activeIndex={0}
          copied={false}
          onCopy={() => undefined}
        />
      </MemoryRouter>,
    );
    expect(html).toContain("Sample presentation");
    expect(html).toContain("Private preview");
    expect(html).toContain("Living room");
    expect(html).toContain("Rear pool");
    expect(html).toContain("Copy link");
    expect(html).toContain("/media/photos/luxury-exterior.jpg");
    expect(html).not.toContain("agent");
    expect(html).not.toContain("Sample Lane");
  });

  it("tells staff the share control does not email or text", () => {
    const html = renderToString(
      <MemoryRouter>
        <PresentationSharePanel listingId="listing1234" getToken={async () => "token"} />
      </MemoryRouter>,
    );
    expect(html).toContain("Presentation / Share link");
    expect(html).toContain("does not email or text");
  });

  it("copies the presentation path from the token, not the studio url", () => {
    const origin = "https://iconicimagestx.vercel.app";
    const token = "abcdefghijklmnopqrstuv";
    expect(presentationClipboardUrl(origin, token)).toBe(`${origin}/present/${token}`);
    expect(copiedPresentationUrl(origin, {
      path: `/present/${token}`,
      url: `${origin}/present/${token}`,
    })).toBe(`${origin}/present/${token}`);
    const page = readFileSync(new URL("./ListingPresentation.tsx", import.meta.url), "utf8");
    const panel = readFileSync(new URL("../components/PresentationSharePanel.tsx", import.meta.url), "utf8");
    expect(page).toContain("presentationClipboardUrl(window.location.origin, token)");
    expect(page).not.toContain("const url = window.location.href");
    expect(panel).toContain("copiedPresentationUrl(window.location.origin, link)");
    expect(panel).not.toContain("/studio/");
  });
});
