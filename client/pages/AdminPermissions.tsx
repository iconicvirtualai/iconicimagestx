import { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { PersonChip } from "@/components/people/PersonChip";
import { useAuth } from "@/contexts/AuthContext";
import {
  CAPABILITIES,
  CAPABILITY_LABEL,
  STAFF_ROLES,
  allows,
  type PersonProfile,
  type StaffRole,
} from "@shared/peopleProfiles";

export default function AdminPermissions() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<PersonProfile[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void user.getIdToken().then(async (token) => {
      const response = await fetch("/api/people/permissions", { headers: { Authorization: `Bearer ${token}` } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not load permissions.");
      if (!cancelled) {
        setProfiles(body.profiles || []);
        setPreview(Boolean(body.preview));
      }
    }).catch((err: Error) => {
      if (!cancelled) setError(err.message);
    });
    return () => { cancelled = true; };
  }, [user]);

  async function save(profile: PersonProfile) {
    if (!user) return;
    setNotice("");
    const token = await user.getIdToken();
    const response = await fetch(`/api/people/permissions/${profile.sourceId}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ role: profile.role, permissions: profile.permissions || {} }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error || "Could not save permissions.");
      return;
    }
    setProfiles((current) => current.map((item) => item.id === profile.id ? body.profile : item));
    setNotice(`Saved access for ${profile.displayName}.`);
    setError("");
  }

  return (
    <AdminLayout title="Permissions">
      <div data-testid="permissions-screen" className="space-y-4">
        <p className="text-sm text-slate-600">Choose a role and what that person can open. A box left untouched keeps the role default. An unchecked box is a real deny, enforced on the profile, group, and message routes.</p>
        {preview ? <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Preview samples are included. Production does not show these names.</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {notice ? <p className="text-sm text-[#0d9488]">{notice}</p> : null}
        {profiles.map((profile) => (
          <section key={profile.id} className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <PersonChip name={profile.displayName} kind="staff" sourceId={profile.sourceId} className="text-sm" />
              <label className="text-xs font-bold text-slate-500">
                Role
                <select
                  aria-label={`Role for ${profile.displayName}`}
                  value={profile.role}
                  onChange={(event) => setProfiles((current) => current.map((item) => item.id === profile.id ? { ...item, role: event.target.value as StaffRole } : item))}
                  className="ml-2 h-11 rounded-xl border border-slate-200 px-2 text-sm"
                >
                  {STAFF_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                </select>
              </label>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {CAPABILITIES.map((key) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={allows(profile.role, profile.permissions, key)}
                    onChange={(event) => {
                      const permissions = { ...(profile.permissions || {}), [key]: event.target.checked };
                      setProfiles((current) => current.map((item) => item.id === profile.id ? { ...item, permissions } : item));
                    }}
                  />
                  {CAPABILITY_LABEL[key]}
                </label>
              ))}
            </div>
            <button type="button" onClick={() => void save(profile)} className="mt-4 rounded-xl bg-[#0d9488] px-3 py-2 text-xs font-bold text-white">Save {profile.displayName}</button>
          </section>
        ))}
      </div>
    </AdminLayout>
  );
}
