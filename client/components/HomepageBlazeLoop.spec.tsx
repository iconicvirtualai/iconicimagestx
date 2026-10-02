import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import HomepageBlazeLoop from "./HomepageBlazeLoop";
import { HOMEPAGE_BLAZE_LOOP } from "@shared/homepageBlazeLoop";

describe("HomepageBlazeLoop", () => {
  it("renders nothing while slots are on hold", () => {
    const html = renderToString(<HomepageBlazeLoop />);
    expect(html).toBe("");
  });

  it("does not render a held slot even if a Drive src was pasted", () => {
    const html = renderToString(
      <HomepageBlazeLoop
        slots={[
          {
            ...HOMEPAGE_BLAZE_LOOP[1],
            src: "https://drive.google.com/file/d/1UTpe1GIaAXmWp5VEaGnf612gyDwiDQll/view",
          },
        ]}
      />,
    );
    expect(html).toBe("");
  });

  it("hard-cuts a muted 9:16 clip when a slot is marked final", () => {
    const html = renderToString(
      <HomepageBlazeLoop
        slots={[
          {
            ...HOMEPAGE_BLAZE_LOOP[0],
            approval: "final",
            src: "https://cdn.example/blaze/built.mp4",
          },
        ]}
      />,
    );
    expect(html).toContain('data-testid="homepage-blaze-loop"');
    expect(html).toContain('data-slot="BUILT"');
    expect(html).toContain('data-phase="clip"');
    expect(html).toContain("aspect-[9/16]");
    expect(html).toContain("https://cdn.example/blaze/built.mp4");
    expect(html).toContain("BUILT.");
    expect(html).toContain("muted");
    expect(html).toContain("autoplay");
    expect(html).toContain("playsinline");
    expect(html).not.toMatch(/\sloop[\s=>]/);
    expect(html).not.toContain("#BEICONIC");
    expect(html).not.toContain("Ten years. Still Iconic.");
    expect(html).not.toMatch(/\bagent\b/i);
    expect(html).not.toMatch(/\bstreet\b/i);
  });

  it("puts the closer under the Iconic mark and hashtag once", () => {
    const html = renderToString(
      <HomepageBlazeLoop
        slots={[
          {
            ...HOMEPAGE_BLAZE_LOOP[2],
            approval: "final",
            src: "https://cdn.example/blaze/ten-years.mp4",
          },
        ]}
      />,
    );
    expect(html).toContain('data-slot="TEN_YEARS"');
    expect(html).toContain("Ten years. Still Iconic.");
    expect(html).toContain("#BEICONIC");
    expect(html).toContain('alt="Iconic"');
    expect(html).toContain("/media/logos/logo-white-large.png");
    expect(html.match(/#BEICONIC/g)).toHaveLength(1);
    expect(html).not.toMatch(/\bagent\b/i);
    expect(html).not.toMatch(/\b(street|lane|avenue)\b/i);
  });
});
