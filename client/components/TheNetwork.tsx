import { motion } from "framer-motion";
import { useSiteSettings } from "@/hooks/useSiteSettings";

export default function TheNetwork() {
  const settings = useSiteSettings();

  return (
    <section className="py-24 bg-white relative overflow-hidden">
      {/* Dynamic Background Patterns */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-[0.03]">
        <div 
          className="w-full h-full"
          style={{ 
            backgroundImage: `radial-gradient(${settings.global.primaryColor} 0.5px, transparent 0.5px)`, 
            backgroundSize: '40px 40px' 
          }}
        ></div>
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto text-center mb-16">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-8 tracking-tight text-black">
              Built Bigger Than <span style={{ color: settings.global.primaryColor }}>One Brand</span>
            </h2>
            
            <div className="space-y-6 text-xl md:text-2xl text-gray-500 leading-relaxed font-medium">
              <p>
                Iconic isn’t here to squeeze the market.<br />
                We’re here to <span className="text-black font-bold">expand it.</span>
              </p>
              <p className="pt-4 text-lg md:text-xl font-normal text-gray-400">
                We support aspiring creatives. We collaborate with growing producers. We’re shaping what modern media should look like — for the benefit of all.
              </p>
              <p className="pt-8 text-2xl md:text-3xl font-bold tracking-tight text-black italic">
                When the standard rises, <span style={{ color: settings.global.primaryColor }}>everyone rises.</span>
              </p>
            </div>
          </motion.div>
        </div>

        {/* Floating Photo Elements Composition */}
        <div className="relative h-[300px] md:h-[400px] max-w-5xl mx-auto">
          {/* Photo 1: Left Top */}
          <motion.div 
            initial={{ opacity: 0, x: -20, y: -20 }}
            whileInView={{ opacity: 1, x: 0, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="absolute top-0 left-[10%] w-[160px] h-[160px] md:w-[240px] md:h-[240px] rounded-[2rem] overflow-hidden shadow-xl z-20 border-4 border-white rotate-[-3deg]"
          >
            <img 
              src="https://images.unsplash.com/photo-1542038784456-1ea8e935640e?w=500&q=80" 
              alt="Creative collaboration"
              className="w-full h-full object-cover grayscale opacity-90 group-hover:grayscale-0 transition-all duration-700"
            />
          </motion.div>

          {/* Photo 2: Right Middle */}
          <motion.div 
            initial={{ opacity: 0, x: 20, y: 10 }}
            whileInView={{ opacity: 1, x: 0, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="absolute top-[20%] right-[10%] w-[180px] h-[180px] md:w-[280px] md:h-[280px] rounded-[2rem] overflow-hidden shadow-2xl z-10 border-4 border-white rotate-[4deg]"
          >
            <img 
              src="https://images.unsplash.com/photo-1600607687940-47a0f9259017?w=600&q=80" 
              alt="Media production"
              className="w-full h-full object-cover"
            />
          </motion.div>

          {/* Photo 3: Center Bottom */}
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="absolute bottom-0 left-[35%] w-[140px] h-[140px] md:w-[220px] md:h-[220px] rounded-[2rem] overflow-hidden shadow-2xl z-30 border-4 border-white rotate-[-2deg]"
          >
            <img 
              src="https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=500&q=80" 
              alt="Architectural detail"
              className="w-full h-full object-cover grayscale opacity-80"
            />
          </motion.div>

          {/* Decorative Accents */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-px bg-gradient-to-r from-transparent via-gray-100 to-transparent -z-10"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[80%] w-px bg-gradient-to-b from-transparent via-gray-100 to-transparent -z-10"></div>
        </div>
      </div>
    </section>
  );
}
