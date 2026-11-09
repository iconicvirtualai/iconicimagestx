import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import FeaturesSection from "./FeaturesSection";
import MediaCarousel from "./MediaCarousel";
import StepsSection from "./StepsSection";
import ThisIsOurMarket from "./ThisIsOurMarket";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const RETIRED = "lifestyle-mtz04327";

const HOME_SURFACES = [
  "client/pages/Index.tsx",
  "client/components/HeroSection.tsx",
  "client/components/MediaCarousel.tsx",
  "client/components/RaisingTheStandard.tsx",
  "client/components/ThisIsOurMarket.tsx",
  "client/components/SolutionSection.tsx",
  "client/components/StatsBar.tsx",
  "client/components/StepsSection.tsx",
  "client/components/VisionStepMedia.tsx",
  "client/components/TheNetwork.tsx",
  "client/components/AudienceSection.tsx",
  "client/components/AudienceDetails.tsx",
  "client/components/SnapReelsStrip.tsx",
  "client/components/FeaturesSection.tsx",
  "client/components/StillToMotion.tsx",
  "client/components/TestimonialsSection.tsx",
  "client/components/FAQSection.tsx",
  "client/components/PartnershipCTA.tsx",
  "client/components/Header.tsx",
  "client/components/Footer.tsx",
];

describe("homepage media swaps", () => {
  it("keeps the blue-suit portrait off homepage surfaces", () => {
    for (const file of HOME_SURFACES) {
      const text = readFileSync(path.join(ROOT, file), "utf8");
      expect(text, file).not.toContain(RETIRED);
    }
    const html = renderToString(
      <MemoryRouter>
        <StepsSection />
        <FeaturesSection />
        <ThisIsOurMarket />
      </MemoryRouter>,
    );
    expect(html).not.toContain(RETIRED);
  });

  it("renders the four vision-to-viral motion visuals", () => {
    const html = renderToString(
      <MemoryRouter>
        <StepsSection />
      </MemoryRouter>,
    );
    expect(html).toContain("/media/home-v2/steps/order-1.webp");
    expect(html).toContain("/media/home-v2/steps/order-4.webp");
    expect(html).toContain("/media/about/03_gear_bts_camera_16x9.jpg");
    expect(html).toContain("An Iconic photographer lining up a shot");
    expect(html).toContain("/media/before-after/twilight-pool-day.jpg");
    expect(html).toContain("/media/before-after/twilight-pool-lifestyle.jpg");
    expect(html).not.toContain("/media/before-after/living-occupied.jpg");
    expect(html).not.toContain("/media/before-after/pasture-animals.jpg");
    expect(html).toContain("/media/pay-at-close/luxury/marias/01-front-day.jpg");
    expect(html).toContain("prefers-reduced-motion");
    expect(html).toContain('loading="lazy"');
  });

  it("sells still shots to motion and adds firepit examples 3 and 4", () => {
    const html = renderToString(
      <MemoryRouter>
        <FeaturesSection />
      </MemoryRouter>,
    );
    expect(html).toContain("Still Shots");
    expect(html).toContain("To Motion");
    expect(html).not.toContain(">Still<");
    expect(html).not.toContain("In motion");
    expect(html).toContain("/media/home-v2/still-to-motion/kitchen.webp");
    expect(html).toContain("/media/home-v2/still-to-motion/kitchen.avif");
    expect(html).toContain("/media/home-v2/still-to-motion/pool.webp");
    const motionSource = readFileSync(path.join(ROOT, "client/components/StillToMotion.tsx"), "utf8");
    expect(motionSource).toContain("/media/home-v2/still-to-motion/pool-4.mp4");
    expect(motionSource).toContain("/media/home-v2/still-to-motion/front-2.webm");
    expect(motionSource).toContain("playsInline");
    expect(motionSource).toContain('muted');
    expect(html).toContain("Example 3");
    expect(html).toContain("Example 4");
    expect(html).toContain("/media/home-v2/photo-edits/firepit-day.webp");
    expect(html).toContain("/media/home-v2/photo-edits/firepit-dusk.avif");
    expect(html).not.toContain(RETIRED);
  });

  it("leaves the pasture and dated living room out of the homepage carousel", () => {
    const html = renderToString(
      <MemoryRouter>
        <MediaCarousel />
      </MemoryRouter>,
    );
    expect(html).not.toContain("pasture-animals");
    expect(html).not.toContain("pasture-lifestyle");
    expect(html).not.toContain("living-occupied");
    expect(html).not.toContain("living-declutter");
    expect(html).toContain("twilight-pool-lifestyle");
    expect(html).toContain("pavilion-lifestyle");
  });
});
