import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ListingSite } from "@/components/listing-site/ListingSite";
import { WebsiteBuilder } from "@/components/listing-site/WebsiteBuilder";
import {
  buildListingSiteModel,
  LISTING_SITE_TEMPLATES,
  listingSiteDemoPath,
  listingSiteTemplate,
  type ListingSiteTemplateId,
  type PortalWebsiteSettings,
} from "@shared/listingSite";
import { demoListingInput, demoListingModel, demoListingWebsite } from "@shared/listingSiteDemo";
import { buildPortalListingDetail } from "@shared/portalListingDetail";

const SAMPLE_LISTING = buildPortalListingDetail({
  listing: {
    id: "sample-lantern-oak",
    status: "delivered",
    address: { street: "18 Lantern Oak Pl", city: "The Woodlands", state: "TX", zip: "77380" },
  },
});

export default function ListingSiteDemo({ mode }: { mode: "site" | "builder" }) {
  const [searchParams] = useSearchParams();
  const requested = listingSiteTemplate(searchParams.get("template"))?.id ?? "two-up";
  const chrome = searchParams.get("chrome") !== "0";

  if (mode === "builder") return <DemoBuilder initialTemplate={requested} />;
  return <DemoSite templateId={requested} chrome={chrome} />;
}

function DemoSite({ templateId, chrome }: { templateId: ListingSiteTemplateId; chrome: boolean }) {
  const model = useMemo(() => demoListingModel(templateId), [templateId]);
  return (
    <div>
      {chrome ? (
        <div className="sticky top-0 z-50 bg-black text-white px-4 py-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Sample</span>
          {LISTING_SITE_TEMPLATES.map((template) => (
            <Link key={template.id} to={listingSiteDemoPath(template.id)} className={template.id === templateId ? "underline font-bold" : "text-gray-300"}>
              {template.name}
            </Link>
          ))}
          <Link to="/site/demo/builder" className="ml-auto underline">Open the picker</Link>
        </div>
      ) : null}
      <ListingSite model={model} />
    </div>
  );
}

function DemoBuilder({ initialTemplate }: { initialTemplate: ListingSiteTemplateId }) {
  const [website, setWebsite] = useState<PortalWebsiteSettings>(() => demoListingWebsite(initialTemplate));
  const [note, setNote] = useState("");
  const detail = useMemo(() => {
    const input = demoListingInput(website);
    return {
      ...SAMPLE_LISTING,
      title: input.addressLine,
      address: {
        ...SAMPLE_LISTING.address,
        line1: input.addressLine,
        city: input.city,
        state: input.state,
        zip: input.zip,
      },
      facts: input.facts.map((fact) => ({
        id: fact.id,
        label: fact.label || fact.id,
        value: fact.value,
        empty: false,
      })),
      photos: input.photos.map((photo, index) => ({
        id: photo.id,
        kind: "photo" as const,
        name: photo.name,
        url: photo.url,
        contentType: "image/jpeg",
        hidden: false,
        order: index,
        uploadedAt: "",
        polishedUrl: photo.polishedUrl,
      })),
      videos: input.videos.map((video, index) => ({
        id: video.id,
        kind: "video" as const,
        name: video.name,
        url: video.url,
        contentType: "video/mp4",
        hidden: false,
        order: index,
        uploadedAt: "",
      })),
      tours: input.tours.map((tour, index) => ({
        id: tour.id,
        kind: "tour" as const,
        name: tour.name,
        url: tour.url,
        embedUrl: tour.embedUrl,
        provider: tour.provider,
        contentType: "",
        hidden: false,
        order: index,
        uploadedAt: "",
      })),
      floorplans: input.floorplans.map((plan, index) => ({
        id: plan.id,
        kind: "floorplan" as const,
        name: plan.name,
        url: plan.url,
        contentType: "image/svg+xml",
        hidden: false,
        order: index,
        uploadedAt: "",
      })),
      website,
    };
  }, [website]);
  const model = buildListingSiteModel(demoListingInput(website));

  return (
    <div className="min-h-screen bg-[#f6f7f8] text-black">
      <header className="bg-black text-white">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500">Sample · not a live listing</p>
          <h1 className="text-3xl font-black mt-2">Pick a listing site</h1>
          <p className="text-gray-400 text-sm mt-2 max-w-xl">Choose a template, then decide which sections and which photo versions to show. This sample never writes a client listing and never sends email.</p>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-8">
        <WebsiteBuilder
          detail={detail}
          website={website}
          canEdit
          saving={false}
          onWebsite={setWebsite}
          onSave={() => setNote("Kept in this browser only. No listing was updated and nothing was emailed.")}
          saveLabel="Save listing site"
          siteHref={`${listingSiteDemoPath(model.template.id)}&chrome=0`}
          siteLabel={`Open ${model.template.name} full screen`}
        />
        {note ? <p className="mt-4 text-sm font-bold" role="status">{note}</p> : null}
      </main>
    </div>
  );
}
