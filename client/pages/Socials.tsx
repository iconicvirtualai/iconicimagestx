import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Facebook, Instagram, Youtube, Share2, ArrowUpRight } from "lucide-react";

const socialLinks = [
  {
    name: "Instagram",
    handle: "@IconicImagesTX",
    description: "Daily cinematic listings and behind-the-scenes content.",
    icon: <Instagram className="w-8 h-8" />,
    color: "bg-gradient-to-tr from-[#f9ce34] via-[#ee2a7b] to-[#6228d7]",
    url: "https://instagram.com/iconicimagestx"
  },
  {
    name: "Facebook",
    handle: "Iconic Images TX",
    description: "Market updates, community highlights, and full property films.",
    icon: <Facebook className="w-8 h-8" />,
    color: "bg-[#1877F2]",
    url: "https://facebook.com/iconicimagestx"
  },
  {
    name: "TikTok",
    handle: "@IconicImagesTX",
    description: "Trending property tours and high-energy real estate reels.",
    icon: (
      <svg className="w-8 h-8 fill-current" viewBox="0 0 24 24">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.04-.1z" />
      </svg>
    ),
    color: "bg-black",
    url: "https://tiktok.com/@iconicimagestx"
  },
  {
    name: "YouTube",
    handle: "Iconic Images",
    description: "Long-form cinematic property tours and agent bio films.",
    icon: <Youtube className="w-8 h-8" />,
    color: "bg-[#FF0000]",
    url: "https://youtube.com/@iconicimagestx"
  }
];

export default function Socials() {
  return (
    <div className="flex flex-col min-h-screen bg-[#fafafa]">
      <Header />
      
      <main className="flex-1 pt-32 pb-24">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#f0fdfa] border border-[#ccfbf1] mb-6">
              <Share2 className="w-4 h-4 text-[#0d9488]" />
              <span className="text-xs font-black uppercase tracking-widest text-[#0d9488]">Get Connected</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-black text-black mb-6 tracking-tighter">
              OUR <span className="text-[#0d9488]">SOCIALS</span>
            </h1>
            <p className="text-xl text-gray-500 max-w-2xl mx-auto font-medium">
              Join our community and stay updated with the latest in real estate media, AI technology, and cinematic marketing.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {socialLinks.map((social) => (
              <a 
                key={social.name}
                href={social.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative bg-white rounded-[2rem] p-8 border border-gray-100 hover:border-[#0d9488]/30 hover:shadow-2xl transition-all duration-500 overflow-hidden"
              >
                <div className="relative z-10 flex items-start justify-between">
                  <div className={`p-4 rounded-2xl text-white ${social.color} shadow-lg group-hover:scale-110 transition-transform duration-500`}>
                    {social.icon}
                  </div>
                  <ArrowUpRight className="w-6 h-6 text-gray-300 group-hover:text-[#0d9488] group-hover:translate-x-1 group-hover:-translate-y-1 transition-all" />
                </div>
                
                <div className="mt-8 relative z-10">
                  <h3 className="text-2xl font-black text-black mb-1 tracking-tight">{social.name}</h3>
                  <p className="text-[#0d9488] font-bold text-sm mb-4">{social.handle}</p>
                  <p className="text-gray-500 font-medium leading-relaxed">
                    {social.description}
                  </p>
                </div>

                {/* Decorative background element */}
                <div className="absolute -bottom-12 -right-12 w-48 h-48 bg-[#fafafa] rounded-full group-hover:bg-[#f0fdfa] group-hover:scale-150 transition-all duration-700 opacity-50"></div>
              </a>
            ))}
          </div>

          <div className="mt-20 bg-black rounded-[3rem] p-12 text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-[#0d9488]/20 to-transparent"></div>
            <div className="relative z-10">
              <h2 className="text-3xl font-black text-white mb-4 tracking-tight uppercase">Tag us in your journey</h2>
              <p className="text-gray-400 font-medium mb-8">Show us how you use Iconic media to win more listings.</p>
              <div className="flex items-center justify-center gap-2">
                <span className="text-[#0d9488] font-black text-2xl">#IconicImagesTX</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
