import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CHANGE_PASSWORD_PATH } from "@shared/passwordAccount";
import { PortalFooter } from "@/components/portal/PortalFooter";
import "@/styles/portal-v2.css";

export type PortalHomeSection = "listings" | "schedule" | "messages" | "orders";
export type PortalSettingsSection = "profile" | "team" | "clients" | "billing";
export type PortalNavId = PortalHomeSection | PortalSettingsSection | "order";

const HOME: { id: Exclude<PortalHomeSection, "orders">; label: string }[] = [
  { id: "listings", label: "Listings" },
  { id: "schedule", label: "Schedule" },
  { id: "messages", label: "Messages" },
];

const SETTINGS: { id: PortalSettingsSection; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "team", label: "Team" },
  { id: "clients", label: "Clients" },
  { id: "billing", label: "Billing" },
];

export function portalHref(path: string, example: boolean, section?: string): string {
  const params = new URLSearchParams();
  if (example) params.set("example", "1");
  if (section) params.set("section", section);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("");
  return letters || "II";
}

function HubNav({
  active,
  example,
  counts,
  onSection,
  onNavigate,
  open = false,
}: {
  active: PortalNavId;
  example: boolean;
  counts?: { listings?: number; schedule?: number; messages?: number };
  onSection?: (section: PortalHomeSection) => void;
  onNavigate?: () => void;
  open?: boolean;
}) {
  const countFor = (id: string) => {
    if (id === "listings") return counts?.listings;
    if (id === "schedule") return counts?.schedule;
    if (id === "messages") return counts?.messages;
    return undefined;
  };

  const item = (id: PortalHomeSection, label: string) => {
    const current = active === id;
    const count = countFor(id);
    const className = current ? "active" : undefined;
    const inner = (
      <>
        {label}
        {count != null && count > 0 ? <span className="count">{count}</span> : null}
      </>
    );
    if (onSection && id !== "orders") {
      return (
        <button
          key={id}
          type="button"
          className={className}
          aria-current={current ? "page" : undefined}
          onClick={() => {
            onSection(id);
            onNavigate?.();
          }}
        >
          {inner}
        </button>
      );
    }
    if (onSection && id === "orders") {
      return (
        <button
          key={id}
          type="button"
          className={className}
          aria-current={current ? "page" : undefined}
          onClick={() => {
            onSection("orders");
            onNavigate?.();
          }}
        >
          {label}
        </button>
      );
    }
    const href = id === "orders"
      ? portalHref("/portal/home", example, "orders")
      : portalHref("/portal/home", example, id === "listings" ? undefined : id);
    return (
      <Link key={id} to={href} className={className} aria-current={current ? "page" : undefined} onClick={onNavigate}>
        {inner}
      </Link>
    );
  };

  return (
    <nav id="client-hub-menu" className={open ? "rail-nav is-open" : "rail-nav"} aria-label="Client home">
      {HOME.map((panel) => item(panel.id, panel.label))}
      <div className="nav-label" data-testid="settings-nav">Settings</div>
      {SETTINGS.map((panel) => {
        const current = active === panel.id;
        return (
          <Link
            key={panel.id}
            to={portalHref(`/portal/settings/${panel.id}`, example)}
            className={current ? "active" : undefined}
            aria-current={current ? "page" : undefined}
            onClick={onNavigate}
          >
            {panel.label}
          </Link>
        );
      })}
      {item("orders", "Order history")}
    </nav>
  );
}

export function PortalShell({
  firstName,
  accountName,
  onSignOut,
  active,
  example = false,
  counts,
  onSection,
  children,
}: {
  firstName: string;
  accountName?: string;
  onSignOut?: () => void;
  active: PortalNavId;
  example?: boolean;
  counts?: { listings?: number; schedule?: number; messages?: number };
  onSection?: (section: PortalHomeSection) => void;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const name = (accountName || firstName || "there").trim();

  useEffect(() => {
    function close(event: MouseEvent) {
      if (!accountRef.current?.contains(event.target as Node)) setAccountOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div className="portal-v2">
      {example ? <div className="sample-banner">Sample data · for review only</div> : null}
      <div className="app">
        <aside className="rail">
          <div className="rail-top">
            <Link className="brand" to={portalHref("/portal/home", example)} aria-label="Iconic Images">
              <img className="logo" src="/media/logos/logo-black-large.png" alt="Iconic Images" />
            </Link>
            <Link
              className={`btn btn-teal place${active === "order" ? " btn-ink" : ""}`}
              data-testid="place-order"
              to={portalHref("/portal/order", example)}
              aria-current={active === "order" ? "page" : undefined}
            >
              Place Order
            </Link>
            <button
              type="button"
              className="phone-menu"
              aria-expanded={menuOpen}
              aria-controls="client-hub-menu"
              onClick={() => setMenuOpen((open) => !open)}
            >
              Menu
            </button>
          </div>
          <HubNav
            active={active}
            example={example}
            counts={counts}
            onSection={onSection}
            onNavigate={() => setMenuOpen(false)}
            open={menuOpen}
          />
          <div className="rail-foot">Your Iconic desk is at Studio 105, The Woodlands.</div>
        </aside>
        <div className="stage">
          <header className="topbar">
            <div className="account" ref={accountRef}>
              <div className="who">
                <div className="nm">
                  {name}
                  {example ? <span className="sample">Sample</span> : null}
                </div>
                <div className="acct-links desk-only">
                  <Link to={example ? portalHref(CHANGE_PASSWORD_PATH, true) : CHANGE_PASSWORD_PATH}>Change password</Link>
                  <span aria-hidden="true">·</span>
                  {onSignOut ? <button type="button" onClick={onSignOut}>Sign out</button> : null}
                </div>
              </div>
              <button
                type="button"
                className="av"
                aria-label="Account menu"
                aria-expanded={accountOpen}
                onClick={() => setAccountOpen((open) => !open)}
              >
                {initials(name)}
              </button>
              {accountOpen ? (
                <div className="acct-menu desk-only" role="menu">
                  <Link to={example ? portalHref(CHANGE_PASSWORD_PATH, true) : CHANGE_PASSWORD_PATH}>Change password</Link>
                  {onSignOut ? <button type="button" onClick={onSignOut}>Sign out</button> : null}
                </div>
              ) : null}
              <div className="acct-menu phone-only" aria-label="Account">
                <Link to={example ? portalHref(CHANGE_PASSWORD_PATH, true) : CHANGE_PASSWORD_PATH}>Change password</Link>
                {onSignOut ? <button type="button" onClick={onSignOut}>Sign out</button> : null}
              </div>
            </div>
          </header>
          <main className="page">
            <div className="page-w">{children}</div>
          </main>
        </div>
      </div>
      <PortalFooter />
    </div>
  );
}
