/**
 * Iconic Images — Admin Messages
 * Unified inbox: in-app chat + SMS conversations + compose panel.
 * Route: /admin/messages
 */

import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { onSnapshot, collection, query, orderBy, limit, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import AdminLayout from "@/components/AdminLayout";
import {
  Bot,
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  Inbox,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  Send,
  Plus,
  AlertCircle,
  X,
  Smartphone,
  Megaphone,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import BotRoomPanel from "@/components/communications/BotRoomPanel";
import OperationsStatsGrid from "@/components/OperationsStatsGrid";
import ContactLiveChat from "@/components/ContactLiveChat";
import { useAuth } from "@/contexts/AuthContext";
import { UnifiedThreads } from "@/components/communications/UnifiedThreads";
import { AssistantPanes } from "@/components/communications/AssistantPanes";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  orderId?: string;
  senderId: string;
  senderType: "staff" | "client" | "photographer";
  senderName: string;
  content: string;
  channel?: "in-app" | "sms";
  isRead: boolean;
  createdAt: { seconds: number } | null;
}

interface Conversation {
  id: string;
  orderId: string;
  conversationSid: string;
  photographerName?: string;
  clientName?: string;
  photographerPhone: string;
  clientPhone: string;
  status: "active" | "closed";
  createdAt: { seconds: number } | null;
}

interface OrderThread {
  orderId: string;
  clientName: string;
  address: string;
  lastMessage?: Message;
  unreadCount: number;
  messages: Message[];
}

interface MailchimpList {
  id: string;
  name: string;
  memberCount: number;
  unsubscribeCount: number;
}

type Tab = "sweep" | "contact" | "inbox" | "sms" | "compose" | "campaigns" | "assistants" | "botroom";

const sweepChannels = [
  {
    label: "Email",
    status: "Ready when SMTP is connected",
    detail: "Delivery, invoice, booking, support, and manual email history.",
    icon: Mail,
    ready: true,
  },
  {
    label: "Text / SMS",
    status: "Ready when Twilio is connected",
    detail: "Client reminders, delivery texts, masked photographer-client threads, and opt-outs.",
    icon: Smartphone,
    ready: true,
  },
  {
    label: "Client Portal",
    status: "Live internal thread feed",
    detail: "Order messages, client notes, gallery replies, invoice questions, and revision requests.",
    icon: MessageSquare,
    ready: true,
  },
  {
    label: "Team Notes",
    status: "Bot Room",
    detail: "Cora, the Grok bots, and Cadi share one timeline. Owners and admins open the Bot Room tab.",
    icon: Inbox,
    ready: true,
  },
  {
    label: "Social Media",
    status: "Connector needed",
    detail: "Instagram, Facebook, TikTok, Google Business, and lead comments/DMs.",
    icon: Megaphone,
    ready: false,
  },
];

const sweepRules = [
  "Sweep every active order for unanswered client, photographer, billing, and delivery messages.",
  "Surface overdue replies, missing confirmations, failed email/text sends, and client questions needing a human.",
  "Merge email, SMS, portal chat, social DMs/comments, and internal notes into one searchable client/order timeline.",
  "Create follow-up tasks for AICON or the right team member instead of letting messages disappear in separate apps.",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(ts: { seconds: number } | null) {
  if (!ts) return "";
  const diff = Date.now() / 1000 - ts.seconds;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Component ────────────────────────────────────────────────────────────────

function initialCommunicationsTab(pathname: string, search: string): Tab {
  const params = new URLSearchParams(search);
  if (pathname.startsWith("/admin/botroom") || params.get("tab") === "botroom") return "botroom";
  return "sweep";
}

export default function AdminMessages() {
  const { toast } = useToast();
  const { user, isAdmin } = useAuth();
  const location = useLocation();
  const [tab, setTab] = useState<Tab>(() => initialCommunicationsTab(location.pathname, location.search));
  const [threads, setThreads] = useState<OrderThread[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConvo, setSelectedConvo] = useState<Conversation | null>(null);
  const [sending, setSending] = useState(false);

  // Compose state
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeChannel, setComposeChannel] = useState<"sms" | "email">("sms");

  // New conversation state
  const [newConvoOrderId, setNewConvoOrderId] = useState("");
  const [newConvoPhotographerPhone, setNewConvoPhotographerPhone] = useState("");
  const [newConvoPhotographerName, setNewConvoPhotographerName] = useState("");
  const [newConvoClientPhone, setNewConvoClientPhone] = useState("");
  const [newConvoClientName, setNewConvoClientName] = useState("");
  const [showNewConvo, setShowNewConvo] = useState(false);

  // Campaign state
  const [campaignName, setCampaignName] = useState("");
  const [campaignBody, setCampaignBody] = useState("");
  const [campaignAudience, setCampaignAudience] = useState("all");
  const [launchingCampaign, setLaunchingCampaign] = useState(false);
  const [mailchimpConnected, setMailchimpConnected] = useState(false);
  const [mailchimpMessage, setMailchimpMessage] = useState("Mailchimp has not been checked yet.");
  const [mailchimpAccount, setMailchimpAccount] = useState("");
  const [mailchimpLists, setMailchimpLists] = useState<MailchimpList[]>([]);
  const [mailchimpListId, setMailchimpListId] = useState("");
  const [mailchimpAudience, setMailchimpAudience] = useState("all");
  const [checkingMailchimp, setCheckingMailchimp] = useState(false);
  const [syncingMailchimp, setSyncingMailchimp] = useState(false);

  async function authHeaders(extra: Record<string, string> = {}) {
    const token = await user?.getIdToken?.();
    return {
      ...extra,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  useEffect(() => {
    const next = initialCommunicationsTab(location.pathname, location.search);
    if (next === "botroom") setTab("botroom");
  }, [location.pathname, location.search]);

  // ─── Real-time messages ───────────────────────────────────────────────────

  useEffect(() => {
    const q = query(
      collection(db, "messages"),
      orderBy("createdAt", "desc"),
      limit(200)
    );

    const unsub = onSnapshot(q, (snap) => {
      const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Message));

      // Group by orderId
      const map = new Map<string, Message[]>();
      for (const msg of msgs) {
        const key = msg.orderId || "unlinked";
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(msg);
      }

      const built: OrderThread[] = [];
      map.forEach((msgs, orderId) => {
        const sorted = [...msgs].sort(
          (a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0)
        );
        const unread = msgs.filter((m) => !m.isRead && m.senderType === "client").length;
        built.push({
          orderId,
          clientName: sorted.find((m) => m.senderType === "client")?.senderName || "Client",
          address: "",
          lastMessage: sorted[sorted.length - 1],
          unreadCount: unread,
          messages: sorted,
        });
      });

      built.sort(
        (a, b) =>
          (b.lastMessage?.createdAt?.seconds ?? 0) -
          (a.lastMessage?.createdAt?.seconds ?? 0)
      );

      setThreads(built);
    });

    return () => unsub();
  }, []);

  // ─── Conversations ────────────────────────────────────────────────────────

  useEffect(() => {
    if (tab !== "sms") return;

    const q = query(
      collection(db, "conversations"),
      orderBy("createdAt", "desc"),
      limit(50)
    );
    const unsub = onSnapshot(q, (snap) => {
      setConversations(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Conversation)));
    });
    return () => unsub();
  }, [tab]);

  useEffect(() => {
    if (tab === "campaigns") {
      checkMailchimp();
    }
  }, [tab]);

  // ─── Send one-off SMS ─────────────────────────────────────────────────────

  async function sendCompose() {
    if (!composeTo || !composeBody) return;
    setSending(true);
    try {
      const res = await fetch(composeChannel === "sms" ? "/api/sms/send" : "/api/messages/email", {
        method: "POST",
        headers: await authHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ to: composeTo, subject: composeSubject, body: composeBody }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: `${composeChannel === "sms" ? "SMS" : "Email"} sent!`, description: `Message delivered to ${composeTo}` });
      setComposeTo("");
      setComposeSubject("");
      setComposeBody("");
    } catch (err) {
      toast({ title: `${composeChannel === "sms" ? "SMS" : "Email"} failed`, description: String(err), variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  // ─── Create masked conversation ───────────────────────────────────────────

  async function createConversation() {
    if (!newConvoOrderId || !newConvoPhotographerPhone || !newConvoClientPhone) return;
    setSending(true);
    try {
      const res = await fetch("/api/sms/conversation", {
        method: "POST",
        headers: await authHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({
          orderId: newConvoOrderId,
          photographerPhone: newConvoPhotographerPhone,
          photographerName: newConvoPhotographerName,
          clientPhone: newConvoClientPhone,
          clientName: newConvoClientName,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: "Conversation created!", description: "Photographer and client have been connected via Twilio." });
      setShowNewConvo(false);
      setNewConvoOrderId("");
      setNewConvoPhotographerPhone("");
      setNewConvoClientPhone("");
    } catch (err) {
      toast({ title: "Failed", description: String(err), variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  // ─── Launch SMS campaign ──────────────────────────────────────────────────

  async function launchCampaign() {
    if (!campaignName || !campaignBody) return;
    setLaunchingCampaign(true);
    try {
      // Create campaign
      const createRes = await fetch("/api/campaigns", {
        method: "POST",
        headers: await authHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({
          name: campaignName,
          type: "sms",
          body: campaignBody,
          audience: campaignAudience,
        }),
      });
      const { id } = await createRes.json();

      // Send
      const sendRes = await fetch(`/api/campaigns/${id}/send`, {
        method: "POST",
        headers: await authHeaders(),
        credentials: "include",
      });
      const result = await sendRes.json();

      toast({
        title: "Campaign sent!",
        description: `${result.sent} messages delivered.`,
      });
      setCampaignName("");
      setCampaignBody("");
    } catch (err) {
      toast({ title: "Campaign failed", description: String(err), variant: "destructive" });
    } finally {
      setLaunchingCampaign(false);
    }
  }

  async function checkMailchimp() {
    setCheckingMailchimp(true);
    try {
      const res = await fetch("/api/campaigns/mailchimp/status", {
        headers: await authHeaders(),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Mailchimp check failed.");

      setMailchimpConnected(Boolean(data.connected));
      setMailchimpAccount(data.accountName || "");
      setMailchimpLists(data.lists || []);
      setMailchimpMessage(
        data.connected
          ? `Connected${data.accountName ? ` to ${data.accountName}` : ""}.`
          : data.message || "Mailchimp is not configured."
      );
      if (!mailchimpListId && data.lists?.[0]?.id) setMailchimpListId(data.lists[0].id);
    } catch (err) {
      setMailchimpConnected(false);
      setMailchimpMessage(err instanceof Error ? err.message : "Mailchimp check failed.");
      toast({ title: "Mailchimp check failed", description: String(err), variant: "destructive" });
    } finally {
      setCheckingMailchimp(false);
    }
  }

  async function syncMailchimp() {
    if (!mailchimpListId) return;
    setSyncingMailchimp(true);
    try {
      const res = await fetch("/api/campaigns/mailchimp/sync", {
        method: "POST",
        headers: await authHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ listId: mailchimpListId, audience: mailchimpAudience }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Mailchimp sync failed.");

      toast({
        title: "Mailchimp sync complete",
        description: `${data.synced} clients synced${data.failed ? `, ${data.failed} failed` : ""}.`,
      });
    } catch (err) {
      toast({ title: "Mailchimp sync failed", description: String(err), variant: "destructive" });
    } finally {
      setSyncingMailchimp(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <AdminLayout title="Communications">
      <div className="pb-8">
        <OperationsStatsGrid />
      </div>
      <div className={`flex min-h-[32rem] flex-col overflow-hidden rounded-2xl border border-gray-800 lg:min-h-[calc(100vh-16rem)] ${tab === "botroom" ? "" : "lg:flex-row"}`}>

        {/* ─── Left sidebar: tabs + thread list ─────────────────────────── */}
        <div className={`flex w-full min-w-0 flex-col border-b border-gray-700 bg-gray-900 ${tab === "botroom" ? "" : "lg:w-80 lg:shrink-0 lg:border-b-0 lg:border-r"}`}>
          {/* Tabs */}
          <div className="flex flex-wrap border-b border-gray-700">
            {[
              { id: "sweep" as Tab, icon: Bot, label: "Sweep" },
              { id: "contact" as Tab, icon: MessageCircle, label: "Chat" },
              { id: "inbox" as Tab, icon: MessageSquare, label: "Inbox" },
              { id: "sms" as Tab, icon: Smartphone, label: "SMS" },
              { id: "compose" as Tab, icon: Send, label: "Compose" },
              { id: "campaigns" as Tab, icon: Megaphone, label: "Campaigns" },
              { id: "assistants" as Tab, icon: Sparkles, label: "Assistants" },
              ...(isAdmin ? [{ id: "botroom" as Tab, icon: Bot, label: "Bot Room" }] : []),
            ].map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex min-w-[4.5rem] flex-1 flex-col items-center gap-1 px-1 py-3 text-[10px] transition-colors ${
                  tab === id
                    ? "text-teal-400 border-b-2 border-teal-400"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>

          {tab === "inbox" && (
            <p className="hidden p-4 text-sm leading-relaxed text-gray-400 lg:block">
              Clients, leads, photographers, and socials are in the combined list.
            </p>
          )}

          {tab === "assistants" && (
            <p className="p-4 text-sm leading-relaxed text-gray-400">
              Grok and OpenAI stay on the server. Owner and admin only.
            </p>
          )}

          {/* SMS conversations list */}
          {tab === "sms" && (
            <div className="flex-1 overflow-y-auto">
              <div className="p-3 border-b border-gray-700">
                <button
                  onClick={() => setShowNewConvo(true)}
                  className="w-full py-2 px-3 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-sm flex items-center gap-2 justify-center"
                >
                  <Plus className="w-4 h-4" /> New Photographer ↔ Client Chat
                </button>
              </div>

              {conversations.length === 0 ? (
                <div className="p-6 text-center text-gray-500 text-sm">
                  No masked conversations yet.
                  <br />
                  Connect a photographer + client above.
                </div>
              ) : (
                conversations.map((convo) => (
                  <button
                    key={convo.id}
                    onClick={() => setSelectedConvo(convo)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-800 hover:bg-gray-800 transition-colors ${
                      selectedConvo?.id === convo.id ? "bg-gray-800" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-white truncate">
                        {convo.photographerName || "Photographer"} ↔{" "}
                        {convo.clientName || "Client"}
                      </span>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${
                          convo.status === "active"
                            ? "bg-green-900 text-green-400"
                            : "bg-gray-700 text-gray-400"
                        }`}
                      >
                        {convo.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">Order: #{convo.orderId.slice(0, 8)}</p>
                    <p className="text-xs text-gray-600 flex items-center gap-1 mt-0.5">
                      <Phone className="w-3 h-3" /> Twilio masked number active
                    </p>
                  </button>
                ))
              )}
            </div>
          )}

          {tab === "contact" && (
            <div className="flex-1 p-4 text-sm text-gray-400 leading-relaxed">
              Site contact chats are on the right. A reply stays in that thread and is not emailed or texted.
            </div>
          )}

          {/* Compose / Campaigns / Sweep — no list needed */}
          {(tab === "compose" || tab === "campaigns" || tab === "sweep") && (
            <div className="flex-1 flex items-center justify-center p-4 text-gray-600 text-sm text-center">
              {tab === "sweep" ? "Automatic correspondence sweep overview →" : "Fill in the form on the right →"}
            </div>
          )}
        </div>

        {/* ─── Right panel ─────────────────────────────────────────────────── */}
        <div className={`flex min-w-0 flex-1 flex-col ${tab === "botroom" ? "bg-[#f4f7f8]" : "bg-gray-950"}`}>

          {tab === "botroom" && isAdmin ? <BotRoomPanel /> : null}
          {tab === "botroom" && !isAdmin ? (
            <p className="p-6 text-sm text-gray-600">Bot Room is for owners and admins.</p>
          ) : null}

          {tab === "contact" && <ContactLiveChat />}

          {/* ── Sweep tab ── */}
          {tab === "sweep" && (
            <div className="flex-1 p-8 overflow-y-auto">
              <div className="w-full min-w-0 space-y-6">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-teal-400 mb-2">
                    AICON Correspondence Sweep
                  </p>
                  <h2 className="text-white text-2xl font-black tracking-tight">
                    One place for every conversation to and from Iconic.
                  </h2>
                  <p className="text-gray-400 text-sm mt-2 max-w-3xl">
                    This center is the required home for team, client, email, text, portal, and social communications. AICON should sweep it automatically and flag anything unanswered, failed, urgent, or financially connected.
                  </p>
                  {isAdmin ? (
                    <Link
                      to="/admin/communications/email"
                      className="mt-4 inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white hover:bg-teal-500"
                    >
                      <Mail className="h-4 w-4" /> Email marketing
                    </Link>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { label: "Open Threads", value: threads.length, tone: "text-white" },
                    { label: "Unread Client Replies", value: threads.reduce((sum, t) => sum + t.unreadCount, 0), tone: "text-teal-300" },
                    { label: "Active SMS Bridges", value: conversations.filter((c) => c.status === "active").length, tone: "text-blue-300" },
                  ].map((metric) => (
                    <div key={metric.label} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">{metric.label}</p>
                      <p className={`text-3xl font-black mt-2 ${metric.tone}`}>{metric.value}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
                  {sweepChannels.map(({ label, status, detail, icon: Icon, ready }) => (
                    <div
                      key={label}
                      className={`bg-gray-900 border border-gray-800 rounded-xl p-4 ${label === "Team Notes" && isAdmin ? "cursor-pointer hover:border-teal-500" : ""}`}
                      onClick={label === "Team Notes" && isAdmin ? () => setTab("botroom") : undefined}
                      onKeyDown={label === "Team Notes" && isAdmin ? (event) => {
                        if (event.key === "Enter" || event.key === " ") setTab("botroom");
                      } : undefined}
                      role={label === "Team Notes" && isAdmin ? "button" : undefined}
                      tabIndex={label === "Team Notes" && isAdmin ? 0 : undefined}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <Icon className="w-5 h-5 text-teal-300" />
                        {ready ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <CircleDashed className="w-4 h-4 text-yellow-400" />}
                      </div>
                      <h3 className="text-white text-sm font-bold">{label}</h3>
                      <p className="text-[10px] text-teal-300 font-bold uppercase tracking-wide mt-1">{status}</p>
                      <p className="text-xs text-gray-500 mt-2 leading-relaxed">{detail}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                    <h3 className="text-white font-black uppercase tracking-wide text-sm mb-4">Automatic Sweep Rules</h3>
                    <div className="space-y-3">
                      {sweepRules.map((rule) => (
                        <div key={rule} className="flex gap-3">
                          <CheckCircle2 className="w-4 h-4 text-teal-400 mt-0.5 flex-shrink-0" />
                          <p className="text-sm text-gray-300 leading-relaxed">{rule}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                    <h3 className="text-white font-black uppercase tracking-wide text-sm mb-4">Next Connectors</h3>
                    <div className="space-y-3 text-sm text-gray-300">
                      <p><span className="text-teal-300 font-bold">Email:</span> connect the shared Iconic inbox so inbound replies are pulled into this timeline.</p>
                      <p><span className="text-teal-300 font-bold">Social:</span> connect Instagram, Facebook, TikTok, and Google Business messages/comments.</p>
                      <p><span className="text-teal-300 font-bold">AICON:</span> schedule correspondence sweeps and create tasks for unresolved replies.</p>
                    </div>
                    <button
                      onClick={() => setTab("compose")}
                      className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold uppercase tracking-widest"
                    >
                      <ExternalLink className="w-4 h-4" /> Send Manual Message
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === "inbox" && <UnifiedThreads />}

          {tab === "assistants" && <AssistantPanes />}

          {/* ── SMS tab ── */}
          {tab === "sms" && (
            <>
              {showNewConvo ? (
                <div className="flex-1 p-8 overflow-y-auto">
                  <div className="max-w-lg mx-auto">
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-white text-xl font-semibold">
                        Connect Photographer ↔ Client
                      </h2>
                      <button onClick={() => setShowNewConvo(false)}>
                        <X className="w-5 h-5 text-gray-400" />
                      </button>
                    </div>

                    <div className="bg-teal-900/30 border border-teal-700/50 rounded-xl p-4 mb-6">
                      <p className="text-teal-300 text-sm">
                        📱 A Twilio proxy number will be assigned — neither the photographer nor
                        the client will see each other's real phone number. Both parties can text
                        naturally.
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-gray-300 text-sm mb-1">Order ID</label>
                        <input
                          value={newConvoOrderId}
                          onChange={(e) => setNewConvoOrderId(e.target.value)}
                          placeholder="Firestore order ID or booking ID"
                          className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-teal-500 text-sm"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-gray-300 text-sm mb-1">Photographer Name</label>
                          <input
                            value={newConvoPhotographerName}
                            onChange={(e) => setNewConvoPhotographerName(e.target.value)}
                            placeholder="Alex Rivera"
                            className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-teal-500 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-gray-300 text-sm mb-1">Photographer Phone</label>
                          <input
                            value={newConvoPhotographerPhone}
                            onChange={(e) => setNewConvoPhotographerPhone(e.target.value)}
                            placeholder="(832) 555-1234"
                            className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-teal-500 text-sm"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-gray-300 text-sm mb-1">Client Name</label>
                          <input
                            value={newConvoClientName}
                            onChange={(e) => setNewConvoClientName(e.target.value)}
                            placeholder="Jane Smith"
                            className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-teal-500 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-gray-300 text-sm mb-1">Client Phone</label>
                          <input
                            value={newConvoClientPhone}
                            onChange={(e) => setNewConvoClientPhone(e.target.value)}
                            placeholder="(713) 555-5678"
                            className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-teal-500 text-sm"
                          />
                        </div>
                      </div>

                      <button
                        onClick={createConversation}
                        disabled={sending || !newConvoOrderId || !newConvoPhotographerPhone || !newConvoClientPhone}
                        className="w-full py-3 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white rounded-xl font-medium flex items-center justify-center gap-2"
                      >
                        {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
                        {sending ? "Connecting…" : "Create Masked Conversation"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : selectedConvo ? (
                <div className="flex-1 p-8 overflow-y-auto">
                  <div className="max-w-lg mx-auto">
                    <h2 className="text-white text-xl font-semibold mb-2">
                      {selectedConvo.photographerName} ↔ {selectedConvo.clientName}
                    </h2>
                    <p className="text-gray-400 text-sm mb-6">
                      Order #{selectedConvo.orderId.slice(0, 8)} • Twilio SID:{" "}
                      {selectedConvo.conversationSid}
                    </p>

                    <div className="bg-gray-900 rounded-2xl p-6 space-y-4 mb-6">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Photographer</span>
                        <span className="text-white">{selectedConvo.photographerPhone}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Client</span>
                        <span className="text-white">{selectedConvo.clientPhone}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Status</span>
                        <span
                          className={
                            selectedConvo.status === "active" ? "text-green-400" : "text-gray-400"
                          }
                        >
                          {selectedConvo.status}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Started</span>
                        <span className="text-white">{timeAgo(selectedConvo.createdAt)}</span>
                      </div>
                    </div>

                    <div className="bg-teal-900/30 border border-teal-700/50 rounded-xl p-4">
                      <p className="text-teal-300 text-sm">
                        ✅ Both parties are texting through a Twilio proxy number. Replies appear
                        in your Messages inbox automatically.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-600">
                  <div className="text-center">
                    <Smartphone className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>Select a conversation or create a new one</p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Compose tab ── */}
          {tab === "compose" && (
            <div className="flex-1 p-8 overflow-y-auto">
              <div className="max-w-lg mx-auto">
                <h2 className="text-white text-2xl font-semibold mb-6">Send a Message</h2>

                <div className="space-y-4">
                  {/* Channel toggle */}
                  <div className="flex rounded-xl overflow-hidden border border-gray-700">
                    {(["sms", "email"] as const).map((ch) => (
                      <button
                        key={ch}
                        onClick={() => setComposeChannel(ch)}
                        className={`flex-1 py-3 text-sm font-medium transition-colors ${
                          composeChannel === ch
                            ? "bg-teal-600 text-white"
                            : "bg-gray-800 text-gray-400 hover:text-gray-200"
                        }`}
                      >
                        {ch === "sms" ? "📱 SMS" : "📧 Email"}
                      </button>
                    ))}
                  </div>

                  <div>
                    <label className="block text-gray-300 text-sm mb-1">
                      {composeChannel === "sms" ? "Phone Number" : "Email Address"}
                    </label>
                    <input
                      value={composeTo}
                      onChange={(e) => setComposeTo(e.target.value)}
                      placeholder={composeChannel === "sms" ? "(832) 555-1234" : "client@email.com"}
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-teal-500 text-sm"
                    />
                  </div>

                  {composeChannel === "email" && (
                    <div>
                      <label className="block text-gray-300 text-sm mb-1">Subject</label>
                      <input
                        value={composeSubject}
                        onChange={(e) => setComposeSubject(e.target.value)}
                        placeholder="Message from Iconic Images"
                        className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-teal-500 text-sm"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-gray-300 text-sm mb-1">Message</label>
                    <textarea
                      value={composeBody}
                      onChange={(e) => setComposeBody(e.target.value)}
                      placeholder="Type your message here…"
                      rows={5}
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-teal-500 text-sm resize-none"
                    />
                    {composeChannel === "sms" && (
                      <p className="text-xs text-gray-500 mt-1">
                        {composeBody.length}/1600 characters
                      </p>
                    )}
                  </div>

                  {/* Quick templates */}
                  <div>
                    <p className="text-gray-400 text-xs mb-2">Quick templates:</p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: "Reminder", text: "Hi {{name}}! Just a reminder your Iconic Images shoot is tomorrow 📸 Reply to confirm!" },
                        { label: "Photos Ready", text: "🎉 Your photos are ready! Check your email for the gallery link. — Iconic Images" },
                        { label: "Follow Up", text: "Hi! Just checking in — are you happy with your photos? We'd love a review if so! 🌟" },
                      ].map(({ label, text }) => (
                        <button
                          key={label}
                          onClick={() => setComposeBody(text)}
                          className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs border border-gray-700"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={sendCompose}
                    disabled={sending || !composeTo || !composeBody}
                    className="w-full py-3 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white rounded-xl font-medium flex items-center justify-center gap-2"
                  >
                    {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {sending ? "Sending…" : `Send ${composeChannel.toUpperCase()}`}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Campaigns tab ── */}
          {tab === "campaigns" && (
            <div className="flex-1 p-8 overflow-y-auto">
              <div className="max-w-3xl mx-auto space-y-6">
                <div>
                  <h2 className="text-white text-2xl font-semibold mb-2">Marketing Campaigns</h2>
                  <p className="text-gray-400 text-sm">
                    Sync client audiences to Mailchimp and send compliant SMS campaigns from one control panel.
                  </p>
                </div>

                <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
                  <div className="flex items-start justify-between gap-4 mb-5">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Mail className="w-5 h-5 text-teal-400" />
                        <h3 className="text-white text-lg font-semibold">Mailchimp</h3>
                        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full ${
                          mailchimpConnected
                            ? "bg-green-500/15 text-green-300"
                            : "bg-yellow-500/15 text-yellow-300"
                        }`}>
                          {mailchimpConnected ? "Connected" : "Needs API Key"}
                        </span>
                      </div>
                      <p className="text-gray-400 text-sm">{mailchimpMessage}</p>
                      {mailchimpAccount && (
                        <p className="text-gray-500 text-xs mt-1">Account: {mailchimpAccount}</p>
                      )}
                    </div>
                    <button
                      onClick={checkMailchimp}
                      disabled={checkingMailchimp}
                      className="px-3 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-200 rounded-lg text-xs font-bold uppercase tracking-widest flex items-center gap-2"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${checkingMailchimp ? "animate-spin" : ""}`} />
                      Check
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-gray-300 text-sm mb-1">Mailchimp Audience/List</label>
                      <select
                        value={mailchimpListId}
                        onChange={(e) => setMailchimpListId(e.target.value)}
                        disabled={!mailchimpConnected || mailchimpLists.length === 0}
                        className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-xl text-white focus:outline-none focus:border-teal-500 text-sm disabled:opacity-50"
                      >
                        {mailchimpLists.length === 0 ? (
                          <option value="">No lists found</option>
                        ) : (
                          mailchimpLists.map((list) => (
                            <option key={list.id} value={list.id}>
                              {list.name} ({list.memberCount} contacts)
                            </option>
                          ))
                        )}
                      </select>
                    </div>

                    <div>
                      <label className="block text-gray-300 text-sm mb-1">Sync Segment</label>
                      <select
                        value={mailchimpAudience}
                        onChange={(e) => setMailchimpAudience(e.target.value)}
                        className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-xl text-white focus:outline-none focus:border-teal-500 text-sm"
                      >
                        <option value="all">Active Clients</option>
                        <option value="vip">VIP Clients</option>
                      </select>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <p className="text-xs text-gray-500">
                      API key stays server-side in `MAILCHIMP_API_KEY`. The dashboard only shows status and audiences.
                    </p>
                    <button
                      onClick={syncMailchimp}
                      disabled={!mailchimpConnected || !mailchimpListId || syncingMailchimp}
                      className="px-4 py-3 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white rounded-xl font-medium flex items-center justify-center gap-2 text-sm"
                    >
                      {syncingMailchimp ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                      {syncingMailchimp ? "Syncing…" : "Sync Clients to Mailchimp"}
                    </button>
                  </div>
                </div>

                <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
                  <h3 className="text-white text-lg font-semibold mb-2">SMS Campaign</h3>
                <p className="text-gray-400 text-sm mb-6">
                  Send a bulk text to your client list. Opt-out is handled automatically.
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-gray-300 text-sm mb-1">Campaign Name</label>
                    <input
                      value={campaignName}
                      onChange={(e) => setCampaignName(e.target.value)}
                      placeholder="Spring Promo 2026"
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-teal-500 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-300 text-sm mb-1">Audience</label>
                    <select
                      value={campaignAudience}
                      onChange={(e) => setCampaignAudience(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-xl text-white focus:outline-none focus:border-teal-500 text-sm"
                    >
                      <option value="all">All Clients (SMS opt-in)</option>
                      <option value="vip">VIP Clients</option>
                      <option value="past">Past Clients Only</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-gray-300 text-sm mb-1">
                      Message <span className="text-gray-500">(use {"{{name}}"} for personalization)</span>
                    </label>
                    <textarea
                      value={campaignBody}
                      onChange={(e) => setCampaignBody(e.target.value)}
                      placeholder="Hi {{name}}! 📸 Iconic Images has a spring special — book this month and get 10% off. Reply STOP to unsubscribe."
                      rows={6}
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-teal-500 text-sm resize-none"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {campaignBody.length}/1600 characters • Always include opt-out instructions
                    </p>
                  </div>

                  <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-xl p-4">
                    <div className="flex gap-3">
                      <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                      <div className="text-yellow-300 text-sm">
                        <p className="font-medium mb-1">Compliance reminder</p>
                        <p className="text-yellow-400/80">
                          Only send to clients who have opted in. TCPA requires consent for marketing texts.
                          Always include "Reply STOP to unsubscribe."
                        </p>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={launchCampaign}
                    disabled={launchingCampaign || !campaignName || !campaignBody}
                    className="w-full py-3 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white rounded-xl font-medium flex items-center justify-center gap-2"
                  >
                    {launchingCampaign ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Megaphone className="w-4 h-4" />
                    )}
                    {launchingCampaign ? "Sending campaign…" : "Launch Campaign"}
                  </button>
                </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
