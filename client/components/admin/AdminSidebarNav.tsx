import { Link } from "react-router-dom";
import { navUnreadCount, type AdminUnreadCounts } from "@shared/adminUnread";
import type { AdminNavItem } from "@/lib/adminNav";
import { UnreadBadge } from "./UnreadBadge";

export function AdminSidebarNav({
  groups,
  activeHref,
  role,
  counts,
  onNavigate,
}: {
  groups: { label: string; items: AdminNavItem[] }[];
  activeHref: string | null;
  role: string;
  counts: AdminUnreadCounts;
  onNavigate?: () => void;
}) {
  return (
    <nav className="scrollbar-hide relative flex-1 space-y-5 overflow-y-auto px-3 py-5" data-testid="admin-sidebar-nav">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="mb-2 px-3 text-[9px] font-black uppercase tracking-[0.15em] text-gray-600">
            {group.label}
          </p>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = item.href === activeHref;
              const unread = navUnreadCount(item.href, counts, role);
              return (
                <Link
                  key={item.label}
                  to={item.href}
                  onClick={onNavigate}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-bold uppercase tracking-wide transition-all ${
                    active
                      ? "border-l-2 border-[#0d9488] bg-[#0d9488]/10 pl-[10px] text-[#0d9488]"
                      : "text-gray-400 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="min-w-0 flex-1">{item.label}</span>
                  <UnreadBadge count={unread} testId={`nav-unread-${item.href}`} />
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
