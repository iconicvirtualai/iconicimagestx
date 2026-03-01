import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export default function FinalCTA() {
  return (
    <section className="bg-white py-12 px-4">
      <div className="container mx-auto max-w-7xl">
        <div className="bg-[#0d9488] rounded-[3rem] py-20 md:py-32 px-8 text-center text-white relative overflow-hidden shadow-2xl shadow-teal-900/20">
          {/* Subtle Background Glows */}
          <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-[#ccfbf1]/20 rounded-full blur-[100px]"></div>
          <div className="absolute bottom-[-20%] right-[-10%] w-[40%] h-[40%] bg-black/10 rounded-full blur-[80px]"></div>

          <div className="relative z-10">
            <h2 className="text-4xl md:text-5xl lg:text-7xl font-bold mb-8 leading-[1.1] tracking-tight">
              Create your Iconic <br className="hidden md:block" />
              media today
            </h2>
            <p className="text-xl md:text-2xl text-white/80 mb-12 max-w-3xl mx-auto leading-relaxed">
              Iconic helps creators, marketers, and real estate pros turn raw
              content into polished, platform-ready assets in minutes.
            </p>
            <Link to="/book">
              <Button className="bg-white text-[#0d9488] hover:bg-white/90 font-bold text-xl px-12 py-8 rounded-2xl transition-all hover:scale-105 shadow-xl shadow-black/10">
                Create your free video &rarr;
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
