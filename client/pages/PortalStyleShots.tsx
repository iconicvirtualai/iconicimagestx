import { ListingSiteView } from "@/pages/ListingSite";
import { LISTING_SITE_TEMPLATES, type PublicListingSite } from "@shared/listingSite";

const PHOTOS = [
  "/media/portal-v2/deliver-hero.jpg",
  "/media/portal-v2/deliver-living.jpg",
  "/media/portal-v2/deliver-kitchen.jpg",
  "/media/portal-v2/deliver-dining.jpg",
  "/media/portal-v2/deliver-bedroom.jpg",
  "/media/portal-v2/deliver-bath.jpg",
  "/media/portal-v2/deliver-yard.jpg",
  "/media/portal-v2/luxury-living.jpg",
];

function site(design: PublicListingSite["design"]): PublicListingSite {
  const template = LISTING_SITE_TEMPLATES.find((item) => item.id === design)!;
  return {
    slug: "100-example-street-spring",
    design,
    font: template.font,
    color: template.color,
    style: template.style,
    address: "100 Example Street, Spring, TX",
    street: "100 Example Street",
    city: "Spring",
    price: "$485,000",
    facts: [
      { label: "Beds", value: "4" },
      { label: "Baths", value: "3" },
      { label: "Sqft", value: "2,480" },
    ],
    photos: PHOTOS.map((url, index) => ({ name: `Photo ${index + 1}`, url })),
    filmPosterUrl: "/media/portal-v2/hero-twilight.jpg",
    tourEmbedUrl: "",
    floorplan: { name: "Floorplan", url: "/media/portal-v2/floorplan.jpg" },
    agent: {
      name: "Example Agent",
      brokerage: "Example Brokerage",
      license: "",
      phone: "(281) 555-0100",
      email: "example.agent@example.com",
      website: "https://example.com",
    },
  };
}

/** Unlinked capture page. Thumbnails in the portal are screenshots of these frames. */
export default function PortalStyleShots() {
  return (
    <div style={{ background: "#111" }}>
      {LISTING_SITE_TEMPLATES.map((template) => (
        <section id={`shot-${template.id}`} key={template.id} style={{ width: 1280, height: 800, overflow: "hidden", background: "#fff" }}>
          <ListingSiteView inquiry={false} site={site(template.id)} />
        </section>
      ))}
    </div>
  );
}
