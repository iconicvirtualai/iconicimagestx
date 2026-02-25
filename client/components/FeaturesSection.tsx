import { Play, ArrowRight, Instagram, Facebook, Linkedin, Youtube, Twitter, MousePointer2, Link as LinkIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";

const FeatureCard = ({
  title,
  description,
  children,
  colSpan = "col-span-1",
  ctaText,
  ctaLink,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  colSpan?: string;
  ctaText?: string;
  ctaLink?: string;
}) => (
  <div className={`bg-[#f8fdff] rounded-2xl border border-dashed border-[#ccfbf1] p-6 flex flex-col ${colSpan} relative group`}>
    <div className="flex-1 mb-6">
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-lg font-bold text-black">{title}</h3>
        {ctaLink && (
          <Link to={ctaLink}>
            <Button size="sm" className="bg-[#0d9488] hover:bg-[#0f766e] text-white text-[10px] h-7 px-3 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
              {ctaText || "TRY NOW"}
            </Button>
          </Link>
        )}
      </div>
      <p className="text-gray-500 text-[11px] leading-relaxed">
        {description}
      </p>
    </div>
    <div className="relative rounded-xl overflow-hidden bg-white border border-gray-100 shadow-sm h-48">
      {children}
    </div>
    {ctaLink && (
       <div className="mt-4 md:hidden">
         <Link to={ctaLink}>
            <Button size="sm" className="w-full bg-[#0d9488] hover:bg-[#0f766e] text-white text-[10px] h-8 rounded-lg">
              {ctaText || "TRY NOW"}
            </Button>
          </Link>
       </div>
    )}
  </div>
);

const VirtualStagingSnippet = () => {
  const [isStaged, setIsStaged] = useState(false);
  const [step, setStep] = useState(0); // 0: initial, 1: dragging, 2: processing, 3: result

  useEffect(() => {
    const timer = setInterval(() => {
      setStep((prev) => (prev + 1) % 4);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (step === 3) setIsStaged(true);
    else if (step === 0) setIsStaged(false);
  }, [step]);

  return (
    <div className="relative h-full w-full bg-gray-50 flex items-center justify-center overflow-hidden">
      {/* Background Room */}
      <AnimatePresence mode="wait">
        {!isStaged ? (
          <motion.img
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            src="https://images.unsplash.com/photo-1600607687940-47a0f9259017?w=400&q=225&fit=crop"
            className="absolute inset-0 w-full h-full object-cover"
            alt="Empty Room"
          />
        ) : (
          <motion.img
            key="staged"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=400&q=225&fit=crop"
            className="absolute inset-0 w-full h-full object-cover"
            alt="Staged Room"
          />
        )}
      </AnimatePresence>

      {/* Animation Overlay */}
      <div className="absolute inset-0 z-20 pointer-events-none">
        {/* Cursor & Photo Icon */}
        {step === 1 && (
          <motion.div
            initial={{ x: -100, y: 100, opacity: 0 }}
            animate={{ x: 0, y: 0, opacity: 1 }}
            transition={{ duration: 1, ease: "easeOut" }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
          >
            <div className="bg-white p-2 rounded-lg shadow-xl border border-gray-100 rotate-6 mb-2">
              <div className="w-12 h-12 bg-[#f0fdfa] rounded flex items-center justify-center">
                <LinkIcon className="w-6 h-6 text-[#0d9488]" />
              </div>
            </div>
            <MousePointer2 className="w-6 h-6 text-black fill-black" />
          </motion.div>
        )}

        {/* Processing State */}
        {step === 2 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[2px]"
          >
            <div className="bg-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-[#0d9488] border-t-transparent rounded-full animate-spin"></div>
              <span className="text-[10px] font-bold text-gray-700">AI STAGING...</span>
            </div>
          </motion.div>
        )}

        {/* Labels */}
        <div className="absolute bottom-3 left-3 flex gap-2">
           <div className="bg-white/90 backdrop-blur-md px-2 py-1 rounded-md text-[8px] font-bold shadow-sm flex items-center gap-1 border border-gray-100">
            <div className={`w-1 h-1 rounded-full ${isStaged ? "bg-[#0d9488]" : "bg-gray-300"}`}></div>
            {isStaged ? "STAGED RESULT" : "EMPTY SPACE"}
          </div>
        </div>
      </div>
    </div>
  );
};

export default function FeaturesSection() {
  return (
    <section className="bg-white py-20 md:py-24">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center px-3 py-1 rounded-md bg-[#f0fdfa] border border-[#ccfbf1] mb-6">
            <span className="text-[10px] font-bold tracking-wider text-[#0d9488] uppercase">
              ADDITIONAL FEATURES
            </span>
          </div>
          <h2 className="text-3xl md:text-5xl font-bold mb-6 text-black max-w-4xl mx-auto tracking-tight">
            Go beyond basic editing with <span className="text-[#0d9488]">powerful</span> add-on tools
          </h2>
          <p className="text-gray-500 max-w-2xl mx-auto text-sm leading-relaxed">
            Iconic isn't just about reels — enhance your content with smart AI tools 
            designed to polish, extend, and personalize every video.
          </p>
        </div>

        {/* Features Bento Grid (3-Column Layout) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          
          {/* Image to Video */}
          <FeatureCard 
            title="Image to Video"
            description="Effortlessly convert your property still images into captivating video tours that highlight key features and create immersive experiences for potential buyers."
            colSpan="md:col-span-2"
          >
            <div className="flex h-full items-center justify-center p-4 gap-4">
              <img src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=400&q=225&fit=crop" className="w-1/2 h-full object-cover rounded-lg border border-gray-100" alt="Before" />
              <ArrowRight className="w-6 h-6 text-[#0d9488] shrink-0" />
              <div className="w-1/2 h-full relative rounded-lg overflow-hidden border border-gray-100">
                <img src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=400&q=225&fit=crop" className="w-full h-full object-cover" alt="After" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                  <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg">
                    <Play className="w-3 h-3 text-[#0d9488] fill-[#0d9488] translate-x-0.5" />
                  </div>
                </div>
              </div>
            </div>
          </FeatureCard>

          {/* One Click Import */}
          <FeatureCard 
            title="One Click Import"
            description="Pull listing photos directly from Realtor.com or Zillow to start your video in seconds."
          >
            <div className="flex flex-col h-full p-4 items-center justify-center gap-4 bg-[#f0f9ff]/30">
              <div className="flex gap-4">
                <div className="w-10 h-10 bg-white rounded-lg shadow-sm border border-gray-100 flex items-center justify-center font-bold text-red-500 text-xs">r</div>
                <div className="w-10 h-10 bg-white rounded-lg shadow-sm border border-gray-100 flex items-center justify-center font-bold text-blue-600 text-xs">Z</div>
              </div>
              <div className="bg-white px-4 py-2 rounded-lg border border-gray-100 shadow-md text-[10px] font-medium flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#0ea5e9]"></div>
                Importing Listing...
              </div>
            </div>
          </FeatureCard>

          {/* AI Virtual Staging */}
          <FeatureCard 
            title="AI Virtual Staging"
            description="Instantly furnish empty rooms with realistic AI staging to showcase your property's full potential."
            ctaText="TRY NOW"
            ctaLink="/services/virtual-staging"
          >
            <VirtualStagingSnippet />
          </FeatureCard>

          {/* AI Photo Edits */}
          <FeatureCard 
            title="AI Photo Edits"
            description="Make your listing photos stand out with AI-powered enhancements — like twilights, lawn repairs, and other edits that instantly elevate any property."
            colSpan="md:col-span-2"
          >
            <div className="relative h-full flex">
              <div className="w-1/2 h-full relative border-r border-white/50">
                <img src="https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?w=400&q=225&fit=crop" className="w-full h-full object-cover grayscale brightness-75" alt="Before" />
                <span className="absolute top-3 left-3 bg-white/20 backdrop-blur-md text-white text-[8px] font-bold px-2 py-0.5 rounded uppercase border border-white/30">Before</span>
              </div>
              <div className="w-1/2 h-full relative">
                <img src="https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?w=400&q=225&fit=crop" className="w-full h-full object-cover" alt="After" />
                <span className="absolute top-3 right-3 bg-[#0d9488]/80 backdrop-blur-md text-white text-[8px] font-bold px-2 py-0.5 rounded uppercase">After</span>
              </div>
              <div className="absolute left-1/2 top-0 bottom-0 w-[2px] bg-white z-10 flex items-center justify-center -translate-x-1/2">
                <div className="w-4 h-4 bg-white rounded-full shadow-lg border border-gray-100 flex items-center justify-center">
                  <div className="flex gap-[1px]">
                    <div className="w-[1px] h-2 bg-gray-300"></div>
                    <div className="w-[1px] h-2 bg-gray-300"></div>
                  </div>
                </div>
              </div>
            </div>
          </FeatureCard>

          {/* Studio */}
          <FeatureCard 
            title="Studio"
            description="Iconic's built-in editor that allows you to customize your videos with templates, music, captions, branding, and even your own photos or clips."
            colSpan="md:col-span-2"
          >
            <div className="bg-[#fcfdfd] h-full flex flex-col p-4">
              <div className="flex gap-4 mb-4">
                <div className="flex-1 bg-white border border-gray-100 rounded-lg shadow-sm p-3">
                  <div className="w-full aspect-video bg-gray-100 rounded-md overflow-hidden relative">
                    <img src="https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=400&q=225&fit=crop" className="w-full h-full object-cover" alt="Studio Preview" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Play className="w-4 h-4 text-white" />
                    </div>
                  </div>
                  <div className="mt-2 h-1 bg-[#0d9488] rounded-full w-2/3"></div>
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
            title="AI Voiceovers"
            description="Instantly generate natural-sounding narrations from a wide range of voices."
          >
            <div className="flex flex-col h-full p-4 items-center justify-center gap-4 bg-[#f0fdfa]/30">
              <div className="w-full bg-white border border-gray-100 rounded-lg p-3 shadow-md flex items-center gap-3">
                <div className="w-6 h-6 bg-[#0d9488] rounded-full flex items-center justify-center">
                  <Play className="w-2 h-2 text-white fill-white ml-0.5" />
                </div>
                <div className="flex-1 flex gap-1 items-center">
                  {[1,3,2,4,3,5,2,4,3].map((h, i) => (
                    <div key={i} className="flex-1 bg-[#ccfbf1]" style={{height: `${h*4}px`}}></div>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-medium text-gray-500">
                <span className="px-2 py-0.5 rounded bg-gray-100">Warm English Narrator</span>
              </div>
            </div>
          </FeatureCard>

          {/* Social Media Captions */}
          <FeatureCard 
            title="Social Media Captions"
            description="Automatically create captions optimized for Instagram, Facebook, LinkedIn, YouTube, and X."
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
            title="AI Avatars"
            description="Create professional video presentations with AI-generated avatars for a personal touch."
            colSpan="md:col-span-2"
          >
            <div className="flex h-full items-center justify-center p-4 gap-6">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="w-16 h-16 md:w-20 md:h-20 rounded-xl border-2 border-white shadow-lg overflow-hidden bg-gray-100 flex-shrink-0 first:border-[#0d9488] first:ring-2 first:ring-[#0d9488]/20">
                  <img src={`https://i.pravatar.cc/150?u=${i+10}`} className="w-full h-full object-cover" alt="Avatar" />
                </div>
              ))}
            </div>
          </FeatureCard>

        </div>
      </div>
    </section>
  );
}
