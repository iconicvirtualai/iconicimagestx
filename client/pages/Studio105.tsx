import { Link } from "react-router-dom";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { itemText, useSiteItems, useSiteText } from "@/content/siteContent";
import { BUSINESS_CONTACT } from "@shared/businessContact";

const ROOMS = [
  {
    id: "studio-noir",
    name: "Studio Noir",
    vibe: "Dark / dramatic",
    summary: "A controlled black room for portraits with edge, branding films, and product that needs mood.",
    uses: ["Headshots with contrast", "Brand films", "Dramatic product", "Evening portraits"],
    card: "bg-zinc-950 text-white border-white/10",
    chip: "bg-white text-black",
    button: "bg-white text-black hover:bg-zinc-200",
    glow: "bg-teal-400/20",
  },
  {
    id: "studio-blanc",
    name: "Studio Blanc",
    vibe: "Bright / white",
    summary: "A clean white room for crisp headshots, bright product, and holiday minis.",
    uses: ["Clean headshots", "Product on white", "Holiday minis", "Bright branding"],
    card: "bg-white text-black border-black/10",
    chip: "bg-black text-white",
    button: "bg-black text-white hover:bg-zinc-800",
    glow: "bg-teal-500/15",
  },
];

export default function Studio105() {
  const kicker = useSiteText("studio105", "hero", "kicker", "The physical studio");
  const title = useSiteText("studio105", "hero", "title", "Studio 105");
  const roomItems = useSiteItems("studio105", "rooms");
  const rooms = roomItems?.length ? ROOMS.map((room) => {
    const item = roomItems.find((entry) => entry.id === room.id);
    return item ? { ...room, name: itemText(item, "name"), vibe: itemText(item, "vibe"), summary: itemText(item, "summary") } : room;
  }) : ROOMS;
  return (
    <Layout>
      <div className="bg-black text-white">
        <section className="pt-36 pb-16">
          <div className="max-w-[1100px] mx-auto px-6">
            <p className="text-[11px] font-black uppercase tracking-[0.45em] text-teal-400 mb-4">
              <span data-site-page="studio105" data-site-block="hero" data-site-field="kicker" data-site-kind="text">{kicker}</span>
            </p>
            <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none">
              <span data-site-page="studio105" data-site-block="hero" data-site-field="title" data-site-kind="text">{title}</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-gray-300 leading-relaxed">
              Two rooms. One standard. Book Studio Noir when the frame should feel dramatic, or Studio Blanc when it should feel clean and bright.
            </p>
          </div>
        </section>

        <section className="pb-24">
          <div className="max-w-[1100px] mx-auto px-6 grid gap-6 md:grid-cols-2">
            {rooms.map((room) => (
              <article key={room.id} className={`relative overflow-hidden rounded-[2rem] border p-8 md:p-10 ${room.card}`}>
                <div className={`pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full blur-3xl ${room.glow}`} />
                <p className={`relative inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${room.chip}`}>
                  {room.vibe}
                </p>
                <h2 className="relative mt-6 text-4xl font-black uppercase tracking-tight">{room.name}</h2>
                <p className="relative mt-4 text-base leading-relaxed opacity-80">{room.summary}</p>
                <ul className="relative mt-6 space-y-2">
                  {room.uses.map((use) => (
                    <li key={use} className="text-sm font-bold uppercase tracking-wider opacity-80">
                      {use}
                    </li>
                  ))}
                </ul>
                <Button asChild className={`relative mt-8 rounded-full px-8 py-6 font-black uppercase tracking-widest text-xs ${room.button}`}>
                  <Link to={`/book?service=${room.id}`}>Book {room.name}</Link>
                </Button>
                <p className="relative mt-4 text-xs opacity-60">
                  Request the room and a time. We confirm availability and the rate. This page does not charge a card.
                </p>
              </article>
            ))}
          </div>
        </section>

        <section id="studio-map" aria-labelledby="studio-location" className="scroll-mt-36 pb-24 md:scroll-mt-32">
          <div className="max-w-[1100px] mx-auto px-6">
            <h2 id="studio-location" className="text-3xl font-black uppercase tracking-tight md:text-5xl">
              Find the studio
            </h2>
            <p className="mt-4 text-lg text-gray-300">{BUSINESS_CONTACT.address}</p>
            <a
              href={BUSINESS_CONTACT.mapsHref}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex min-h-12 items-center rounded-full bg-white px-8 text-xs font-black uppercase tracking-widest text-black"
            >
              Get directions
            </a>
            <iframe
              title="Map of Studio 105, 26410 Oakridge Dr. Ste 105 - 108, Spring, TX 77380"
              src={BUSINESS_CONTACT.mapsEmbed}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="mt-8 h-64 w-full max-w-full rounded-[2rem] border border-white/10 md:h-[420px]"
            />
          </div>
        </section>
      </div>
    </Layout>
  );
}
