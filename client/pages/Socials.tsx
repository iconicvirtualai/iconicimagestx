import Layout from "@/components/Layout";
import { Facebook, Instagram, Youtube, Share2, ArrowUpRight, Heart } from "lucide-react";

const STILLS = [
  {
    id: 1,
    platform: "Instagram",
    image: "/media/photos/drone-hero.jpg",
    description: "Aerial still from an Iconic listing shoot.",
  },
  {
    id: 2,
    platform: "Instagram",
    image: "/media/before-after/twilight-pool-lifestyle.jpg",
    description: "Twilight conversion of a rear pool.",
  },
  {
    id: 3,
    platform: "YouTube",
    image: "/media/photos/luxury-interior.jpg",
    description: "Listing interior from the Iconic library.",
  },
  {
    id: 4,
    platform: "Instagram",
    image: "/media/photos/lifestyle-mtz04327.jpg",
    description: "Lifestyle portrait from an Iconic session.",
  },
];

const PLATFORMS = [
  {
    name: "Instagram",
    handle: "@iconicimagestx",
    icon: <Instagram className="w-5 h-5" />,
    color: "from-[#f9ce34] via-[#ee2a7b] to-[#6228d7]",
    url: "https://instagram.com/iconicimagestx",
  },
  {
    name: "Facebook",
    handle: "Iconic Images TX",
    icon: <Facebook className="w-5 h-5" />,
    color: "from-[#1877F2] to-[#0052D4]",
    url: "https://facebook.com/iconicimagestx",
  },
  {
    name: "TikTok",
    handle: "@iconicimagestx",
    icon: (
      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.04-.1z" />
      </svg>
    ),
    color: "from-black to-gray-800",
    url: "https://tiktok.com/@iconicimagestx",
  },
  {
    name: "YouTube",
    handle: "Iconic Images",
    icon: <Youtube className="w-5 h-5" />,
    color: "from-[#FF0000] to-[#CC0000]",
    url: "https://youtube.com/@iconicimagestx",
  },
];

export default function Socials() {
  return (
    <Layout>
      <div className="bg-[#fafafa] text-black">
        <main className="flex-1 pt-24 pb-16">
          <div className="container mx-auto px-4 max-w-5xl">
            <div className="max-w-xl mb-12">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black border border-black mb-4 shadow-lg">
                <Share2 className="w-3.5 h-3.5 text-white" />
                <span className="text-[9px] font-bold uppercase tracking-widest accent-text-bordered">Iconic channels</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-bold text-black tracking-tighter leading-none mb-4">
                ICONIC <span className="accent-text-bordered">EVERYWHERE.</span>
              </h1>
              <p className="text-lg text-gray-500 font-medium leading-relaxed max-w-lg">
                Follow Iconic Images. The frames below are from our own library.
              </p>
            </div>

            <div className="mb-20">
              <h2 className="text-xl font-bold text-black uppercase tracking-widest mb-6">Selected stills</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {STILLS.map((still) => (
                  <figure key={still.id} className="bg-white rounded-[1.8rem] overflow-hidden border border-gray-100 shadow-lg">
                    <div className="relative aspect-[4/5] overflow-hidden">
                      <img src={still.image} alt={still.description} className="w-full h-full object-cover" />
                      <div className="absolute top-5 left-5 px-3 py-1 rounded-full bg-white/90 text-[9px] font-bold uppercase tracking-widest text-black">
                        {still.platform}
                      </div>
                    </div>
                    <figcaption className="p-5 text-xs text-gray-600 font-semibold leading-relaxed">
                      <span className="font-bold text-black mr-2">Iconic Images</span>
                      {still.description}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-20">
              {PLATFORMS.map((platform) => (
                <a
                  key={platform.name}
                  href={platform.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group bg-white rounded-[1.5rem] p-6 border border-gray-100 hover:border-[#0d9488]/30 hover:shadow-xl transition-all duration-500"
                >
                  <div className={`p-3 rounded-xl text-white bg-gradient-to-br ${platform.color} shadow-md w-fit mb-6`}>
                    {platform.icon}
                  </div>
                  <h3 className="text-xl font-bold text-black tracking-tight">{platform.name}</h3>
                  <p className="accent-text-bordered font-bold text-[11px] mb-4">{platform.handle}</p>
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-500 group-hover:text-[#0d9488]">
                    View profile <ArrowUpRight className="w-3 h-3" />
                  </span>
                </a>
              ))}
            </div>

            <div className="relative bg-black rounded-[2.5rem] p-10 md:p-16 text-center overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-[#0d9488]/20 to-transparent"></div>
              <div className="relative z-10 max-w-2xl mx-auto">
                <div className="inline-flex items-center gap-2 px-5 py-1.5 rounded-full bg-white/10 border border-white/10 mb-6">
                  <Heart className="w-3.5 h-3.5 text-[#0d9488] fill-[#0d9488]" />
                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-white">Iconic Images</span>
                </div>
                <h2 className="text-3xl md:text-5xl font-bold text-white mb-6 tracking-tighter leading-none">
                  TAG US IN YOUR <span className="accent-text-bordered">WINS.</span>
                </h2>
                <p className="text-lg text-gray-400 font-medium mb-10 max-w-xl mx-auto">
                  Share your work with #IconicImagesTX.
                </p>
                <a
                  href="https://instagram.com/iconicimagestx"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex px-10 py-5 bg-[#0d9488] text-white font-bold rounded-xl hover:bg-[#0f766e] transition-all text-sm"
                >
                  Follow us on Instagram
                </a>
              </div>
            </div>
          </div>
        </main>
      </div>
    </Layout>
  );
}
