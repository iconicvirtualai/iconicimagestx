import { ListingTile } from "@/components/client-home/ClientHomeDashboard";
import type { ClientListingCard } from "@shared/clientHome";
import type { ListingCardLook } from "@shared/listingCard";
import { packagePriceDisplay, packageSkinsInDisplayOrder, type PackageSkinCategory } from "@shared/packageSkins";

const COVERS: Record<ListingCardLook, string> = {
  apprenticeship: "/package-tile-previews/house-cottage.jpg",
  "just-photos": "/package-tile-previews/house-white.jpg",
  essentials: "/package-tile-previews/house-white.jpg",
  showcase: "/package-tile-previews/house-pool.jpg",
  legacy: "/package-tile-previews/house-dusk.jpg",
  "market-leader": "/package-tile-previews/house-estate.jpg",
  refresh: "/package-tile-previews/portrait-man.jpg",
  "content-partner": "/package-tile-previews/team.jpg",
  "local-legend": "/package-tile-previews/portrait.jpg",
  baseline: "/package-tile-previews/desk.jpg",
  "growth-engine": "/package-tile-previews/play.svg",
  "professional-suite": "/package-tile-previews/team.jpg",
  "signature-tier": "/package-tile-previews/portrait.jpg",
  "iconic-partnership": "/package-tile-previews/house-estate.jpg",
  "connected-core": "/package-tile-previews/interior.jpg",
  "authority-stack": "/package-tile-previews/portrait-man.jpg",
};

const AMENITIES: Partial<Record<ListingCardLook, Pick<ClientListingCard, "beds" | "baths" | "garage" | "pool">>> = {
  showcase: { beds: "3", baths: "2", garage: "3", pool: "Y" },
  legacy: { beds: "3", baths: "3", garage: "2", pool: "Y" },
  "market-leader": { beds: "4", baths: "3.5", garage: "3", pool: "Y" },
};

const SECTIONS: { id: PackageSkinCategory; title: string; note: string }[] = [
  {
    id: "listing",
    title: "Listings & Spaces",
    note: "Apprenticeship → Just Photos → Essentials → Showcase → Legacy → Market Leader",
  },
  {
    id: "human-brand",
    title: "The Human Brand",
    note: "Refresh → Content Partner → Local Legend",
  },
  {
    id: "social",
    title: "Social Monopoly",
    note: "Baseline → Growth → Pro Suite → Signature → Iconic · Connected Core · Authority Stack",
  },
];

function sample(look: ListingCardLook): ClientListingCard {
  const skin = packageSkinsInDisplayOrder().find((item) => item.look === look);
  return {
    id: look,
    address: "123 Main Street, Conroe, TX 77304",
    status: "delivered",
    projectType: skin?.category === "listing" ? "real_estate" : "business",
    imageCount: 0,
    coverUrl: COVERS[look],
    createdAt: "2026-01-01T00:00:00.000Z",
    appointmentDate: "2026-01-01",
    href: `/portal/listings/${look}`,
    look,
    street: "123 Main Street",
    locality: "Conroe, TX 77304",
    shootDateLabel: "01.01.2026",
    beds: "",
    baths: "",
    garage: "",
    pool: "",
    ...AMENITIES[look],
  };
}

/** Coordinator review of the sixteen package skins. The client home uses the same ListingTile. */
export default function ListingCardPreview() {
  return (
    <main className="min-h-screen bg-[#e2e8f0] px-6 py-10 text-[#0F172A]" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <div className="mx-auto max-w-[1128px]">
        <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">Iconic project tiles</h1>
        <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-[#64748b]">
          Local Legend blend. Inter only. Charcoal, teal, and slate, with gold on the top tiers.
          Listing address is the same street and city block on every listing tile.
        </p>
        {SECTIONS.map((section) => (
          <section key={section.id} id={section.id} className="mt-12" data-section={section.id}>
            <div className="mb-4 flex items-baseline gap-3.5">
              <h2 className="text-[12px] font-extrabold uppercase tracking-[0.16em]">{section.title}</h2>
              <span className="text-[12px] text-[#64748b]">{section.note}</span>
            </div>
            <div className="grid grid-cols-1 justify-start gap-6 md:grid-cols-2 xl:grid-cols-3">
              {packageSkinsInDisplayOrder(section.id).map((item, index) => (
                <div key={item.look} className="w-full max-w-[360px]">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[#64748b]">
                    {String(index).padStart(2, "0")} · {item.title} · {packagePriceDisplay(item)}
                  </p>
                  <ListingTile listing={sample(item.look)} />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
