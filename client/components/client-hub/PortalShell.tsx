import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, LayoutGrid, LogOut, Menu, MessageSquare, Receipt, Settings, UserRound, Users, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type PortalHomeSection = "listings" | "schedule" | "messages" | "orders";
export type PortalSettingsSection = "profile" | "team" | "clients" | "billing";
export type PortalNavId = PortalHomeSection | PortalSettingsSection | "order";

const HOME: { id: Exclude<PortalHomeSection, "orders">; label: string; icon: typeof LayoutGrid }[] = [
  { id: "listings", label: "Listings", icon: LayoutGrid },
  { id: "schedule", label: "Schedule", icon: CalendarClock },
  { id: "messages", label: "Messages", icon: MessageSquare },
];

const SETTINGS: { id: PortalSettingsSection; label: string; icon: typeof UserRound }[] = [
  { id: "profile", label: "Profile", icon: UserRound },
  { id: "team", label: "Team", icon: Users },
  { id: "clients", label: "Clients", icon: Receipt },
  { id: "billing", label: "Billing", icon: Wallet },
];

function HubNav({
  active,
  example,
  counts,
  onSection,
  onNavigate,
  compact = false,
}: {
  active: PortalNavId;
  example: boolean;
  counts?: { listings?: number; schedule?: number };
  onSection?: (section: PortalHomeSection) => void;
  onNavigate?: () => void;
  compact?: boolean;
}) {
  return (
    <nav aria-label="Client home" className={compact ? "pt-3 flex flex-col gap-2" : "p-3 flex flex-col gap-2"}>
      {compact ? null : (
        <Link
          to={portalHref("/portal/order", example)}
          data-testid="place-order"
          aria-current={active === "order" ? "page" : undefined}
          onClick={onNavigate}
          className={`flex items-center justify-center min-h-14 rounded-2xl px-3 py-3 text-center text-sm font-black uppercase tracking-widest ${active === "order" ? "bg-[#0f766e] text-white" : "bg-[#0d9488] text-white hover:bg-[#0f766e]"}`}
        >
          Place Order
        </Link>
      )}
      {HOME.map((panel) => {
        const Icon = panel.icon;
        const current = active === panel.id;
        const count = panel.id === "listings" ? counts?.listings : panel.id === "schedule" ? counts?.schedule : undefined;
        const className = `w-full flex items-center justify-between gap-2 rounded-2xl px-3 py-3 text-left ${current ? "bg-black text-white" : "text-gray-600 hover:bg-gray-50"}`;
        const inner = (
          <>
            <span className="flex items-center gap-2 min-w-0">
              <Icon className={`w-4 h-4 shrink-0 ${current ? "text-white" : "text-[#0d9488]"}`} />
              <span className="text-xs font-black uppercase tracking-widest truncate">{panel.label}</span>
            </span>
            {count != null ? <span className="text-[10px] font-black text-gray-400">{count}</span> : null}
          </>
        );
        if (onSection) {
          return (
            <button
              key={panel.id}
              type="button"
              aria-current={current ? "page" : undefined}
              onClick={() => {
                onSection(panel.id);
                onNavigate?.();
              }}
              className={className}
            >
              {inner}
            </button>
          );
        }
        return (
          <Link
            key={panel.id}
            to={portalHref("/portal/home", example, panel.id === "listings" ? undefined : panel.id)}
            aria-current={current ? "page" : undefined}
            onClick={onNavigate}
            className={className}
          >
            {inner}
          </Link>
        );
      })}
      <div className="pt-2" data-testid="settings-nav">
        <p className="px-3 pb-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-gray-400">
          <Settings className="w-3.5 h-3.5" /> Settings
        </p>
        {SETTINGS.map((panel) => {
          const Icon = panel.icon;
          const current = active === panel.id;
          return (
            <Link
              key={panel.id}
              to={portalHref(`/portal/settings/${panel.id}`, example)}
              aria-current={current ? "page" : undefined}
              onClick={onNavigate}
              className={`mt-1 w-full flex items-center gap-2 rounded-2xl px-3 py-3 ${current ? "bg-black text-white" : "text-gray-600 hover:bg-gray-50"}`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${current ? "text-white" : "text-[#0d9488]"}`} />
              <span className="text-xs font-black uppercase tracking-widest truncate">{panel.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function portalHref(path: string, example: boolean, section?: string): string {
  const params = new URLSearchParams();
  if (example) params.set("example", "1");
  if (section) params.set("section", section);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function PortalShell({
  firstName,
  onSignOut,
  active,
  example = false,
  counts,
  onSection,
  children,
}: {
  firstName: string;
  onSignOut?: () => void;
  active: PortalNavId;
  example?: boolean;
  counts?: { listings?: number; schedule?: number };
  onSection?: (section: PortalHomeSection) => void;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="flex-1 bg-[#f6f7f8] text-black flex flex-col min-h-0">
      {example ? (
        <div className="bg-amber-100 text-amber-950 text-center text-[11px] font-black uppercase tracking-[0.22em] px-3 py-2">
          Example data
        </div>
      ) : null}
      <header className="bg-black text-white">
        <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-6 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500">Iconic Images</p>
            <h1 className="text-2xl sm:text-3xl font-black mt-2 truncate">Hello, {firstName}</h1>
          </div>
          {onSignOut ? (
            <Button
              variant="outline"
              className="border-zinc-700 bg-transparent text-white hover:bg-zinc-900 shrink-0"
              onClick={onSignOut}
            >
              <LogOut className="w-4 h-4 mr-2" /> Sign out
            </Button>
          ) : null}
        </div>
      </header>

      <div className="lg:hidden sticky top-0 z-30 bg-white border-b border-gray-200">
        <div className="flex items-center gap-2 p-3">
          <Link
            to={portalHref("/portal/order", example)}
            data-testid="place-order-bar"
            aria-current={active === "order" ? "page" : undefined}
            onClick={closeMenu}
            className={`flex flex-1 items-center justify-center min-h-12 rounded-2xl px-3 text-sm font-black uppercase tracking-widest text-white ${active === "order" ? "bg-[#0f766e]" : "bg-[#0d9488]"}`}
          >
            Place Order
          </Link>
          <button
            type="button"
            className="inline-flex min-h-12 items-center gap-2 rounded-2xl border border-gray-200 px-3 text-xs font-black uppercase tracking-widest"
            aria-expanded={menuOpen}
            aria-controls="client-hub-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            Menu
          </button>
        </div>
        {menuOpen ? (
          <div id="client-hub-menu" className="border-t border-gray-100 px-3 pb-3">
            <HubNav
              active={active}
              example={example}
              counts={counts}
              onSection={onSection}
              onNavigate={closeMenu}
              compact
            />
          </div>
        ) : null}
      </div>

      <div className="flex-1 flex min-w-0">
        <aside className="hidden lg:block w-72 shrink-0 sticky top-0 self-start max-h-screen overflow-y-auto bg-white border-r border-gray-200">
          <HubNav active={active} example={example} counts={counts} onSection={onSection} />
        </aside>
        <main className="flex-1 min-w-0 overflow-x-hidden px-3 sm:px-6 lg:px-8 py-4 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
