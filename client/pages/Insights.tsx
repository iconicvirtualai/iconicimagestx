import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { useState, useRef } from "react";

export default function Insights() {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [activeCategory, setActiveCategory] = useState("FEATURES");

  const categories = [
    "ALL", "ABOUT US", "AI IN REAL ESTATE MARKETING", "AI IN REAL ESTATE VIDEOS", 
    "AI VIDEO", "AI VIDEO TOOLS", "FEATURES", "NEWS", "REAL ESTATE LISTING", 
    "REAL ESTATE MARKETING", "REAL ESTATE MARKETING VIDEO", "REAL ESTATE PHOTOGRAPHY",
    "REAL ESTATE VIDEO FOR REALTORS", "REAL ESTATE VIDEO MARKETING", "VIDEO MARKETING FOR REAL ESTATE"
  ];

  const scrollTestimonials = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 400;
      scrollContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-white">
      <Header />
      
      <main className="flex-1">
        {/* Hero Section */}
        <section className="pt-16 pb-12">
          <div className="container mx-auto px-4">
            <h1 className="text-4xl md:text-5xl font-bold text-black mb-4">Iconic Insights</h1>
            <p className="text-gray-500 text-lg">Insights, guides, and tips for creating stunning real estate videos.</p>
          </div>
        </section>

        {/* Filters and Search */}
        <section className="pb-12 border-b border-gray-100">
          <div className="container mx-auto px-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
              <div className="flex flex-wrap gap-2 flex-1">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`px-4 py-1.5 rounded-full text-[10px] font-bold tracking-wider transition-all border ${
                      activeCategory === cat 
                        ? 'bg-[#22d3ee] text-white border-[#22d3ee]' 
                        : 'bg-white text-gray-400 border-gray-100 hover:border-gray-300'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <div className="relative w-full lg:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                <input 
                  type="text" 
                  placeholder="Search" 
                  className="w-full pl-10 pr-4 py-2 rounded-full border border-gray-100 focus:border-[#22d3ee] focus:ring-1 focus:ring-[#22d3ee] outline-none text-sm transition-all"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Featured Post */}
        <section className="py-12">
          <div className="container mx-auto px-4">
            <div className="relative group cursor-pointer overflow-hidden rounded-[2.5rem] bg-gray-900 aspect-[21/9]">
              <img 
                src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1600&q=80" 
                alt="Featured Post" 
                className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
              <div className="absolute bottom-0 left-0 p-8 md:p-16 max-w-4xl">
                <div className="flex gap-2 mb-6">
                  <span className="bg-[#22d3ee] text-white text-[10px] font-bold px-3 py-1 rounded">NEW</span>
                  <span className="bg-white/20 backdrop-blur-md text-white text-[10px] font-bold px-3 py-1 rounded border border-white/20 uppercase">REAL ESTATE MARKETING</span>
                </div>
                <h2 className="text-3xl md:text-5xl font-bold text-white mb-6 leading-tight">
                  7 Tools to Turn Real Estate Photos Into Videos: The Ultimate Guide for Real Estate Creators
                </h2>
                <p className="text-gray-300 text-lg mb-8 line-clamp-2 max-w-3xl">
                  The way buyers experience properties is changing fast—and photo-to-video AI software is leading the transformation. Gone are the days when a simple carousel of photos was enough to spark interest.
                </p>
                <div className="flex items-center gap-4 text-gray-400 text-xs font-medium">
                  <span>December 26, 2025</span>
                  <span className="w-1 h-1 bg-gray-600 rounded-full"></span>
                  <span>13 min read</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Grid Posts */}
        <section className="pb-24">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {[
                {
                  title: "Introducing AI Photo Edits: Create \"Show-Ready\" Photos Without Leaving Iconic",
                  image: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80",
                  date: "October 25, 2025",
                  readTime: "4 min read"
                },
                {
                  title: "Introducing AI Avatars & Voiceovers: Bring Your Listings (and You) to Life",
                  image: "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=800&q=80",
                  date: "September 12, 2025",
                  readTime: "5 min read"
                },
                {
                  title: "Welcome to Iconic Studio: Your New Real Estate Video Editor",
                  image: "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=800&q=80",
                  date: "August 5, 2025",
                  readTime: "6 min read"
                },
                {
                  title: "Meet v2.5: Our Most Realistic AI Video Engine Yet",
                  image: "https://images.unsplash.com/photo-1558494949-ef010cbdcc51?w=800&q=80",
                  date: "July 8, 2025",
                  readTime: "2 min read"
                },
                {
                  title: "Introducing the Iconic API: Our AI, Your Platform",
                  image: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=800&q=80",
                  date: "July 8, 2025",
                  readTime: "2 min read"
                },
                {
                  title: "How to Get Free Videos With Every Referral",
                  image: "https://images.unsplash.com/photo-1523240715639-963a7a3b3f46?w=800&q=80",
                  date: "April 14, 2025",
                  readTime: "3 min read"
                }
              ].map((post, i) => (
                <div key={i} className="group cursor-pointer">
                  <div className="relative aspect-[9/16] overflow-hidden rounded-[2rem] bg-gray-900 mb-6">
                    <img
                      src={post.image}
                      alt={post.title}
                      className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent"></div>
                    <div className="absolute top-4 left-4">
                      <span className="bg-[#22d3ee] text-white text-[8px] font-bold px-2 py-0.5 rounded uppercase">FEATURES</span>
                    </div>
                    <div className="absolute bottom-0 left-0 p-6 w-full">
                      <h3 className="text-xl font-bold text-white mb-6 leading-tight group-hover:text-[#22d3ee] transition-colors">
                        {post.title}
                      </h3>
                      <div className="flex items-center gap-3">
                        <img src="https://i.pravatar.cc/150?u=alok" className="w-8 h-8 rounded-full border border-white/20" alt="Alok Gupta" />
                        <div>
                          <p className="text-white text-[10px] font-bold uppercase tracking-tight">Alok Gupta</p>
                          <div className="flex items-center gap-2 text-gray-400 text-[9px] font-medium">
                            <span>{post.date}</span>
                            <span className="w-0.5 h-0.5 bg-gray-600 rounded-full"></span>
                            <span>{post.readTime}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section className="bg-[#e0f7f6]/40 py-24 md:py-32 overflow-hidden">
          <div className="container mx-auto px-4 text-center">
            <div className="inline-flex items-center px-3 py-1 rounded bg-white border border-[#ccfbf1] mb-8 shadow-sm">
              <span className="text-[10px] font-bold tracking-wider text-[#0d9488] uppercase">
                TESTIMONIALS
              </span>
            </div>

            <h2 className="text-4xl md:text-5xl font-bold mb-6 text-black">
              Join the top real estate pros
            </h2>
            <p className="text-gray-500 max-w-2xl mx-auto mb-16">
              Real estate media businesses, photographers, and agents are using Iconic 
              every day to boost their video marketing.
            </p>

            <div className="relative group">
              <div 
                ref={scrollContainerRef}
                className="flex gap-6 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-12"
              >
                {[
                  {
                    name: "John Rudy",
                    role: "Founder, Rudy Media Group",
                    content: "Iconic saves a huge amount of time and money. I'm using it for a wide range of real estate.",
                    avatar: "https://i.pravatar.cc/150?u=john"
                  },
                  {
                    name: "Kim Lindsey",
                    role: "Owner, Kim Lindsey Photography",
                    content: "Groundbreaking tool. They are committed to improving the services with new updates often.",
                    avatar: "https://i.pravatar.cc/150?u=kim"
                  },
                  {
                    name: "Joe Semkow",
                    role: "Photographer, Explore Kitchener",
                    content: "An absolute game-changer! Professional-quality videos in minutes. Customer service is top-notch. Quick and responsive.",
                    avatar: "https://i.pravatar.cc/150?u=joe"
                  },
                  {
                    name: "Dan Hom",
                    role: "Owner, Dan Hom Photography",
                    content: "We realized the Founder and his team were providing a value-add proposition our business could leverage. Iconic has streamlined editing times by 25%, shortening time to listing.",
                    avatar: "https://i.pravatar.cc/150?u=dan"
                  },
                  {
                    name: "Nicole Causey",
                    role: "Co-Founder, RealEstate Realty",
                    content: "Iconic transforms photos into beautiful, realistic video walkthroughs. The 'Drone Flyovers' are truly incredible! A must-have tool for realtors in a digital-first world.",
                    avatar: "https://i.pravatar.cc/150?u=nicole"
                  },
                  {
                    name: "Chris Lawrence",
                    role: "Owner, Rip City Photography, LLC",
                    content: "It literally takes 5 minutes on the backend to produce a great product to offer to your real estate agents. The cost is affordable and the developers are quick to respond.",
                    avatar: "https://i.pravatar.cc/150?u=chris"
                  },
                  {
                    name: "Bryce Perez",
                    role: "Founder, RE Media Company",
                    content: "It's quick, cost-effective, and perfect for generating professional-quality videos. I can create multiple videos in minutes, maintaining a strong online presence.",
                    avatar: "https://i.pravatar.cc/150?u=bryce"
                  }
                ].map((t, i) => (
                  <div key={i} className="flex-shrink-0 w-[300px] md:w-[350px] snap-center">
                    <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm text-left h-full flex flex-col">
                      <div className="flex items-center gap-3 mb-4">
                        <img src={t.avatar} alt={t.name} className="w-10 h-10 rounded-full border border-gray-100" />
                        <div>
                          <h4 className="font-bold text-black text-xs">{t.name}</h4>
                          <p className="text-gray-400 text-[9px] font-medium uppercase tracking-tight">{t.role}</p>
                        </div>
                      </div>
                      <p className="text-gray-600 text-[11px] leading-relaxed mb-4 italic flex-1">
                        "{t.content}"
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Navigation Controls */}
              <div className="flex items-center justify-center gap-4">
                <button 
                  onClick={() => scrollTestimonials('left')}
                  className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 hover:text-[#0d9488] hover:border-[#0d9488] transition-all"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((p) => (
                    <div key={p} className={`w-1 h-1 rounded-full ${p === 1 ? "bg-[#0d9488]" : "bg-gray-200"}`}></div>
                  ))}
                </div>
                <button 
                  onClick={() => scrollTestimonials('right')}
                  className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 hover:text-[#0d9488] hover:border-[#0d9488] transition-all"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />

      <style dangerouslySetInnerHTML={{ __html: `
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}} />
    </div>
  );
}
