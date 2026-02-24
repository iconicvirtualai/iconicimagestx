export default function StepsSection() {
  return (
    <section className="bg-[#e0f7f6]/40 py-24 md:py-32 relative overflow-hidden">
      <div className="container mx-auto px-4 text-center relative z-10">
        {/* Badge */}
        <div className="inline-flex items-center px-4 py-1.5 rounded-md bg-white border border-[#ccfbf1] mb-8 shadow-sm">
          <span className="text-[12px] font-bold tracking-wider text-[#0d9488] uppercase">
            4 STEPS TO RESULTS
          </span>
        </div>

        {/* Headline */}
        <h2 className="text-4xl md:text-5xl lg:text-7xl font-bold mb-8 leading-[1.1] tracking-tight text-black max-w-5xl mx-auto">
          Create scroll-stopping reels in <br className="hidden md:block" />
          <span className="text-[#0d9488]">minutes</span>, not days
        </h2>

        {/* Placeholder for steps or more content */}
        <p className="text-lg md:text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed">
           Our proprietary production workflow removes the friction from content creation, 
           enabling your brand to publish studio-quality media at the speed of social.
        </p>
      </div>

      {/* Decorative background element */}
      <div className="absolute top-[-20%] left-[-10%] w-[40%] h-[40%] bg-white rounded-full blur-[120px] opacity-40"></div>
    </section>
  );
}
