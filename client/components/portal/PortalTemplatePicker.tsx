import { useState } from "react";
import { ListingPackageCard } from "@/components/listing-card/ListingPackageCard";
import { ListingSiteView } from "@/pages/ListingSite";
import type { ClientListingCard } from "@shared/clientHome";
import { clientListingPath } from "@shared/clientHome";
import type { ListingCardLook } from "@shared/listingCard";
import { packageSkinsInDisplayOrder } from "@shared/packageSkins";
import { listingSitePath, listingSiteSlug, type PublicListingSite } from "@shared/listingSite";
import type { PortalListingDetail, PortalWebsiteSettings } from "@shared/portalListingDetail";

/** The only listing-site style set in the product: classic, editorial, minimal. */
const SITE_STYLES: Array<{
  id: PortalWebsiteSettings["style"];
  name: string;
  note: string;
  design: PortalWebsiteSettings["design"];
  font: PortalWebsiteSettings["font"];
  color: PortalWebsiteSettings["color"];
}> = [
  { id: "classic", name: "Classic", note: "Numbered index", design: "index", font: "sans", color: "ink" },
  { id: "editorial", name: "Editorial", note: "Film-first serif", design: "premiere", font: "serif", color: "ink" },
  { id: "minimal", name: "Minimal", note: "Open two-up", design: "two-up", font: "modern", color: "teal" },
];

export function PortalTemplatePicker({
  detail,
  website,
  canEdit,
  saving,
  onWebsite,
  onSave,
}: {
  detail: PortalListingDetail;
  website: PortalWebsiteSettings;
  canEdit: boolean;
  saving: boolean;
  onWebsite: (next: PortalWebsiteSettings) => void;
  onSave: () => void;
}) {
  const slug = listingSiteSlug({ line1: detail.address.line1, city: detail.address.city });
  const [fullPreview, setFullPreview] = useState(false);
  const preview = previewSite(detail, website);

  return (
    <section className="space-y-6" data-testid="portal-templates">
      <div className="rounded-2xl border border-gray-100 bg-white p-5">
        <h2 className="text-xs font-black uppercase tracking-widest text-[#0d9488]">Listing site styles</h2>
        <p className="mt-1 text-xs text-gray-500">
          Classic, Editorial, and Minimal. Each card is that style on this listing’s photos. Pick one, open the full preview, then save.
        </p>
        {slug ? (
          <a href={listingSitePath(slug)} className="mt-3 inline-flex min-h-12 items-center text-sm font-black underline">View site</a>
        ) : (
          <p className="mt-3 text-xs text-gray-500">Add a street and city on the Data tab to open the public site. The preview below still works.</p>
        )}
        <p className="mt-2 text-xs text-gray-500">{styleLabel(website.style)} · {fontLabel(website.font)} · {website.published ? "Published" : "Not published yet. Preview stays on this page until you publish."}</p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {SITE_STYLES.map((style) => {
            const selected = website.style === style.id && website.design === style.design;
            const preset = { ...website, design: style.design, font: style.font, color: style.color, style: style.id };
            return (
              <div
                key={style.id}
                className={`min-w-0 overflow-hidden rounded-2xl border bg-white ${selected ? "border-black" : "border-gray-200"}`}
                data-testid={`listing-style-${style.id}`}
              >
                <div className="h-44 overflow-hidden bg-gray-50" aria-hidden="true">
                  <div className="pointer-events-none">
                    <ListingSiteView inquiry={false} site={previewSite(detail, preset)} />
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!canEdit}
                  aria-pressed={selected}
                  data-testid={`listing-style-pick-${style.id}`}
                  onClick={() => onWebsite(preset)}
                  className="block min-h-11 w-full px-3 py-3 text-left"
                >
                  <span className="block text-sm font-black">{style.name}</span>
                  <span className="block text-xs text-gray-500">{style.note}</span>
                </button>
              </div>
            );
          })}
        </div>
        <div className="mt-4 overflow-hidden rounded-2xl border border-gray-100" data-testid="listing-site-preview">
          <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
            <p className="text-xs font-black uppercase tracking-widest text-gray-500">Preview</p>
            <button type="button" className="min-h-11 text-xs font-black uppercase tracking-widest text-[#0d9488]" onClick={() => setFullPreview(true)}>
              Open full preview
            </button>
          </div>
          <div className="max-h-[70vh] min-w-0 overflow-auto">
            <ListingSiteView inquiry={false} site={preview} />
          </div>
        </div>
      </div>

      {canEdit && (
        <details className="rounded-2xl border border-gray-100 bg-white p-5" data-testid="portal-tile-skins">
          <summary className="cursor-pointer text-xs font-black uppercase tracking-widest text-gray-400">Portal tile</summary>
          <p className="mt-3 text-xs text-gray-500">Optional. This only changes the project tile in the portal, not the public listing site.</p>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            {packageSkinsInDisplayOrder().map((skin) => {
              const selected = website.tileLook === skin.look;
              return (
                <div key={skin.look} className={`min-w-0 rounded-[20px] p-2 ${selected ? "ring-2 ring-black" : ""}`} data-testid={`tile-skin-${skin.look}`}>
                  <div className="pointer-events-none">
                    <ListingPackageCard listing={skinCard(detail, skin.look)} />
                  </div>
                  <button
                    type="button"
                    aria-pressed={selected}
                    className="mt-2 min-h-11 w-full rounded-xl bg-black text-xs font-black uppercase tracking-widest text-white"
                    onClick={() => onWebsite({ ...website, tileLook: skin.look })}
                  >
                    {selected ? "Selected" : `Use ${skin.skinLabel}`}
                  </button>
                </div>
              );
            })}
          </div>
        </details>
      )}

      {canEdit && (
        <div className="rounded-2xl border border-gray-100 bg-white p-5">
          <p className="text-xs font-black uppercase tracking-widest text-gray-400">Site options</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Toggle label="Publish site" checked={website.published} onChange={(published) => onWebsite({ ...website, published })} />
            <Toggle label="Show photos" checked={website.showPhotos} onChange={(showPhotos) => onWebsite({ ...website, showPhotos })} />
            <Toggle label="Show video" checked={website.showVideo} onChange={(showVideo) => onWebsite({ ...website, showVideo })} />
            <Toggle label="Show virtual tours" checked={website.showTours} onChange={(showTours) => onWebsite({ ...website, showTours })} />
            <Toggle label="Show floorplans" checked={website.showFloorplans} onChange={(showFloorplans) => onWebsite({ ...website, showFloorplans })} />
          </div>
          <button type="button" className="mt-6 min-h-11 rounded-xl bg-black px-4 text-sm font-black text-white disabled:opacity-60" disabled={saving} onClick={onSave}>
            Save site style
          </button>
        </div>
      )}

      {fullPreview && (
        <div className="fixed inset-0 z-50 overflow-auto bg-white" data-testid="listing-site-full-preview">
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3">
            <p className="text-xs font-black uppercase tracking-widest">Listing site preview</p>
            <button type="button" className="min-h-11 rounded-xl bg-black px-4 text-xs font-black uppercase tracking-widest text-white" onClick={() => setFullPreview(false)}>
              Close preview
            </button>
          </div>
          <ListingSiteView inquiry={false} site={preview} />
        </div>
      )}
    </section>
  );
}

function previewSite(detail: PortalListingDetail, website: PortalWebsiteSettings): PublicListingSite {
  const photos = website.showPhotos ? detail.photos.filter((item) => !item.hidden).map((item) => ({ name: item.name, url: item.url })) : [];
  const floor = website.showFloorplans ? detail.floorplans.find((item) => !item.hidden) : null;
  const tour = website.showTours ? detail.tours.find((item) => !item.hidden && item.embedUrl) : null;
  return {
    slug: listingSiteSlug({ line1: detail.address.line1, city: detail.address.city }) || "preview",
    design: website.design,
    font: website.font,
    color: website.color,
    style: website.style,
    address: detail.address.formatted || detail.title || "Listing",
    street: detail.address.line1 || detail.title || "Listing",
    city: detail.address.city,
    price: "",
    facts: detail.facts.filter((fact) => !fact.empty).slice(0, 6).map((fact) => ({ label: fact.label, value: fact.value })),
    photos,
    filmPosterUrl: website.showVideo ? photos[0]?.url || "" : "",
    tourEmbedUrl: tour?.embedUrl || "",
    floorplan: floor ? { name: floor.name, url: floor.url } : null,
    agent: { name: "", brokerage: "", license: "", phone: "", email: "" },
  };
}

function skinCard(detail: PortalListingDetail, look: ListingCardLook): ClientListingCard {
  const beds = detail.facts.find((fact) => fact.id === "beds");
  const baths = detail.facts.find((fact) => fact.id === "baths");
  const pool = detail.facts.find((fact) => fact.id === "pool");
  return {
    id: detail.id || look,
    address: detail.address.formatted || "Listing",
    status: detail.status || "delivered",
    projectType: "real_estate",
    imageCount: detail.photos.length,
    coverUrl: detail.photos.find((item) => !item.hidden)?.url || "",
    createdAt: "",
    appointmentDate: null,
    href: clientListingPath(detail.id || look),
    look,
    street: detail.address.line1 || detail.address.formatted || "Listing",
    locality: [detail.address.city, detail.address.state, detail.address.zip].filter(Boolean).join(", "),
    shootDateLabel: "",
    beds: beds && !beds.empty ? beds.value : "",
    baths: baths && !baths.empty ? baths.value : "",
    garage: "",
    pool: pool && !pool.empty ? pool.value : "",
  };
}

function styleLabel(style: PortalWebsiteSettings["style"]): string {
  if (style === "editorial") return "Editorial";
  if (style === "minimal") return "Minimal";
  return "Classic";
}

function fontLabel(font: PortalWebsiteSettings["font"]): string {
  if (font === "serif") return "Serif";
  if (font === "modern") return "Modern";
  return "Sans";
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-3">
      <span className="text-sm font-bold">{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}
