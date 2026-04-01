import { useState, useEffect, useRef } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { services } from "@/lib/services";
import { Button } from "@/components/ui/button";
import { MessageCircle, X, Send, User, Sparkles, ArrowRight, ChevronRight, Check, DollarSign, Target, Rocket } from "lucide-react";
import { Link } from "react-router-dom";

interface Message {
  id: string;
  text: string;
  sender: "user" | "ai";
  timestamp: Date;
  recommendation?: PackageRecommendation;
}

interface PackageRecommendation {
  id: string;
  name: string;
  price: string;
  description: string;
  bookingUrl: string;
  icon: any;
}

const getPackageRecommendation = (id: string): PackageRecommendation | undefined => {
  const service = services.find(s => s.id === id);
  if (!service) return undefined;

  const icons: Record<string, any> = {
    "listing-essentials": Sparkles,
    "listing-showcase": Target,
    "listing-legacy": Rocket,
    "branding-refresh": User,
    "branding-content-partner": MessageCircle,
    "business-growth-engine": Rocket
  };

  return {
    id: service.id,
    name: service.name,
    price: service.price.toString(),
    description: service.description,
    bookingUrl: `/book?service=${service.id}`,
    icon: icons[service.id] || Sparkles
  };
};

export default function AIPricingAssistant() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      text: "Hi! I'm your Iconic AI Assistant. I'm here to help you find the perfect media package for your needs. To get started, what is your primary focus right now: selling a specific property, or building your personal brand?",
      sender: "ai",
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [step, setStep] = useState(0); // 0: Initial, 1: Detail, 2: Final
  const [category, setCategory] = useState<"listing" | "brand" | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSendMessage = () => {
    if (!inputValue.trim()) return;

    const newUserMessage: Message = {
      id: Date.now().toString(),
      text: inputValue,
      sender: "user",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, newUserMessage]);
    setInputValue("");
    setIsTyping(true);

    // Simulate AI logic based on steps
    setTimeout(() => {
      let responseText = "";
      let recommendation: PackageRecommendation | undefined;
      const lowerInput = inputValue.toLowerCase();

      if (step === 0) {
        if (lowerInput.includes("property") || lowerInput.includes("listing") || lowerInput.includes("sell")) {
          setCategory("listing");
          setStep(1);
          responseText = "Great! For property listings, we have several tiers. Are you typically handling luxury estates ($1M+), or are you looking for high-speed, high-volume media for standard residential listings?";
        } else if (lowerInput.includes("brand") || lowerInput.includes("agent") || lowerInput.includes("personal")) {
          setCategory("brand");
          setStep(1);
          responseText = "Building a brand is key to long-term success. Are you looking for a simple refresh of your headshots, or a full 'content department on autopilot' with monthly video production?";
        } else {
          responseText = "I see. To give you the best recommendation, could you tell me if you're focusing on a specific property right now, or your overall personal branding as an agent?";
        }
      } else if (step === 1) {
        if (category === "listing") {
          if (lowerInput.includes("luxury") || lowerInput.includes("estate") || lowerInput.includes("million")) {
            responseText = "For luxury estates, I highly recommend 'The Legacy' or 'The Showcase'. 'The Legacy' includes a full cinematic property video which is essential for high-end buyers. Based on our conversation, 'The Legacy' production is your best bet.";
            recommendation = getPackageRecommendation("listing-legacy");
          } else {
            responseText = "For standard residential listings, 'The Essentials' is our most popular choice for speed, while 'The Showcase' adds those aerials and animated reels that really make a listing pop on social media. I'd recommend starting with 'The Showcase' for the best ROI.";
            recommendation = getPackageRecommendation("listing-showcase");
          }
        } else if (category === "brand") {
          if (lowerInput.includes("refresh") || lowerInput.includes("headshot") || lowerInput.includes("simple")) {
            responseText = "If you're just starting out or need a quick update, 'The Refresh' is perfect. It gives you those modern lifestyle portraits that stand out from the typical corporate headshot. Here's what I recommend:";
            recommendation = getPackageRecommendation("branding-refresh");
          } else {
            responseText = "For a full content strategy, 'The Content Partner' or 'The Growth Engine' are designed to take the weight off your shoulders. Based on your goals for consistent production, 'The Content Partner' is my top recommendation.";
            recommendation = getPackageRecommendation("branding-content-partner");
          }
        }
        setStep(2);
      } else {
        responseText = "I've provided a recommendation above! If you have more specific questions, feel free to ask, or you can jump straight into the booking flow to see exact dates and availability.";
      }

      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        text: responseText,
        sender: "ai",
        timestamp: new Date(),
        recommendation
      };
      setMessages((prev) => [...prev, aiResponse]);
      setIsTyping(false);
    }, 1500);
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#fafafa]">
      <Header />

      <main className="flex-1 pt-32 pb-20 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-black border border-black mb-6 shadow-lg">
              <Sparkles className="w-4 h-4 text-white" />
              <span className="text-[12px] font-bold tracking-wider uppercase accent-text-bordered">
                AI Media Strategist
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-black mb-4 tracking-tight">
              Find your <span className="accent-text-bordered">perfect match</span>
            </h1>
            <p className="text-gray-500 text-lg max-w-2xl mx-auto">
              Answer a few questions and our AI will determine which service or package best suits your specific business goals.
            </p>
          </div>

          {/* Chat Container */}
          <div className="bg-white rounded-[2.5rem] shadow-2xl shadow-teal-900/5 border border-gray-100 overflow-hidden flex flex-col h-[650px]">
            {/* Chat Messages */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-8 space-y-6 bg-gradient-to-b from-white to-gray-50/30"
            >
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className="space-y-4"
                >
                  <div className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`flex gap-3 max-w-[80%] ${msg.sender === "user" ? "flex-row-reverse" : "flex-row"}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border shadow-sm ${
                        msg.sender === "user" ? "bg-white border-gray-100" : "bg-[#0d9488] border-[#0d9488] text-white"
                      }`}>
                        {msg.sender === "user" ? <User className="w-4 h-4 text-gray-400" /> : <Sparkles className="w-4 h-4" />}
                      </div>
                      <div
                        className={`px-5 py-4 rounded-2xl text-sm leading-relaxed ${
                          msg.sender === "user"
                            ? "bg-black text-white rounded-tr-none"
                            : "bg-white text-gray-800 border border-gray-100 shadow-sm rounded-tl-none"
                        }`}
                      >
                        {msg.text}
                        <div className={`text-[10px] mt-2 font-medium ${msg.sender === "user" ? "text-gray-400" : "text-gray-400"}`}>
                          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  </div>

                  {msg.recommendation && (
                    <div className="flex justify-start pl-11">
                      <div className="bg-teal-50/50 border border-teal-100 rounded-[2rem] p-6 max-w-[80%] shadow-sm animate-in zoom-in-95 duration-500">
                        <div className="flex items-center gap-4 mb-4">
                          <div className="w-12 h-12 rounded-2xl bg-white border border-teal-100 flex items-center justify-center shadow-sm">
                            <msg.recommendation.icon className="w-6 h-6 text-[#0d9488]" />
                          </div>
                          <div>
                            <p className="text-[10px] font-black text-[#0d9488] uppercase tracking-[0.2em] mb-0.5">Recommended Package</p>
                            <h4 className="text-xl font-black text-black uppercase tracking-tight">{msg.recommendation.name}</h4>
                          </div>
                        </div>
                        <p className="text-sm text-gray-600 mb-6 leading-relaxed">
                          {msg.recommendation.description}
                        </p>
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-black text-black">${msg.recommendation.price}</span>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Starting At</span>
                          </div>
                          <Link to={msg.recommendation.bookingUrl}>
                            <Button className="bg-black hover:bg-gray-800 text-white font-bold rounded-xl px-6 py-5 group shadow-lg">
                              Book Now
                              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#0d9488] flex items-center justify-center text-white shrink-0">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div className="bg-white border border-gray-100 px-5 py-4 rounded-2xl rounded-tl-none shadow-sm flex gap-1">
                      <div className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce"></div>
                      <div className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                      <div className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Chat Input */}
            <div className="p-6 border-t border-gray-100 bg-white">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="relative"
              >
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={step === 2 ? "Ask a follow-up question..." : "Tell me about your marketing goals..."}
                  className="w-full pl-6 pr-16 py-4 bg-gray-50 rounded-2xl outline-none text-sm focus:ring-2 ring-teal-500/10 border border-transparent focus:bg-white focus:border-[#0d9488]/20 transition-all shadow-inner"
                />
                <button
                  type="submit"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 bg-[#0d9488] text-white rounded-xl hover:bg-[#0f766e] transition-colors shadow-lg shadow-teal-100 disabled:opacity-50"
                  disabled={!inputValue.trim()}
                >
                  <Send className="w-5 h-5" />
                </button>
              </form>
              <div className="mt-4 flex flex-wrap gap-2 justify-center">
                {step === 0 && (
                  <>
                    <button onClick={() => setInputValue("I need to sell a luxury listing fast.")} className="text-[10px] font-bold text-gray-400 border border-gray-100 px-3 py-1.5 rounded-full hover:border-[#0d9488] hover:text-[#0d9488] transition-colors bg-white shadow-sm">"Sell a luxury listing"</button>
                    <button onClick={() => setInputValue("I want to build my personal brand as a realtor.")} className="text-[10px] font-bold text-gray-400 border border-gray-100 px-3 py-1.5 rounded-full hover:border-[#0d9488] hover:text-[#0d9488] transition-colors bg-white shadow-sm">"Build my personal brand"</button>
                  </>
                )}
                {step === 1 && category === "listing" && (
                  <>
                    <button onClick={() => setInputValue("I handle luxury estates.")} className="text-[10px] font-bold text-gray-400 border border-gray-100 px-3 py-1.5 rounded-full hover:border-[#0d9488] hover:text-[#0d9488] transition-colors bg-white shadow-sm">"Luxury Estates"</button>
                    <button onClick={() => setInputValue("Standard residential listings.")} className="text-[10px] font-bold text-gray-400 border border-gray-100 px-3 py-1.5 rounded-full hover:border-[#0d9488] hover:text-[#0d9488] transition-colors bg-white shadow-sm">"Standard Residential"</button>
                  </>
                )}
                {step === 1 && category === "brand" && (
                  <>
                    <button onClick={() => setInputValue("Just a simple refresh.")} className="text-[10px] font-bold text-gray-400 border border-gray-100 px-3 py-1.5 rounded-full hover:border-[#0d9488] hover:text-[#0d9488] transition-colors bg-white shadow-sm">"Simple Refresh"</button>
                    <button onClick={() => setInputValue("Full content department.")} className="text-[10px] font-bold text-gray-400 border border-gray-100 px-3 py-1.5 rounded-full hover:border-[#0d9488] hover:text-[#0d9488] transition-colors bg-white shadow-sm">"Full Content Dept"</button>
                  </>
                )}
                {step === 2 && (
                  <button onClick={() => { setStep(0); setCategory(null); setMessages([{ id: Date.now().toString(), text: "Let's start over! What is your primary focus: property or brand?", sender: "ai", timestamp: new Date() }]); }} className="text-[10px] font-bold text-red-400 border border-red-50 px-3 py-1.5 rounded-full hover:bg-red-50 transition-colors bg-white shadow-sm">Start Over</button>
                )}
              </div>
            </div>
          </div>

          {/* Quick Info */}
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 bg-white rounded-2xl border border-gray-100 shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center text-[#0d9488] mb-4">
                <Check className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-black mb-2">Tailored Advice</h4>
              <p className="text-xs text-gray-500 leading-relaxed">Our AI analyzes your specific market and goals to provide exact package matches.</p>
            </div>
            <div className="p-6 bg-white rounded-2xl border border-gray-100 shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center text-[#0d9488] mb-4">
                <Check className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-black mb-2">Instant Insight</h4>
              <p className="text-xs text-gray-500 leading-relaxed">No waiting for a callback. Get strategy recommendations in seconds.</p>
            </div>
            <div className="p-6 bg-white rounded-2xl border border-gray-100 shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center text-[#0d9488] mb-4">
                <Check className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-black mb-2">Iconic Guarantee</h4>
              <p className="text-xs text-gray-500 leading-relaxed">Our recommendations focus on maximizing your ROI and market presence.</p>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
