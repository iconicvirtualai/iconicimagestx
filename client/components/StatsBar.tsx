export default function StatsBar() {
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
    <div className="bg-white border-y border-gray-100 py-12 md:py-16">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-center relative">
          {stats.map((stat, index) => (
            <div key={index} className="flex flex-col gap-2 relative group">
              <span className="text-4xl md:text-5xl lg:text-6xl font-bold text-[#0d9488] transition-transform group-hover:scale-105 duration-300">
                {stat.value}
              </span>
              <span className="text-sm md:text-base text-gray-400 font-medium uppercase tracking-wider">
                {stat.label}
              </span>
              
              {/* Divider for desktop */}
              {index < stats.length - 1 && (
                <div className="hidden md:block absolute right-[-1px] top-1/2 -translate-y-1/2 w-px h-16 bg-gray-100"></div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
