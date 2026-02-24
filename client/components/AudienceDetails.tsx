export default function AudienceDetails() {
  const audiences = [
    {
      title: "Realtors & Brokers",
      description: "Attract leads, close faster, and win more listings with engaging property videos.",
      image: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=400&h=400&fit=crop",
    },
    {
      title: "Photographers",
      description: "Upsell AI videos with every order. More profit, no effort.",
      image: "https://images.unsplash.com/photo-1542038784456-1ea8e935640e?w=400&h=400&fit=crop",
    },
    {
      title: "Real Estate Media Companies",
      description: "Scale your business and stay competitive with AI property videos — no extra overhead.",
      image: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=400&h=400&fit=crop",
    },
  ];

  return (
    <section className="bg-white pb-20 md:pb-24">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {audiences.map((audience, index) => (
            <div key={index} className="flex flex-col items-center text-center group">
              <div className="w-24 h-24 md:w-32 md:h-32 mb-6 relative rounded-full overflow-hidden bg-gray-50 border border-gray-100 shadow-sm transition-transform duration-500 group-hover:scale-105">
                <img
                  src={audience.image}
                  alt={audience.title}
                  className="w-full h-full object-cover grayscale opacity-80 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-500"
                />
              </div>
              <h3 className="text-lg font-bold text-black mb-2">{audience.title}</h3>
              <p className="text-gray-500 text-[13px] leading-relaxed max-w-[240px]">
                {audience.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
