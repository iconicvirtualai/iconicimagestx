import { useEffect, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { clientPortalAction, staffHomePath } from "@shared/staffAccess";
import {
  billingPrefill,
  type AgentContactRecord,
  type BillingProfile,
  type ClientHubProfile,
  type TeamMemberRecord,
} from "@shared/clientHubSettings";
import type { ClientInvoiceStatement, ClientListingCard } from "@shared/clientHome";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { PortalShell, portalHref, type PortalSettingsSection } from "@/components/client-hub/PortalShell";
import { BillingSettings, ClientsSettings, ProfileSettings, TeamSettings } from "@/components/client-hub/SettingsPages";
import { exampleBilling, exampleContacts, exampleInvoice, exampleListing, exampleMembers, exampleOrders, exampleProfile } from "@/lib/exampleHub";

const SECTIONS = new Set(["profile", "team", "clients", "billing"]);

export function useExampleMode(): boolean {
  const [params] = useSearchParams();
  return params.get("example") === "1";
}

async function hubFetch<T>(path: string, userToken: () => Promise<string>, init?: RequestInit): Promise<T> {
  const token = await userToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Could not load settings.");
  return body as T;
}

export default function PortalSettings() {
  const { section = "" } = useParams();
  const example = useExampleMode();
  const { user, userType, staffProfile, clientProfile, loading, signOutUser } = useAuth();
  const active = SECTIONS.has(section) ? section as PortalSettingsSection : null;

  if (!active) {
    return <Navigate to={portalHref("/portal/settings/profile", example)} replace />;
  }

  if (!example) {
    if (loading) return <Pending />;
    if (user && userType === "staff") return <Navigate to={staffHomePath(staffProfile?.role)} replace />;
    const gate = clientPortalAction({ loading, hasUser: Boolean(user), isClient: userType === "client" });
    if (gate.type !== "show-home" || !user) return <Navigate to="/portal" replace />;
  }

  const firstName = example ? exampleProfile().firstName : clientProfile?.firstName || "there";

  return (
    <div className="iframe-safe-page bg-[#f6f7f8] flex flex-col">
      <PortalShell
        firstName={firstName}
        example={example}
        active={active}
        onSignOut={example ? undefined : () => void signOutUser().then(() => { window.location.assign("/portal"); })}
      >
        {active === "profile" ? <ProfileRoute example={example} /> : null}
        {active === "team" ? <TeamRoute example={example} /> : null}
        {active === "clients" ? <ClientsRoute example={example} /> : null}
        {active === "billing" ? <BillingRoute example={example} /> : null}
      </PortalShell>
      <Footer />
    </div>
  );
}

function ProfileRoute({ example }: { example: boolean }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ClientHubProfile | null>(example ? exampleProfile() : null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (example || !user) return;
    let cancelled = false;
    void hubFetch<{ profile: ClientHubProfile }>("/api/clients/me/hub/profile", () => user.getIdToken())
      .then((body) => { if (!cancelled) setProfile(body.profile); })
      .catch((err: Error) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [example, user]);
  if (error) return <ErrorState message={error} />;
  if (!profile) return <Pending />;
  return (
    <ProfileSettings
      profile={profile}
      example={example}
      onSave={async (next) => {
        if (example) {
          setProfile(next);
          return;
        }
        const saved = await hubFetch<{ profile: ClientHubProfile }>("/api/clients/me/hub/profile", () => user!.getIdToken(), {
          method: "PATCH",
          body: JSON.stringify(next),
        });
        setProfile(saved.profile);
      }}
    />
  );
}

function TeamRoute({ example }: { example: boolean }) {
  const { user } = useAuth();
  const [state, setState] = useState<{
    name: string;
    logoUrl: string;
    members: TeamMemberRecord[];
    listings: ClientListingCard[];
    orders: Array<{ id: string; address: string; status: string; href: string }>;
  } | null>(example ? {
    name: "Example Team",
    logoUrl: "/media/brand/iconic-camera-logo.png",
    members: exampleMembers(),
    listings: [exampleListing()],
    orders: exampleOrders(),
  } : null);
  const [error, setError] = useState("");
  async function reload() {
    if (!user) return;
    const body = await hubFetch<{
      team: { name: string; logoUrl: string } | null;
      members: TeamMemberRecord[];
      listings: ClientListingCard[];
      orders: Array<{ id: string; address: string; status: string; href: string }>;
    }>("/api/clients/me/hub/team", () => user.getIdToken());
    setState({
      name: body.team?.name || "",
      logoUrl: body.team?.logoUrl || "",
      members: body.members || [],
      listings: body.listings || [],
      orders: body.orders || [],
    });
  }
  useEffect(() => {
    if (example || !user) return;
    let cancelled = false;
    void reload().catch((err: Error) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [example, user]);
  if (error) return <ErrorState message={error} />;
  if (!state) return <Pending />;
  return (
    <TeamSettings
      teamName={state.name}
      logoUrl={state.logoUrl}
      members={state.members}
      listings={state.listings}
      orders={state.orders}
      example={example}
      onSaveTeam={async (input) => {
        if (example) {
          setState({ ...state, name: input.name, logoUrl: input.logoUrl });
          return;
        }
        await hubFetch("/api/clients/me/hub/team", () => user!.getIdToken(), { method: "POST", body: JSON.stringify(input) });
        await reload();
      }}
      onAdd={async (input) => {
        if (example) {
          setState({
            ...state,
            members: [...state.members, {
              id: `example-${state.members.length + 1}`,
              teamId: "example-team",
              ownerClientId: "example-owner",
              name: input.name,
              email: input.email,
              phone: input.phone,
              permissions: input.permissions,
              logoUrl: input.logoUrl,
              status: "invited",
              linkedClientId: "",
              inviteEmail: "paused",
            }],
          });
          return;
        }
        await hubFetch("/api/clients/me/hub/team/members", () => user!.getIdToken(), { method: "POST", body: JSON.stringify(input) });
        await reload();
      }}
      onInvite={async (id) => {
        if (example) return "paused";
        const body = await hubFetch<{ inviteEmail: string }>(`/api/clients/me/hub/team/members/${id}/invite`, () => user!.getIdToken(), { method: "POST" });
        await reload();
        return body.inviteEmail;
      }}
    />
  );
}

function ClientsRoute({ example }: { example: boolean }) {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<AgentContactRecord[] | null>(example ? exampleContacts() : null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (example || !user) return;
    let cancelled = false;
    void hubFetch<{ contacts: AgentContactRecord[] }>("/api/clients/me/hub/clients", () => user.getIdToken())
      .then((body) => { if (!cancelled) setContacts(body.contacts); })
      .catch((err: Error) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [example, user]);
  if (error) return <ErrorState message={error} />;
  if (!contacts) return <Pending />;
  return (
    <ClientsSettings
      contacts={contacts}
      example={example}
      onSave={async (contact) => {
        if (example) {
          setContacts([...contacts, { ...contact, id: `example-${contacts.length + 1}`, ownerClientId: "example-owner" }]);
          return;
        }
        await hubFetch("/api/clients/me/hub/clients", () => user!.getIdToken(), { method: "POST", body: JSON.stringify(contact) });
        const body = await hubFetch<{ contacts: AgentContactRecord[] }>("/api/clients/me/hub/clients", () => user!.getIdToken());
        setContacts(body.contacts);
      }}
      onImport={async (csv) => {
        if (example) return;
        await hubFetch("/api/clients/me/hub/clients/import", () => user!.getIdToken(), { method: "POST", body: JSON.stringify({ csv }) });
        const body = await hubFetch<{ contacts: AgentContactRecord[] }>("/api/clients/me/hub/clients", () => user!.getIdToken());
        setContacts(body.contacts);
      }}
    />
  );
}

function BillingRoute({ example }: { example: boolean }) {
  const { user } = useAuth();
  const [state, setState] = useState<{ billing: BillingProfile; invoices: ClientInvoiceStatement[]; payments: Array<{ id: string; invoiceNumber: string; status: string; amount: number | null; issuedOn: string }> } | null>(
    example ? {
      billing: exampleBilling(),
      invoices: [exampleInvoice()],
      payments: [{ id: "example-payment", invoiceNumber: "INV-EXAMPLE-1001", status: "partial", amount: 121.5, issuedOn: "Oct 2, 2026" }],
    } : null,
  );
  const [error, setError] = useState("");
  useEffect(() => {
    if (example || !user) return;
    let cancelled = false;
    void hubFetch<NonNullable<typeof state>>("/api/clients/me/hub/billing", () => user.getIdToken())
      .then((body) => { if (!cancelled) setState(body); })
      .catch((err: Error) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [example, user]);
  if (error) return <ErrorState message={error} />;
  if (!state) return <Pending />;
  return (
    <BillingSettings
      billing={state.billing}
      invoices={state.invoices}
      payments={state.payments}
      example={example}
      onSave={async (next) => {
        if (example) {
          setState({ ...state, billing: { ...state.billing, ...next } });
          return;
        }
        const saved = await hubFetch<NonNullable<typeof state>>("/api/clients/me/hub/billing", () => user!.getIdToken(), {
          method: "PATCH",
          body: JSON.stringify(next),
        });
        setState(saved);
      }}
      onCard={async (sourceId) => {
        if (example) return;
        const saved = await hubFetch<NonNullable<typeof state>>("/api/clients/me/hub/billing/card", () => user!.getIdToken(), {
          method: "POST",
          body: JSON.stringify({ sourceId }),
        });
        setState(saved);
      }}
    />
  );
}

export function portalOrderPrefill() {
  return billingPrefill(exampleProfile(), exampleBilling());
}

function Pending() {
  return (
    <div className="iframe-safe-page bg-[#f6f7f8] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-[#0d9488] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
      <p className="font-bold">{message}</p>
      <Button asChild className="mt-4 bg-black text-white">
        <Link to="/portal">Back to sign in</Link>
      </Button>
    </div>
  );
}
