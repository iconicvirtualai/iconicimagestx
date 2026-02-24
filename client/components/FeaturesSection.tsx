import { Play, Download, Layout, Edit3, Image as ImageIcon, Mic, Share2, User } from "lucide-react";

const FeatureCard = ({
  title,
  description,
  image,
  isFullWidth = false,
}: {
  title: string;
  description: string;
  image: string;
  isFullWidth?: boolean;
}) => (
  <div className={`bg-[#e0f7f6]/40 rounded-[2.5rem] overflow-hidden border border-[#ccfbf1] p-8 md:p-12 flex flex-col ${isFullWidth ? "lg:col-span-2" : ""}`}>
    <div className="flex-1 mb-8">
      <h3 className="text-2xl font-bold text-black mb-4">{title}</h3>
      <p className="text-gray-500 leading-relaxed text-base max-w-xl">
        {description}
      </p>
    </div>
    <div className="relative rounded-3xl overflow-hidden aspect-[16/9] bg-white border border-white shadow-xl shadow-teal-500/5 group">
      <img
        src={image}
        alt={title}
        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
      />
      {/* Dynamic Overlay Elements (based on feature) */}
      {title === "AI Photo Edits" && (
        <div className="absolute inset-0 flex">
          <div className="w-1/2 border-r border-white/50 bg-black/5 flex items-center justify-center">
            <span className="bg-white px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider">Before</span>
          </div>
          <div className="w-1/2 flex items-center justify-center">
            <span className="bg-[#0d9488] text-white px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider">After</span>
          </div>
        </div>
      )}
      {title === "Image to Video" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-2xl">
            <Play className="w-6 h-6 text-[#0d9488] fill-[#0d9488] translate-x-0.5" />
          </div>
        </div>
      )}
    </div>
  </div>
);

export default function FeaturesSection() {
  const features = [
    {
      title: "Image to Video",
      description: "Instantly transform property photos into cinematic reels with dynamic transitions.",
      image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=450&fit=crop",
    },
    {
      title: "One Click Import",
      description: "Import listings directly from MLS, Zillow, or your personal portal in seconds.",
      image: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800&q=450&fit=crop",
    },
    {
      title: "AI Virtual Staging",
      description: "Instantly furnish empty rooms with realistic AI staging to showcase full potential.",
      image: "https://images.unsplash.com/photo-1600607687940-47a0f9259017?w=800&q=450&fit=crop",
    },
    {
      title: "AI Photo Edits",
      description: "Elevate your property photos with AI-powered sky replacements and color grading.",
      image: "https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?w=800&q=450&fit=crop",
    },
    {
      title: "Studio",
      description: "A professional editing suite built for speed. Customize every detail of your content.",
      image: "https://images.unsplash.com/photo-1536240478700-b869070f9279?w=1600&q=900&fit=crop",
      isFullWidth: true,
    },
    {
      title: "AI Voiceovers",
      description: "Generate natural-sounding narrations for your property tours in any language.",
      image: "https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=800&q=450&fit=crop",
    },
    {
      title: "Social Media Captions",
      description: "AI-generated hooks and captions optimized for high engagement on any platform.",
      image: "https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=800&q=450&fit=crop",
    },
    {
      title: "AI Avatars",
      description: "Bring your brand to life with professional AI presenters for your video tours.",
      image: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=1600&q=900&fit=crop",
      isFullWidth: true,
    },
  ];

  return (
    <section className="bg-white py-24 md:py-32">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="text-center mb-20">
          <div className="inline-flex items-center px-4 py-1.5 rounded-md bg-[#f0fdfa] border border-[#ccfbf1] mb-8">
            <span className="text-[12px] font-bold tracking-wider text-[#0d9488] uppercase">
              ADDITIONAL FEATURES
            </span>
          </div>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-8 leading-[1.2] tracking-tight text-black max-w-4xl mx-auto">
            Go beyond basic editing with <br className="hidden md:block" />
            <span className="text-[#0d9488]">powerful</span> add-on tools
          </h2>
          <p className="text-lg md:text-xl text-gray-500 max-w-3xl mx-auto leading-relaxed">
            Iconic isn't just about media capture — enhance your content with smart tools 
            designed to polish, extend, and personalize every asset.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-7xl mx-auto">
          {features.map((feature, index) => (
            <FeatureCard key={index} {...feature} />
          ))}
        </div>
      </div>
    </section>
  );
}
