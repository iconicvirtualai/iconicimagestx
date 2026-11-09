import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useSiteText } from "@/content/siteContent";

const MARKET_BODY = "Iconic was built here. We’ve invested here. We’ve shaped here. Winning brands don’t chase. They choose Iconic.";
const BLAZE_VIDEO = "/media/home-v2/services-blaze/services-blaze-v1-muted.mp4";
const BLAZE_POSTER = "/media/home-v2/services-blaze/services-blaze-v1-poster.jpg";
const BAR_UNDERLAY = "/media/blaze/02_US_v3.mp4";
const VISIBLE_RATIO = 0.15;

function armMarketVideo(video: HTMLVideoElement) {
  video.muted = true;
  video.defaultMuted = true;
}

export default function ThisIsOurMarket() {
  const titleLead = useSiteText("home", "market", "titleLead", "This Is");
  const titleAccent = useSiteText("home", "market", "titleAccent", "OUR");
  const titleTail = useSiteText("home", "market", "titleTail", "Market.");
  const body = useSiteText("home", "market", "body", MARKET_BODY);
  const videoSrc = useSiteText("home", "market", "video", BLAZE_VIDEO);
  const poster = useSiteText("home", "market", "poster", BLAZE_POSTER);
  const underlaySrc = useSiteText("home", "market", "underlay", BAR_UNDERLAY);
  const columnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = columnRef.current;
    if (!root) return;
    const videos = Array.from(root.querySelectorAll("video"));
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const node = entry.target as HTMLVideoElement;
        armMarketVideo(node);
        if (entry.intersectionRatio >= VISIBLE_RATIO) {
          void node.play().catch(() => undefined);
          continue;
        }
        node.pause();
      }
    }, { threshold: [0, VISIBLE_RATIO, 0.6] });
    for (const video of videos) {
      armMarketVideo(video);
      observer.observe(video);
    }
    return () => observer.disconnect();
  }, [videoSrc, underlaySrc]);

  return (
    <section className="py-24 bg-black overflow-hidden relative border-t border-white/5">
      {/* Background Decor */}
      <div className="absolute top-0 right-0 w-[40%] h-[100%] bg-teal-500/5 -skew-x-12 transform origin-top-right -z-10 blur-3xl opacity-30"></div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-12 lg:flex-row">
          {/* Left: Text Content */}
          <div className="w-full text-left lg:w-[46%] lg:shrink-0">
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

          {/* Right: back card up and to the right; front portrait overlaps its lower-left */}
          <div ref={columnRef} className="relative mx-auto aspect-[312/413] w-full min-w-0 max-w-[26rem] lg:mx-0 lg:w-auto lg:max-w-[34rem] lg:flex-1">
            <div className="absolute left-[38%] top-0 h-[71%] w-[62%] overflow-hidden rounded-[1.35rem] border-[3px] border-[#75bed4]">
              <video
                src={underlaySrc}
                data-site-page="home"
                data-site-block="market"
                data-site-field="underlay"
                data-site-kind="video"
                className="pointer-events-none h-full w-full object-cover"
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                aria-hidden="true"
                onLoadedMetadata={(event) => armMarketVideo(event.currentTarget)}
                onPlay={(event) => armMarketVideo(event.currentTarget)}
              />
            </div>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
              className="absolute left-0 top-[25%] z-10 h-[75%] w-[74%] overflow-hidden rounded-2xl border-[5px] border-[#111] bg-[#111] shadow-[0_10px_24px_rgba(0,0,0,0.32)]"
            >
              <video
                src={videoSrc}
                poster={poster}
                data-site-page="home"
                data-site-block="market"
                data-site-field="video"
                data-site-kind="video"
                className="h-full w-full object-cover"
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                aria-label="Iconic services"
                onLoadedMetadata={(event) => armMarketVideo(event.currentTarget)}
                onPlay={(event) => armMarketVideo(event.currentTarget)}
              />
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
