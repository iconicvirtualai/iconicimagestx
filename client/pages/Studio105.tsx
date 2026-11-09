import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Studio105Shell from "@/components/studio105/Studio105Shell";
import Studio105BookForm from "@/components/studio105/Studio105BookForm";
import { itemText, useSiteItems, useSiteText } from "@/content/siteContent";
import { BUSINESS_CONTACT } from "@shared/businessContact";
import { STUDIO105_PATHS } from "@shared/studio105";

const ROOMS = [
  {
    id: "studio-noir",
    path: STUDIO105_PATHS.noir,
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
    path: STUDIO105_PATHS.blanc,
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

const FAQ = [
  {
    q: "Where is Studio 105?",
    a: `${BUSINESS_CONTACT.address}. Call ${BUSINESS_CONTACT.phoneDisplay} or email ${BUSINESS_CONTACT.email}.`,
  },
  {
    q: "Do I pay when I request a room?",
    a: "No. Request the room and a time. We confirm availability and the rate. This page does not charge a card.",
  },
  {
    q: "Which room should I book?",
    a: "Studio Noir is the controlled black room for portraits with edge, branding films, and product that needs mood. Studio Blanc is the clean white room for crisp headshots, bright product, and holiday minis.",
  },
  {
    q: "What happens after I send a request?",
    a: "The request goes to the studio. We confirm the room is open and we confirm the rate before the session is set.",
  },
];

function sectionOf(pathname: string): string {
  if (pathname.endsWith("/rooms")) return "rooms";
  if (pathname.endsWith("/noir")) return "noir";
  if (pathname.endsWith("/blanc")) return "blanc";
  if (pathname.endsWith("/rates")) return "rates";
  if (pathname.endsWith("/faq")) return "faq";
  if (pathname.endsWith("/location")) return "location";
  if (pathname.endsWith("/book")) return "book";
  return "home";
}

function StudioMap() {
  return (
    <section id="studio-map" aria-labelledby="studio-location" className="scroll-mt-36 pb-24 md:scroll-mt-32">
      <div className="mx-auto max-w-[1100px] px-6">
        <h2 id="studio-location" className="text-3xl font-black uppercase tracking-tight md:text-5xl">
          Find the studio
        </h2>
        <p className="mt-4 text-lg text-gray-300">{BUSINESS_CONTACT.address}</p>
        <p className="mt-2 text-base text-gray-300">
          <a href={BUSINESS_CONTACT.phoneHref} className="underline underline-offset-4">{BUSINESS_CONTACT.phoneDisplay}</a>
          {" · "}
          <a href={BUSINESS_CONTACT.emailHref} className="underline underline-offset-4">{BUSINESS_CONTACT.email}</a>
        </p>
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
  );
}

function RoomCard({ room, bookLabel }: { room: (typeof ROOMS)[number]; bookLabel?: string }) {
  return (
    <article className={`relative overflow-hidden rounded-[2rem] border p-8 md:p-10 ${room.card}`}>
      <div className={`pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full blur-3xl ${room.glow}`} />
      <p className={`relative inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${room.chip}`}>
        {room.vibe}
      </p>
      <h2 className="relative mt-6 text-4xl font-black uppercase tracking-tight">
        <Link to={room.path}>{room.name}</Link>
      </h2>
      <p className="relative mt-4 text-base leading-relaxed opacity-80">{room.summary}</p>
      <ul className="relative mt-6 space-y-2">
        {room.uses.map((use) => (
          <li key={use} className="text-sm font-bold uppercase tracking-wider opacity-80">{use}</li>
        ))}
      </ul>
      <Button asChild className={`relative mt-8 rounded-full px-8 py-6 font-black uppercase tracking-widest text-xs ${room.button}`}>
        <Link to={`${STUDIO105_PATHS.book}?room=${room.id}`}>{bookLabel || `Book ${room.name}`}</Link>
      </Button>
      <p className="relative mt-4 text-xs opacity-60">
        Request the room and a time. We confirm availability and the rate. This page does not charge a card.
      </p>
    </article>
  );
}

export default function Studio105() {
  const { pathname } = useLocation();
  const section = sectionOf(pathname);
  const kicker = useSiteText("studio105", "hero", "kicker", "The physical studio");
  const title = useSiteText("studio105", "hero", "title", "Studio 105");
  const roomItems = useSiteItems("studio105", "rooms");
  const rooms = ROOMS.map((room) => {
    const item = roomItems?.find((entry) => entry.id === room.id);
    return item
      ? { ...room, name: itemText(item, "name") || room.name, vibe: itemText(item, "vibe") || room.vibe, summary: itemText(item, "summary") || room.summary }
      : room;
  });
  const activeRoom = rooms.find((room) => section === "noir" ? room.id === "studio-noir" : section === "blanc" ? room.id === "studio-blanc" : false);

  return (
    <Studio105Shell>
      <div data-testid={`studio105-${section}`}>
        {section === "home" || section === "rooms" ? (
          <>
            <section className="pb-16 pt-16">
              <div className="mx-auto max-w-[1100px] px-6">
                <p className="mb-4 text-[11px] font-black uppercase tracking-[0.45em] text-teal-400">
                  <span data-site-page="studio105" data-site-block="hero" data-site-field="kicker" data-site-kind="text">{kicker}</span>
                </p>
                <h1 className="text-5xl font-black uppercase leading-none tracking-tighter md:text-7xl">
                  <span data-site-page="studio105" data-site-block="hero" data-site-field="title" data-site-kind="text">{title}</span>
                </h1>
                <p className="mt-6 max-w-2xl text-lg leading-relaxed text-gray-300">
                  Two rooms. One standard. Book Studio Noir when the frame should feel dramatic, or Studio Blanc when it should feel clean and bright.
                </p>
              </div>
            </section>
            <section className="pb-24">
              <div className="mx-auto grid max-w-[1100px] gap-6 px-6 md:grid-cols-2">
                {rooms.map((room) => <RoomCard key={room.id} room={room} />)}
              </div>
            </section>
            {section === "home" ? <StudioMap /> : null}
          </>
        ) : null}

        {activeRoom ? (
          <section className="px-6 py-16">
            <div className="mx-auto max-w-[800px]">
              <RoomCard room={activeRoom} />
              <p className="mt-8 text-sm text-white/60">
                <Link to={STUDIO105_PATHS.rooms} className="underline underline-offset-4">Both rooms</Link>
                {" · "}
                <Link to={STUDIO105_PATHS.rates} className="underline underline-offset-4">Rates</Link>
              </p>
            </div>
          </section>
        ) : null}

        {section === "rates" ? (
          <section className="px-6 py-16">
            <div className="mx-auto max-w-[800px]">
              <p className="text-[11px] font-black uppercase tracking-[0.45em] text-teal-400">Rates</p>
              <h1 className="mt-4 text-5xl font-black uppercase tracking-tight">Confirmed with the request</h1>
              <p className="mt-6 text-lg leading-relaxed text-gray-300">
                Studio Noir and Studio Blanc are requested here. The rate is confirmed when we accept the time. This page does not list a price and it does not charge a card.
              </p>
              <div className="mt-10 grid gap-4 sm:grid-cols-2">
                {rooms.map((room) => (
                  <Link key={room.id} to={`${STUDIO105_PATHS.book}?room=${room.id}`} className="rounded-[1.5rem] border border-white/10 p-6 hover:border-[#2dd4bf]">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#2dd4bf]">{room.vibe}</p>
                    <h2 className="mt-3 text-2xl font-black uppercase">{room.name}</h2>
                    <p className="mt-3 text-sm leading-relaxed text-white/70">{room.summary}</p>
                    <p className="mt-4 text-xs font-black uppercase tracking-widest">Request this room</p>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {section === "faq" ? (
          <section className="px-6 py-16">
            <div className="mx-auto max-w-[800px]">
              <p className="text-[11px] font-black uppercase tracking-[0.45em] text-teal-400">FAQ</p>
              <h1 className="mt-4 text-5xl font-black uppercase tracking-tight">Studio questions</h1>
              <div className="mt-10 space-y-3">
                {FAQ.map((item) => (
                  <details key={item.q} className="rounded-2xl border border-white/10 px-5 py-4" open>
                    <summary className="cursor-pointer text-lg font-black">{item.q}</summary>
                    <p className="mt-3 text-sm leading-relaxed text-gray-300">{item.a}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {section === "location" ? (
          <section className="pt-16">
            <div className="mx-auto max-w-[1100px] px-6">
              <p className="text-[11px] font-black uppercase tracking-[0.45em] text-teal-400">Location</p>
              <h1 className="mt-4 text-5xl font-black uppercase tracking-tight">Spring, Texas</h1>
            </div>
            <StudioMap />
          </section>
        ) : null}

        {section === "book" ? (
          <section className="px-6 py-16">
            <div className="mx-auto max-w-[800px]">
              <p className="text-[11px] font-black uppercase tracking-[0.45em] text-teal-400">Book a room</p>
              <h1 className="mt-4 text-5xl font-black uppercase tracking-tight">Request Studio 105</h1>
              <p className="mt-4 max-w-xl text-lg text-gray-300">
                Tell us the room and a time. We confirm availability and the rate.
              </p>
              <div className="mt-8">
                <Studio105BookForm />
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </Studio105Shell>
  );
}
