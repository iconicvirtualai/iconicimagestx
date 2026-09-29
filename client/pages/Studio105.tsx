import { Link } from "react-router-dom";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";

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
  return (
    <Layout>
      <div className="bg-black text-white">
        <section className="pt-36 pb-16">
          <div className="max-w-[1100px] mx-auto px-6">
            <p className="text-[11px] font-black uppercase tracking-[0.45em] text-teal-400 mb-4">
              The physical studio
            </p>
            <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none">
              Studio 105
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-gray-300 leading-relaxed">
              Two rooms. One standard. Book Studio Noir when the frame should feel dramatic, or Studio Blanc when it should feel clean and bright.
            </p>
          </div>
        </section>

        <section className="pb-24">
          <div className="max-w-[1100px] mx-auto px-6 grid gap-6 md:grid-cols-2">
            {ROOMS.map((room) => (
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
      </div>
    </Layout>
  );
}
