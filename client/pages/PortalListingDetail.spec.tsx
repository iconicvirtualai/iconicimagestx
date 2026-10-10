import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PortalListingDetail, { PortalListingDetailView } from "./PortalListingDetail";
import { buildPortalListingDetail, defaultPortalWebsite, portalFactsDraftFromDetail } from "@shared/portalListingDetail";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: null,
    userType: null,
    staffProfile: null,
    loading: false,
    signOutUser: async () => undefined,
  }),
}));

const detail = buildPortalListingDetail({
  listing: {
    id: "listing1234",
    status: "scheduled",
    address: { street: "18 Oak Hollow", city: "Spring", state: "TX", zip: "77389" },
    bedrooms: 3,
    images: [
      { id: "front", name: "front.jpg", url: "https://cdn.example/front.jpg", contentType: "image/jpeg" },
      { id: "back", name: "back.jpg", url: "https://cdn.example/back.jpg", contentType: "image/jpeg", hiddenFromPresentation: true },
    ],
    videos: [{ id: "reel", name: "tour.mov", url: "https://cdn.example/tour.mov", contentType: "video/quicktime" }],
  },
  orderRequest: { id: "req1", submittedAt: "2026-03-30T15:00:00.000Z" },
  invoices: [{ id: "inv1", invoiceNumber: "INV-2026-100", status: "draft", total: 100, amountDue: 100 }],
});

function render(
  tab: "data" | "photos" | "video" | "tours" | "floorplans" | "marketing" | "orders" | "activity" | "website",
  editing: "photo" | null = null,
  canEdit = true,
  dataEditing = false,
) {
  return renderToString(
    <MemoryRouter>
      <PortalListingDetailView
        detail={detail}
        tab={tab}
        editing={editing}
        saving={false}
        canEdit={canEdit}
        dataEditing={dataEditing}
        dataDraft={portalFactsDraftFromDetail(detail)}
        website={defaultPortalWebsite()}
        onTab={() => undefined}
        onToggleEditing={() => undefined}
        onMedia={() => undefined}
        onWebsite={() => undefined}
        onWebsiteSave={() => undefined}
        onDataEditing={() => undefined}
        onDataDraft={() => undefined}
        onDataSave={() => undefined}
        onRequestPhotoEdit={async () => false}
      />
    </MemoryRouter>,
  );
}

describe("portal listing detail page", () => {
  it("shows the address and leaves missing property facts as placeholders", () => {
    const html = render("data");
    expect(html).toContain("18 Oak Hollow");
    expect(html).toContain("Spring");
    expect(html).toContain("77389");
    expect(html).toContain("Not on file yet");
    expect(html).toContain("Public record lookups are not part of this page.");
    expect(html).toContain("data-edit-toggle");
    expect(html).toContain('aria-checked="false"');
    expect(html).not.toContain("data-field-line1");
    expect(html).not.toContain("data-save");
    for (const tab of ["data", "photos", "video", "tours", "floorplans", "marketing", "website", "orders", "activity"]) {
      expect(html).toContain(`listing-tab-${tab}`);
    }
  });

  it("opens listing fact fields only while the data edit toggle is on", () => {
    const editing = render("data", null, true, true);
    expect(editing).toContain('aria-checked="true"');
    expect(editing).toContain("data-save");
    expect(editing).toContain("data-field-line1");
    expect(editing).toContain("data-field-beds");
    expect(editing).toContain("data-field-pool");
    expect(editing).toContain("data-field-office");
    expect(editing).toContain('value="18 Oak Hollow"');
    expect(editing).toContain('value="3"');
    expect(editing).toContain('placeholder="Not on file yet"');
    expect(editing).not.toContain("Pay now");
    expect(editing).not.toContain("Download");

    const visitorEditing = render("data", null, false, true);
    expect(visitorEditing).not.toContain("data-edit-toggle");
    expect(visitorEditing).not.toContain("data-field-line1");
    expect(visitorEditing).not.toContain("data-save");
  });

  it("lets the owner request an edit on one visible photo", () => {
    const html = render("photos");
    expect(html).toContain("photo-edit-open-front");
    expect(html).toContain("Request edit");
    expect(html).not.toContain("Pay now");

    const requested = buildPortalListingDetail({
      listing: {
        id: "listing1234",
        images: [{ id: "front", name: "front.jpg", url: "https://cdn.example/front.jpg", contentType: "image/jpeg" }],
        photoEditRequests: [{
          id: "req-front1",
          listingId: "listing1234",
          photoId: "front",
          photoName: "front.jpg",
          note: "Warm the sky on the left.",
          status: "requested",
          timeline: [{ status: "requested", at: "2026-04-02T15:00:00.000Z", actor: "client", actorId: "client123" }],
          replacement: null,
          clientId: "client123",
          createdAt: "2026-04-02T15:00:00.000Z",
          updatedAt: "2026-04-02T15:00:00.000Z",
        }],
      },
    });
    const owner = renderToString(
      <MemoryRouter>
        <PortalListingDetailView
          detail={requested}
          tab="photos"
          editing={null}
          saving={false}
          canEdit
          dataEditing={false}
          dataDraft={portalFactsDraftFromDetail(requested)}
          website={defaultPortalWebsite()}
          onTab={() => undefined}
          onToggleEditing={() => undefined}
          onMedia={() => undefined}
          onWebsite={() => undefined}
          onWebsiteSave={() => undefined}
          onDataEditing={() => undefined}
          onDataDraft={() => undefined}
          onDataSave={() => undefined}
          onRequestPhotoEdit={async () => false}
        />
      </MemoryRouter>,
    );
    expect(owner).toContain("Warm the sky on the left.");
    expect(owner).toContain("Requested");
    expect(owner).not.toContain("photo-edit-open-front");

    const visitor = renderToString(
      <MemoryRouter>
        <PortalListingDetailView
          detail={requested}
          tab="photos"
          editing={null}
          saving={false}
          canEdit={false}
          dataEditing={false}
          dataDraft={portalFactsDraftFromDetail(requested)}
          website={defaultPortalWebsite()}
          onTab={() => undefined}
          onToggleEditing={() => undefined}
          onMedia={() => undefined}
          onWebsite={() => undefined}
          onWebsiteSave={() => undefined}
          onDataEditing={() => undefined}
          onDataDraft={() => undefined}
          onDataSave={() => undefined}
          onRequestPhotoEdit={async () => false}
        />
      </MemoryRouter>,
    );
    expect(visitor).not.toContain("Warm the sky on the left.");
    expect(visitor).not.toContain("Request edit");
    expect(visitor).not.toContain("photo-edit-open-front");
  });

  it("shows a hidden photo only while editing", () => {
    expect(render("photos")).not.toContain("back.jpg");
    const editing = render("photos", "photo");
    expect(editing).toContain("back.jpg");
    expect(editing).toContain("Hidden");
    expect(editing).toContain("Hide");
  });

  it("scaffolds marketing, invoices, and activity without a pay action", () => {
    expect(render("marketing")).toContain("Design tools are not connected yet.");
    const orders = render("orders");
    expect(orders).toContain("INV-2026-100");
    expect(orders).toContain("draft");
    expect(orders).toContain("Total");
    expect(orders).toContain("$100.00");
    expect(orders).toContain('data-slot="money"');
    expect(orders).toContain("whitespace-nowrap");
    expect(orders).not.toContain("View invoice");
    expect(orders).not.toContain("/invoice/");
    expect(orders).not.toContain("Pay now");
    expect(render("activity")).toContain("Booking request received");
    expect(render("website")).toContain("Save site style");
  });

  it("gives a visitor the listing without edit, hide, site save, or a pay action", () => {
    const photos = render("photos", "photo", false);
    expect(photos).toContain("front.jpg");
    expect(photos).not.toContain("back.jpg");
    expect(photos).not.toContain("Edit");
    expect(photos).not.toContain("Hide");
    expect(photos).not.toContain("/portal/home");
    expect(photos).toContain('data-can-edit="false"');

    const website = render("website", null, false);
    expect(website).toContain("Sans");
    expect(website).not.toContain("Save site style");
    expect(website).not.toContain("<select");

    const orders = render("orders", null, false);
    expect(orders).not.toContain("INV-2026-100");
    expect(orders).not.toContain("draft");
    expect(orders).not.toContain("Total");
    expect(orders).not.toContain("Amount due");
    expect(orders).not.toContain("Pay now");
    expect(orders).not.toContain("View invoice");
    expect(orders).not.toContain("/invoice/");
    const activity = render("activity", null, false);
    expect(activity).toContain("Booking request received");
    expect(activity).not.toContain("INV-2026-100");
    expect(activity).not.toContain("Payment recorded");
    expect(activity).not.toMatch(/Invoice /);

    const data = render("data", null, false);
    expect(data).toContain("18 Oak Hollow");
    expect(data).toContain("Spring");
    expect(data).not.toContain("data-edit-toggle");
    expect(data).not.toContain("data-save");
    expect(data).not.toContain("data-field-");
    expect(data).not.toContain("Pay now");
    expect(data).not.toContain("Download");
    expect(data).not.toContain("INV-2026-100");
    expect(data).not.toContain("View invoice");
  });

  it("plays a listing video instead of turning a mov named tour into an iframe", () => {
    const html = render("video");
    expect(html).toContain("tour.mov");
    expect(html).toContain("<video");
    expect(html).toContain("playsinline");
    expect(html).toContain('preload="metadata"');
    expect(html).toContain("controls");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("Download");
  });

  it("embeds Matterport, shows a PNG floor plan, and opens a PDF floor plan in a new tab", () => {
    const media = {
      ...detail,
      videos: [{
        id: "reel",
        kind: "video" as const,
        name: "snap-reel.mp4",
        url: "https://cdn.example/snap-reel.mp4",
        contentType: "video/mp4",
        hidden: false,
        order: 0,
        uploadedAt: "",
      }],
      floorplans: [
        { id: "png", kind: "floorplan" as const, name: "level1.png", url: "https://cdn.example/level1.png", contentType: "image/png", hidden: false, order: 0, uploadedAt: "" },
        { id: "pdf", kind: "floorplan" as const, name: "level2.pdf", url: "https://cdn.example/level2.pdf", contentType: "application/pdf", hidden: false, order: 1, uploadedAt: "" },
      ],
      tours: [{
        id: "mp",
        kind: "tour" as const,
        name: "Matterport",
        url: "https://my.matterport.com/show/?m=abc123",
        contentType: "",
        hidden: false,
        order: 0,
        uploadedAt: "",
        provider: "Matterport",
        embedUrl: "https://my.matterport.com/show/?m=abc123",
      }],
    };
    const view = (tab: "video" | "tours" | "floorplans") => renderToString(
      <MemoryRouter>
        <PortalListingDetailView
          detail={media}
          tab={tab}
          editing={null}
          saving={false}
          canEdit={false}
          dataEditing={false}
          dataDraft={portalFactsDraftFromDetail(media)}
          website={defaultPortalWebsite()}
          onTab={() => undefined}
          onToggleEditing={() => undefined}
          onMedia={() => undefined}
          onWebsite={() => undefined}
          onWebsiteSave={() => undefined}
          onDataEditing={() => undefined}
          onDataDraft={() => undefined}
          onDataSave={() => undefined}
          onRequestPhotoEdit={async () => false}
        />
      </MemoryRouter>,
    );
    const reel = view("video");
    expect(reel).toContain('data-gallery-kind="reel"');
    expect(reel).toContain("78dvh");
    expect(reel).not.toContain("aspect-video");
    expect(reel).not.toContain("Download");

    const tours = view("tours");
    expect(tours).toContain('allow="fullscreen; xr-spatial-tracking"');
    expect(tours).toContain("Open 3D tour");
    expect(tours).not.toContain("Download");

    const plans = view("floorplans");
    expect(plans).toContain('data-gallery-kind="floorplan-image"');
    expect(plans).toContain("level1.png");
    expect(plans).toContain('data-gallery-kind="floorplan-pdf"');
    expect(plans).toContain("Open floor plan");
    expect(plans).toContain('target="_blank"');
    expect(plans).not.toContain("<iframe");
    expect(plans).not.toContain("Download");
  });

  it("keeps a logged-out visitor on the listing route and uses not-found for a bad id", () => {
    const pending = renderToString(
      <MemoryRouter initialEntries={["/portal/listings/listing1234"]}>
        <Routes>
          <Route path="/portal/listings/:listingId" element={<PortalListingDetail />} />
          <Route path="/portal" element={<p>Portal login</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(pending).toContain("animate-spin");
    expect(pending).not.toContain("Portal login");

    const missing = renderToString(
      <MemoryRouter initialEntries={["/portal/listings/no"]}>
        <Routes>
          <Route path="/portal/listings/:listingId" element={<PortalListingDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(missing).toContain("Oops! Page not found");
    expect(missing).not.toContain("portal-listing-detail");
  });
});
