import Layout from "@/components/Layout";
import { Search } from "lucide-react";
import { useState } from "react";

const ARTICLE_STILLS = [
  "/media/photos/luxury-exterior.jpg",
  "/media/photos/luxury-interior.jpg",
  "/media/photos/staged-living-room.jpg",
  "/media/before-after/twilight-pool-lifestyle.jpg",
  "/media/photos/drone-hero.jpg",
  "/media/before-after/aerial-estate.jpg",
];

export default function Insights() {
  const [activeCategory, setActiveCategory] = useState("FEATURES");

  const categories = [
    "ALL", "ABOUT US", "AI IN REAL ESTATE MARKETING", "AI IN REAL ESTATE VIDEOS", 
    "AI VIDEO", "AI VIDEO TOOLS", "FEATURES", "NEWS", "REAL ESTATE LISTING", 
    "REAL ESTATE MARKETING", "REAL ESTATE MARKETING VIDEO", "REAL ESTATE PHOTOGRAPHY",
    "REAL ESTATE VIDEO FOR REALTORS", "REAL ESTATE VIDEO MARKETING", "VIDEO MARKETING FOR REAL ESTATE"
  ];

  return (
    <Layout>
      <div className="bg-white">
        <main className="flex-1">
        {/* Hero Section */}
        <section className="pt-24 pb-12">
          <div className="container mx-auto px-4">
            <h1 className="text-4xl md:text-5xl font-bold text-black mb-4">Iconic Insights</h1>
            <p className="text-gray-500 text-lg">Insights, guides, and tips for creating stunning real estate videos.</p>

            {/* Quick Links */}
            <div className="mt-8 flex flex-col sm:flex-row gap-4">
              <a href="/insights" className="px-6 py-3 bg-teal-500 text-white rounded-lg font-semibold hover:bg-teal-600 transition-colors inline-block text-center">
                Insights & Articles
              </a>
              <a href="/insights/prep" className="px-6 py-3 bg-white border-2 border-teal-500 text-teal-600 rounded-lg font-semibold hover:bg-teal-50 transition-colors inline-block text-center">
                📹 Photoshoot Prep Guide
              </a>
            </div>
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
                src="/media/before-after/aerial-estate.jpg" 
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
                  image: ARTICLE_STILLS[0],
                  date: "October 25, 2025",
                  readTime: "4 min read"
                },
                {
                  title: "Introducing AI Avatars & Voiceovers: Bring Your Listings (and You) to Life",
                  image: ARTICLE_STILLS[1],
                  date: "September 12, 2025",
                  readTime: "5 min read"
                },
                {
                  title: "Welcome to Iconic Studio: Your New Real Estate Video Editor",
                  image: ARTICLE_STILLS[2],
                  date: "August 5, 2025",
                  readTime: "6 min read"
                },
                {
                  title: "Meet v2.5: Our Most Realistic AI Video Engine Yet",
                  image: ARTICLE_STILLS[3],
                  date: "July 8, 2025",
                  readTime: "2 min read"
                },
                {
                  title: "Introducing the Iconic API: Our AI, Your Platform",
                  image: ARTICLE_STILLS[4],
                  date: "July 8, 2025",
                  readTime: "2 min read"
                },
                {
                  title: "How to Get Free Videos With Every Referral",
                  image: ARTICLE_STILLS[5],
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
                      <h3 className="text-xl font-bold text-white mb-4 leading-tight group-hover:text-[#22d3ee] transition-colors">
                        {post.title}
                      </h3>
                      <p className="text-gray-300 text-[10px] font-medium">
                        {post.date}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

      </main>

      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}} />
    </Layout>
  );
}
