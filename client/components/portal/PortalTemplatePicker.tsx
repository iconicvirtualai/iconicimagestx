import { useState } from "react";
import { ListingSiteView } from "@/pages/ListingSite";
import { LISTING_SITE_TEMPLATES, listingSitePath, listingSiteSlug, type ListingSiteDesign, type PublicListingSite } from "@shared/listingSite";
import { listingSiteActionState, type PortalListingDetail, type PortalWebsiteSettings } from "@shared/portalListingDetail";

export function PortalTemplatePicker({
  detail,
  website,
  savedWebsite,
  canEdit,
  saving,
  onWebsite,
  onSave,
}: {
  detail: PortalListingDetail;
  website: PortalWebsiteSettings;
  savedWebsite?: PortalWebsiteSettings;
  canEdit: boolean;
  saving: boolean;
  onWebsite: (next: PortalWebsiteSettings) => void;
  onSave: (next: PortalWebsiteSettings) => void;
}) {
  const slug = listingSiteSlug({ line1: detail.address.line1, city: detail.address.city });
  const saved = savedWebsite ?? website;
  const [fullPreview, setFullPreview] = useState<ListingSiteDesign | null>(null);
  const preview = previewSite(detail, website);
  const current = LISTING_SITE_TEMPLATES.find((item) => item.id === website.design) || LISTING_SITE_TEMPLATES.find((item) => item.id === "index")!;

  return (
    <section className="space-y-6" data-testid="portal-templates">
      {canEdit && (
        <ListingSiteActionBar
          website={website}
          saved={saved}
          slug={slug}
          saving={saving}
          onCommit={onSave}
        />
      )}
      <div className="rounded-2xl border border-gray-100 bg-white p-5">
        <h2 className="text-xs font-black uppercase tracking-widest text-[#0d9488]">Listing site styles</h2>
        <p className="mt-1 text-xs text-gray-500">
          Ten listing sites. Each card is that design on this listing’s photos.
          {canEdit ? " Pick one, then Select, Save style, or Publish at the top right." : ""}
        </p>
        {slug && website.published ? (
          <a href={listingSitePath(slug)} className="mt-3 inline-flex min-h-12 items-center text-sm font-black underline" data-testid="listing-site-view">View site</a>
        ) : slug ? (
          <p className="mt-3 flex min-h-12 items-center text-sm font-black text-gray-400" data-testid="listing-site-unpublished">Not published yet</p>
        ) : (
          <p className="mt-3 text-xs text-gray-500">Add a street and city on the Data tab to open the public site. The preview below still works.</p>
        )}
        <p className="mt-2 text-xs text-gray-500">{current.name} · {fontLabel(website.font)} · {website.published ? "Published" : "Preview stays on this page until you publish."}</p>
        <style>{STYLE_CARD_THUMB_CSS}</style>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {LISTING_SITE_TEMPLATES.map((template) => {
            const selected = website.design === template.id;
            const preset = { ...website, design: template.id, font: template.font, color: template.color, style: template.style };
            return (
              <div
                key={template.id}
                className={`min-w-0 overflow-hidden rounded-2xl border bg-white ${selected ? "border-black" : "border-gray-200"}`}
                data-testid={`listing-style-${template.id}`}
                data-legacy-style={template.style}
              >
                <div
                  className="style-card-thumb"
                  style={{ background: THUMB_BG[template.id] }}
                  aria-hidden="true"
                  ref={markThumbInert}
                  data-testid={`listing-style-thumb-${template.id}`}
                >
                  <div className="style-card-thumb-scale">
                    <div className="style-card-thumb-page">
                      <ListingSiteView inquiry={false} site={previewSite(detail, preset)} />
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!canEdit}
                  aria-pressed={selected}
                  data-testid={`listing-style-pick-${template.id}`}
                  onClick={() => onWebsite(preset)}
                  className="block min-h-11 w-full px-3 py-3 text-left"
                >
                  <span className="block text-sm font-black">{template.name}</span>
                  <span className="block text-xs text-gray-500">{template.vibe}</span>
                </button>
                <button
                  type="button"
                  className="block min-h-11 w-full border-t border-gray-100 px-3 text-left text-xs font-black uppercase tracking-widest text-[#0d9488]"
                  data-testid={`listing-style-preview-${template.id}`}
                  onClick={() => setFullPreview(template.id)}
                >
                  Open full preview
                </button>
              </div>
            );
          })}
        </div>
        <div className="mt-4 overflow-hidden rounded-2xl border border-gray-100" data-testid="listing-site-preview">
          <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
            <p className="text-xs font-black uppercase tracking-widest text-gray-500">Preview</p>
            <button type="button" className="min-h-11 text-xs font-black uppercase tracking-widest text-[#0d9488]" onClick={() => setFullPreview(website.design)}>
              Open full preview
            </button>
          </div>
          <div className="max-h-[70vh] min-w-0 overflow-auto">
            <ListingSiteView inquiry={false} site={preview} />
          </div>
        </div>
      </div>

      {canEdit && (
        <div className="rounded-2xl border border-gray-100 bg-white p-5">
          <p className="text-xs font-black uppercase tracking-widest text-gray-400">Site options</p>
          <p className="mt-2 text-xs text-gray-500">Show or hide sections, then save them with the buttons at the top right.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Toggle label="Show photos" checked={website.showPhotos} onChange={(showPhotos) => onWebsite({ ...website, showPhotos })} />
            <Toggle label="Show video" checked={website.showVideo} onChange={(showVideo) => onWebsite({ ...website, showVideo })} />
            <Toggle label="Show virtual tours" checked={website.showTours} onChange={(showTours) => onWebsite({ ...website, showTours })} />
            <Toggle label="Show floorplans" checked={website.showFloorplans} onChange={(showFloorplans) => onWebsite({ ...website, showFloorplans })} />
          </div>
        </div>
      )}

      {fullPreview && (
        <div className="fixed inset-0 z-50 overflow-auto bg-white" data-testid="listing-site-full-preview" data-preview-design={fullPreview}>
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3">
            <p className="text-xs font-black uppercase tracking-widest">
              {LISTING_SITE_TEMPLATES.find((item) => item.id === fullPreview)?.name || "Listing site"} preview
            </p>
            <button type="button" className="min-h-11 rounded-xl bg-black px-4 text-xs font-black uppercase tracking-widest text-white" onClick={() => setFullPreview(null)}>
              Close preview
            </button>
          </div>
          <ListingSiteView inquiry={false} site={previewSite(detail, presetFor(website, fullPreview))} />
        </div>
      )}
    </section>
  );
}

const primaryAction = "inline-flex min-h-11 items-center justify-center rounded-xl bg-black px-4 text-[11px] font-black uppercase tracking-widest text-white disabled:opacity-60";
const quietAction = "inline-flex min-h-11 items-center justify-center rounded-xl border border-black/15 bg-white px-3 text-[11px] font-black uppercase tracking-widest text-black disabled:opacity-60";

function ListingSiteActionBar({
  website,
  saved,
  slug,
  saving,
  onCommit,
}: {
  website: PortalWebsiteSettings;
  saved: PortalWebsiteSettings;
  slug: string;
  saving: boolean;
  onCommit: (next: PortalWebsiteSettings) => void;
}) {
  const state = listingSiteActionState(saved, website);
  const view = slug ? listingSitePath(slug) : "";
  return (
    <div
      className="fixed right-3 top-3 z-40 flex max-w-[calc(100vw-1.5rem)] flex-wrap items-center justify-end gap-1.5 rounded-2xl border border-black/10 bg-white p-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.18)] sm:right-5 sm:top-5"
      data-testid="listing-site-publish-bar"
      data-listing-action={state.mode}
      role="region"
      aria-label="Listing site actions"
    >
      {state.mode === "live" && (
        <>
          <p className="px-2 text-[11px] font-black uppercase tracking-widest text-[#0d9488]" data-testid="listing-site-published-state">Published</p>
          {view ? (
            <a href={view} className="inline-flex min-h-11 items-center rounded-xl px-3 text-[11px] font-black uppercase tracking-widest text-black" data-testid="listing-site-view-action">View site</a>
          ) : null}
          <button type="button" className={quietAction} disabled={saving} data-testid="listing-site-unpublish" onClick={() => onCommit({ ...website, published: false })}>
            Unpublish
          </button>
        </>
      )}
      {state.mode === "update" && (
        <>
          {view ? (
            <a href={view} className="inline-flex min-h-11 items-center rounded-xl px-3 text-[11px] font-black uppercase tracking-widest text-black" data-testid="listing-site-view-action">View site</a>
          ) : null}
          <button type="button" className={primaryAction} disabled={saving} data-testid="listing-site-update" onClick={() => onCommit({ ...website, published: true })}>
            Update
          </button>
        </>
      )}
      {state.mode === "choose" && (
        <>
          <button
            type="button"
            className={quietAction}
            disabled={saving}
            data-testid="listing-site-save-style"
            onClick={() => onCommit({ ...website, published: saved.published })}
          >
            {state.saveLabel}
          </button>
          <button
            type="button"
            className={primaryAction}
            disabled={saving}
            data-testid="listing-site-publish"
            onClick={() => onCommit({ ...website, published: true })}
          >
            Publish
          </button>
        </>
      )}
    </div>
  );
}

function presetFor(website: PortalWebsiteSettings, design: ListingSiteDesign): PortalWebsiteSettings {
  if (website.design === design) return website;
  const template = LISTING_SITE_TEMPLATES.find((item) => item.id === design);
  if (!template) return { ...website, design };
  return { ...website, design, font: template.font, color: template.color, style: template.style };
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

function markThumbInert(node: HTMLDivElement | null) {
  node?.setAttribute("inert", "");
}

/** Page-sized sample scaled into the card so header, title, photos, and type all show. */
const THUMB_PAGE_WIDTH = 960;
const THUMB_PAGE_HEIGHT = 1000;

const THUMB_BG: Record<ListingSiteDesign, string> = {
  issue: "#F4F0E8",
  premiere: "#0B0B0C",
  "product-drop": "#FFFFFF",
  "gallery-wall": "#FAFAF7",
  "field-guide": "#EFE8D8",
  "two-up": "#F2EFEA",
  "golden-hour": "#F6EBDD",
  index: "#F7F7F5",
  dossier: "#1A1C1E",
  stories: "#F5F3EF",
};

const STYLE_CARD_THUMB_CSS = `
.style-card-thumb{
  container-type:inline-size;
  overflow:hidden;
  --iframe-hero:560px;
  --iframe-hero-max:560px;
}
.style-card-thumb-scale{
  height:calc(100cqw * ${THUMB_PAGE_HEIGHT} / ${THUMB_PAGE_WIDTH});
  overflow:hidden;
}
.style-card-thumb-page{
  width:${THUMB_PAGE_WIDTH}px;
  height:${THUMB_PAGE_HEIGHT}px;
  overflow:hidden;
  transform-origin:top left;
  transform:scale(calc(100cqw / ${THUMB_PAGE_WIDTH}px));
  pointer-events:none;
}
.style-card-thumb .ls-index,
.style-card-thumb .ls-two,
.style-card-thumb .ls-premiere,
.style-card-thumb .ls-issue,
.style-card-thumb .ls-drop,
.style-card-thumb .ls-gallery,
.style-card-thumb .ls-field,
.style-card-thumb .ls-gold,
.style-card-thumb .ls-dossier,
.style-card-thumb .ls-stories{min-height:0}
.style-card-thumb .ls-index-hero h1,
.style-card-thumb .ls-story h1,
.style-card-thumb .ls-premiere .ls-letterbox h1,
.style-card-thumb .ls-issue h1,
.style-card-thumb .ls-drop h1,
.style-card-thumb .ls-field h1,
.style-card-thumb .ls-gold h1,
.style-card-thumb .ls-dossier h1,
.style-card-thumb .ls-stories h1{
  line-height:1;
  overflow-wrap:anywhere;
  display:-webkit-box;
  -webkit-box-orient:vertical;
  -webkit-line-clamp:4;
  overflow:hidden;
}
`;

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
