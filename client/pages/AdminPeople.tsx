import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";
import { PersonChip } from "@/components/people/PersonChip";
import { useAuth } from "@/contexts/AuthContext";
import { ROLE_LABEL, type PersonProfile, type PersonRole } from "@shared/peopleProfiles";

export default function AdminPeople() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [profiles, setProfiles] = useState<PersonProfile[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    const handle = window.setTimeout(() => {
      void user.getIdToken().then(async (token) => {
        const params = new URLSearchParams();
        if (query) params.set("q", query);
        if (role) params.set("role", role);
        const response = await fetch(`/api/people/directory?${params}`, { headers: { Authorization: `Bearer ${token}` } });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Could not load people.");
        setProfiles(body.profiles || []);
        setError("");
      }).catch((err: Error) => setError(err.message));
    }, 200);
    return () => window.clearTimeout(handle);
  }, [user, query, role]);

  return (
    <AdminLayout title="People">
      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name" className="h-11 flex-1 rounded-xl border border-slate-200 px-3 text-sm" />
          <select aria-label="Filter by role" value={role} onChange={(event) => setRole(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
            <option value="">All roles</option>
            {(Object.keys(ROLE_LABEL) as PersonRole[]).map((item) => <option key={item} value={item}>{ROLE_LABEL[item]}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-3 text-xs font-bold">
          <Link to="/admin/groups" className="text-[#0d9488]">Groups</Link>
          <Link to="/admin/permissions" className="text-[#0d9488]">Permissions</Link>
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {profiles.map((profile) => (
            <div key={profile.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <PersonChip name={profile.displayName} kind={profile.kind} sourceId={profile.sourceId} className="text-sm" />
              <p className="mt-2 text-xs text-slate-500">{ROLE_LABEL[profile.role]}{profile.email ? ` · ${profile.email}` : ""}{profile.preview ? " · Preview" : ""}</p>
            </div>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
