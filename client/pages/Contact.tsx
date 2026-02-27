import { useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ChatWidget from "@/components/ChatWidget";
import { Button } from "@/components/ui/button";
import { Quote, MessageCircle, ArrowRight, Phone } from "lucide-react";

export default function Contact() {
  const [isChatOpen, setIsChatOpen] = useState(false);
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <Header />
      
      <main className="flex-1">
        <section className="py-20 md:py-32">
          <div className="container mx-auto px-4 max-w-7xl">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
              
              {/* Left Side: Content & Testimonial */}
              <div className="space-y-12">
                <div>
                  <div className="text-[#0d9488] font-bold tracking-wider text-xs uppercase mb-6">
                    CONTACT US
                  </div>
                  <h1 className="text-5xl md:text-7xl font-bold text-black mb-8 leading-[1.1] tracking-tight">
                    We'd love to <span className="text-[#0d9488]">hear from you</span>
                  </h1>
                  <p className="text-gray-500 text-lg leading-relaxed max-w-xl">
                    Have a question or feedback? We'd love to hear from you. Send us a
                    message and we'll respond as soon as possible.
                  </p>

                  {/* Chat & Call Options */}
                  <div className="pt-8 flex flex-wrap gap-4">
                    <button
                      onClick={() => setIsChatOpen(true)}
                      className="flex items-center gap-4 p-5 bg-[#f0fdfa] border border-[#ccfbf1] rounded-2xl group hover:border-[#0d9488] transition-all duration-300 shadow-sm hover:shadow-md text-left"
                    >
                      <div className="bg-[#0d9488] p-3 rounded-xl text-white group-hover:scale-110 transition-transform flex-shrink-0">
                        <MessageCircle className="w-6 h-6" />
                      </div>
                      <div className="flex-1 min-w-[140px]">
                        <div className="text-[10px] font-bold tracking-widest text-[#0d9488] uppercase mb-1">LIVE CHAT</div>
                        <div className="text-lg font-bold text-black group-hover:text-[#0d9488] transition-colors flex items-center gap-2">
                          Start Chat
                          <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-all translate-x-[-10px] group-hover:translate-x-0" />
                        </div>
                      </div>
                    </button>

                    <a
                      href="tel:281-356-0965"
                      className="flex items-center gap-4 p-5 bg-[#fdf2f2] border border-[#fee2e2] rounded-2xl group hover:border-[#ef4444] transition-all duration-300 shadow-sm hover:shadow-md text-left"
                    >
                      <div className="bg-[#ef4444] p-3 rounded-xl text-white group-hover:scale-110 transition-transform flex-shrink-0">
                        <Phone className="w-6 h-6" />
                      </div>
                      <div className="flex-1 min-w-[140px]">
                        <div className="text-[10px] font-bold tracking-widest text-[#ef4444] uppercase mb-1">CALL US</div>
                        <div className="text-lg font-bold text-black group-hover:text-[#ef4444] transition-colors flex items-center gap-2">
                          281-356-0965
                          <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-all translate-x-[-10px] group-hover:translate-x-0" />
                        </div>
                      </div>
                    </a>
                  </div>
                </div>

                <div className="pt-12 border-t border-gray-100">
                  <div className="flex gap-4 mb-8">
                    <div className="bg-black p-2 rounded-lg">
                      <Quote className="w-5 h-5 text-white fill-white" />
                    </div>
                  </div>
                  <blockquote className="text-xl text-gray-700 leading-relaxed italic mb-8">
                    "It's quick, cost-effective, and perfect for generating professional-quality videos. 
                    I can create multiple videos in minutes, maintaining a strong online presence."
                  </blockquote>
                  <div className="flex items-center gap-4">
                    <img 
                      src="https://i.pravatar.cc/150?u=bryce" 
                      alt="Bryce Perez" 
                      className="w-16 h-16 rounded-full border-2 border-white shadow-sm"
                    />
                    <div>
                      <h4 className="font-bold text-black text-lg">Bryce Perez</h4>
                      <p className="text-gray-400 text-sm">Founder, RE Media Company</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Side: Contact Form */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-2xl p-8 md:p-10">
                <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-black">Name *</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-[#0d9488] focus:ring-1 focus:ring-[#0d9488] outline-none transition-all"
                      placeholder="Your name"
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-black">Subject *</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-[#0d9488] focus:ring-1 focus:ring-[#0d9488] outline-none transition-all"
                      placeholder="Subject"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-black">Email *</label>
                    <input 
                      type="email" 
                      className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-[#0d9488] focus:ring-1 focus:ring-[#0d9488] outline-none transition-all"
                      placeholder="you@example.com"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-black">Phone</label>
                    <input 
                      type="tel" 
                      className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-[#0d9488] focus:ring-1 focus:ring-[#0d9488] outline-none transition-all"
                      placeholder="Your phone number"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-black">Message *</label>
                    <textarea 
                      className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-[#0d9488] focus:ring-1 focus:ring-[#0d9488] outline-none transition-all h-32 resize-none"
                      placeholder="How can we help?"
                      required
                    ></textarea>
                  </div>

                  <Button className="w-full bg-[#22d3ee] hover:bg-[#0891b2] text-white font-bold py-6 text-lg rounded-xl transition-all shadow-lg shadow-cyan-100">
                    Send
                  </Button>
                </form>
              </div>

            </div>
          </div>
        </section>
      </main>

      <Footer />

      <ChatWidget isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
    </div>
  );
}
