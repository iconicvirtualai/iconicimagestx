import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Facebook, Instagram, Youtube, Share2, ArrowUpRight, Heart, MessageCircle, Send, Bookmark, Play, Star, RefreshCcw } from "lucide-react";
import { useState, useEffect, useRef } from "react";

// Mock data that could come from an API (Vercel/GitHub integration ready)
const INITIAL_POSTS = [
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

const INITIAL_PLATFORMS = [
  {
    name: "Instagram",
    handle: "@IconicImagesTX",
    icon: <Instagram className="w-5 h-5" />,
    color: "from-[#f9ce34] via-[#ee2a7b] to-[#6228d7]",
    url: "https://instagram.com/iconicimagestx",
    count: "12.4k Followers",
    lastSynced: "2 mins ago"
  },
  {
    name: "Facebook",
    handle: "Iconic Images TX",
    icon: <Facebook className="w-5 h-5" />,
    color: "from-[#1877F2] to-[#0052D4]",
    url: "https://facebook.com/iconicimagestx",
    count: "8.2k Likes",
    lastSynced: "Just now"
  },
  {
    name: "TikTok",
    handle: "@IconicImagesTX",
    icon: (
      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.04-.1z" />
      </svg>
    ),
    color: "from-black to-gray-800",
    url: "https://tiktok.com/@iconicimagestx",
    count: "45k Likes",
    lastSynced: "1 hr ago"
  },
  {
    name: "YouTube",
    handle: "Iconic Images",
    icon: <Youtube className="w-5 h-5" />,
    color: "from-[#FF0000] to-[#CC0000]",
    url: "https://youtube.com/@iconicimagestx",
    count: "5.1k Subs",
    lastSynced: "4 mins ago"
  }
];

const FEATURED_PROPERTIES = [
  {
    id: 1,
    address: "1245 Willow Creek Dr",
    location: "Spring, TX",
    platform: "Zillow",
    image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80",
    price: "$549,000",
    status: "Active",
    daysOnMarket: "4 days"
  },
  {
    id: 2,
    address: "882 High Meadow Ln",
    location: "The Woodlands, TX",
    platform: "HAR.com",
    image: "https://images.unsplash.com/photo-1600607687940-4e524cb35a3a?w=800&q=80",
    price: "$1,250,000",
    status: "Active",
    daysOnMarket: "12 days"
  },
  {
    id: 3,
    address: "552 Oak Forest Ct",
    location: "Conroe, TX",
    platform: "Zillow",
    image: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80",
    price: "$425,000",
    status: "Pending",
    daysOnMarket: "24 days"
  },
  {
    id: 4,
    address: "210 River Walk Way",
    location: "Humble, TX",
    platform: "HAR.com",
    image: "https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?w=800&q=80",
    price: "$685,000",
    status: "Active",
    daysOnMarket: "8 days"
  }
];

export default function Socials() {
  const [likedPosts, setLikedPosts] = useState<number[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [platforms, setPlatforms] = useState(INITIAL_PLATFORMS);
  const [posts, setPosts] = useState(INITIAL_POSTS);
  const scrollRef = useRef<HTMLDivElement>(null);
  const marketScrollRef = useRef<HTMLDivElement>(null);

  const toggleLike = (id: number) => {
    setLikedPosts(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const handleSync = () => {
    setIsSyncing(true);
    // Simulate real-time update from GitHub/Vercel connected environment
    setTimeout(() => {
      setIsSyncing(false);
      // Logic to update stats would go here
      setPlatforms(prev => prev.map(p => ({ ...p, lastSynced: "Just now" })));
    }, 2000);
  };

  // Auto-scroll effect for the carousels
  useEffect(() => {
    const interval = setInterval(() => {
      if (scrollRef.current) {
        const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
        if (scrollLeft + clientWidth >= scrollWidth - 10) {
          scrollRef.current.scrollTo({ left: 0, behavior: 'smooth' });
        } else {
          scrollRef.current.scrollBy({ left: 350, behavior: 'smooth' });
        }
      }

      if (marketScrollRef.current) {
        const { scrollLeft, scrollWidth, clientWidth } = marketScrollRef.current;
        if (scrollLeft + clientWidth >= scrollWidth - 10) {
          marketScrollRef.current.scrollTo({ left: 0, behavior: 'smooth' });
        } else {
          marketScrollRef.current.scrollBy({ left: 380, behavior: 'smooth' });
        }
      }
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-[#fafafa]">
      <Header />
      
      <main className="flex-1 pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-5xl">
          {/* Scaled Header */}
          <div className="flex flex-col md:flex-row items-end justify-between gap-6 mb-12 animate-in fade-in slide-in-from-bottom-3 duration-700">
            <div className="max-w-xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#f0fdfa] border border-[#ccfbf1] mb-4">
                <Share2 className="w-3.5 h-3.5 text-[#0d9488]" />
                <span className="text-[9px] font-bold uppercase tracking-widest text-[#0d9488]">Live Social Feed</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-bold text-black tracking-tighter leading-none mb-4">
                ICONIC <span className="text-[#0d9488]">EVERYWHERE.</span>
              </h1>
              <p className="text-lg text-gray-500 font-medium leading-relaxed max-w-lg">
                Connected to our cloud ecosystem for real-time engagement updates. Follow the movement.
              </p>
            </div>
            
            <div className="flex flex-col items-end gap-3">
              <button 
                onClick={handleSync}
                disabled={isSyncing}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-100 rounded-xl text-[10px] font-bold text-gray-600 hover:border-[#0d9488] hover:text-[#0d9488] transition-all shadow-sm group"
              >
                <RefreshCcw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
                {isSyncing ? "SYNCING LIVE DATA..." : "REFRESH SOCIAL STATS"}
              </button>
              <div className="hidden md:flex items-center gap-3">
                <div className="flex -space-x-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="w-9 h-9 rounded-full border-2 border-white bg-gray-200 overflow-hidden shadow-md">
                      <img src={`https://i.pravatar.cc/150?u=${i+10}`} alt="user" className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
                <p className="text-[9px] font-bold text-[#0d9488] uppercase tracking-widest">Live Updates Connected</p>
              </div>
            </div>
          </div>

          {/* Featured Content Carousel - Scaled down */}
          <div className="mb-20 relative">
            <div className="flex items-center justify-between mb-6 px-1">
              <h2 className="text-xl font-bold text-black uppercase tracking-widest flex items-center gap-2">
                <Star className="w-5 h-5 fill-[#0d9488] text-[#0d9488]" />
                Real-Time Highlights
              </h2>
              <div className="flex gap-2">
                <button onClick={() => scrollRef.current?.scrollBy({ left: -350, behavior: 'smooth' })} className="p-2.5 rounded-full bg-white border border-gray-100 hover:border-[#0d9488] hover:text-[#0d9488] transition-all shadow-sm">
                  <ArrowUpRight className="w-4 h-4 rotate-[225deg]" />
                </button>
                <button onClick={() => scrollRef.current?.scrollBy({ left: 350, behavior: 'smooth' })} className="p-2.5 rounded-full bg-white border border-gray-100 hover:border-[#0d9488] hover:text-[#0d9488] transition-all shadow-sm">
                  <ArrowUpRight className="w-4 h-4 rotate-[45deg]" />
                </button>
              </div>
            </div>

            <div 
              ref={scrollRef}
              className="flex gap-5 overflow-x-auto pb-6 snap-x snap-mandatory no-scrollbar scroll-smooth"
            >
              {posts.map((post) => (
                <div 
                  key={post.id}
                  className="min-w-[280px] md:min-w-[340px] bg-white rounded-[1.8rem] overflow-hidden border border-gray-100 shadow-lg snap-center group hover:shadow-xl transition-all duration-500"
                >
                  <div className="relative aspect-[4/5] overflow-hidden">
                    <img src={post.image} alt={post.platform} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                    
                    <div className="absolute top-5 left-5 px-3 py-1 rounded-full bg-white/90 backdrop-blur-sm border border-white/20 text-[9px] font-bold uppercase tracking-widest text-black shadow-md">
                      {post.platform}
                    </div>

                    {post.type === "Reel" && (
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white scale-90 group-hover:scale-100 transition-transform duration-500 pointer-events-none">
                        <Play className="w-6 h-6 fill-white" />
                      </div>
                    )}
                  </div>

                  <div className="p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => toggleLike(post.id)}
                          className={`transition-all hover:scale-110 ${likedPosts.includes(post.id) ? 'text-red-500' : 'text-gray-400'}`}
                        >
                          <Heart className={`w-5 h-5 ${likedPosts.includes(post.id) ? 'fill-red-500' : ''}`} />
                        </button>
                        <MessageCircle className="w-5 h-5 text-gray-400 hover:text-black cursor-pointer" />
                        <Send className="w-5 h-5 text-gray-400 hover:text-black cursor-pointer" />
                      </div>
                      <Bookmark className="w-5 h-5 text-gray-400 hover:text-black cursor-pointer" />
                    </div>
                    
                    <p className="text-xs font-bold text-black mb-2">{likedPosts.includes(post.id) ? "Liked by you and others" : `${post.likes} likes`}</p>
                    <p className="text-xs text-gray-600 font-semibold leading-relaxed">
                      <span className="font-bold text-black mr-2">IconicImagesTX</span>
                      {post.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Social Platforms Grid - Scaled */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-20">
            {platforms.map((platform) => (
              <a
                key={platform.name}
                href={platform.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative bg-white rounded-[1.5rem] p-6 border border-gray-100 hover:border-[#0d9488]/30 hover:shadow-xl transition-all duration-500 overflow-hidden"
              >
                <div className="relative z-10 flex items-start justify-between mb-6">
                  <div className={`p-3 rounded-xl text-white bg-gradient-to-br ${platform.color} shadow-md group-hover:scale-105 transition-all duration-500`}>
                    {platform.icon}
                  </div>
                  <div className="text-right">
                    <span className="block text-[8px] font-bold uppercase tracking-widest text-[#0d9488] mb-0.5">Synced</span>
                    <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">{platform.lastSynced}</span>
                  </div>
                </div>

                <div className="relative z-10">
                  <h3 className="text-xl font-bold text-black mb-0.5 tracking-tight">{platform.name}</h3>
                  <p className="text-[#0d9488] font-bold text-[11px] mb-3">{platform.handle}</p>
                  <div className="flex items-center gap-3 py-3 border-t border-gray-50">
                    <div className="text-center flex-1">
                      <p className="text-base font-bold text-black">{platform.count}</p>
                      <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Global Reach</p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-center gap-1.5 group-hover:text-[#0d9488] transition-colors">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 group-hover:text-[#0d9488]">View Profile</span>
                  <ArrowUpRight className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </div>
              </a>
            ))}
          </div>

          {/* Featured Properties Carousel */}
          <div className="mb-24 relative animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-300">
            <div className="flex flex-col md:flex-row items-start md:items-end justify-between mb-8 px-1 gap-4">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#f0f9ff] border border-[#e0f2fe] mb-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#0ea5e9] animate-pulse"></div>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-[#0ea5e9]">Live on Market</span>
                </div>
                <h2 className="text-2xl font-bold text-black uppercase tracking-tight">Iconic Featured Properties</h2>
                <p className="text-xs text-gray-400 font-medium mt-1 uppercase tracking-widest">Recently Marketed • Last 120 Days</p>
              </div>
              <div className="flex gap-2">
                <div className="hidden md:flex items-center gap-4 mr-4 text-[9px] font-bold text-gray-400 uppercase tracking-widest border-r border-gray-100 pr-4">
                  <span>Synced with Zillow & HAR</span>
                </div>
                <button onClick={() => marketScrollRef.current?.scrollBy({ left: -380, behavior: 'smooth' })} className="p-2.5 rounded-full bg-white border border-gray-100 hover:border-[#0d9488] hover:text-[#0d9488] transition-all shadow-sm">
                  <ArrowUpRight className="w-4 h-4 rotate-[225deg]" />
                </button>
                <button onClick={() => marketScrollRef.current?.scrollBy({ left: 380, behavior: 'smooth' })} className="p-2.5 rounded-full bg-white border border-gray-100 hover:border-[#0d9488] hover:text-[#0d9488] transition-all shadow-sm">
                  <ArrowUpRight className="w-4 h-4 rotate-[45deg]" />
                </button>
              </div>
            </div>

            <div
              ref={marketScrollRef}
              className="flex gap-6 overflow-x-auto pb-8 snap-x snap-mandatory no-scrollbar scroll-smooth"
            >
              {FEATURED_PROPERTIES.map((property) => (
                <div
                  key={property.id}
                  className="min-w-[300px] md:min-w-[380px] bg-white rounded-[2rem] overflow-hidden border border-gray-100 shadow-xl snap-center group hover:shadow-2xl hover:-translate-y-1 transition-all duration-500"
                >
                  <div className="relative aspect-[16/10] overflow-hidden">
                    <img src={property.image} alt={property.address} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity"></div>

                    <div className="absolute top-5 left-5 flex gap-2">
                      <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest text-white shadow-lg ${property.platform === 'Zillow' ? 'bg-[#006AFF]' : 'bg-[#00508F]'}`}>
                        {property.platform}
                      </div>
                      <div className={`px-3 py-1 rounded-full backdrop-blur-sm text-[9px] font-black uppercase tracking-widest text-white shadow-lg ${property.status === 'Active' ? 'bg-green-500/80' : 'bg-orange-500/80'}`}>
                        {property.status}
                      </div>
                    </div>

                    <div className="absolute bottom-5 left-6 right-6">
                      <p className="text-[10px] font-bold text-teal-400 uppercase tracking-[0.2em] mb-1">Recent Masterpiece</p>
                      <h3 className="text-xl font-bold text-white tracking-tight leading-tight">{property.address}</h3>
                      <p className="text-xs text-white/80 font-medium">{property.location}</p>
                    </div>
                  </div>

                  <div className="p-6">
                    <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-50">
                      <div>
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">List Price</p>
                        <p className="text-lg font-black text-black">{property.price}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Market Pulse</p>
                        <p className="text-xs font-bold text-[#0d9488]">{property.daysOnMarket} on Market</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex -space-x-2">
                        {[1, 2, 3].map((i) => (
                          <div key={i} className="w-7 h-7 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center">
                            <Star className="w-3 h-3 text-[#0d9488] fill-[#0d9488]" />
                          </div>
                        ))}
                      </div>
                      <a
                        href={property.platform === 'Zillow' ? "https://zillow.com" : "https://har.com"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 hover:text-black transition-colors uppercase tracking-widest"
                      >
                        View Listing <ArrowUpRight className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom CTA Section - Scaled */}
          <div className="relative bg-black rounded-[2.5rem] p-10 md:p-16 text-center overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-[#0d9488]/20 to-transparent"></div>
            
            <div className="relative z-10 max-w-2xl mx-auto">
              <div className="inline-flex items-center gap-2 px-5 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/10 mb-6">
                <Heart className="w-3.5 h-3.5 text-[#0d9488] fill-[#0d9488]" />
                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-white">Cloud Integrated Community</span>
              </div>
              <h2 className="text-3xl md:text-5xl font-bold text-white mb-6 tracking-tighter leading-none">
                TAG US IN YOUR <span className="text-[#0d9488]">WINS.</span>
              </h2>
              <p className="text-lg text-gray-400 font-medium mb-10 max-w-xl mx-auto">
                Real-time syncing enabled. Share your journey using #IconicImagesTX for a chance to be featured.
              </p>
              
              <div className="flex flex-col sm:flex-row items-center justify-center gap-5">
                <a 
                  href="https://instagram.com/iconicimagestx" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto px-10 py-5 bg-[#0d9488] text-white font-bold rounded-xl hover:bg-[#0f766e] hover:scale-105 transition-all shadow-xl shadow-teal-500/20 text-sm"
                >
                  FOLLOW US ON INSTAGRAM
                </a>
                <div className="flex items-center gap-3 text-white/40 font-bold text-xl uppercase tracking-tighter">
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
