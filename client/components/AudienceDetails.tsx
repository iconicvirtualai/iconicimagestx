import { itemText, useSiteItems } from "@/content/siteContent";

const FALLBACK_AUDIENCES = [
    {
      title: "Realtors & Brokers",
      description: "Attract leads, close faster, and win more listings with engaging property videos.",
      image: "/media/photos/lifestyle-mtz04327.jpg",
    },
    {
      title: "Photographers",
      description: "Upsell AI videos with every order. More profit, no effort.",
      image: "/media/photos/studio-mtz01691.jpg",
    },
    {
      title: "Real Estate Media Companies",
      description: "Scale your business and stay competitive with AI property videos — no extra overhead.",
      image: "/media/photos/drone-hero.jpg",
    },
    {
      title: "Developers & Builders",
      description: "Showcase new construction and development projects with cinematic fly-throughs.",
      image: "/media/photos/luxury-exterior.jpg",
    },
    {
      title: "Small Business Owners",
      description: "Professional media content to tell your brand story and engage your local community.",
      image: "/media/photos/lifestyle-daughtery-mtz00636.jpg",
    },
    {
      title: "Online Appearance",
      description: "High-impact visual identity for anyone looking to dominate their digital space.",
      image: "/media/photos/headshot-gracepoint-1.jpg",
    },
  ];

export default function AudienceDetails() {
  const items = useSiteItems("home", "audienceDetails");
  const audiences = items
    ? items.map((item) => ({
        id: item.id,
        title: itemText(item, "title"),
        description: itemText(item, "body"),
        image: itemText(item, "image"),
      }))
    : FALLBACK_AUDIENCES.map((item, index) => ({ ...item, id: String(index) }));

  return (
    <section className="bg-white pb-20 md:pb-24">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-12 gap-x-8 max-w-5xl mx-auto">
          {audiences.map((audience) => (
            <div key={audience.id} className="flex flex-col items-center text-center group">
              <div className="w-24 h-24 md:w-32 md:h-32 mb-6 relative rounded-full overflow-hidden bg-gray-50 border border-gray-100 shadow-sm transition-transform duration-500 group-hover:scale-105">
                <img
                  src={audience.image}
                  alt={audience.title}
                  data-site-page="home" data-site-block="audienceDetails" data-site-item={audience.id} data-site-field="image" data-site-kind="image"
                  className="w-full h-full object-cover grayscale opacity-80 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-500"
                />
              </div>
              <h3 data-site-page="home" data-site-block="audienceDetails" data-site-item={audience.id} data-site-field="title" data-site-kind="text" className="text-lg font-bold text-black mb-2">{audience.title}</h3>
              <p data-site-page="home" data-site-block="audienceDetails" data-site-item={audience.id} data-site-field="body" data-site-kind="text" className="text-gray-500 text-[13px] leading-relaxed max-w-[240px]">
                {audience.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
