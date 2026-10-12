import { useSiteText } from "@/content/siteContent";

export default function AudienceSection() {
  const badge = useSiteText("home", "audience", "badge", "WHO IT'S FOR");
  const title = useSiteText("home", "audience", "title", "Tailored for real estate and visual storytelling professionals");
  const defaultTitle = title === "Tailored for real estate and visual storytelling professionals";
  const body = useSiteText("home", "audience", "body", "Iconic simplifies media creation for real estate professionals, builders, and business owners — helping you showcase your vision and grow your presence.");
  return (
    <section className="bg-white pt-10 md:pt-12 pb-12">
      <div className="container mx-auto px-4 text-center">
        {/* Badge */}
        <div className="inline-flex items-center px-4 py-1.5 rounded-md bg-black border border-black mb-8 shadow-lg">
          <span data-site-page="home" data-site-block="audience" data-site-field="badge" data-site-kind="text" className="text-[12px] font-bold tracking-wider uppercase accent-text-bordered">
            {badge}
          </span>
        </div>

        <h2 data-site-page="home" data-site-block="audience" data-site-field="title" data-site-kind="text" className="text-3xl md:text-5xl font-bold mb-6 leading-[1.2] tracking-tight text-black max-w-4xl mx-auto">
          {defaultTitle ? <>Tailored for real estate and visual <br className="hidden md:block" /><span className="accent-text-bordered">storytelling</span> professionals</> : title}
        </h2>

        <p data-site-page="home" data-site-block="audience" data-site-field="body" data-site-kind="text" className="text-gray-500 mb-8 max-w-2xl mx-auto leading-relaxed text-base">
          {body}
        </p>
      </div>
    </section>
  );
}
