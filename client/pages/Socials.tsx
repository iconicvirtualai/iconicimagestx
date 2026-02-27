import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Facebook, Instagram, Youtube, Share2, ArrowUpRight, Heart, MessageCircle, Send, Bookmark, Play, Star } from "lucide-react";
import { useState, useEffect, useRef } from "react";

const socialPosts = [
  {
    id: 1,
    platform: "Instagram",
    type: "Reel",
    image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80",
    likes: "1.2k",
    comments: "48",
    description: "Cinematic tour of our latest listing in The Woodlands. High-HDR & Drone. #RealEstate #Iconic",
  },
  {
    id: 2,
    platform: "TikTok",
    type: "Trending",
    image: "https://images.unsplash.com/photo-1600607687940-4e524cb35a3a?w=800&q=80",
    likes: "8.5k",
    comments: "156",
    description: "POV: You found the perfect modern farmhouse. ✨ #HomeTour #POV #ModernFarmhouse",
  },
  {
    id: 3,
    platform: "YouTube",
    type: "Film",
    image: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80",
    likes: "2.4k",
    comments: "92",
    description: "Full Cinematic Property Film: The Modern Oasis. Premiering now. #LuxuryRealEstate",
  },
  {
    id: 4,
    platform: "Instagram",
    type: "Post",
    image: "https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?w=800&q=80",
    likes: "945",
    comments: "31",
    description: "New Lifestyle Portraits for @IconicAgents. Elevate your brand today. #PersonalBranding",
  }
];

const platforms = [
  {
    name: "Instagram",
    handle: "@IconicImagesTX",
    icon: <Instagram className="w-6 h-6" />,
    color: "from-[#f9ce34] via-[#ee2a7b] to-[#6228d7]",
    url: "https://instagram.com/iconicimagestx",
    count: "12.4k Followers"
  },
  {
    name: "Facebook",
    handle: "Iconic Images TX",
    icon: <Facebook className="w-6 h-6" />,
    color: "from-[#1877F2] to-[#0052D4]",
    url: "https://facebook.com/iconicimagestx",
    count: "8.2k Likes"
  },
  {
    name: "TikTok",
    handle: "@IconicImagesTX",
    icon: (
      <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.04-.1z" />
      </svg>
    ),
    color: "from-black to-gray-800",
    url: "https://tiktok.com/@iconicimagestx",
    count: "45k Likes"
  },
  {
    name: "YouTube",
    handle: "Iconic Images",
    icon: <Youtube className="w-6 h-6" />,
    color: "from-[#FF0000] to-[#CC0000]",
    url: "https://youtube.com/@iconicimagestx",
    count: "5.1k Subs"
  }
];

export default function Socials() {
  const [likedPosts, setLikedPosts] = useState<number[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const toggleLike = (id: number) => {
    setLikedPosts(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  // Auto-scroll effect for the carousel
  useEffect(() => {
    const interval = setInterval(() => {
      if (scrollRef.current) {
        const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
        if (scrollLeft + clientWidth >= scrollWidth - 10) {
          scrollRef.current.scrollTo({ left: 0, behavior: 'smooth' });
        } else {
          scrollRef.current.scrollBy({ left: 400, behavior: 'smooth' });
        }
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-[#fafafa]">
      <Header />
      
      <main className="flex-1 pt-32 pb-24">
        {/* Dynamic Header */}
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="flex flex-col md:flex-row items-end justify-between gap-8 mb-16 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#f0fdfa] border border-[#ccfbf1] mb-6">
                <Share2 className="w-4 h-4 text-[#0d9488]" />
                <span className="text-[10px] font-black uppercase tracking-widest text-[#0d9488]">The Social Feed</span>
              </div>
              <h1 className="text-5xl md:text-7xl font-black text-black tracking-tighter leading-none mb-6">
                ICONIC <span className="text-[#0d9488]">EVERYWHERE.</span>
              </h1>
              <p className="text-xl text-gray-500 font-medium leading-relaxed">
                We're more than just media. We're a community of top-tier producers, agents, and creators. Follow our journey.
              </p>
            </div>
            <div className="hidden md:flex items-center gap-4">
              <div className="flex -space-x-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="w-12 h-12 rounded-full border-4 border-white bg-gray-200 overflow-hidden shadow-lg">
                    <img src={`https://i.pravatar.cc/150?u=${i}`} alt="user" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
              <p className="text-xs font-black text-[#0d9488] uppercase tracking-widest">+2.5k Joining Weekly</p>
            </div>
          </div>

          {/* Featured Content Carousel */}
          <div className="mb-24 relative">
            <div className="flex items-center justify-between mb-8 px-2">
              <h2 className="text-2xl font-black text-black uppercase tracking-widest flex items-center gap-3">
                <Star className="w-6 h-6 fill-[#0d9488] text-[#0d9488]" />
                Featured Content
              </h2>
              <div className="flex gap-2">
                <button onClick={() => scrollRef.current?.scrollBy({ left: -400, behavior: 'smooth' })} className="p-3 rounded-full bg-white border border-gray-100 hover:border-[#0d9488] hover:text-[#0d9488] transition-all shadow-sm">
                  <ArrowUpRight className="w-5 h-5 rotate-[225deg]" />
                </button>
                <button onClick={() => scrollRef.current?.scrollBy({ left: 400, behavior: 'smooth' })} className="p-3 rounded-full bg-white border border-gray-100 hover:border-[#0d9488] hover:text-[#0d9488] transition-all shadow-sm">
                  <ArrowUpRight className="w-5 h-5 rotate-[45deg]" />
                </button>
              </div>
            </div>

            <div 
              ref={scrollRef}
              className="flex gap-6 overflow-x-auto pb-8 snap-x snap-mandatory no-scrollbar scroll-smooth"
            >
              {socialPosts.map((post) => (
                <div 
                  key={post.id}
                  className="min-w-[320px] md:min-w-[400px] bg-white rounded-[2.5rem] overflow-hidden border border-gray-100 shadow-xl snap-center group hover:shadow-2xl hover:shadow-teal-500/10 transition-all duration-500"
                >
                  {/* Post Image/Video Placeholder */}
                  <div className="relative aspect-[4/5] overflow-hidden">
                    <img src={post.image} alt={post.platform} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                    
                    {/* Platform Badge */}
                    <div className="absolute top-6 left-6 px-4 py-1.5 rounded-full bg-white/90 backdrop-blur-sm border border-white/20 text-xs font-black uppercase tracking-widest text-black shadow-lg">
                      {post.platform}
                    </div>

                    {post.type === "Reel" && (
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white scale-90 group-hover:scale-100 transition-transform duration-500 pointer-events-none">
                        <Play className="w-8 h-8 fill-white" />
                      </div>
                    )}
                  </div>

                  {/* Post Stats */}
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-4">
                        <button 
                          onClick={() => toggleLike(post.id)}
                          className={`transition-all hover:scale-125 ${likedPosts.includes(post.id) ? 'text-red-500' : 'text-gray-400'}`}
                        >
                          <Heart className={`w-6 h-6 ${likedPosts.includes(post.id) ? 'fill-red-500' : ''}`} />
                        </button>
                        <MessageCircle className="w-6 h-6 text-gray-400 hover:text-black cursor-pointer" />
                        <Send className="w-6 h-6 text-gray-400 hover:text-black cursor-pointer" />
                      </div>
                      <Bookmark className="w-6 h-6 text-gray-400 hover:text-black cursor-pointer" />
                    </div>
                    
                    <p className="text-sm font-black text-black mb-2">{likedPosts.includes(post.id) ? "Liked by you and 1.2k others" : `${post.likes} likes`}</p>
                    <p className="text-sm text-gray-600 font-medium leading-relaxed">
                      <span className="font-black text-black mr-2">IconicImagesTX</span>
                      {post.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Social Platforms Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-24">
            {platforms.map((platform) => (
              <a 
                key={platform.name}
                href={platform.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative bg-white rounded-[2rem] p-8 border border-gray-100 hover:border-[#0d9488]/30 hover:shadow-2xl transition-all duration-500 overflow-hidden"
              >
                <div className="relative z-10 flex items-start justify-between mb-8">
                  <div className={`p-4 rounded-2xl text-white bg-gradient-to-br ${platform.color} shadow-lg group-hover:scale-110 group-hover:rotate-6 transition-all duration-500`}>
                    {platform.icon}
                  </div>
                  <div className="text-right">
                    <span className="block text-[10px] font-black uppercase tracking-widest text-[#0d9488] mb-1">Status</span>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Active</span>
                    </div>
                  </div>
                </div>
                
                <div className="relative z-10">
                  <h3 className="text-2xl font-black text-black mb-1 tracking-tight">{platform.name}</h3>
                  <p className="text-[#0d9488] font-bold text-sm mb-4">{platform.handle}</p>
                  <div className="flex items-center gap-3 py-4 border-t border-gray-50">
                    <div className="text-center flex-1">
                      <p className="text-lg font-black text-black">{platform.count}</p>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Audience</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-center gap-2 group-hover:text-[#0d9488] transition-colors">
                  <span className="text-xs font-black uppercase tracking-widest">Visit Platform</span>
                  <ArrowUpRight className="w-4 h-4 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                </div>

                {/* Decorative background element */}
                <div className="absolute -bottom-12 -right-12 w-48 h-48 bg-[#fafafa] rounded-full group-hover:bg-[#f0fdfa] group-hover:scale-150 transition-all duration-700 opacity-50"></div>
              </a>
            ))}
          </div>

          {/* Bottom CTA Section */}
          <div className="relative bg-black rounded-[3rem] p-12 md:p-20 text-center overflow-hidden">
            {/* Animated background elements */}
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-[#0d9488]/20 to-transparent"></div>
            <div className="absolute -top-24 -left-24 w-96 h-96 bg-[#0d9488]/10 rounded-full blur-[100px] animate-pulse"></div>
            <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-[#22d3ee]/10 rounded-full blur-[100px] animate-pulse"></div>

            <div className="relative z-10 max-w-3xl mx-auto">
              <div className="inline-flex items-center gap-2 px-6 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/10 mb-8">
                <Heart className="w-4 h-4 text-[#0d9488] fill-[#0d9488]" />
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Join the Community</span>
              </div>
              <h2 className="text-4xl md:text-6xl font-black text-white mb-8 tracking-tighter leading-none">
                TAG US IN YOUR <span className="text-[#0d9488]">WINS.</span>
              </h2>
              <p className="text-xl text-gray-400 font-medium mb-12">
                Share your journey using #IconicImagesTX for a chance to be featured on our official channels and reach 50k+ weekly viewers.
              </p>
              
              <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
                <a 
                  href="https://instagram.com/iconicimagestx" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto px-12 py-6 bg-[#0d9488] text-white font-black rounded-2xl hover:bg-[#0f766e] hover:scale-105 transition-all shadow-2xl shadow-teal-500/20"
                >
                  FOLLOW US ON INSTAGRAM
                </a>
                <div className="flex items-center gap-4 text-white/40 font-black text-2xl">
                  #IconicImagesTX
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />

      <style dangerouslySetInnerHTML={{ __html: `
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}} />
    </div>
  );
}
