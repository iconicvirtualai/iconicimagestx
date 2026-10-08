import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { PortalListingDetail, PortalMediaItem } from "@shared/portalListingDetail";
import {
  LISTING_SITE_TEMPLATES,
  buildListingSiteModel,
  listingSiteInputFromDetail,
  listingSitePublicPath,
  listingSiteTemplate,
  middleSectionOrder,
  moveMiddleSection,
  usableMediaUrl,
  type ListingSiteSectionId,
  type PhotoVersion,
  type PortalWebsiteSettings,
} from "@shared/listingSite";
import { ListingSite } from "./ListingSite";

const SECTION_TOGGLES: Array<{ id: ListingSiteSectionId; key: "showHero" | "showPhotos" | "showVideo" | "showTours" | "showFloorplans" | "showLead" | "showAgent"; label: string }> = [
  { id: "hero", key: "showHero", label: "Hero photo or video" },
  { id: "collage", key: "showPhotos", label: "Delivery collage" },
  { id: "video", key: "showVideo", label: "Video" },
  { id: "matterport", key: "showTours", label: "Matterport 3D" },
  { id: "floorplan", key: "showFloorplans", label: "Floorplan" },
  { id: "lead", key: "showLead", label: "Lead capture" },
  { id: "agent", key: "showAgent", label: "Agent branding" },
];

const SECTION_NAMES: Record<ListingSiteSectionId, string> = {
  hero: "Hero",
  collage: "Collage",
  video: "Video",
  matterport: "Matterport",
  floorplan: "Floorplan",
  lead: "Lead capture",
  agent: "Agent",
};

export function WebsiteBuilder({
  detail,
  website,
  canEdit,
  saving,
  onWebsite,
  onSave,
  saveLabel = "Save listing site",
  siteHref,
  siteLabel = "Open the public site",
}: {
  detail: PortalListingDetail;
  website: PortalWebsiteSettings;
  canEdit: boolean;
  saving: boolean;
  onWebsite: (next: PortalWebsiteSettings) => void;
  onSave: () => void;
  saveLabel?: string;
  siteHref?: string;
  siteLabel?: string;
}) {
  const template = listingSiteTemplate(website.templateId) ?? LISTING_SITE_TEMPLATES[0];
  const visible = detail.photos.filter((photo) => !photo.hidden && usableMediaUrl(photo.url));
  const hiddenCount = detail.photos.filter((photo) => photo.hidden).length;
  const replacements = useMemo(() => {
    const map: Record<string, string> = {};
    for (const request of detail.photoEditRequests ?? []) {
      const url = request.replacement?.url;
      if (url && !map[request.photoId]) map[request.photoId] = url;
    }
    return map;
  }, [detail.photoEditRequests]);
  const model = useMemo(
    () => buildListingSiteModel(listingSiteInputFromDetail(detail, website)),
    [detail, website],
  );
  const heroIds = website.heroPhotoIds.filter((id) => visible.some((photo) => photo.id === id));
  const heroSelected = heroIds.length ? heroIds : visible[0] ? [visible[0].id] : [];
  const collageIds = website.collagePhotoIds.filter((id) => visible.some((photo) => photo.id === id));
  const collageSelected = !website.showPhotos ? [] : collageIds.length ? collageIds : visible.map((photo) => photo.id);

  function setHero(next: string[]) {
    onWebsite({ ...website, heroPhotoIds: next });
  }

  function setCollage(next: string[]) {
    if (!next.length) {
      onWebsite({ ...website, showPhotos: false, collagePhotoIds: [] });
      return;
    }
    const sameAsFile = next.length === visible.length && next.every((id, index) => id === visible[index]?.id);
    onWebsite({ ...website, showPhotos: true, collagePhotoIds: sameAsFile ? [] : next });
  }

  function toggleListed(selected: string[], id: string, on: boolean, apply: (next: string[]) => void) {
    if (on) {
      apply(selected.includes(id) ? selected : [...selected, id]);
      return;
    }
    apply(selected.filter((item) => item !== id));
  }

  function setVersion(id: string, version: PhotoVersion) {
    onWebsite({ ...website, photoVersions: { ...website.photoVersions, [id]: version } });
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-5" data-testid="website-builder">
      <h2 className="text-xs font-black uppercase tracking-widest text-[#0d9488] mb-1">Listing site</h2>
      <p className="text-xs text-gray-500 mb-5">
        Pick a template. Turn sections on or off, choose which photos and which version of each photo to show, then set the headline and agent details.
      </p>

      <div className="grid sm:grid-cols-3 gap-3" data-testid="template-picker">
        {LISTING_SITE_TEMPLATES.map((item) => {
          const selected = item.id === template.id;
          const body = (
            <>
              <img src={item.thumbnail} alt="" className="w-full aspect-[4/5] object-cover rounded-xl bg-[#f2efea]" />
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-3">{item.number} · {item.vibe}</p>
              <p className="font-black mt-1">{item.name}</p>
              <p className="text-xs text-gray-500 mt-1">{item.summary}</p>
            </>
          );
          if (!canEdit) {
            return selected ? (
              <article key={item.id} className="rounded-2xl border-2 border-[#0d9488] p-3 text-left" data-testid={`template-card-${item.id}`}>
                {body}
              </article>
            ) : null;
          }
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={selected}
              data-testid={`template-card-${item.id}`}
              onClick={() => onWebsite({ ...website, templateId: item.id })}
              className={`rounded-2xl border p-3 text-left ${selected ? "border-[#0d9488] ring-2 ring-[#0d9488]" : "border-gray-200"}`}
            >
              {body}
            </button>
          );
        })}
      </div>

      {canEdit ? (
        <div className="mt-6 grid gap-4">
          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Headline</span>
            <input value={website.headline} onChange={(event) => onWebsite({ ...website, headline: event.target.value })} className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold" placeholder={detail.address.line1 || detail.title} />
          </label>
          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Tagline</span>
            <textarea value={website.tagline} onChange={(event) => onWebsite({ ...website, tagline: event.target.value })} rows={3} className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
          </label>
          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Price</span>
            <input value={website.price} onChange={(event) => onWebsite({ ...website, price: event.target.value })} className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold" placeholder="$1,185,000" />
          </label>
        </div>
      ) : (
        <div className="mt-6 grid sm:grid-cols-3 gap-4">
          <Field label="Template" value={template.name} />
          <Field label="Headline" value={website.headline || detail.title} />
          <Field label="Price" value={website.price || "Not set"} />
        </div>
      )}

      <div className="mt-6">
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Sections</p>
        <p className="text-xs text-gray-500 mt-1">
          {template.allowsSectionReorder
            ? "Hero stays first. Lead capture and agent branding stay last. The middle sections can move."
            : `${template.name} keeps a fixed story order. A section with no media, or one you turn off, drops out.`}
        </p>
        <p className="text-xs text-gray-600 mt-2">Showing: {model.sections.map((id) => SECTION_NAMES[id]).join(" · ") || "Nothing to show yet"}</p>
        <div className="mt-3 grid sm:grid-cols-2 gap-3">
          {SECTION_TOGGLES.map((item) => (
            canEdit ? (
              <label key={item.id} className="flex items-center justify-between gap-3 bg-gray-50 rounded-xl px-3 py-3">
                <span className="text-sm font-bold">{item.label}</span>
                <input
                  type="checkbox"
                  data-testid={`section-toggle-${item.id}`}
                  checked={website[item.key]}
                  onChange={(event) => onWebsite({ ...website, [item.key]: event.target.checked })}
                />
              </label>
            ) : (
              <Field key={item.id} label={item.label} value={website[item.key] ? "Shown" : "Hidden"} />
            )
          ))}
        </div>
        {canEdit && template.allowsSectionReorder ? (
          <ol className="mt-3 grid gap-2">
            {middleSectionOrder(website).map((id, index, order) => (
              <li key={id} className="flex items-center justify-between gap-3 bg-gray-50 rounded-xl px-3 py-2">
                <span className="text-sm font-bold">{index + 2}. {SECTION_NAMES[id]}</span>
                <span className="flex gap-2">
                  <button type="button" className="text-xs font-bold underline disabled:opacity-30" disabled={index === 0} onClick={() => onWebsite({ ...website, sectionOrder: moveMiddleSection(order, id, -1) })}>Earlier</button>
                  <button type="button" className="text-xs font-bold underline disabled:opacity-30" disabled={index === order.length - 1} onClick={() => onWebsite({ ...website, sectionOrder: moveMiddleSection(order, id, 1) })}>Later</button>
                </span>
              </li>
            ))}
          </ol>
        ) : null}
      </div>

      <div className="mt-6">
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Photos</p>
        <p className="text-xs text-gray-500 mt-1">The first hero photo leads the page. Collage order is the order you set here. Iconic Polish is the grass-replacement version when one exists.</p>
        {hiddenCount > 0 ? <p className="text-xs text-gray-500 mt-1">Hidden photos stay off the site. Unhide them on the Photos tab.</p> : null}
        {visible.length === 0 ? <p className="text-sm text-gray-500 mt-3">No photos on this listing yet.</p> : (
          <ul className="mt-3 grid gap-3">
            {visible.map((photo) => {
              const polish = polishUrl(photo, replacements);
              const version = website.photoVersions[photo.id] === "original" || !polish ? "original" : (website.photoVersions[photo.id] ?? "polished");
              const inHero = heroSelected.includes(photo.id);
              const inCollage = collageSelected.includes(photo.id);
              return (
                <li key={photo.id} className="flex gap-3 bg-gray-50 rounded-xl p-3">
                  <img src={version === "polished" && polish ? polish : photo.url} alt="" className="w-16 h-16 object-cover rounded-lg bg-gray-200" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold truncate">{photo.name}</p>
                    {canEdit ? (
                      <div className="mt-2 flex flex-wrap gap-3 text-xs font-bold">
                        <label className="inline-flex items-center gap-1">
                          <input type="checkbox" checked={inHero} onChange={(event) => toggleListed(heroSelected, photo.id, event.target.checked, setHero)} />
                          Hero
                        </label>
                        <label className="inline-flex items-center gap-1">
                          <input type="checkbox" checked={inCollage} onChange={(event) => toggleListed(collageSelected, photo.id, event.target.checked, setCollage)} />
                          Collage
                        </label>
                        {inHero ? <OrderButtons onEarlier={() => setHero(moveId(heroSelected, photo.id, -1))} onLater={() => setHero(moveId(heroSelected, photo.id, 1))} /> : null}
                        {inCollage ? <OrderButtons onEarlier={() => setCollage(moveId(collageSelected, photo.id, -1))} onLater={() => setCollage(moveId(collageSelected, photo.id, 1))} /> : null}
                        {polish ? (
                          <span className="inline-flex gap-1" role="group" aria-label={`Version for ${photo.name}`}>
                            <button type="button" data-testid={`photo-version-${photo.id}-original`} aria-pressed={version === "original"} className={version === "original" ? "underline" : ""} onClick={() => setVersion(photo.id, "original")}>Original</button>
                            <button type="button" data-testid={`photo-version-${photo.id}-polished`} aria-pressed={version === "polished"} className={version === "polished" ? "underline" : ""} onClick={() => setVersion(photo.id, "polished")}>Iconic Polish</button>
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500 mt-1">{inHero ? "Hero" : "Not in the hero"} · {inCollage ? "Collage" : "Not in the collage"}{polish ? ` · ${version === "polished" ? "Iconic Polish" : "Original"}` : ""}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-6">
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Agent</p>
        {canEdit ? (
          <div className="mt-3 grid sm:grid-cols-2 gap-3">
            <AgentField label="Name" value={website.agent.name} onChange={(name) => onWebsite({ ...website, agent: { ...website.agent, name } })} />
            <AgentField label="Brokerage" value={website.agent.brokerage} onChange={(brokerage) => onWebsite({ ...website, agent: { ...website.agent, brokerage } })} />
            <AgentField label="TX license number" value={website.agent.license} onChange={(license) => onWebsite({ ...website, agent: { ...website.agent, license } })} />
            <AgentField label="Phone" value={website.agent.phone} onChange={(phone) => onWebsite({ ...website, agent: { ...website.agent, phone } })} />
            <AgentField label="Email" value={website.agent.email} onChange={(email) => onWebsite({ ...website, agent: { ...website.agent, email } })} />
            <AgentField label="Office" value={website.agent.office} onChange={(office) => onWebsite({ ...website, agent: { ...website.agent, office } })} />
            <AgentField label="Headshot URL" value={website.agent.headshotUrl} onChange={(headshotUrl) => onWebsite({ ...website, agent: { ...website.agent, headshotUrl } })} />
          </div>
        ) : (
          <div className="mt-3 grid sm:grid-cols-2 gap-3">
            <Field label="Name" value={website.agent.name || "Not set"} />
            <Field label="TX license number" value={website.agent.license || "Not on file"} />
          </div>
        )}
        <p className="text-xs text-gray-500 mt-3">TREC brokerage and consumer notices, the Equal Housing mark, and the Iconic Images credit stay on every template.</p>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        {canEdit ? (
          <Button type="button" className="bg-black text-white" disabled={saving} onClick={onSave}>{saving ? "Saving…" : saveLabel}</Button>
        ) : null}
        <Link to={siteHref || listingSitePublicPath(detail.id)} className="text-sm font-bold underline">{siteLabel}</Link>
        <Link to="/site/demo" className="text-sm font-bold underline">See the sample templates</Link>
      </div>

      {canEdit ? (
        <details className="mt-6">
          <summary className="text-sm font-bold cursor-pointer">Preview on this page</summary>
          <div className="mt-3 overflow-hidden rounded-2xl border border-gray-100">
            <ListingSite model={model} />
          </div>
        </details>
      ) : null}
    </section>
  );
}

function polishUrl(photo: PortalMediaItem, replacements: Record<string, string>): string {
  return usableMediaUrl(photo.polishedUrl) || usableMediaUrl(replacements[photo.id]);
}

function moveId(ids: string[], id: string, direction: -1 | 1): string[] {
  const index = ids.indexOf(id);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= ids.length) return ids;
  const copy = ids.slice();
  const [item] = copy.splice(index, 1);
  copy.splice(next, 0, item);
  return copy;
}

function OrderButtons({ onEarlier, onLater }: { onEarlier: () => void; onLater: () => void }) {
  return (
    <span className="inline-flex gap-2">
      <button type="button" className="underline" onClick={onEarlier}>Earlier</button>
      <button type="button" className="underline" onClick={onLater}>Later</button>
    </span>
  );
}

function AgentField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold" />
    </label>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</p>
      <p className="font-bold mt-1">{value}</p>
    </div>
  );
}
