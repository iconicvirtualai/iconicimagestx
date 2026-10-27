import { Play, ArrowRight, Instagram, Facebook, Linkedin, Youtube, Twitter } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { itemText, useSiteItems, useSiteText } from "@/content/siteContent";
import { FEATURED_SNAP_REEL } from "@/lib/snapReels";
import { VOICE_SAMPLE_SLOTS } from "@/lib/voiceSamples";

const FeatureCard = ({
  title,
  description,
  children,
  colSpan = "col-span-1",
  ctaText,
  ctaLink,
  itemId,
  previewClassName = "h-48",
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  colSpan?: string;
  ctaText?: string;
  ctaLink?: string;
  itemId?: string;
  previewClassName?: string;
}) => {
  const settings = useSiteSettings();
  return (
    <div className={`bg-[#f8fdff] rounded-2xl border border-dashed border-[#ccfbf1] p-6 flex flex-col ${colSpan} relative group`}>
      <div className="flex-1 mb-6">
        <div className="flex justify-between items-start mb-2">
          <h3 data-site-page="home" data-site-block="features" data-site-item={itemId} data-site-field="title" data-site-kind="text" className="text-lg font-bold text-black">{title}</h3>
          {ctaLink && (
            <Link to={ctaLink}>
              <Button size="sm" className="text-white text-[10px] h-7 px-3 rounded-lg md:opacity-0 md:group-hover:opacity-100 transition-opacity" style={{ backgroundColor: settings.global.primaryColor }}>
                {ctaText || "TRY NOW"}
              </Button>
            </Link>
          )}
        </div>
        <p data-site-page="home" data-site-block="features" data-site-item={itemId} data-site-field="body" data-site-kind="text" className="text-gray-500 text-[11px] leading-relaxed">
          {description}
        </p>
      </div>
      <div className={`relative overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm ${previewClassName}`}>
        {children}
      </div>
      {ctaLink && (
         <div className="mt-4 md:hidden">
           <Link to={ctaLink}>
              <Button size="sm" className="w-full text-white text-[10px] h-8 rounded-lg" style={{ backgroundColor: settings.global.primaryColor }}>
                {ctaText || "TRY NOW"}
              </Button>
            </Link>
         </div>
      )}
    </div>
  );
};

const AiPhotoEditSnippet = () => {
  return (
    <div className="relative h-full">
      <img
        src="/media/home/hero-16x9.jpg"
        alt="Twilight front elevation"
        className="h-full w-full object-cover"
      />
      <span className="absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-md bg-black/70 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-white">
        Twilight
      </span>
    </div>
  );
};

const VirtualStagingSnippet = () => {
  return (
    <div className="relative h-full w-full overflow-hidden bg-gray-50">
      <img
        src="/media/photos/staged-living-room.jpg"
        alt="Virtually staged living room"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute bottom-3 left-3 rounded-md border border-gray-100 bg-white/90 px-2 py-1 text-[8px] font-bold shadow-sm">
        Staged living room
      </div>
    </div>
  );
};

const AVATAR_PORTRAITS = [
  { src: "/media/photos/headshot-gracepoint-4.jpg", alt: "Headshot in front of office windows" },
  { src: "/media/photos/studio-mtz01691.jpg", alt: "Studio portrait" },
  { src: "/media/photos/lifestyle-daughtery-mtz00636.jpg", alt: "Lifestyle portrait against a white brick wall" },
  { src: "/media/photos/lifestyle-logan-dan02309.jpg", alt: "Outdoor portrait" },
  { src: "/media/photos/holiday-mtz08102.jpg", alt: "Holiday portrait" },
];

function VoiceSamplePlayer() {
  const [active, setActive] = useState<string>(VOICE_SAMPLE_SLOTS[0].id);
  return (
    <ul className="flex h-full flex-col justify-center gap-1.5 bg-[#f0fdfa]/40 px-3 py-3" aria-label="AI voice samples">
      {VOICE_SAMPLE_SLOTS.map((sample) => {
        const selected = active === sample.id;
        return (
          <li key={sample.id}>
            <button
              type="button"
              data-voice-sample={sample.id}
              aria-pressed={selected}
              onClick={() => setActive(sample.id)}
              className={`flex w-full items-center gap-2 rounded-full border px-2 py-1 text-left ${selected ? "border-teal-200 bg-white shadow-sm" : "border-transparent bg-white/70"}`}
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#0d9488]" aria-hidden="true">
                <Play className="h-2.5 w-2.5 fill-white text-white" />
              </span>
              <span className="text-[10px] font-bold text-black">{sample.label}</span>
              <span className="ml-auto flex h-4 w-[88px] items-end gap-px" aria-hidden="true">
                {sample.bars.map((height, index) => (
                  <span key={index} className="flex-1 rounded-sm bg-[#99f6e4]" style={{ height: `${height}px` }} />
                ))}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const FEATURE_TITLE = "Go beyond basic editing with powerful add-on tools";
const FEATURE_BODY = "Iconic isn't just about reels — enhance your content with smart AI tools designed to polish, extend, and personalize every video.";

export default function FeaturesSection() {
  const settings = useSiteSettings();
  const badge = useSiteText("home", "features", "badge", "ADDITIONAL FEATURES");
  const title = useSiteText("home", "features", "title", FEATURE_TITLE);
  const body = useSiteText("home", "features", "body", FEATURE_BODY);
  const saved = useSiteItems("home", "features");
  const copy = (id: string, fallbackTitle: string, fallbackBody: string) => {
    const item = saved?.find((entry) => entry.id === id);
    return {
      title: item ? itemText(item, "title") : fallbackTitle,
      description: item ? itemText(item, "body") : fallbackBody,
      itemId: id,
    };
  };
  return (
    <section className="bg-white py-20 md:py-24">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center px-3 py-1 rounded-md bg-black border border-black mb-6 shadow-lg">
            <span data-site-page="home" data-site-block="features" data-site-field="badge" data-site-kind="text" className="text-[10px] font-bold tracking-wider uppercase accent-text-bordered">
              {badge}
            </span>
          </div>
          <h2 data-site-page="home" data-site-block="features" data-site-field="title" data-site-kind="text" className="text-3xl md:text-5xl font-bold mb-6 text-black max-w-4xl mx-auto tracking-tight">
            {title === FEATURE_TITLE ? <>Go beyond basic editing with <span className="accent-text-bordered">powerful</span> add-on tools</> : title}
          </h2>
          <p data-site-page="home" data-site-block="features" data-site-field="body" data-site-kind="text" className="text-gray-500 max-w-2xl mx-auto text-sm leading-relaxed">
            {body}
          </p>
        </div>

        {/* Features Bento Grid (3-Column Layout) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">

          {/* Snap Reels */}
          <FeatureCard
            {...copy("snap", "Snap Reels", "Turn the listing stills into a 9:16 Snap Reel. A vertical cut buyers can watch before they ever book a showing.")}
            colSpan="md:col-span-2"
          >
            <div className="flex h-full items-center justify-center gap-3 bg-[#f4f7f8] px-3">
              <img
                src="/media/launch/kitchen_island_hero.jpg"
                className="h-[88%] w-auto max-w-[46%] rounded-2xl border border-gray-100 object-cover"
                alt="Listing kitchen still"
              />
              <ArrowRight className="h-5 w-5 shrink-0" style={{ color: settings.global.primaryColor }} />
              <div className="relative h-[88%] aspect-[9/16] overflow-hidden rounded-[1.15rem] border border-gray-100 bg-black">
                <video
                  src={FEATURED_SNAP_REEL.src}
                  className="h-full w-full object-cover"
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  aria-label={`Snap Reel — ${FEATURED_SNAP_REEL.title}`}
                />
                <span className="absolute bottom-2 left-2 rounded-md bg-black/70 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-white">
                  Snap Reel
                </span>
              </div>
            </div>
          </FeatureCard>

          {/* One Click Import */}
          <FeatureCard
            {...copy("import", "One Click Import", "Pull listing photos directly from Realtor.com or Zillow to start your video in seconds.")}
          >
            <div className="flex flex-col h-full p-4 items-center justify-center gap-4 bg-[#f0f9ff]/30">
              <div className="flex gap-4">
                <div className="w-10 h-10 bg-white rounded-lg shadow-sm border border-gray-100 flex items-center justify-center font-bold text-red-500 text-xs">r</div>
                <div className="w-10 h-10 bg-white rounded-lg shadow-sm border border-gray-100 flex items-center justify-center font-bold text-blue-600 text-xs">Z</div>
              </div>
              <div className="bg-white px-4 py-2 rounded-lg border border-gray-100 shadow-md text-[10px] font-medium flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: settings.global.secondaryColor }}></div>
                Importing Listing...
              </div>
            </div>
          </FeatureCard>

          {/* AI Virtual Staging */}
          <FeatureCard
            {...copy("staging", "AI Virtual Staging", "Instantly furnish empty rooms with realistic AI staging to showcase your property's full potential.")}
            ctaText="TRY NOW"
            ctaLink="/services/virtual-staging"
          >
            <VirtualStagingSnippet />
          </FeatureCard>

          {/* AI Photo Edits */}
          <FeatureCard
            {...copy("edits", "AI Photo Edits", "Make your listing photos stand out with AI-powered enhancements — like twilights, lawn repairs, and other edits that instantly elevate any property.")}
            colSpan="md:col-span-2"
          >
            <AiPhotoEditSnippet />
          </FeatureCard>

          {/* Studio */}
          <FeatureCard
            {...copy("studio", "Studio", "Iconic's built-in editor that allows you to customize your videos with templates, music, captions, branding, and even your own photos or clips.")}
            colSpan="md:col-span-2"
          >
            <div className="bg-[#fcfdfd] h-full flex flex-col p-4">
              <div className="flex gap-4 mb-4">
                <div className="flex-1 bg-white border border-gray-100 rounded-lg shadow-sm p-3">
                  <div className="w-full aspect-video bg-gray-100 rounded-md overflow-hidden relative">
                    <img src="/media/photos/studio-mtz01691.jpg" className="h-full w-full object-cover object-[center_18%]" alt="Studio portrait" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Play className="w-4 h-4 text-white" />
                    </div>
                  </div>
                  <div className="mt-2 h-1 rounded-full w-2/3" style={{ backgroundColor: settings.global.primaryColor }}></div>
                </div>
                <div className="w-24 flex flex-col gap-2">
                  <div className="h-4 bg-gray-50 rounded border border-gray-100"></div>
                  <div className="h-4 bg-gray-50 rounded border border-gray-100"></div>
                  <div className="h-4 bg-gray-50 rounded border border-gray-100"></div>
                </div>
              </div>
              <div className="mt-auto flex justify-between items-center text-[8px] font-bold text-gray-400 uppercase tracking-widest">
                <span>00:15 / 00:45</span>
                <span>HD 1080p</span>
              </div>
            </div>
          </FeatureCard>

          {/* AI Voiceovers */}
          <FeatureCard
            {...copy("voice", "AI Voiceovers", "Instantly generate natural-sounding narrations from a wide range of voices.")}
            previewClassName="h-auto min-h-[15.5rem]"
          >
            <VoiceSamplePlayer />
          </FeatureCard>

          {/* Social Media Captions */}
          <FeatureCard
            {...copy("captions", "Social Media Captions", "Automatically create captions optimized for Instagram, Facebook, LinkedIn, YouTube, and X.")}
          >
            <div className="flex flex-col h-full p-4 items-center justify-center gap-4">
              <div className="flex gap-2 mb-2">
                <Instagram className="w-5 h-5 text-pink-500" />
                <Facebook className="w-5 h-5 text-blue-600" />
                <Linkedin className="w-5 h-5 text-blue-700" />
                <Youtube className="w-5 h-5 text-red-600" />
                <Twitter className="w-5 h-5 text-black" />
              </div>
              <div className="w-full bg-gray-50 border border-dashed border-gray-200 rounded-lg p-3 text-[9px] text-gray-400 italic">
                "Welcome to the most stunning property in The Woodlands..."
              </div>
            </div>
          </FeatureCard>

          {/* AI Avatars */}
          <FeatureCard
            {...copy("avatars", "AI Avatars", "Create professional video presentations with AI-generated avatars for a personal touch.")}
            colSpan="md:col-span-2"
          >
            <div className="flex h-full items-center justify-center gap-3 overflow-hidden bg-[radial-gradient(circle_at_center,_#f0fdfa,_#ffffff_70%)] px-3 md:gap-4">
              {AVATAR_PORTRAITS.map((portrait, index) => (
                <div
                  key={portrait.src}
                  className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-full border-2 border-white bg-gray-100 shadow-lg sm:h-16 sm:w-16 md:h-20 md:w-20"
                  style={index === 0 ? { boxShadow: `0 0 0 2px ${settings.global.primaryColor}` } : undefined}
                >
                  <img src={portrait.src} className="h-full w-full object-cover object-[center_15%]" alt={portrait.alt} />
                </div>
              ))}
            </div>
          </FeatureCard>

        </div>
      </div>
    </section>
  );
}
