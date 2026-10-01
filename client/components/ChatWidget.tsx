import { useEffect, useRef, useState } from "react";
import { X, Send, User } from "lucide-react";

interface Message {
  id: string;
  text: string;
  sender: "user" | "support";
  timestamp: Date;
}

interface ContactInfo {
  name: string;
  email: string;
  phone: string;
}

const STORAGE_KEY = "iconic-live-chat-contact";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function loadContact(): ContactInfo | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ContactInfo>;
    const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
    const email = typeof parsed.email === "string" ? parsed.email.trim() : "";
    const phone = typeof parsed.phone === "string" ? parsed.phone.trim() : "";
    if (!name || (!email && !phone)) return null;
    return { name, email, phone };
  } catch {
    return null;
  }
}

function saveContact(contact: ContactInfo) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(contact));
  } catch {
    // Private browsing can block storage. The in-memory copy still works.
  }
}

export default function ChatWidget({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      text: "Hi — send a note and the Iconic Images team will follow up by email or phone.",
      sender: "support",
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [contact, setContact] = useState<ContactInfo | null>(null);
  const [editingContact, setEditingContact] = useState(false);
  const [contactDraft, setContactDraft] = useState<ContactInfo>({ name: "", email: "", phone: "" });
  const [contactError, setContactError] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = loadContact();
    if (saved) {
      setContact(saved);
      setContactDraft(saved);
    }
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen, error]);

  const needsContact = !contact || editingContact;

  const saveContactForm = (event: React.FormEvent) => {
    event.preventDefault();
    const name = contactDraft.name.trim();
    const email = contactDraft.email.trim();
    const phone = contactDraft.phone.trim();
    if (!name) {
      setContactError("Please enter your name.");
      return;
    }
    if (!email && !phone) {
      setContactError("Add an email or phone number so we can reply.");
      return;
    }
    if (email && !EMAIL_RE.test(email)) {
      setContactError("Enter a valid email, or leave it blank and use a phone number.");
      return;
    }
    const next = { name, email, phone };
    setContact(next);
    setContactDraft(next);
    saveContact(next);
    setEditingContact(false);
    setContactError("");
  };

  const handleSendMessage = async () => {
    const text = inputValue.trim();
    if (!text || !contact || sending) return;

    setSending(true);
    setError("");

    try {
      const response = await fetch("/api/contact/live-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: contact.name,
          email: contact.email,
          phone: contact.phone,
          message: text,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(data.error || "We couldn't deliver your message.");
      }

      const confirmation =
        typeof data.message === "string" && data.message.trim()
          ? data.message.trim()
          : "We got your message. A teammate will reply by email or phone.";
      const now = Date.now();
      setMessages((prev) => [
        ...prev,
        { id: `${now}`, text, sender: "user", timestamp: new Date() },
        { id: `${now}-ok`, text: confirmation, sender: "support", timestamp: new Date() },
      ]);
      setInputValue("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "We couldn't deliver your message.";
      setError(`${message} Your message is still here — try again, or call 281-356-0965.`);
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  const replyLine = contact
    ? [contact.name, contact.email || contact.phone].filter(Boolean).join(" · ")
    : "";

  return (
    <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 w-[min(380px,calc(100vw-2rem))] h-[min(550px,calc(100dvh-2rem))] bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col z-[100] animate-in slide-in-from-bottom-6 duration-300">
      <div className="p-6 bg-[#0d9488] rounded-t-2xl flex items-center justify-between text-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center border border-white/30 backdrop-blur-sm">
            <User className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-bold">Iconic Support</h4>
            <p className="text-xs text-teal-100 font-medium">We'll reply by email or phone</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close chat"
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

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
                {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 border-t border-gray-100 bg-white rounded-b-2xl">
        {needsContact ? (
          <form onSubmit={saveContactForm} className="space-y-2">
            <p className="text-xs text-gray-500">Tell us how to reach you. Email or phone is enough.</p>
            <input
              type="text"
              value={contactDraft.name}
              onChange={(event) => setContactDraft((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Your name"
              autoComplete="name"
              aria-label="Your name"
              className="w-full px-4 py-2 bg-gray-100 rounded-xl outline-none text-sm focus:ring-2 ring-teal-500/20 border border-transparent focus:bg-white transition-all"
            />
            <input
              type="email"
              value={contactDraft.email}
              onChange={(event) => setContactDraft((prev) => ({ ...prev, email: event.target.value }))}
              placeholder="Email"
              autoComplete="email"
              aria-label="Email"
              className="w-full px-4 py-2 bg-gray-100 rounded-xl outline-none text-sm focus:ring-2 ring-teal-500/20 border border-transparent focus:bg-white transition-all"
            />
            <input
              type="tel"
              value={contactDraft.phone}
              onChange={(event) => setContactDraft((prev) => ({ ...prev, phone: event.target.value }))}
              placeholder="Phone"
              autoComplete="tel"
              aria-label="Phone"
              className="w-full px-4 py-2 bg-gray-100 rounded-xl outline-none text-sm focus:ring-2 ring-teal-500/20 border border-transparent focus:bg-white transition-all"
            />
            {contactError ? (
              <p role="alert" className="text-xs text-red-600">{contactError}</p>
            ) : null}
            <button
              type="submit"
              className="w-full py-2 bg-[#0d9488] text-white rounded-xl hover:bg-[#0f766e] transition-colors text-sm font-semibold"
            >
              Continue
            </button>
          </form>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-[11px] text-gray-500 truncate">{replyLine}</p>
              <button
                type="button"
                onClick={() => {
                  setEditingContact(true);
                  setContactError("");
                }}
                className="text-[11px] font-semibold text-[#0d9488] shrink-0"
              >
                Change
              </button>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                placeholder="Type your message..."
                aria-label="Message"
                disabled={sending}
                className="flex-1 px-4 py-2 bg-gray-100 rounded-xl outline-none text-sm focus:ring-2 ring-teal-500/20 border border-transparent focus:bg-white transition-all disabled:opacity-60"
              />
              <button
                type="submit"
                aria-label="Send message"
                className="p-2 bg-[#0d9488] text-white rounded-xl hover:bg-[#0f766e] transition-colors shadow-md shadow-teal-100 disabled:opacity-50"
                disabled={!inputValue.trim() || sending}
              >
                <Send className="w-5 h-5" />
              </button>
            </form>
            {error ? (
              <p role="alert" className="text-xs text-red-600 mt-2">{error}</p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
