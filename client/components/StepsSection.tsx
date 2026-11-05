import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { itemText, useSiteItems, useSiteText } from "@/content/siteContent";

export default function StepsSection() {
  const settings = useSiteSettings();
  const badge = useSiteText("home", "steps", "badge", "4 STEPS TO RESULTS");
  const headline = useSiteText("home", "steps", "title", "From vision to viral in minutes, not days");
  const defaultHeadline = headline === "From vision to viral in minutes, not days";
  const intro = useSiteText("home", "steps", "body", "Placing an order with Iconic is as simple as it gets. We handle the heavy lifting so you can focus on growth.");
  const stepItems = useSiteItems("home", "steps");
  const steps = [
    {
      step: "STEP 1",
      title: "Book your session",
      description: "Select your creative service and schedule a time through our seamless partnership portal in just a few clicks.",
      image: "/media/photos/lifestyle-mtz04327.jpg",
    },
    {
      step: "STEP 2",
      title: "We capture the vision",
      description: "Our professional creative team arrives on-site with state-of-the-art equipment to capture high-impact raw media.",
      image: "/media/photos/luxury-exterior.jpg",
    },
    {
      step: "STEP 3",
      title: "Rapid post-production",
      description: "Our expert editors transform raw clips into polished, cinematic masterpieces that perfectly align with your brand.",
      image: "/media/photos/luxury-interior.jpg",
    },
    {
      step: "STEP 4",
      title: "Delivery & launch",
      description: "Receive your ready-to-post assets within 24 hours. Download, publish, and dominate your social feed instantly.",
      image: "/media/launch/living_room_bright.jpg",
    },
  ];
  const shown = steps.map((item, index) => {
    const saved = stepItems?.[index];
    if (!saved) return { ...item, id: String(index) };
    return {
      ...item,
      id: saved.id,
      step: itemText(saved, "step", item.step),
      title: itemText(saved, "title", item.title),
      description: itemText(saved, "body", item.description),
      image: itemText(saved, "image", item.image),
    };
  });

  return (
    <section className="bg-gray-50 py-20 md:py-24 relative overflow-hidden">
      <div className="container mx-auto px-4 relative z-10 max-w-6xl">
        <div className="text-center mb-12">
          {/* Badge */}
          <div className="inline-flex items-center px-4 py-1.5 rounded-md bg-black border border-black mb-6 shadow-sm">
            <span data-site-page="home" data-site-block="steps" data-site-field="badge" data-site-kind="text" className="text-[12px] font-bold tracking-wider uppercase accent-text-bordered">
              {badge}
            </span>
          </div>

          <h2 data-site-page="home" data-site-block="steps" data-site-field="title" data-site-kind="text" className="text-balance text-3xl md:text-5xl lg:text-6xl font-bold mb-6 leading-[1.1] tracking-tight text-black max-w-4xl mx-auto">
            {defaultHeadline ? <>From vision to viral in <span className="accent-text-bordered">minutes</span>, not days</> : headline}
          </h2>

          <p data-site-page="home" data-site-block="steps" data-site-field="body" data-site-kind="text" className="text-base md:text-lg text-gray-500 max-w-2xl mx-auto leading-relaxed">
            {intro}
          </p>
        </div>

        {/* Steps Grid - Updated to 4 columns as per screenshot */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-4 max-w-[1400px] mx-auto">
          {shown.map((item, index) => (
            <div
              key={item.id}
              className="bg-white rounded-[1.5rem] p-6 border border-gray-100 shadow-sm flex flex-col h-full hover:shadow-xl transition-all duration-300 group"
            >
              <div className="mb-6">
                <span data-site-page="home" data-site-block="steps" data-site-item={item.id} data-site-field="step" data-site-kind="text" className="text-[10px] font-bold tracking-widest text-gray-400 uppercase block mb-2">
                  {item.step}
                </span>
                <h3 data-site-page="home" data-site-block="steps" data-site-item={item.id} data-site-field="title" data-site-kind="text" className="text-lg font-bold text-black mb-3 leading-tight transition-all" onMouseEnter={(e) => { e.currentTarget.classList.add('accent-text-bordered'); }} onMouseLeave={(e) => { e.currentTarget.classList.remove('accent-text-bordered'); }}>
                  {item.title}
                </h3>
                <p data-site-page="home" data-site-block="steps" data-site-item={item.id} data-site-field="body" data-site-kind="text" className="text-sm text-gray-500 leading-relaxed min-h-[60px]">
                  {item.description}
                </p>
              </div>

              <div className="group/still relative mt-auto aspect-[4/3] overflow-hidden rounded-xl border border-teal-100 bg-teal-50">
                <img
                  src={item.image}
                  alt=""
                  data-site-page="home"
                  data-site-block="steps"
                  data-site-item={item.id}
                  data-site-field="image"
                  data-site-kind="image"
                  className="h-full w-full object-cover transition duration-500 ease-out motion-safe:group-hover/still:scale-105"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0f766e]/45 via-transparent to-[#14b8a6]/15 transition duration-500 motion-safe:group-hover/still:from-[#0f766e]/25" />
              </div>
            </div>
          ))}
        </div>

        {/* CTA Button */}
        <div className="mt-16 text-center">
          <Link to="/book">
            <Button className="text-white font-bold text-lg px-8 py-7 rounded-2xl shadow-xl shadow-teal-100 transition-all hover:scale-105 active:scale-95 group" style={{ backgroundColor: settings.global.primaryColor }}>
              BOOK YOUR SESSION
              <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Decorative background element */}
      <div className="absolute top-[-20%] left-[-10%] w-[40%] h-[40%] bg-white rounded-full blur-[120px] opacity-40"></div>
      <div className="absolute bottom-[-10%] right-[-5%] w-[30%] h-[30%] bg-[#ccfbf1]/20 rounded-full blur-[100px] opacity-30"></div>
    </section>
  );
}
