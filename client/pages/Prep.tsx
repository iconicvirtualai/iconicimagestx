import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { ChevronRight, Play } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

export default function Prep() {
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);

  const prepGuides = [
    {
      id: "lighting",
      title: "Proper Lighting Setup",
      description: "Learn how to use natural and artificial lighting to showcase rooms in their best light.",
      duration: "8:45",
      thumbnail: "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=600&q=80",
      videoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ"
    },
    {
      id: "staging",
      title: "Staging Your Spaces",
      description: "Expert tips on decluttering, decorating, and presenting each room to its full potential.",
      duration: "12:30",
      thumbnail: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=600&q=80",
      videoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ"
    },
    {
      id: "cleanup",
      title: "Pre-Shoot Cleaning Checklist",
      description: "A comprehensive walkthrough of cleaning steps to ensure your listing looks showroom-ready.",
      duration: "10:15",
      thumbnail: "https://images.unsplash.com/photo-1582321905220-8149df7ee89d?w=600&q=80",
      videoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ"
    },
    {
      id: "camera",
      title: "Camera & Equipment Angles",
      description: "Discover the best angles and camera movements to capture each room dynamically.",
      duration: "9:20",
      thumbnail: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=600&q=80",
      videoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ"
    },
    {
      id: "outdoor",
      title: "Outdoor & Exterior Shots",
      description: "Learn how to capture curb appeal, landscaping, and exterior features that sell properties.",
      duration: "7:50",
      thumbnail: "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=600&q=80",
      videoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ"
    },
    {
      id: "audio",
      title: "Audio & Sound Considerations",
      description: "Eliminate background noise and ensure clean audio recording during your shoot.",
      duration: "6:40",
      thumbnail: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&q=80",
      videoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ"
    }
  ];

  return (
    <Layout>
      <div className="bg-white">
        <main className="flex-1">
          {/* Hero Section */}
          <section className="pt-24 pb-12 bg-gradient-to-b from-gray-50 to-white">
            <div className="container mx-auto px-4">
              <div className="max-w-4xl">
                <Link to="/insights" className="inline-flex items-center gap-2 text-teal-600 hover:text-teal-700 text-sm font-semibold mb-6">
                  <ChevronRight className="w-4 h-4 rotate-180" />
                  Back to Resources
                </Link>
                <h1 className="text-4xl md:text-5xl font-bold text-black mb-4">Photoshoot Preparation Guide</h1>
                <p className="text-gray-600 text-lg">Master the art of preparing real estate listings for professional photography and videography. These expert guides will help you maximize the visual impact of every property.</p>
              </div>
            </div>
          </section>

          {/* Video Grid */}
          <section className="py-16">
            <div className="container mx-auto px-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {prepGuides.map((guide) => (
                  <div
                    key={guide.id}
                    onClick={() => setSelectedVideo(guide.id)}
                    className="group cursor-pointer"
                  >
                    <div className="relative aspect-video overflow-hidden rounded-2xl bg-gray-900 mb-4 hover:shadow-xl transition-shadow">
                      <img
                        src={guide.thumbnail}
                        alt={guide.title}
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-black/30 group-hover:bg-black/50 transition-colors flex items-center justify-center">
                        <Play className="w-16 h-16 text-white opacity-80 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <div className="absolute bottom-3 right-3 bg-black/80 text-white text-xs font-semibold px-2 py-1 rounded">
                        {guide.duration}
                      </div>
                    </div>
                    <h3 className="text-lg font-bold text-black mb-2 group-hover:text-teal-600 transition-colors">
                      {guide.title}
                    </h3>
                    <p className="text-gray-600 text-sm leading-relaxed">
                      {guide.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Quick Tips Section */}
          <section className="py-16 bg-gray-50">
            <div className="container mx-auto px-4">
              <h2 className="text-3xl font-bold text-black mb-8">Quick Preparation Checklist</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl">
                <div className="bg-white p-6 rounded-xl border border-gray-200">
                  <h3 className="font-bold text-black mb-4">Interior Preparation</h3>
                  <ul className="space-y-2 text-gray-600 text-sm">
                    <li>✓ Deep clean all surfaces</li>
                    <li>✓ Declutter and organize spaces</li>
                    <li>✓ Open all curtains and blinds</li>
                    <li>✓ Adjust all lighting fixtures</li>
                    <li>✓ Remove personal items</li>
                    <li>✓ Ensure neutral color palette</li>
                  </ul>
                </div>

                <div className="bg-white p-6 rounded-xl border border-gray-200">
                  <h3 className="font-bold text-black mb-4">Exterior Preparation</h3>
                  <ul className="space-y-2 text-gray-600 text-sm">
                    <li>✓ Mow lawn and trim hedges</li>
                    <li>✓ Pressure wash walkways</li>
                    <li>✓ Touch up front door paint</li>
                    <li>✓ Ensure driveway is clean</li>
                    <li>✓ Remove excess vehicles</li>
                    <li>✓ Add potted plants for appeal</li>
                  </ul>
                </div>

                <div className="bg-white p-6 rounded-xl border border-gray-200">
                  <h3 className="font-bold text-black mb-4">Equipment Setup</h3>
                  <ul className="space-y-2 text-gray-600 text-sm">
                    <li>✓ Test all camera equipment</li>
                    <li>✓ Check battery levels</li>
                    <li>✓ Clear memory cards</li>
                    <li>✓ Set up lighting rigs</li>
                    <li>✓ Test audio levels</li>
                    <li>✓ Scout shooting locations</li>
                  </ul>
                </div>

                <div className="bg-white p-6 rounded-xl border border-gray-200">
                  <h3 className="font-bold text-black mb-4">Final Steps</h3>
                  <ul className="space-y-2 text-gray-600 text-sm">
                    <li>✓ Confirm shoot date/time</li>
                    <li>✓ Review property photos</li>
                    <li>✓ Plan camera movements</li>
                    <li>✓ Prepare shot list</li>
                    <li>✓ Set weather contingencies</li>
                    <li>✓ Arrange property access</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* CTA Section */}
          <section className="py-16">
            <div className="container mx-auto px-4">
              <div className="max-w-2xl mx-auto text-center">
                <h2 className="text-3xl font-bold text-black mb-4">Ready to Create Professional Content?</h2>
                <p className="text-gray-600 mb-8">Use ICONIC to transform your prepared listings into stunning videos and virtual tours.</p>
                <Link to="/book">
                  <Button className="bg-teal-500 hover:bg-teal-600 text-white font-bold px-8 py-6 rounded-full">
                    Schedule a Photoshoot
                  </Button>
                </Link>
              </div>
            </div>
          </section>
        </main>
      </div>

      {/* Video Modal */}
      {selectedVideo && (
        <div 
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedVideo(null)}
        >
          <div 
            className="w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedVideo(null)}
              className="text-white hover:text-gray-300 text-2xl mb-4 block"
            >
              ✕
            </button>
            <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
              <iframe
                src={prepGuides.find(g => g.id === selectedVideo)?.videoUrl}
                title="Preparation Video"
                className="w-full h-full"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
