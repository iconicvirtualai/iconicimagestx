import { useSiteSettings } from "@/hooks/useSiteSettings";

export default function AudienceSection() {
  const settings = useSiteSettings();
  return (
    <section className="bg-white pt-10 md:pt-12 pb-12">
      <div className="container mx-auto px-4 text-center">
        {/* Badge */}
        <div className="inline-flex items-center px-4 py-1.5 rounded-md bg-black border border-black mb-8 shadow-lg">
          <span className="text-[12px] font-bold tracking-wider uppercase accent-text-bordered">
            WHO IT'S FOR
          </span>
        </div>

        {/* Headline */}
        <h2 className="text-3xl md:text-5xl font-bold mb-6 leading-[1.2] tracking-tight text-black max-w-4xl mx-auto">
          Tailored for real estate and visual <br className="hidden md:block" />
          <span className="accent-text-bordered">storytelling</span> professionals
        </h2>

        {/* Description */}
        <p className="text-gray-500 mb-8 max-w-2xl mx-auto leading-relaxed text-base">
          Iconic simplifies media creation for real estate professionals, builders,
          and business owners — helping you showcase your vision and grow your presence.
        </p>
      </div>
    </section>
  );
}
