import { Star, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function TestimonialsSection() {
  const testimonials = [
    {
      name: "Chris Lawrence",
      role: "Owner, Rip City Photography, LLC",
      content: "Iconic has completely transformed our production workflow. We've seen a 400% increase in media engagement since switching to their partnership model.",
      avatar: "https://i.pravatar.cc/150?u=chris",
    },
    {
      name: "Bryce Perez",
      role: "Founder, RE Media Company",
      content: "The quality and turnaround time are unmatched. Being able to offer cinematic reels within 24 hours has given us a massive competitive edge.",
      avatar: "https://i.pravatar.cc/150?u=bryce",
    },
    {
      name: "Mark Shepherd",
      role: "MD & Founder, Apollo3D Ltd, UK",
      content: "Everything from booking to delivery is seamless. It feels like having an elite creative team in-house without the overhead costs.",
      avatar: "https://i.pravatar.cc/150?u=mark",
    },
  ];

  return (
    <section className="bg-[#e0f7f6]/40 py-20 md:py-24 overflow-hidden">
      <div className="container mx-auto px-4 text-center max-w-6xl">
        {/* Badge */}
        <div className="inline-flex items-center px-4 py-1.5 rounded-md bg-white border border-[#ccfbf1] mb-8 shadow-sm">
          <span className="text-[12px] font-bold tracking-wider text-[#0d9488] uppercase">
            TESTIMONIALS
          </span>
        </div>

        {/* Headline */}
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6 leading-[1.2] tracking-tight text-black max-w-4xl mx-auto">
          What our people are saying
        </h2>
        <p className="text-base md:text-lg text-gray-500 mb-10 max-w-3xl mx-auto leading-relaxed">
          Media companies, photographers, and agents are using Iconic
          every day to boost their visual marketing and scale their impact.
        </p>

        {/* CTA Button */}
        <div className="mb-20">
          <Button className="bg-[#0f766e] text-white hover:bg-[#0d9488] font-bold text-lg px-12 py-7 rounded-xl shadow-lg shadow-teal-100 transition-all hover:scale-105">
            Start for free &rarr;
          </Button>
        </div>

        {/* Testimonials Grid/Carousel */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-7xl mx-auto mb-12">
          {testimonials.map((t, i) => (
            <div key={i} className="bg-white p-10 rounded-[2.5rem] border border-gray-100 shadow-sm text-left flex flex-col h-full hover:shadow-md transition-shadow">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-100 border-2 border-white shadow-sm">
                  <img src={t.avatar} alt={t.name} className="w-full h-full object-cover" />
                </div>
                <div>
                  <h4 className="font-bold text-black">{t.name}</h4>
                  <p className="text-gray-400 text-xs uppercase tracking-wider font-semibold">{t.role}</p>
                </div>
              </div>
              <p className="text-gray-600 leading-relaxed italic mb-8 flex-1">
                "{t.content}"
              </p>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} className="w-4 h-4 text-[#22c55e] fill-[#22c55e]" />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Pagination Controls */}
        <div className="flex items-center justify-center gap-4">
          <button className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 hover:text-black hover:border-black transition-all">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5, 6].map((p) => (
              <div key={p} className={`w-2.5 h-2.5 rounded-full ${p === 1 ? "bg-[#0d9488]" : "bg-gray-200"}`}></div>
            ))}
          </div>
          <button className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 hover:text-black hover:border-black transition-all">
            <ChevronRight className="w-6 h-6" />
          </button>
        </div>
      </div>
    </section>
  );
}
