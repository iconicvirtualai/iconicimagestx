import { motion } from "framer-motion";
import { useSiteSettings } from "@/hooks/useSiteSettings";

export default function ThisIsOurMarket() {
  const settings = useSiteSettings();

  return (
    <section className="py-24 bg-gray-50 overflow-hidden relative">
      {/* Background Decor */}
      <div className="absolute top-0 right-0 w-[40%] h-[100%] bg-teal-50/50 -skew-x-12 transform origin-top-right -z-10 blur-3xl opacity-30" style={{ backgroundColor: `${settings.global.primaryColor}10` }}></div>
      
      <div className="container mx-auto px-4 relative z-10">
        <div className="flex flex-col lg:flex-row items-center gap-12 max-w-6xl mx-auto">
          {/* Left: Text Content */}
          <div className="w-full lg:w-3/5 text-left">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
            >
              <h2 className="text-4xl md:text-5xl font-bold mb-8 tracking-tight text-black">
                This Is Our Market.
              </h2>
              
              <div className="space-y-6 text-xl md:text-2xl text-gray-500 leading-relaxed font-medium">
                <p>
                  Iconic was <span className="text-black font-bold">built here.</span><br />
                  We’ve <span style={{ color: settings.global.primaryColor }} className="font-bold">invested here.</span><br />
                  We’ve <span className="text-black font-bold">shaped here.</span>
                </p>
                
                <p className="text-black font-bold pt-4">
                  And we’re not finished.
                </p>

                <p className="text-lg md:text-xl text-gray-400 font-normal">
                  We’re building systems.<br />
                  We’re building people.<br />
                  We’re building momentum that compounds.
                </p>

                <p className="pt-8 text-2xl md:text-3xl font-bold tracking-tight text-black">
                  Winning brands don’t <span className="text-gray-300">chase.</span><br />
                  They <span style={{ color: settings.global.primaryColor }}>choose Iconic.</span>
                </p>
              </div>
            </motion.div>
          </div>

          {/* Right: Visual Content (Photo Grid/Composition) */}
          <div className="w-full lg:w-2/5 flex items-center justify-center relative h-[500px]">
            <div className="relative w-full h-full">
              {/* Main Image */}
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8 }}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[400px] md:w-[350px] md:h-[450px] rounded-3xl overflow-hidden shadow-2xl z-20 border-8 border-white"
              >
                <img
                  src="https://images.unsplash.com/photo-1542038784456-1ea8e935640e?w=800&q=80&fm=webp"
                  alt="Creative team at work"
                  className="w-full h-full object-cover grayscale brightness-90 group-hover:grayscale-0 transition-all duration-700"
                />
              </motion.div>

              {/* Secondary Floating Image */}
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: 0.2 }}
                className="absolute top-[10%] -right-10 w-[200px] h-[260px] rounded-2xl overflow-hidden shadow-2xl z-30 border-4 border-white"
              >
                <img
                  src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=600&q=80&fm=webp"
                  alt="High end property visuals"
                  className="w-full h-full object-cover"
                />
              </motion.div>

              {/* Third Floating Decor Element */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: 0.4 }}
                className="absolute bottom-10 -left-10 w-24 h-24 rounded-2xl shadow-xl z-10 p-4 border border-teal-100 bg-white"
                style={{ borderColor: `${settings.global.primaryColor}30` }}
              >
                <div className="w-full h-full rounded-lg animate-pulse opacity-20" style={{ backgroundColor: settings.global.primaryColor }}></div>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
