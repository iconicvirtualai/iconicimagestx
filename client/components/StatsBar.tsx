import { useSiteSettings } from "@/hooks/useSiteSettings";

export default function StatsBar() {
  const settings = useSiteSettings();
  const stats = [
    {
      value: "100,000+",
      label: "Media assets produced",
    },
    {
      value: "24 hrs",
      label: "Avg. turnaround time",
    },
    {
      value: "+403%",
      label: "More brand engagement",
    },
  ];

  return (
    <div className="bg-black border-y border-white/5 py-12 md:py-16">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-center relative">
          {stats.map((stat, index) => (
            <div key={index} className="flex flex-col gap-2 relative group">
              <span className="text-4xl md:text-5xl lg:text-6xl font-black text-white transition-transform group-hover:scale-105 duration-300">
                {stat.value}
              </span>
              <span
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
