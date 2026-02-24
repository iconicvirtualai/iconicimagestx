import { Calendar, Camera, Scissors, Rocket } from "lucide-react";

export default function StepsSection() {
  const steps = [
    {
      step: "STEP 1",
      title: "Book your session",
      description: "Select your creative service and schedule a time through our seamless partnership portal in just a few clicks.",
      image: "https://images.unsplash.com/photo-1506784983877-45594efa4cbe?w=800&q=80", // Calendar/Planning
      icon: <Calendar className="w-5 h-5 text-[#0d9488]" />,
    },
    {
      step: "STEP 2",
      title: "We capture the vision",
      description: "Our professional creative team arrives on-site with state-of-the-art equipment to capture high-impact raw media.",
      image: "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=800&q=80", // Camera/Shooting
      icon: <Camera className="w-5 h-5 text-[#0d9488]" />,
    },
    {
      step: "STEP 3",
      title: "Rapid post-production",
      description: "Our expert editors transform raw clips into polished, cinematic masterpieces that perfectly align with your brand.",
      image: "https://images.unsplash.com/photo-1536240478700-b869070f9279?w=800&q=80", // Editing
      icon: <Scissors className="w-5 h-5 text-[#0d9488]" />,
    },
    {
      step: "STEP 4",
      title: "Delivery & launch",
      description: "Receive your ready-to-post assets within 24 hours. Download, publish, and dominate your social feed instantly.",
      image: "https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=800&q=80", // Social/Launch
      icon: <Rocket className="w-5 h-5 text-[#0d9488]" />,
    },
  ];

  return (
    <section className="bg-[#e0f7f6]/40 py-24 md:py-32 relative overflow-hidden">
      <div className="container mx-auto px-4 relative z-10">
        <div className="text-center mb-16">
          {/* Badge */}
          <div className="inline-flex items-center px-4 py-1.5 rounded-md bg-white border border-[#ccfbf1] mb-8 shadow-sm">
            <span className="text-[12px] font-bold tracking-wider text-[#0d9488] uppercase">
              4 STEPS TO RESULTS
            </span>
          </div>

          {/* Headline */}
          <h2 className="text-4xl md:text-5xl lg:text-7xl font-bold mb-8 leading-[1.1] tracking-tight text-black max-w-5xl mx-auto">
            From vision to viral in <br className="hidden md:block" />
            <span className="text-[#0d9488]">minutes</span>, not days
          </h2>

          <p className="text-lg md:text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed">
            Placing an order with Iconic is as simple as it gets. We handle the heavy lifting so you can focus on growth.
          </p>
        </div>

        {/* Steps Grid - Updated to 4 columns as per screenshot */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-4 max-w-[1400px] mx-auto">
          {steps.map((item, index) => (
            <div
              key={index}
              className="bg-white rounded-[1.5rem] p-6 border border-gray-100 shadow-sm flex flex-col h-full hover:shadow-xl transition-all duration-300 group"
            >
              <div className="mb-6">
                <span className="text-[10px] font-bold tracking-widest text-gray-400 uppercase block mb-2">
                  {item.step}
                </span>
                <h3 className="text-lg font-bold text-black mb-3 leading-tight group-hover:text-[#0d9488] transition-colors">
                  {item.title}
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed min-h-[60px]">
                  {item.description}
                </p>
              </div>

              <div className="mt-auto relative rounded-xl overflow-hidden aspect-[4/3] bg-gray-50 border border-gray-50">
                <img
                  src={item.image}
                  alt={item.title}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                />
                <div className="absolute top-3 right-3 w-8 h-8 bg-white/80 backdrop-blur-md rounded-lg flex items-center justify-center shadow-sm border border-white/40">
                  <div className="scale-75">
                    {item.icon}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Decorative background element */}
      <div className="absolute top-[-20%] left-[-10%] w-[40%] h-[40%] bg-white rounded-full blur-[120px] opacity-40"></div>
      <div className="absolute bottom-[-10%] right-[-5%] w-[30%] h-[30%] bg-[#ccfbf1]/20 rounded-full blur-[100px] opacity-30"></div>
    </section>
  );
}
