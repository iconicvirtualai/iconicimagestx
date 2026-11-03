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
              <div className="relative mb-6 h-40 w-40 overflow-hidden rounded-full border-4 border-white bg-gray-100 shadow-xl ring-1 ring-black/10 transition-transform duration-500 group-hover:scale-105 md:h-52 md:w-52">
                <img
                  src={audience.image}
                  alt={audience.title}
                  data-site-page="home" data-site-block="audienceDetails" data-site-item={audience.id} data-site-field="image" data-site-kind="image"
                  className="h-full w-full object-cover object-[center_18%] grayscale opacity-90 transition-all duration-500 group-hover:grayscale-0 group-hover:opacity-100"
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
