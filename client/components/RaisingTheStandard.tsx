import { motion } from "framer-motion";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { Quote } from "lucide-react";

export default function RaisingTheStandard() {
  const settings = useSiteSettings();

  return (
    <section className="py-24 bg-black overflow-hidden border-t border-white/5">
      <div className="container mx-auto px-4">
        <div className="flex flex-col lg:flex-row items-center gap-16 max-w-6xl mx-auto">
          {/* Left: iPhone Video Player Placeholder */}
          <div className="w-full lg:w-1/2 flex justify-center lg:justify-end">
            <div className="relative w-[280px] h-[580px] md:w-[320px] md:h-[650px] bg-[#111] rounded-[3rem] border-[8px] border-[#222] shadow-2xl overflow-hidden group">
              {/* iPhone Notch */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-[#222] rounded-b-2xl z-20"></div>

              {/* Video Content */}
              <video
                src="https://videos.pexels.com/video-files/34236991/14509265_360_640_24fps.mp4"
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity duration-500"
              />

              {/* Overlay Gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none"></div>
            </div>
          </div>

          {/* Right: Text Content */}
          <div className="w-full lg:w-1/2 text-left">
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
            >
              <h2 className="text-4xl md:text-5xl font-black mb-8 tracking-tight text-white uppercase">
                We Raise the Bar.
              </h2>

              <div className="space-y-6 text-xl md:text-2xl text-gray-400 leading-relaxed font-medium">
                <p>
                  We don’t follow <span className="text-white font-bold">trends.</span><br />
                  We break <span className="text-teal-400 font-bold italic">patterns.</span>
                </p>
                <p>
                  We don’t <span className="text-white font-bold">undercut.</span><br />
                  We <span className="text-teal-400 font-bold italic">outperform.</span>
                </p>
                <p className="pt-4 text-lg md:text-xl font-normal border-t border-white/10 text-gray-500">
                  As the industry grows, it grows to the standard we’ve set.
                </p>
              </div>

              {/* Testimonial Box */}
              <div className="mt-12 p-8 rounded-3xl bg-white/5 border border-white/10 relative">
                <Quote className="absolute -top-4 -left-4 w-10 h-10 text-teal-400/20 fill-teal-400/20" />
                <p className="text-gray-300 italic mb-6 leading-relaxed">
                  "Iconic didn't just give us a video; they gave us a completely new way to represent our properties. Their standard is levels above anything else we've tried."
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-teal-500 flex items-center justify-center font-bold text-white shadow-lg">
                    JD
                  </div>
                  <div>
                    <p className="font-bold text-white text-sm">James Dalton</p>
                    <p className="text-gray-500 text-xs uppercase tracking-wider">Luxury Estate Group</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
