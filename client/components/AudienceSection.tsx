import { useSiteText } from "@/content/siteContent";

const DEFAULT_TITLE = "Who is Iconic for?";
const DEFAULT_BODY = "We're more than just a company. What's a company anyway? A group of people doing what they do, helping others with what they need.";

export default function AudienceSection() {
  const badge = useSiteText("home", "audience", "badge", "WHO IT'S FOR");
  const title = useSiteText("home", "audience", "title", DEFAULT_TITLE);
  const body = useSiteText("home", "audience", "body", DEFAULT_BODY);
  return (
    <section className="bg-white pb-8 pt-16 md:pt-20">
      <div className="container mx-auto px-4 text-center">
        <div className="mb-8 inline-flex items-center rounded-md border border-black bg-black px-4 py-1.5 shadow-lg">
          <span data-site-page="home" data-site-block="audience" data-site-field="badge" data-site-kind="text" className="accent-text-bordered text-[12px] font-bold uppercase tracking-wider">
            {badge}
          </span>
        </div>

        <h2 data-site-page="home" data-site-block="audience" data-site-field="title" data-site-kind="text" className="mx-auto mb-6 max-w-3xl text-balance text-3xl font-bold leading-[1.15] tracking-tight text-black md:text-5xl">
          {title}
        </h2>

        <p data-site-page="home" data-site-block="audience" data-site-field="body" data-site-kind="text" className="mx-auto mb-4 max-w-2xl text-balance text-base leading-relaxed text-gray-500 md:text-lg">
          {body}
        </p>
      </div>
    </section>
  );
}
