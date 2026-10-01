import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { PresentationView } from "./ListingPresentation";
import { PresentationSharePanel } from "@/components/PresentationSharePanel";
import { seededPresentation } from "@shared/presentation";

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
});
