export default function AudienceSection() {
  return (
    <section className="bg-white py-24 md:py-32">
      <div className="container mx-auto px-4 text-center">
        {/* Badge */}
        <div className="inline-flex items-center px-4 py-1.5 rounded-md bg-[#f0fdfa] border border-[#ccfbf1] mb-8">
          <span className="text-[12px] font-bold tracking-wider text-[#0d9488] uppercase">
            WHO IT'S FOR
          </span>
        </div>

        {/* Headline */}
        <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-8 leading-[1.2] tracking-tight text-black max-w-4xl mx-auto">
          Tailored for real estate and visual <br className="hidden md:block" />
          <span className="text-[#0d9488]">storytelling</span> professionals
        </h2>

        {/* Description */}
        <p className="text-lg md:text-xl text-gray-500 mb-16 max-w-3xl mx-auto leading-relaxed">
          Iconic simplifies high-end media creation for all real estate and 
          creative professionals — helping you showcase properties and grow 
          your business with cinematic power.
        </p>
      </div>
    </section>
  );
}
