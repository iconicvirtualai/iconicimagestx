import { motion } from "framer-motion";
import { itemText, useSiteItems, useSiteText } from "@/content/siteContent";

const NETWORK_BODY = "We look forward to working with you. Collaborators, creators, producers, podcasters, and photographers are welcome here. Iconic was built to stand beside other media professionals, not to crowd them out.";
const NETWORK_CLOSER = "Bring your clients and your craft. There is room for the work you already love.";

const FALLBACK_PHOTOS = [
  { id: "podcast-set", image: "/media/home-v2/lifestyle/podcast-set-wide.jpg", alt: "The Iconic podcast set, cameras and lights" },
  { id: "conversation", image: "/media/home-v2/lifestyle/podcast-conversation.jpg", alt: "A host and guest in conversation on the podcast set" },
  { id: "crew", image: "/media/home-v2/lifestyle/podcast-crew-cameras.jpg", alt: "The podcast set from behind the cameras" },
  { id: "interior", image: "/media/home-v2/lifestyle/interior-shoot-lighting.jpg", alt: "A lit interior shoot" },
  { id: "location", image: "/media/home-v2/lifestyle/on-location-outdoor-shoot.jpg", alt: "Shooting outdoors on location" },
  { id: "sweep", image: "/media/home-v2/lifestyle/studio-105-sweep.jpg", alt: "Studio 105 white sweep with strobes" },
];

const FRAME: Record<string, string> = {
  "podcast-set": "col-span-2 aspect-[3/2] md:col-span-3",
  conversation: "col-span-2 aspect-[3/2] md:col-span-3",
  crew: "col-span-1 aspect-[3/4] md:col-span-2",
  interior: "col-span-1 aspect-[3/4] md:col-span-2",
  location: "col-span-2 aspect-[3/4] md:col-span-2 md:aspect-[3/4]",
  sweep: "col-span-2 aspect-[16/9] md:col-span-6",
};

export default function TheNetwork() {
  const titleLead = useSiteText("home", "network", "titleLead", "Built Bigger Than");
  const titleAccent = useSiteText("home", "network", "titleAccent", "One Brand");
  const body = useSiteText("home", "network", "body", NETWORK_BODY);
  const closer = useSiteText("home", "network", "closer", NETWORK_CLOSER);
  const saved = useSiteItems("home", "network");
  const photos = saved?.length
    ? saved.map((item) => ({
      id: item.id,
      image: itemText(item, "image"),
      alt: itemText(item, "alt"),
    })).filter((item) => item.image)
    : FALLBACK_PHOTOS;

  return (
    <section className="relative overflow-hidden bg-white py-20 md:py-24">
      <div className="container relative z-10 mx-auto px-4">
        <div className="mx-auto mb-14 max-w-3xl text-center">
          <motion.div
            initial={{ opacity: 1, scale: 1 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <h2 className="mb-6 text-balance text-4xl font-bold tracking-tight text-black md:text-5xl lg:text-6xl">
              <span data-site-page="home" data-site-block="network" data-site-field="titleLead" data-site-kind="text">{titleLead}</span>{" "}
              <span className="accent-text-bordered" data-site-page="home" data-site-block="network" data-site-field="titleAccent" data-site-kind="text">{titleAccent}</span>
            </h2>
            <p data-site-page="home" data-site-block="network" data-site-field="body" data-site-kind="text" className="text-balance text-lg font-medium leading-relaxed text-gray-600 md:text-xl">
              {body}
            </p>
            <p data-site-page="home" data-site-block="network" data-site-field="closer" data-site-kind="text" className="mt-6 text-balance text-lg font-semibold leading-relaxed text-black md:text-xl">
              {closer}
            </p>
          </motion.div>
        </div>

        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-3 md:grid-cols-6 md:gap-4">
          {photos.map((photo, index) => (
            <motion.figure
              key={photo.id}
              initial={{ opacity: 1, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.05 }}
              className={`overflow-hidden rounded-[1.5rem] border-4 border-white shadow-xl ${FRAME[photo.id] || "col-span-1 aspect-[3/4] md:col-span-2"}`}
            >
              <img
                src={photo.image}
                alt={photo.alt}
                data-site-page="home"
                data-site-block="network"
                data-site-item={photo.id}
                data-site-field="image"
                data-site-kind="image"
                className="h-full w-full object-cover transition duration-700 motion-safe:hover:scale-105"
              />
            </motion.figure>
          ))}
        </div>
      </div>
    </section>
  );
}
