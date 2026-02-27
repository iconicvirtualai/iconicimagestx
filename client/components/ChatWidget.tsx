import { useState, useEffect, useRef } from "react";
import { MessageCircle, X, Send, User } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Message {
  id: string;
  text: string;
  sender: "user" | "support";
  timestamp: Date;
}

export default function ChatWidget({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      text: "Hi there! How can we help you today?",
      sender: "support",
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

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

    // Simulate response
    setTimeout(() => {
      const supportResponse: Message = {
        id: (Date.now() + 1).toString(),
        text: "Thanks for reaching out! A member of our team will be with you shortly.",
        sender: "support",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, supportResponse]);
    }, 1500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-6 right-6 w-[380px] h-[550px] bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col z-[100] animate-in slide-in-from-bottom-6 duration-300">
      {/* Header */}
      <div className="p-6 bg-[#0d9488] rounded-t-2xl flex items-center justify-between text-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center border border-white/30 backdrop-blur-sm">
            <User className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-bold">Iconic Support</h4>
            <div className="flex items-center gap-1.5 text-xs text-teal-100 font-medium">
              <span className="w-2 h-2 rounded-full bg-green-400"></span>
              Live Now
            </div>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Messages */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50/50"
      >
        {messages.map((msg) => (
          <div 
            key={msg.id}
            className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
          >
            <div 
              className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm ${
                msg.sender === "user" 
                  ? "bg-[#0d9488] text-white rounded-br-none" 
                  : "bg-white text-gray-800 border border-gray-100 shadow-sm rounded-bl-none"
              }`}
            >
              {msg.text}
              <div className={`text-[10px] mt-1.5 ${msg.sender === "user" ? "text-teal-100" : "text-gray-400"}`}>
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-100 bg-white rounded-b-2xl">
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2"
        >
          <input 
            type="text" 
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 px-4 py-2 bg-gray-100 rounded-xl outline-none text-sm focus:ring-2 ring-teal-500/20 border border-transparent focus:bg-white transition-all"
          />
          <button 
            type="submit"
            className="p-2 bg-[#0d9488] text-white rounded-xl hover:bg-[#0f766e] transition-colors shadow-md shadow-teal-100 disabled:opacity-50"
            disabled={!inputValue.trim()}
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
