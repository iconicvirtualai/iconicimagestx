import { User, Camera, Building2 } from "lucide-react";

export default function AudienceDetails() {
  const audiences = [
    {
      title: "Realtors & Brokers",
      description: "Attract leads, close faster, and win more listings with engaging property videos.",
      image: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=400&h=400&fit=crop",
      icon: <User className="w-6 h-6 text-[#0d9488]" />,
    },
    {
      title: "Photographers",
      description: "Upsell premium media with every order. More profit, no extra effort on your end.",
      image: "https://images.unsplash.com/photo-1542038784456-1ea8e935640e?w=400&h=400&fit=crop",
      icon: <Camera className="w-6 h-6 text-[#0d9488]" />,
    },
    {
      title: "Real Estate Media Companies",
      description: "Scale your business and stay competitive with high-end property videos — no extra overhead.",
      image: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=400&h=400&fit=crop",
      icon: <Building2 className="w-6 h-6 text-[#0d9488]" />,
    },
  ];

  return (
    <section className="bg-white pb-24 md:pb-32">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 max-w-6xl mx-auto">
          {audiences.map((audience, index) => (
            <div key={index} className="flex flex-col items-center text-center group">
              <div className="w-32 h-32 md:w-48 md:h-48 mb-8 relative rounded-full overflow-hidden bg-gray-50 border border-gray-100 shadow-sm transition-transform duration-500 group-hover:scale-105">
                <img
                  src={audience.image}
                  alt={audience.title}
                  className="w-full h-full object-cover grayscale opacity-80 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-500"
                />
              </div>
              <h3 className="text-xl font-bold text-black mb-3">{audience.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed max-w-[280px]">
                {audience.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
