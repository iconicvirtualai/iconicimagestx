import {
  Bot,
  Megaphone,
  MessageCircle,
  MessageSquare,
  Send,
  Smartphone,
  Sparkles,
} from "lucide-react";
import type { ElementType } from "react";
import { communicationTabUnreadKey, type AdminUnreadCounts } from "@shared/adminUnread";
import { UnreadBadge } from "@/components/admin/UnreadBadge";

export type CommunicationsTabId =
  | "sweep"
  | "contact"
  | "inbox"
  | "sms"
  | "compose"
  | "campaigns"
  | "assistants"
  | "botroom";

const TABS: { id: CommunicationsTabId; label: string; icon: ElementType; adminOnly?: boolean }[] = [
  { id: "sweep", label: "Sweep", icon: Bot },
  { id: "contact", label: "Chat", icon: MessageCircle },
  { id: "inbox", label: "Inbox", icon: MessageSquare },
  { id: "sms", label: "SMS", icon: Smartphone },
  { id: "compose", label: "Compose", icon: Send },
  { id: "campaigns", label: "Campaigns", icon: Megaphone },
  { id: "assistants", label: "Assistants", icon: Sparkles },
  { id: "botroom", label: "Bot Room", icon: Bot, adminOnly: true },
];

export function CommunicationsTabBar({
  tab,
  isAdmin,
  counts,
  onSelect,
}: {
  tab: CommunicationsTabId;
  isAdmin: boolean;
  counts: AdminUnreadCounts;
  onSelect: (tab: CommunicationsTabId) => void;
}) {
  const visible = TABS.filter((item) => isAdmin || !item.adminOnly);
  return (
    <div className="flex flex-wrap border-b border-gray-700" role="tablist" aria-label="Communications">
      {visible.map(({ id, icon: Icon, label }) => {
        const key = communicationTabUnreadKey(id);
        const unread = key ? counts[key] : 0;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => onSelect(id)}
            className={`flex min-w-[4.5rem] flex-1 flex-col items-center gap-1 px-1 py-3 text-[10px] transition-colors ${
              tab === id
                ? "border-b-2 border-teal-400 text-teal-400"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            <Icon className="h-4 w-4" />
            <span className="inline-flex items-center gap-1">
              {label}
              <UnreadBadge count={unread} testId={key ? `communications-unread-${key}` : undefined} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
