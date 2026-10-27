import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import PhotographerSetBoard from "./PhotographerSetBoard";
import type { WorkingShot } from "@/lib/photoOrder";

const shots: WorkingShot[] = [
  { key: "dark", name: "kitchen-2ev.jpg", url: "https://cdn.example/dark.jpg", culled: false, shotAt: 1000 },
  { key: "mid", name: "kitchen-0ev.jpg", url: "https://cdn.example/mid.jpg", culled: false, shotAt: 1200 },
  { key: "bright", name: "kitchen+2ev.jpg", url: "https://cdn.example/bright.jpg", culled: false, shotAt: 1400 },
  { key: "yard", name: "yard.jpg", url: "https://cdn.example/yard.jpg", culled: true, shotAt: 9000 },
  { key: "front", name: "front.jpg", url: "https://cdn.example/front.jpg", culled: false, shotAt: 20000 },
];

describe("photographer set board", () => {
  it("shows HDR merge, cull, drag order, and the sequenced export names", () => {
    const html = renderToString(
      <StaticRouter location="/admin/upload">
        <PhotographerSetBoard
          listingId="listing1234"
          address="123 Main St"
          shots={shots}
          onAddress={() => undefined}
          onReorder={() => undefined}
          onCull={() => undefined}
          onMerge={() => undefined}
          onUploadGallery={() => undefined}
          onExportZip={() => undefined}
        />
      </StaticRouter>,
    );
    expect(html).toContain('data-testid="hdr-merge"');
    expect(html).toContain('data-testid="cull-front"');
    expect(html).toContain('data-testid="reorder-grid"');
    expect(html).toContain("Culled");
    expect(html).toContain("001_123-main-st.jpg");
    expect(html).toContain("002_123-main-st.jpg");
    expect(html).not.toContain("yard.jpg</li>");
    expect(html).toContain('data-testid="upload-gallery-order"');
    expect(html).toContain("Upload to gallery");
  });
});
