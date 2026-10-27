import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  CONTACT_STATUSES,
  HUB_SOCIAL_PLATFORMS,
  TEAM_PERMISSIONS,
  billingAddressLine,
  cardLabel,
  marketingMaterialFromProfile,
  type AgentContactRecord,
  type BillingProfile,
  type ClientHubProfile,
  type TeamMemberRecord,
  type TeamPermission,
} from "@shared/clientHubSettings";
import type { ClientInvoiceStatement, ClientListingCard } from "@shared/clientHome";
import { usd } from "@shared/clientHome";
import { OrderHistory } from "@/components/client-home/ClientHomeDashboard";
import { MoneyAmount } from "@/components/MoneyAmount";
import { MarketingAgentCard } from "@/components/client-hub/MarketingAgentCard";

const fieldClass = "h-11 w-full min-w-0 max-w-full rounded-xl border border-gray-200 bg-white px-3 text-sm";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.readAsDataURL(file);
  });
}

async function uploadAsset(kind: string, file: File, example: boolean): Promise<string> {
  const dataUrl = await readImage(file);
  if (example) return dataUrl;
  const token = await tokenFor();
  const response = await fetch("/api/clients/me/hub/profile/asset", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ kind, dataUrl }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Could not upload that image.");
  return String(body.url || "");
}

async function tokenFor(): Promise<string> {
  const { auth } = await import("@/lib/firebase");
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in to save settings.");
  return user.getIdToken();
}

export function ProfileSettings({
  profile,
  example = false,
  onSave,
}: {
  profile: ClientHubProfile;
  example?: boolean;
  onSave: (profile: ClientHubProfile) => Promise<void>;
}) {
  const [draft, setDraft] = useState(profile);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const material = marketingMaterialFromProfile(draft);
  useEffect(() => setDraft(profile), [profile]);

  async function onFile(kind: "headshot" | "companyLogo" | "brokerageLogo", file: File | undefined) {
    if (!file) return;
    setMessage("");
    try {
      const url = await uploadAsset(kind, file, example);
      setDraft((current) => ({
        ...current,
        headshotUrl: kind === "headshot" ? url : current.headshotUrl,
        companyLogoUrl: kind === "companyLogo" ? url : current.companyLogoUrl,
        brokerageLogoUrl: kind === "brokerageLogo" ? url : current.brokerageLogoUrl,
      }));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not upload that image.");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await onSave(draft);
      setMessage(example ? "Example preview — nothing was saved." : "Profile saved. Marketing materials use these details.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save the profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-6 min-w-0">
      <div>
        <h2 className="text-2xl font-black">Profile</h2>
        <p className="text-sm text-gray-500 mt-1">This is the agent info used on listing sites, flyers, and marketing kits.</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-4 min-w-0 bg-white rounded-2xl border border-gray-100 p-4">
        <Field label="First name"><input className={fieldClass} value={draft.firstName} onChange={(event) => setDraft({ ...draft, firstName: event.target.value })} required /></Field>
        <Field label="Last name"><input className={fieldClass} value={draft.lastName} onChange={(event) => setDraft({ ...draft, lastName: event.target.value })} /></Field>
        <Field label="Phone"><input className={fieldClass} value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} inputMode="tel" /></Field>
        <Field label="Email"><input className={fieldClass} type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></Field>
        <Field label="Brokerage"><input className={fieldClass} value={draft.brokerage} onChange={(event) => setDraft({ ...draft, brokerage: event.target.value })} /></Field>
        <Field label="Website"><input className={fieldClass} value={draft.website} onChange={(event) => setDraft({ ...draft, website: event.target.value })} inputMode="url" placeholder="https://" /></Field>
        <ImageField label="Headshot" url={draft.headshotUrl} onFile={(file) => void onFile("headshot", file)} />
        <ImageField label="Company logo" url={draft.companyLogoUrl} onFile={(file) => void onFile("companyLogo", file)} />
        <ImageField label="Brokerage logo" url={draft.brokerageLogoUrl} onFile={(file) => void onFile("brokerageLogo", file)} />
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 p-4 grid sm:grid-cols-2 gap-4 min-w-0">
        <h3 className="sm:col-span-2 text-xs font-black uppercase tracking-widest text-[#0d9488]">Social links</h3>
        {HUB_SOCIAL_PLATFORMS.map((platform) => (
          <Field key={platform.id} label={platform.label}>
            <input
              className={fieldClass}
              value={draft.socials[platform.id]}
              onChange={(event) => setDraft({ ...draft, socials: { ...draft.socials, [platform.id]: event.target.value } })}
              inputMode="url"
              placeholder="https://"
            />
          </Field>
        ))}
        <div className="sm:col-span-2 space-y-3">
          <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Custom</h3>
          {draft.customSocials.map((entry, index) => (
            <div key={entry.id} className="grid sm:grid-cols-[1fr_2fr_auto] gap-2">
              <input className={fieldClass} aria-label="Custom social label" value={entry.label} onChange={(event) => updateCustom(index, { label: event.target.value })} />
              <input className={fieldClass} aria-label="Custom social URL" value={entry.url} onChange={(event) => updateCustom(index, { url: event.target.value })} />
              <button type="button" className="h-11 px-3 text-xs font-black uppercase tracking-widest" onClick={() => setDraft({ ...draft, customSocials: draft.customSocials.filter((_, item) => item !== index) })}>Remove</button>
            </div>
          ))}
          <button
            type="button"
            className="text-xs font-black uppercase tracking-widest text-[#0d9488]"
            onClick={() => setDraft({ ...draft, customSocials: [...draft.customSocials, { id: `custom-${draft.customSocials.length + 1}`, label: "", url: "" }] })}
          >
            Add custom link
          </button>
        </div>
      </div>
      {material ? (
        <div>
          <h3 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3">Used on marketing materials</h3>
          <div className="grid lg:grid-cols-3 gap-3">
            <MarketingAgentCard agent={material} title="Flyer" note="Flyer designs use this name, headshot, logos, and contact line." />
            <MarketingAgentCard agent={material} title="Social post" note="Social posts use these profile links." />
            <MarketingAgentCard agent={material} title="Reel" note="Reels and shorts use this branding." />
          </div>
        </div>
      ) : null}
      {message ? <p role="status" className="text-sm font-bold">{message}</p> : null}
      <button type="submit" disabled={saving} className="min-h-12 rounded-2xl bg-black text-white px-5 text-xs font-black uppercase tracking-widest">
        {saving ? "Saving" : "Save profile"}
      </button>
    </form>
  );

  function updateCustom(index: number, patch: { label?: string; url?: string }) {
    setDraft({
      ...draft,
      customSocials: draft.customSocials.map((entry, item) => item === index ? { ...entry, ...patch } : entry),
    });
  }
}

function ImageField({ label, url, onFile }: { label: string; url: string; onFile: (file: File | undefined) => void }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-3 min-w-0">
        {url ? <img src={url} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover bg-gray-100" /> : <div className="h-14 w-14 shrink-0 rounded-xl bg-gray-100" />}
        <label className="inline-flex min-h-11 min-w-0 items-center rounded-xl border border-gray-200 px-3 text-[10px] font-black uppercase tracking-widest">
          Upload
          <input type="file" accept="image/jpeg,image/png,image/webp" aria-label={label} className="sr-only" onChange={(event) => onFile(event.target.files?.[0])} />
        </label>
      </div>
    </Field>
  );
}

export function TeamSettings({
  teamName,
  logoUrl,
  members,
  listings,
  orders,
  example = false,
  onSaveTeam,
  onAdd,
  onInvite,
}: {
  teamName: string;
  logoUrl: string;
  members: TeamMemberRecord[];
  listings: ClientListingCard[];
  orders: Array<{ id: string; address: string; status: string; href: string }>;
  example?: boolean;
  onSaveTeam: (input: { name: string; logoUrl: string }) => Promise<void>;
  onAdd: (input: { name: string; email: string; phone: string; permissions: TeamPermission[]; logoUrl: string; invite: boolean }) => Promise<void>;
  onInvite: (id: string) => Promise<string>;
}) {
  const [name, setName] = useState(teamName);
  const [logo, setLogo] = useState(logoUrl);
  const [draft, setDraft] = useState({ name: "", email: "", phone: "", permissions: ["view"] as TeamPermission[], logoUrl: "" });
  const [message, setMessage] = useState("");
  useEffect(() => {
    setName(teamName);
    setLogo(logoUrl);
  }, [teamName, logoUrl]);

  function toggle(permission: TeamPermission) {
    setDraft((current) => {
      const has = current.permissions.includes(permission);
      const permissions = has ? current.permissions.filter((item) => item !== permission) : [...current.permissions, permission];
      return { ...current, permissions: permissions.length ? permissions : ["view"] };
    });
  }

  return (
    <div className="space-y-6 min-w-0">
      <div>
        <h2 className="text-2xl font-black">Team</h2>
        <p className="text-sm text-gray-500 mt-1">Teammates, permissions, and the listings and orders on this team.</p>
      </div>
      <form
        className="bg-white rounded-2xl border border-gray-100 p-4 grid sm:grid-cols-2 gap-4 min-w-0"
        onSubmit={(event) => {
          event.preventDefault();
          void onSaveTeam({ name, logoUrl: logo }).then(() => setMessage(example ? "Example preview — nothing was saved." : "Team saved.")).catch((err: Error) => setMessage(err.message));
        }}
      >
        <Field label="Team name"><input className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} required /></Field>
        <ImageField label="Team logo" url={logo} onFile={(file) => {
          if (!file) return;
          void uploadAsset("teamLogo", file, example).then(setLogo).catch((err: Error) => setMessage(err.message));
        }} />
        <button type="submit" className="sm:col-span-2 min-h-12 rounded-2xl bg-black text-white px-5 text-xs font-black uppercase tracking-widest w-fit">Save team</button>
      </form>
      <ul className="space-y-3">
        {members.length === 0 ? <li className="text-sm text-gray-500">No teammates yet.</li> : null}
        {members.map((member) => (
          <li key={member.id} className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-black">{member.name}</p>
                <p className="text-sm text-gray-500">{member.email}{member.phone ? ` · ${member.phone}` : ""}</p>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-2">{member.permissions.join(" · ")}</p>
                <p className="text-xs text-gray-500 mt-1">{member.inviteEmail === "paused" ? "Invite email is paused." : member.inviteEmail === "sent" ? "Invite email sent." : "No invite email yet."}</p>
              </div>
              {member.logoUrl ? <img src={member.logoUrl} alt="" className="h-12 w-12 rounded-xl object-cover" /> : null}
            </div>
            <button
              type="button"
              className="mt-3 text-xs font-black uppercase tracking-widest text-[#0d9488]"
              onClick={() => void onInvite(member.id).then((status) => setMessage(status === "paused" ? "Invite saved. Email is paused until client notifications are on." : "Invite email sent.")).catch((err: Error) => setMessage(err.message))}
            >
              Send invite
            </button>
          </li>
        ))}
      </ul>
      <form
        className="bg-white rounded-2xl border border-gray-100 p-4 grid sm:grid-cols-2 gap-4 min-w-0"
        onSubmit={(event) => {
          event.preventDefault();
          void onAdd({ ...draft, invite: true }).then(() => {
            setDraft({ name: "", email: "", phone: "", permissions: ["view"], logoUrl: "" });
            setMessage(example ? "Example teammate kept on this preview. No email was sent." : "Teammate added.");
          }).catch((err: Error) => setMessage(err.message));
        }}
      >
        <h3 className="sm:col-span-2 text-xs font-black uppercase tracking-widest text-[#0d9488]">Add a teammate</h3>
        <Field label="Name"><input className={fieldClass} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></Field>
        <Field label="Email"><input className={fieldClass} type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} required /></Field>
        <Field label="Phone"><input className={fieldClass} value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></Field>
        <ImageField label="Teammate logo" url={draft.logoUrl} onFile={(file) => {
          if (!file) return;
          void uploadAsset("memberLogo", file, example).then((url) => setDraft((current) => ({ ...current, logoUrl: url }))).catch((err: Error) => setMessage(err.message));
        }} />
        <fieldset className="sm:col-span-2">
          <legend className="text-[10px] font-black uppercase tracking-widest text-gray-400">Permissions</legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {TEAM_PERMISSIONS.map((permission) => (
              <label key={permission} className="inline-flex items-center gap-2 text-sm font-bold capitalize">
                <input type="checkbox" checked={draft.permissions.includes(permission)} onChange={() => toggle(permission)} />
                {permission}
              </label>
            ))}
          </div>
        </fieldset>
        <button type="submit" className="min-h-12 rounded-2xl bg-[#0d9488] text-white px-5 text-xs font-black uppercase tracking-widest w-fit">Add teammate</button>
      </form>
      <section>
        <h3 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3">Team listings</h3>
        {listings.length === 0 ? <p className="text-sm text-gray-500">No listings for this team yet.</p> : (
          <ul className="space-y-2">
            {listings.map((listing) => (
              <li key={listing.id}>
                <Link to={listing.href || `/portal/listings/${listing.id}`} className="font-bold text-sm">{listing.address}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3">Team orders</h3>
        {orders.length === 0 ? <p className="text-sm text-gray-500">No orders for this team yet.</p> : (
          <ul className="space-y-2">
            {orders.map((order) => (
              <li key={order.id}>
                <Link to={order.href} className="font-bold text-sm">{order.address}</Link>
                <span className="text-xs text-gray-500"> · {order.status.replace(/_/g, " ")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {message ? <p role="status" className="text-sm font-bold">{message}</p> : null}
    </div>
  );
}

export function ClientsSettings({
  contacts,
  example = false,
  onSave,
  onImport,
}: {
  contacts: AgentContactRecord[];
  example?: boolean;
  onSave: (contact: Omit<AgentContactRecord, "id"> & { id?: string }) => Promise<void>;
  onImport: (csv: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [tag, setTag] = useState("all");
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState({ name: "", email: "", phone: "", tags: "", notes: "", lastContact: "", status: "lead" as AgentContactRecord["status"] });
  const tags = useMemo(() => [...new Set(contacts.flatMap((contact) => contact.tags))].sort(), [contacts]);
  const shown = contacts.filter((contact) => {
    if (status !== "all" && contact.status !== status) return false;
    if (tag !== "all" && !contact.tags.includes(tag)) return false;
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return [contact.name, contact.email, contact.phone, contact.notes, contact.tags.join(" ")].join(" ").toLowerCase().includes(needle);
  });

  function exportCsv() {
    const header = "name,email,phone,tags,notes,lastContact,status";
    const lines = shown.map((contact) => [contact.name, contact.email, contact.phone, contact.tags.join("|"), contact.notes, contact.lastContact, contact.status].map((value) => /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value).join(","));
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "clients.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6 min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black">Clients</h2>
          <p className="text-sm text-gray-500 mt-1">Your customers, shared contacts, tags, and notes.</p>
        </div>
        <button type="button" onClick={exportCsv} className="min-h-11 rounded-xl border border-black px-4 text-[10px] font-black uppercase tracking-widest">Export CSV</button>
      </div>
      <div className="flex flex-col sm:flex-row gap-2 min-w-0">
        <input className={fieldClass} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search clients" aria-label="Search clients" />
        <select className={fieldClass} value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Client status">
          <option value="all">All statuses</option>
          {CONTACT_STATUSES.map((item) => <option key={item} value={item}>{item.replace(/_/g, " ")}</option>)}
        </select>
        <select className={fieldClass} value={tag} onChange={(event) => setTag(event.target.value)} aria-label="Client tag">
          <option value="all">All tags</option>
          {tags.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>
      <ul className="space-y-3">
        {shown.length === 0 ? <li className="text-sm text-gray-500">No clients match.</li> : null}
        {shown.map((contact) => (
          <li key={contact.id} className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-black">{contact.name}</p>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{contact.status.replace(/_/g, " ")}{contact.source === "share" ? " · shared" : ""}</p>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              {contact.email ? <a href={`mailto:${contact.email}`}>{contact.email}</a> : null}
              {contact.phone ? <span> · <a href={`tel:${contact.phone}`}>{contact.phone}</a></span> : null}
            </p>
            {contact.tags.length > 0 ? <p className="text-xs text-gray-500 mt-2">{contact.tags.join(" · ")}</p> : null}
            {contact.notes ? <p className="text-sm mt-2">{contact.notes}</p> : null}
            {contact.lastContact ? <p className="text-xs text-gray-500 mt-2">Last contact {contact.lastContact}</p> : null}
          </li>
        ))}
      </ul>
      <form
        className="bg-white rounded-2xl border border-gray-100 p-4 grid sm:grid-cols-2 gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave({
            ownerClientId: "",
            teamId: "",
            name: draft.name,
            email: draft.email,
            phone: draft.phone,
            tags: draft.tags.split(/[|,]/).map((item) => item.trim()).filter(Boolean),
            notes: draft.notes,
            lastContact: draft.lastContact,
            status: draft.status,
            source: "manual",
            shareRef: "",
          }).then(() => {
            setDraft({ name: "", email: "", phone: "", tags: "", notes: "", lastContact: "", status: "lead" });
            setMessage(example ? "Example preview — nothing was saved." : "Client saved.");
          }).catch((err: Error) => setMessage(err.message));
        }}
      >
        <h3 className="sm:col-span-2 text-xs font-black uppercase tracking-widest text-[#0d9488]">Add a client</h3>
        <Field label="Name"><input className={fieldClass} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></Field>
        <Field label="Email"><input className={fieldClass} type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></Field>
        <Field label="Phone"><input className={fieldClass} value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></Field>
        <Field label="Tags"><input className={fieldClass} value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} placeholder="vip, buyer" /></Field>
        <Field label="Last contact"><input className={fieldClass} type="date" value={draft.lastContact} onChange={(event) => setDraft({ ...draft, lastContact: event.target.value })} /></Field>
        <Field label="Status">
          <select className={fieldClass} value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as AgentContactRecord["status"] })}>
            {CONTACT_STATUSES.map((item) => <option key={item} value={item}>{item.replace(/_/g, " ")}</option>)}
          </select>
        </Field>
        <label className="sm:col-span-2 block">
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Notes</span>
          <textarea className="mt-1 w-full rounded-xl border border-gray-200 p-3 text-sm" rows={3} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
        </label>
        <button type="submit" className="min-h-12 rounded-2xl bg-black text-white px-5 text-xs font-black uppercase tracking-widest w-fit">Save client</button>
      </form>
      <form
        className="bg-white rounded-2xl border border-gray-100 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const file = (event.currentTarget.elements.namedItem("csv") as HTMLInputElement).files?.[0];
          if (!file) return;
          void file.text().then((csv) => onImport(csv)).then(() => setMessage(example ? "Example preview — the file was not imported." : "Contacts imported.")).catch((err: Error) => setMessage(err.message));
        }}
      >
        <Field label="Import CSV">
          <label className="inline-flex min-h-11 items-center rounded-xl border border-gray-200 px-3 text-[10px] font-black uppercase tracking-widest">
            Choose CSV
            <input name="csv" type="file" accept=".csv,text/csv" aria-label="Import CSV" className="sr-only" />
          </label>
        </Field>
        <button type="submit" className="mt-3 min-h-11 rounded-xl border border-black px-4 text-[10px] font-black uppercase tracking-widest">Import</button>
      </form>
      {message ? <p role="status" className="text-sm font-bold">{message}</p> : null}
    </div>
  );
}

export function BillingSettings({
  billing,
  invoices,
  payments,
  example = false,
  onSave,
  onCard,
}: {
  billing: BillingProfile & { square?: { applicationId: string; locationId: string; environment: string } };
  invoices: ClientInvoiceStatement[];
  payments: Array<{ id: string; invoiceNumber: string; status: string; amount: number | null; issuedOn: string }>;
  example?: boolean;
  onSave: (billing: Pick<BillingProfile, "email" | "phone" | "line1" | "line2" | "city" | "state" | "postalCode">) => Promise<void>;
  onCard: (sourceId: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(billing);
  const [message, setMessage] = useState("");
  const [sourceId, setSourceId] = useState("");
  useEffect(() => setDraft(billing), [billing]);
  const dollars = (cents: number) => usd(cents / 100);

  return (
    <div className="space-y-6 min-w-0">
      <div>
        <h2 className="text-2xl font-black">Billing</h2>
        <p className="text-sm text-gray-500 mt-1">Card on file, balance, credits, payments, invoices, and order history.</p>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <Summary label="Account balance" value={dollars(billing.balanceCents)} />
        <Summary label="Credits" value={dollars(billing.creditsCents)} />
        <Summary label="Card on file" value={cardLabel(billing.card) || "No card on file"} />
      </div>
      <form
        className="bg-white rounded-2xl border border-gray-100 p-4 grid sm:grid-cols-2 gap-4 min-w-0"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave(draft).then(() => setMessage(example ? "Example preview — nothing was saved." : "Billing details saved.")).catch((err: Error) => setMessage(err.message));
        }}
      >
        <Field label="Billing email"><input className={fieldClass} type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></Field>
        <Field label="Billing phone"><input className={fieldClass} value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></Field>
        <Field label="Address"><input className={fieldClass} value={draft.line1} onChange={(event) => setDraft({ ...draft, line1: event.target.value })} /></Field>
        <Field label="Address line 2"><input className={fieldClass} value={draft.line2} onChange={(event) => setDraft({ ...draft, line2: event.target.value })} /></Field>
        <Field label="City"><input className={fieldClass} value={draft.city} onChange={(event) => setDraft({ ...draft, city: event.target.value })} /></Field>
        <Field label="State"><input className={fieldClass} value={draft.state} onChange={(event) => setDraft({ ...draft, state: event.target.value })} /></Field>
        <Field label="Postal code"><input className={fieldClass} value={draft.postalCode} onChange={(event) => setDraft({ ...draft, postalCode: event.target.value })} /></Field>
        <p className="text-sm text-gray-500 sm:col-span-2">Invoices and checkout use {billingAddressLine(draft) || "the billing address you save here"}.</p>
        <button type="submit" className="min-h-12 rounded-2xl bg-black text-white px-5 text-xs font-black uppercase tracking-widest w-fit">Save billing</button>
      </form>
      <section className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
        <h3 className="text-xs font-black uppercase tracking-widest text-[#0d9488]">Credit or debit card</h3>
        <p className="text-sm text-gray-600">Square keeps the card. Iconic stores the brand and last four digits, not the card number.</p>
        {billing.square?.applicationId ? (
          <SquareCard
            applicationId={billing.square.applicationId}
            locationId={billing.square.locationId}
            environment={billing.square.environment}
            onToken={(token) => void onCard(token).then(() => setMessage("Card saved with Square.")).catch((err: Error) => setMessage(err.message))}
          />
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-gray-500">Set SQUARE_APPLICATION_ID to show the Square card form. Do not type a card number here.</p>
            {example ? null : (
              <form
                className="flex flex-col sm:flex-row gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void onCard(sourceId).then(() => setMessage("Card saved with Square.")).catch((err: Error) => setMessage(err.message));
                }}
              >
                <input className={fieldClass} aria-label="Square card nonce" value={sourceId} onChange={(event) => setSourceId(event.target.value)} placeholder="Square card nonce" />
                <button type="submit" className="min-h-11 rounded-xl bg-black text-white px-4 text-[10px] font-black uppercase tracking-widest">Save Square nonce</button>
              </form>
            )}
          </div>
        )}
      </section>
      <section>
        <h3 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3">Credits</h3>
        {billing.credits.length === 0 ? <p className="text-sm text-gray-500">No credits on this account.</p> : (
          <ul className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-100">
            {billing.credits.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span>{entry.label}<span className="block text-xs text-gray-500">{entry.at}</span></span>
                <MoneyAmount>{entry.kind === "debit" ? `-${dollars(entry.cents)}` : dollars(entry.cents)}</MoneyAmount>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3">Payments</h3>
        {payments.length === 0 ? <p className="text-sm text-gray-500">No payments on file.</p> : (
          <ul className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-100">
            {payments.map((payment) => (
              <li key={payment.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="font-bold">{payment.invoiceNumber}<span className="block text-xs font-medium text-gray-500">{payment.issuedOn} · {payment.status.replace(/_/g, " ")}</span></span>
                {payment.amount == null ? <span>Amount not stored</span> : <MoneyAmount>{usd(payment.amount)}</MoneyAmount>}
              </li>
            ))}
          </ul>
        )}
      </section>
      <OrderHistory invoices={invoices} filterable />
      {message ? <p role="status" className="text-sm font-bold">{message}</p> : null}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</p>
      <p className="font-black mt-2"><MoneyAmount>{value}</MoneyAmount></p>
    </div>
  );
}

function SquareCard({
  applicationId,
  locationId,
  environment,
  onToken,
}: {
  applicationId: string;
  locationId: string;
  environment: string;
  onToken: (token: string) => void;
}) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const src = environment === "sandbox" ? "https://sandbox.web.squarecdn.com/v1/square.js" : "https://web.squarecdn.com/v1/square.js";
    let cancelled = false;
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    const script = existing || document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => {
      if (cancelled) return;
      const square = (window as unknown as { Square?: { payments: (appId: string, loc: string) => { card: () => Promise<{ attach: (selector: string) => Promise<void>; tokenize: () => Promise<{ status: string; token?: string }> }> } } }).Square;
      if (!square) {
        setError("Square checkout did not load.");
        return;
      }
      void square.payments(applicationId, locationId).card().then(async (card) => {
        await card.attach("#square-card");
        (window as unknown as { iconicSquareCard?: typeof card }).iconicSquareCard = card;
        if (!cancelled) setReady(true);
      }).catch(() => {
        if (!cancelled) setError("Square checkout did not load.");
      });
    };
    if (!existing) document.head.appendChild(script);
    else script.onload?.(new Event("load"));
    return () => {
      cancelled = true;
    };
  }, [applicationId, locationId, environment]);

  return (
    <div className="space-y-3">
      <div id="square-card" className="min-h-12" />
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <button
        type="button"
        disabled={!ready}
        className="min-h-11 rounded-xl bg-black text-white px-4 text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
        onClick={() => {
          const card = (window as unknown as { iconicSquareCard?: { tokenize: () => Promise<{ status: string; token?: string }> } }).iconicSquareCard;
          if (!card) return;
          void card.tokenize().then((result) => {
            if (result.status === "OK" && result.token) onToken(result.token);
            else setError("Square could not read that card.");
          });
        }}
      >
        Save card with Square
      </button>
    </div>
  );
}
