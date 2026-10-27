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
  website = defaultPortalWebsite(),
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
        website={website}
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
    expect(html).toContain("photo-select-front");
    expect(html).toContain('aria-pressed="false"');
    expect(html).not.toContain("Earlier");
    expect(html).not.toContain("Later");
    expect(html).not.toContain('type="checkbox"');
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
    expect(owner).toContain("photo-select-front");
    expect(owner).not.toContain("photo-select-all");
    expect(owner).not.toContain("photo-group-name");

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

  it("shows a returned revision as a thumbnail in the Revisions section", () => {
    const revised = buildPortalListingDetail({
      listing: {
        id: "listing1234",
        images: [{ id: "front", name: "front.jpg", url: "https://cdn.example/front.jpg", contentType: "image/jpeg" }],
        photoEditRequests: [{
          id: "req-front1",
          listingId: "listing1234",
          photoId: "front",
          photoName: "front.jpg",
          photoUrl: "https://cdn.example/front.jpg",
          note: "Warm the sky on the left.",
          status: "received_back",
          timeline: [
            { status: "requested", at: "2026-04-02T15:00:00.000Z", actor: "client", actorId: "client123" },
            { status: "received_back", at: "2026-04-03T15:00:00.000Z", actor: "staff", actorId: "staff123" },
          ],
          replacement: {
            name: "front-revised.jpg",
            url: "https://cdn.example/front-revised.jpg",
            path: "listings/listing1234/replacements/front-revised.jpg",
            contentType: "image/jpeg",
            attachedAt: "2026-04-03T15:00:00.000Z",
            attachedBy: "staff123",
          },
          clientId: "client123",
          createdAt: "2026-04-02T15:00:00.000Z",
          updatedAt: "2026-04-03T15:00:00.000Z",
        }],
      },
    });
    const html = renderToString(
      <MemoryRouter>
        <PortalListingDetailView
          detail={revised}
          tab="photos"
          editing={null}
          saving={false}
          canEdit
          dataEditing={false}
          dataDraft={portalFactsDraftFromDetail(revised)}
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
    expect(html).toContain("gallery-revisions");
    expect(html).toContain("Revisions");
    expect(html).toContain('alt="front-revised.jpg"');
    expect(html).toContain("Revised");
    expect(html).toContain("Send back for revisions");
    expect(html).toContain("photo-slide-next-front");
    expect(html).toContain("photo-size-slider");
    expect(html).toContain("<img");
    expect(html).not.toContain(">https://cdn.example/front-revised.jpg<");
  });

  it("shows a hidden photo to the owner so it can be selected again", () => {
    const owner = render("photos");
    expect(owner).toContain("back.jpg");
    expect(owner).toContain("Hidden");
    expect(owner).not.toContain("Earlier");
    expect(owner).not.toContain("Later");
    expect(render("photos", null, false)).not.toContain("back.jpg");
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
    expect(render("website")).toContain("Not published yet");
    expect(render("website")).toContain("listing-site-unpublished");
    expect(render("website")).not.toContain("listing-site-view");
    expect(render("website")).not.toContain('href="/l/18-oak-hollow-spring"');
    expect(render("website")).toContain("listing-site-preview");
    expect(render("website")).toContain('data-testid="listing-style-index"');
    expect(render("website")).toContain('data-legacy-style="classic"');
    expect(render("website")).toContain('data-testid="listing-style-premiere"');
    expect(render("website")).toContain('data-legacy-style="editorial"');
    expect(render("website")).toContain('data-testid="listing-style-two-up"');
    expect(render("website")).toContain('data-legacy-style="minimal"');
    expect(render("website")).toContain("listing-style-thumb-index");
    expect(render("website")).toContain("listing-style-preview-stories");
    expect(render("website")).toContain("style-card-thumb-page");
    expect(render("website")).toContain("100cqw / 960px");
    for (const design of ["issue", "premiere", "product-drop", "gallery-wall", "field-guide", "two-up", "golden-hour", "index", "dossier", "stories"]) {
      expect(render("website")).toContain(`data-listing-design="${design}"`);
      expect(render("website")).toContain(`listing-style-${design}`);
    }
    expect(render("website")).toContain("Portal tile");
    expect(render("website")).toContain("portal-tile-skins");
    expect(render("website")).toContain("tile-skin-showcase");
    expect(render("marketing")).toContain("portal-upload-social");
    expect(render("marketing")).toContain("portal-upload-file");
    expect(render("video")).toContain("portal-upload-input-video");
    expect(render("website")).not.toContain("/l/18-oak-hollow-spring");
    expect(render("website")).toContain("The Issue");
    expect(render("website")).toContain("Premiere");
    expect(render("website")).toContain("Product Drop");
    expect(render("website")).toContain("Gallery Wall");
    expect(render("website")).toContain("Field Guide");
    expect(render("website")).toContain("Two-Up");
    expect(render("website")).toContain("Golden Hour");
    expect(render("website")).toContain("Index");
    expect(render("website")).toContain("The Dossier");
    expect(render("website")).toContain("Stories Deck");
    expect(render("website")).toContain("Luxury editorial magazine");
    expect(render("website")).toContain("Swipeable social cards");
    expect(render("website")).not.toContain("not generated");
  });

  it("links View site only after the listing site is published", () => {
    const published = render("website", null, true, false, { ...defaultPortalWebsite(), published: true });
    expect(published).toContain('data-testid="listing-site-view"');
    expect(published).toContain('href="/l/18-oak-hollow-spring"');
    expect(published).toContain(">View site<");
    expect(published).toContain("Published");
    expect(published).not.toContain("listing-site-unpublished");
    expect(published).not.toContain("Not published yet");

    const visitor = render("website", null, false, false, { ...defaultPortalWebsite(), published: true });
    expect(visitor).toContain('href="/l/18-oak-hollow-spring"');
    expect(visitor).not.toContain("Save site style");
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
    expect(website).toContain("Not published yet");
    expect(website).not.toContain('href="/l/18-oak-hollow-spring"');
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
        groupId: "",
        uploadedAt: "",
      }],
      floorplans: [
        { id: "png", kind: "floorplan" as const, name: "level1.png", url: "https://cdn.example/level1.png", contentType: "image/png", hidden: false, order: 0, groupId: "", uploadedAt: "" },
        { id: "pdf", kind: "floorplan" as const, name: "level2.pdf", url: "https://cdn.example/level2.pdf", contentType: "application/pdf", hidden: false, order: 1, groupId: "", uploadedAt: "" },
      ],
      tours: [{
        id: "mp",
        kind: "tour" as const,
        name: "Matterport",
        url: "https://my.matterport.com/show/?m=abc123",
        contentType: "",
        hidden: false,
        order: 0,
        groupId: "",
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
    expect(reel).toContain("var(--iframe-hero)");
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
