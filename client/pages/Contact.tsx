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
        <section className="py-16 md:py-24">
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">

              {/* Left Side: Content & Testimonial */}
              <div className="space-y-10">
                <div>
                  <div className="text-[#0d9488] font-bold tracking-wider text-xs uppercase mb-5">
                    CONTACT US
                  </div>
                  <h1 className="text-4xl md:text-6xl font-bold text-black mb-6 leading-[1.1] tracking-tight">
                    We'd love to <span className="text-[#0d9488]">hear from you</span>
                  </h1>
                  <p className="text-gray-500 text-base leading-relaxed max-w-xl">
                    Have a question or feedback? We'd love to hear from you. Send us a
                    message and we'll respond as soon as possible.
                  </p>

                  {/* Chat & Call Options */}
                  <div className="pt-6 flex flex-wrap gap-4">
                    <button
                      onClick={() => setIsChatOpen(true)}
                      className="flex items-center gap-4 p-4 bg-[#f0fdfa] border border-[#ccfbf1] rounded-2xl group hover:border-[#0d9488] transition-all duration-300 shadow-sm hover:shadow-md text-left"
                    >
                      <div className="bg-[#0d9488] p-2.5 rounded-xl text-white group-hover:scale-110 transition-transform flex-shrink-0">
                        <MessageCircle className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-[120px]">
                        <div className="text-[9px] font-bold tracking-widest text-[#0d9488] uppercase mb-0.5">LIVE CHAT</div>
                        <div className="text-base font-bold text-black group-hover:text-[#0d9488] transition-colors flex items-center gap-2">
                          Start Chat
                          <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-all translate-x-[-10px] group-hover:translate-x-0" />
                        </div>
                      </div>
                    </button>

                    <a
                      href="tel:281-356-0965"
                      className="flex items-center gap-4 p-4 bg-gray-400/50 border border-black rounded-2xl group hover:bg-gray-400/60 transition-all duration-300 shadow-xl hover:shadow-2xl text-left relative overflow-hidden"
                    >
                      <div className="bg-black p-2.5 rounded-xl text-white group-hover:scale-110 transition-transform flex-shrink-0 shadow-sm">
                        <Phone className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-[120px] relative z-10">
                        <div className="text-[9px] font-bold tracking-widest text-black/60 uppercase mb-0.5">CALL US</div>
                        <div className="text-base font-bold text-black group-hover:text-black transition-colors flex items-center gap-2">
                          281-356-0965
                          <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-all translate-x-[-10px] group-hover:translate-x-0" />
                        </div>
                      </div>
                    </a>
                  </div>
                </div>

                <div className="pt-10 border-t border-gray-100">
                  <div className="flex gap-4 mb-6">
                    <div className="bg-black p-1.5 rounded-lg">
                      <Quote className="w-4 h-4 text-white fill-white" />
                    </div>
                  </div>
                  <blockquote className="text-lg text-gray-700 leading-relaxed italic mb-6">
                    "It's quick, cost-effective, and perfect for generating professional-quality videos.
                    I can create multiple videos in minutes, maintaining a strong online presence."
                  </blockquote>
                  <div className="flex items-center gap-4">
                    <img
                      src="https://i.pravatar.cc/150?u=bryce"
                      alt="Bryce Perez"
                      className="w-14 h-14 rounded-full border-2 border-white shadow-sm"
                    />
                    <div>
                      <h4 className="font-bold text-black text-base">Bryce Perez</h4>
                      <p className="text-gray-400 text-xs">Founder, RE Media Company</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Side: Contact Form */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-2xl p-6 md:p-8">
                <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-black">Name *</label>
                    <input
                      type="text"
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-[#0d9488] focus:ring-1 focus:ring-[#0d9488] outline-none transition-all text-sm"
                      placeholder="Your name"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-black">Subject *</label>
                    <input
                      type="text"
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-[#0d9488] focus:ring-1 focus:ring-[#0d9488] outline-none transition-all text-sm"
                      placeholder="Subject"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-black">Email *</label>
                    <input
                      type="email"
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-[#0d9488] focus:ring-1 focus:ring-[#0d9488] outline-none transition-all text-sm"
                      placeholder="you@example.com"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-black">Phone</label>
                    <input
                      type="tel"
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-[#0d9488] focus:ring-1 focus:ring-[#0d9488] outline-none transition-all text-sm"
                      placeholder="Your phone number"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-black">Message *</label>
                    <textarea
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-[#0d9488] focus:ring-1 focus:ring-[#0d9488] outline-none transition-all h-28 resize-none text-sm"
                      placeholder="How can we help?"
                      required
                    ></textarea>
                  </div>

                  <Button className="w-full bg-black hover:bg-gray-900 text-white font-bold py-5 text-base rounded-xl transition-all shadow-[0_10px_30px_rgba(0,0,0,0.2),inset_0_1px_1px_rgba(255,255,255,0.1)] border border-gray-800 hover:border-gray-700">
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
