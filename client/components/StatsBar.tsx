import { itemText, useSiteItems } from "@/content/siteContent";

const FALLBACK_STATS = [
  { id: "assets", value: "100,000+", label: "Media assets produced" },
  { id: "turnaround", value: "24 hrs", label: "Avg. turnaround time" },
  { id: "engagement", value: "+403%", label: "More brand engagement" },
];

export default function StatsBar() {
  const items = useSiteItems("home", "stats");
  const stats = items
    ? items.map((item) => ({ id: item.id, value: itemText(item, "value"), label: itemText(item, "label") }))
    : FALLBACK_STATS;

  return (
    <div className="bg-black border-y border-white/5 py-12 md:py-16">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-center relative">
          {stats.map((stat, index) => (
            <div key={stat.id} className="flex flex-col gap-2 relative group">
              <span data-site-page="home" data-site-block="stats" data-site-item={stat.id} data-site-field="value" data-site-kind="text" className="text-4xl md:text-5xl lg:text-6xl font-black text-white transition-transform group-hover:scale-105 duration-300">
                {stat.value}
              </span>
              <span
                data-site-page="home" data-site-block="stats" data-site-item={stat.id} data-site-field="label" data-site-kind="text"
                className="text-sm md:text-base font-bold uppercase tracking-widest transition-colors duration-300 text-teal-400"
              >
                {stat.label}
              </span>

              {/* Divider for desktop */}
              {index < stats.length - 1 && (
                <div className="hidden md:block absolute right-[-1px] top-1/2 -translate-y-1/2 w-px h-16 bg-white/10"></div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
