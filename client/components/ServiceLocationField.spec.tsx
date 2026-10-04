import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import ServiceLocationField from "./ServiceLocationField";

const picked = {
  placeId: "ChIJpicked",
  formatted: "100 Main St, Austin, TX 78701, USA",
  lat: 30.2672,
  lng: -97.7431,
};

describe("service location field", () => {
  it("shows a map pin only after an address is picked", () => {
    const pinned = renderToString(
      <ServiceLocationField query={picked.formatted} picked={picked} onChange={() => undefined} />,
    );
    expect(pinned).toContain('id="service-location"');
    expect(pinned).toContain("service-location-pin");
    expect(pinned).toContain("Map pin saved for this address.");
    expect(pinned).toContain(picked.formatted);
    expect(pinned).not.toContain("service-location-unpinned");

    const typed = renderToString(
      <ServiceLocationField query="100 Main" picked={null} onChange={() => undefined} />,
    );
    expect(typed).toContain("service-location-unpinned");
    expect(typed).toContain("Choose an address from the list to drop the map pin.");
    expect(typed).not.toContain("service-location-pin");
  });
});
