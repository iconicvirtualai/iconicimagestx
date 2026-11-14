import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";
import { useAuth } from "@/contexts/AuthContext";
import {
  CLIENT_SERVICES,
  PRICING_TIERS,
  ROLE_LABEL,
  WEEKDAYS,
  WEEKDAY_LABEL,
  type ClientProfileSettings,
  type PersonKind,
  type PersonProfile,
  type StaffProfileSettings,
  type Weekday,
} from "@shared/peopleProfiles";

const STAFF_TABS = ["Profile", "Hours", "Communication", "Zones"] as const;
const CLIENT_TABS = ["Profile", "Notifications", "Cards", "Services", "Team"] as const;

async function loadProfile(token: string, kind: string, id: string): Promise<PersonProfile> {
  const response = await fetch(`/api/people/${kind}/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Could not open that profile.");
  return body.profile as PersonProfile;
}

export default function AdminPersonProfile() {
  const { kind = "", id = "" } = useParams();
  const { user } = useAuth();
  const [profile, setProfile] = useState<PersonProfile | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState("Profile");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const tokenUser = user;
    if (!tokenUser || (kind !== "staff" && kind !== "client" && kind !== "agent")) return;
    let cancelled = false;
    void tokenUser.getIdToken().then((token) => loadProfile(token, kind, id)).then((next) => {
      if (!cancelled) setProfile(next);
    }).catch((err: Error) => {
      if (!cancelled) setError(err.message);
    });
    return () => { cancelled = true; };
  }, [user, kind, id]);

  async function save(extra?: Record<string, unknown>) {
    if (!user || !profile) return;
    setSaving(true);
    setNotice("");
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/people/${profile.kind}/${profile.sourceId}/settings`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          staffSettings: profile.staffSettings,
          clientSettings: profile.clientSettings,
          brokerage: profile.brokerage,
          ...extra,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not save settings.");
      setProfile(body.profile);
      setNotice("Settings saved on this profile.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  const tabs = profile?.kind === "client" ? CLIENT_TABS : profile?.kind === "staff" ? STAFF_TABS : ["Profile"];
  const testId = profile?.kind === "client" ? "client-profile" : "staff-profile";

  return (
    <AdminLayout title="Profile">
      <div data-testid={testId} className="mx-auto max-w-3xl">
        <Link to="/admin/people" className="text-xs font-bold text-[#0d9488]">All people</Link>
        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
        {!profile ? <p className="mt-6 text-sm text-slate-500">Loading profile…</p> : (
          <div className="mt-4 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
            {profile.preview ? (
              <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Preview sample. It is not written to the live directory.</p>
            ) : null}
            <header className="flex items-center gap-4">
              <Avatar profile={profile} />
              <div className="min-w-0">
                <h2 className="truncate text-2xl font-black text-slate-950">{profile.displayName}</h2>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{ROLE_LABEL[profile.role]} · {profile.email || "No email"}</p>
                {profile.phone ? <p className="text-sm text-slate-600">{profile.phone}</p> : null}
              </div>
            </header>
            <div className="mt-6 flex gap-2 overflow-x-auto" role="tablist" aria-label="Profile settings">
              {tabs.map((item) => (
                <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${tab === item ? "bg-[#0d9488] text-white" : "bg-slate-100 text-slate-600"}`}>{item}</button>
              ))}
            </div>
            <div className="mt-6">
              {profile.kind === "staff" && profile.staffSettings ? (
                <StaffFields tab={tab} settings={profile.staffSettings} onChange={(staffSettings) => setProfile({ ...profile, staffSettings, displayName: staffSettings.displayName || profile.legalName, color: staffSettings.color })} />
              ) : null}
              {profile.kind === "client" && profile.clientSettings ? (
                <ClientFields
                  tab={tab}
                  profile={profile}
                  onChange={(next) => setProfile(next)}
                />
              ) : null}
              {profile.kind === "agent" ? (
                <p className="text-sm text-slate-600">{profile.bio || "This agent contact does not have a login yet. Their name and email stay on the contact record."}</p>
              ) : null}
            </div>
            {profile.kind !== "agent" ? (
              <div className="mt-6 flex items-center gap-3">
                <button type="button" disabled={saving} onClick={() => void save()} className="rounded-xl bg-[#0d9488] px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{saving ? "Saving…" : "Save settings"}</button>
                {notice ? <p className="text-sm text-[#0d9488]">{notice}</p> : null}
              </div>
            ) : null}
            {profile.kind === "staff" ? (
              <p className="mt-4 text-xs text-slate-400">Role and what they can open are set on the <Link to="/admin/permissions" className="font-bold text-[#0d9488]">permissions</Link> screen.</p>
            ) : null}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function Avatar({ profile }: { profile: PersonProfile }) {
  if (profile.photoUrl) return <img src={profile.photoUrl} alt="" className="h-16 w-16 rounded-2xl object-cover" />;
  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-2xl text-lg font-black text-white" style={{ background: profile.color }}>
      {profile.displayName.slice(0, 1)}
    </div>
  );
}

function StaffFields({
  tab,
  settings,
  onChange,
}: {
  tab: string;
  settings: StaffProfileSettings;
  onChange: (settings: StaffProfileSettings) => void;
}) {
  if (tab === "Hours") {
    return (
      <div className="space-y-3">
        {WEEKDAYS.map((day) => (
          <DayRow key={day} day={day} value={settings.hours[day]} onChange={(hours) => onChange({ ...settings, hours: { ...settings.hours, [day]: hours } })} />
        ))}
      </div>
    );
  }
  if (tab === "Communication") {
    return <CommToggles value={settings.comms} onChange={(comms) => onChange({ ...settings, comms })} />;
  }
  if (tab === "Zones") {
    return (
      <div className="space-y-3">
        <Field label="Service zones" value={settings.zones.zones.join(", ")} onChange={(value) => onChange({ ...settings, zones: { ...settings.zones, zones: value.split(",").map((item) => item.trim()).filter(Boolean) } })} />
        <Field label="Max drive miles" value={settings.zones.maxDriveMiles ?? ""} onChange={(value) => onChange({ ...settings, zones: { ...settings.zones, maxDriveMiles: value === "" ? null : Number(value) } })} />
        <Field label="Max drive minutes" value={settings.zones.maxDriveMinutes ?? ""} onChange={(value) => onChange({ ...settings, zones: { ...settings.zones, maxDriveMinutes: value === "" ? null : Number(value) } })} />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <Field label="Display name" value={settings.displayName} onChange={(displayName) => onChange({ ...settings, displayName })} />
      <Field label="Photo URL" value={settings.photoUrl} onChange={(photoUrl) => onChange({ ...settings, photoUrl })} />
      <label className="block text-xs font-bold text-slate-500">
        Color
        <input type="color" value={settings.color} onChange={(event) => onChange({ ...settings, color: event.target.value })} className="mt-1 h-11 w-full" />
      </label>
      <label className="block text-xs font-bold text-slate-500">
        Bio
        <textarea value={settings.bio} onChange={(event) => onChange({ ...settings, bio: event.target.value })} rows={4} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
      </label>
    </div>
  );
}

function ClientFields({
  tab,
  profile,
  onChange,
}: {
  tab: string;
  profile: PersonProfile;
  onChange: (profile: PersonProfile) => void;
}) {
  const settings = profile.clientSettings as ClientProfileSettings;
  const set = (next: ClientProfileSettings) => onChange({ ...profile, clientSettings: next, displayName: next.displayName || profile.legalName });
  if (tab === "Notifications") return <CommToggles value={settings.notifications} onChange={(notifications) => set({ ...settings, notifications })} />;
  if (tab === "Cards") {
    return (
      <div className="space-y-3 text-sm text-slate-700">
        <p>{profile.card ? `${profile.card.brand} ending ${profile.card.last4}` : "No card on file."}</p>
        <p>Saved cards stay on the billing page. This profile does not collect a card number.</p>
        <Link to="/admin/client-billing" className="inline-flex rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white">Open client billing</Link>
      </div>
    );
  }
  if (tab === "Services") {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-3">
          {CLIENT_SERVICES.map((service) => {
            const on = settings.defaultServices.includes(service);
            return (
              <label key={service} className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={on} onChange={() => set({ ...settings, defaultServices: on ? settings.defaultServices.filter((item) => item !== service) : [...settings.defaultServices, service] })} />
                {service}
              </label>
            );
          })}
        </div>
        <label className="block text-xs font-bold text-slate-500">
          Pricing tier
          <select value={settings.pricingTier} onChange={(event) => set({ ...settings, pricingTier: event.target.value as ClientProfileSettings["pricingTier"] })} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm">
            {PRICING_TIERS.map((tier) => <option key={tier}>{tier}</option>)}
          </select>
        </label>
      </div>
    );
  }
  if (tab === "Team") {
    return (
      <div className="space-y-3">
        <Field label="Brokerage" value={profile.brokerage} onChange={(brokerage) => onChange({ ...profile, brokerage })} />
        <Field label="Customer team id" value={settings.customerTeamId} onChange={(customerTeamId) => set({ ...settings, customerTeamId })} />
        <p className="text-xs text-slate-500">The team id points at an existing customer team. People are not copied into a second list.</p>
        <Link to="/admin/groups/preview-brokerage" className="text-xs font-bold text-[#0d9488]">Open groups</Link>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <Field label="Display name" value={settings.displayName} onChange={(displayName) => set({ ...settings, displayName })} />
      <Field label="Photo URL" value={settings.photoUrl} onChange={(photoUrl) => set({ ...settings, photoUrl })} />
      <p className="text-sm text-slate-600">{profile.email || "No email on the client record."}</p>
      <p className="text-sm text-slate-600">{profile.phone || "No phone on the client record."}</p>
    </div>
  );
}

function DayRow({ day, value, onChange }: { day: Weekday; value: StaffProfileSettings["hours"][Weekday]; onChange: (value: StaffProfileSettings["hours"][Weekday]) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex w-32 items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={value.enabled} onChange={(event) => onChange({ ...value, enabled: event.target.checked })} />
        {WEEKDAY_LABEL[day]}
      </label>
      <input type="time" value={value.start} disabled={!value.enabled} onChange={(event) => onChange({ ...value, start: event.target.value })} className="h-11 rounded-xl border border-slate-200 px-2 text-sm" />
      <input type="time" value={value.end} disabled={!value.enabled} onChange={(event) => onChange({ ...value, end: event.target.value })} className="h-11 rounded-xl border border-slate-200 px-2 text-sm" />
    </div>
  );
}

function CommToggles({
  value,
  onChange,
}: {
  value: { email: boolean; sms: boolean; push: boolean };
  onChange: (value: { email: boolean; sms: boolean; push: boolean }) => void;
}) {
  const rows = [
    ["email", "Email"],
    ["sms", "SMS"],
    ["push", "In-app"],
  ] as const;
  return (
    <div className="space-y-3">
      {rows.map(([key, label]) => (
        <label key={key} className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={value[key]} onChange={(event) => onChange({ ...value, [key]: event.target.checked })} />
          {label}
        </label>
      ))}
      <p className="text-xs text-slate-500">These are preferences only. Turning one on does not send a message.</p>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string | number; onChange: (value: string) => void }) {
  return (
    <label className="block text-xs font-bold text-slate-500">
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-900" />
    </label>
  );
}

export function profileKind(value: string): PersonKind | null {
  if (value === "staff" || value === "client" || value === "agent") return value;
  return null;
}
