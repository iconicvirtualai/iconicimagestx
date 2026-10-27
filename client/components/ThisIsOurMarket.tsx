import { motion } from "framer-motion";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { useSiteText } from "@/content/siteContent";

const MARKET_BODY = "Iconic was built here. We’ve invested here. We’ve shaped here. Winning brands don’t chase. They choose Iconic.";

export default function ThisIsOurMarket() {
  const settings = useSiteSettings();
  const titleLead = useSiteText("home", "market", "titleLead", "This Is");
  const titleAccent = useSiteText("home", "market", "titleAccent", "OUR");
  const titleTail = useSiteText("home", "market", "titleTail", "Market.");
  const body = useSiteText("home", "market", "body", MARKET_BODY);

  return (
    <section className="py-24 bg-black overflow-hidden relative border-t border-white/5">
      {/* Background Decor */}
      <div className="absolute top-0 right-0 w-[40%] h-[100%] bg-teal-500/5 -skew-x-12 transform origin-top-right -z-10 blur-3xl opacity-30"></div>

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
              <h2 className="text-4xl md:text-5xl font-black mb-8 tracking-tight text-white uppercase">
                <span data-site-page="home" data-site-block="market" data-site-field="titleLead" data-site-kind="text">{titleLead}</span>{" "}
                <span className="text-teal-400" data-site-page="home" data-site-block="market" data-site-field="titleAccent" data-site-kind="text">{titleAccent}</span>{" "}
                <span data-site-page="home" data-site-block="market" data-site-field="titleTail" data-site-kind="text">{titleTail}</span>
              </h2>

              {body !== MARKET_BODY ? (
                <p data-site-page="home" data-site-block="market" data-site-field="body" data-site-kind="text" className="text-xl md:text-2xl text-gray-400 leading-relaxed font-medium">{body}</p>
              ) : null}
              <div data-site-page="home" data-site-block="market" data-site-field="body" data-site-kind="text" className={`space-y-6 text-xl md:text-2xl text-gray-400 leading-relaxed font-medium ${body !== MARKET_BODY ? "hidden" : ""}`}>
                <p>
                  Iconic was <span className="text-white font-bold">built here.</span><br />
                  We’ve <span className="text-teal-400 font-bold italic">invested here.</span><br />
                  We’ve <span className="text-white font-bold">shaped here.</span>
                </p>

                <p className="text-white font-bold pt-4">
                  And we’re not finished.
                </p>

                <p className="text-lg md:text-xl text-gray-500 font-normal">
                  We’re building systems.<br />
                  We’re building people.<br />
                  We’re building momentum that compounds.
                </p>

                <p className="pt-8 text-2xl md:text-3xl font-bold tracking-tight text-white">
                  Winning brands don’t <span className="text-gray-600">chase.</span><br />
                  They <span className="text-teal-400 italic">choose Iconic.</span>
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
                className="absolute top-1/2 left-1/2 -translate-x-[58%] -translate-y-1/2 h-[280px] w-[280px] md:h-[340px] md:w-[340px] overflow-hidden rounded-full border-8 border-[#111] shadow-2xl z-20"
              >
                <img
                  src="/media/photos/lifestyle-mtz04802.jpg"
                  alt="Iconic portrait on location"
                  className="h-full w-full object-cover object-[center_18%]"
                />
              </motion.div>

              {/* Secondary Floating Image */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: 0.2 }}
                className="absolute top-[8%] -right-6 h-[150px] w-[210px] overflow-hidden rounded-[1.75rem] border-4 border-[#222] shadow-2xl z-30 md:h-[170px] md:w-[240px]"
              >
                <img
                  src="/media/launch/hero_day_exterior_front.jpg"
                  alt="Iconic listing exterior"
                  className="h-full w-full object-cover"
                />
              </motion.div>

              {/* Third Floating Decor Element */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: 0.4 }}
                className="absolute bottom-10 -left-10 w-24 h-24 rounded-2xl shadow-xl z-10 p-4 border border-white/5 bg-white/5 backdrop-blur-md"
              >
                <div className="w-full h-full rounded-lg animate-pulse opacity-20 bg-teal-500"></div>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
