import { Link } from "react-router-dom";
import { launchStill, launchStillsByGroup } from "@/lib/launchStills";

function Frame({
  id,
  className = "",
  ratio = "aspect-[4/3]",
}: {
  id: string;
  className?: string;
  ratio?: string;
}) {
  const still = launchStill(id);
  return (
    <figure className={`group relative overflow-hidden rounded-3xl bg-zinc-900 ${className}`}>
      <img
        src={still.src}
        alt={still.alt}
        className={`${ratio} w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]`}
      />
      <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-5 pb-5 pt-16">
        <span className="text-[10px] font-black uppercase tracking-[0.28em] text-white">{still.title}</span>
      </figcaption>
    </figure>
  );
}

function GroupLabel({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="mb-6 mt-16 flex items-end justify-between gap-6">
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.35em] text-teal-400">{kicker}</p>
        <h3 className="mt-2 text-2xl font-black uppercase tracking-tight text-white md:text-3xl">{title}</h3>
      </div>
    </div>
  );
}

export default function SelectedWork() {
  const interiors = launchStillsByGroup("Interior");
  const outdoor = launchStillsByGroup("Outdoor");
  const aerials = launchStillsByGroup("Aerial");
  const floorplan = launchStill("floorplan");

  return (
    <section className="bg-black py-24 text-white md:py-32">
      <div className="container mx-auto max-w-6xl px-4">
        <div className="max-w-3xl">
          <p className="text-[11px] font-black uppercase tracking-[0.35em] text-teal-400">Selected work</p>
          <h2 className="mt-3 text-4xl font-black uppercase tracking-tight md:text-6xl">The stills we deliver.</h2>
          <p className="mt-6 text-lg leading-relaxed text-white/70">
            Day exteriors, interiors, outdoor living, and drone coverage from Iconic shoots.
            The before-and-after edits above are the same standard. The floorplan below is a real 2D sample of the listing add-on.
          </p>
        </div>

        <div className="mt-12">
          <Frame id="hero-alt" ratio="aspect-[16/10]" />
        </div>

        <GroupLabel kicker="Interiors" title="Rooms, as shot" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Frame id="kitchen-island" ratio="aspect-[4/3]" />
          <Frame id="living-open" ratio="aspect-[4/3]" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3">
          {interiors
            .filter((still) => still.id !== "kitchen-island" && still.id !== "living-open")
            .map((still) => (
              <Frame key={still.id} id={still.id} ratio="aspect-[4/3]" />
            ))}
        </div>

        <GroupLabel kicker="Outdoor" title="Pool, patio, entry" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {outdoor.map((still) => (
            <Frame key={still.id} id={still.id} ratio="aspect-[3/4] md:aspect-[4/5]" />
          ))}
        </div>

        <GroupLabel kicker="Aerial" title="Drone coverage" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {aerials.map((still) => (
            <Frame key={still.id} id={still.id} ratio="aspect-[16/10]" />
          ))}
        </div>

        <div className="mt-16 grid items-center gap-10 rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 md:grid-cols-2 md:p-8">
          <img
            src={floorplan.src}
            alt={floorplan.alt}
            className="w-full rounded-2xl bg-white object-contain"
          />
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.35em] text-teal-400">2D floorplan</p>
            <h3 className="mt-3 text-3xl font-black uppercase tracking-tight">A sample, not a mockup.</h3>
            <p className="mt-4 text-base leading-relaxed text-white/70">
              Listing packages can include a next-day 2D floorplan. This is one delivered sheet: room names and dimensions, ready to sit with the photo set.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/pricing"
                className="rounded-full bg-white px-6 py-3 text-sm font-bold text-black transition hover:bg-gray-100"
              >
                See listing packages
              </Link>
              <Link
                to="/portfolio"
                className="rounded-full border border-white/20 px-6 py-3 text-sm font-bold text-white transition hover:bg-white/10"
              >
                Full portfolio
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
