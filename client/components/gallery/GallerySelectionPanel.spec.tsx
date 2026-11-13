import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { PublicGalleryView, type PublicGalleryModel } from "@/pages/PublicGallery";
import { AdminClientSelectionsView, type StaffSelectionView } from "./AdminClientSelections";

const photos = [1, 2, 3].map((n) => ({
  id: `p${n}`,
  type: "photo",
  fileName: `00${n}_photo.jpg`,
  url: "https://cdn.example/photo.jpg",
  canDownload: true,
}));

function visible(html: string): string {
  return html.replace(/<!-- -->/g, "");
}

function client(over: boolean) {
  const gallery: PublicGalleryModel = {
    title: "18 Oak Hollow",
    clientName: "TEST Client",
    status: "delivered",
    paymentRequired: false,
    mediaItems: photos,
    selection: {
      open: true,
      mode: "listing",
      billing: over ? "charge" : "selections",
      allowance: 2,
      extraPhotoPrice: over ? 25 : null,
      selectedIds: over ? ["p1", "p2", "p3"] : ["p1"],
      submitted: false,
    },
  };
  return renderToString(
    <MemoryRouter>
      <PublicGalleryView
        gallery={gallery}
        galleryId="gal-1"
        selectedIds={gallery.selection?.selectedIds}
        onToggleSelection={() => undefined}
        onSubmitSelection={() => undefined}
      />
    </MemoryRouter>,
  );
}

describe("client gallery selections", () => {
  it("renders hearts and a selected filter without a portal login", () => {
    const html = visible(client(false));
    expect(html).toContain('data-testid="gallery-selection"');
    expect(html).toContain('data-testid="gallery-selection-heart-p1"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("gallery-selection-filter-selected");
    expect(html).toContain("1 selected of 2 included");
    expect(html).not.toContain("gallery-selection-over");
    expect(html).not.toContain("Added total");
    expect(html).not.toContain('href="/portal"');
    expect(html).not.toContain("Sign in");
  });

  it("shows the extra price and added total before submit", () => {
    const html = visible(client(true));
    expect(html).toContain('data-testid="gallery-selection-over"');
    expect(html).toContain("3 selected of 2 included");
    expect(html).toContain("$25.00 per extra photo");
    expect(html).toContain("Added total $25.00");
    expect(html).toContain('data-testid="gallery-selection-submit"');
  });
});

describe("admin client selections", () => {
  it("shows the count, file names, and copy actions", () => {
    const view: StaffSelectionView = {
      settings: {
        open: true,
        mode: "headshots",
        billing: "charge",
        allowance: 2,
        extraPriceOverride: null,
        catalogExtraPrice: 40,
        catalogPackageId: "headshots",
        catalogPackageName: "Headshots",
        extraPhotoPrice: 40,
      },
      status: "submitted",
      reviewPending: true,
      selectedIds: ["p1", "p2", "p3"],
      fileNames: ["001_photo.jpg", "002_photo.jpg", "003_photo.jpg"],
      csv: "fileName\n001_photo.jpg\n",
      recordedOnOrder: true,
      archivedCount: 0,
      photos: photos.map((photo) => ({
        id: photo.id,
        fileName: photo.fileName || photo.id,
        selected: true,
        archived: false,
      })),
    };
    const html = visible(renderToString(
      <MemoryRouter>
      <AdminClientSelectionsView
        view={view}
        selectedIds={["p1", "p2", "p3"]}
        onSave={() => undefined}
        onArchive={() => undefined}
        onCopy={() => undefined}
        onCsv={() => undefined}
      />
      </MemoryRouter>,
    ));
    expect(html).toContain('data-testid="admin-client-selections"');
    expect(html).toContain('data-testid="admin-selection-badge"');
    expect(html).toContain("3 selected of 2 included");
    expect(html).toContain("Charge per additional photo");
    expect(html).toContain("No charge, just selections needed");
    expect(html).toContain("001_photo.jpg");
    expect(html).toContain("Copy file names");
    expect(html).toContain("Archive the rest");
    expect(html).toContain("Headshot finals");
    expect(html).not.toMatch(/sendEmail|twilio|CLIENT_NOTIFY_LIVE/);
  });
});
