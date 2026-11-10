/**
 * Dev-only screenshot page. The numbers below are a labeled sample.
 * They are not read from Firestore and this route is omitted from production builds.
 */

import { navGroups } from "@/lib/adminNav";
import { shellUnreadTotal, unreadCounts } from "@shared/adminUnread";
import { AdminSidebarNav } from "@/components/admin/AdminSidebarNav";
import { UnreadBadge } from "@/components/admin/UnreadBadge";
import { CommunicationsTabBar } from "@/components/communications/CommunicationsTabBar";
import { Menu } from "lucide-react";

const counts = unreadCounts({
  channels: { chat: 1, inbox: 12, sms: 2, botroom: 1, orders: 3, events: 4 },
  taskTotals: { admin: 2 },
  uid: "admin",
});

export default function AdminUnreadFixture() {
  return (
    <main className="min-h-screen bg-[#f4f7f8] text-slate-900">
      <p data-testid="unread-fixture-banner" className="bg-amber-100 px-4 py-2 text-center text-xs font-bold text-amber-950">
        Screenshot fixture. These counts are sample numbers, not live Firestore.
      </p>
      <div className="grid gap-6 p-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="flex h-[720px] flex-col overflow-hidden rounded-2xl border border-gray-800 bg-[#0a0a0a]" data-testid="unread-fixture-menu">
          <div className="border-b border-gray-800 p-5">
            <span className="block text-xs font-black uppercase tracking-widest text-white">Iconic</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Ops Portal</span>
          </div>
          <AdminSidebarNav groups={navGroups} activeHref="/admin/communications" role="admin" counts={counts} />
        </aside>
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <button type="button" className="relative rounded-lg border border-slate-200 bg-white p-2" aria-label="Open menu">
              <Menu className="h-4 w-4" />
              <UnreadBadge count={shellUnreadTotal(counts, "admin")} testId="admin-menu-unread" className="absolute -right-1 -top-1" />
            </button>
            <p className="text-xs font-semibold text-slate-500">Collapsed menu button. The mobile drawer uses the same menu list.</p>
          </div>
          <section className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900" data-testid="unread-fixture-communications">
            <CommunicationsTabBar tab="sweep" isAdmin counts={counts} onSelect={() => undefined} />
            <p className="p-4 text-sm text-gray-400">Communications parent badge is the sum of Chat, Inbox, SMS, and Bot Room.</p>
          </section>
          <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4" data-testid="unread-fixture-sections">
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600">
              My tasks 4
              <UnreadBadge count={counts.tasks} testId="tasks-mine-unread" />
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-teal-800">Holiday RSVPs</span>
              <UnreadBadge count={counts.events} testId="events-rsvp-unread" />
            </span>
          </section>
          <aside className="w-full max-w-sm overflow-hidden rounded-2xl border border-gray-800 bg-[#0a0a0a]" data-testid="unread-fixture-mobile">
            <p className="px-4 pt-3 text-[10px] font-bold uppercase tracking-widest text-gray-500">Mobile menu</p>
            <AdminSidebarNav groups={navGroups} activeHref="/admin/orders" role="admin" counts={counts} />
          </aside>
        </div>
      </div>
    </main>
  );
}
