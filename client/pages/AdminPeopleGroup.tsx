import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";
import { PersonChip } from "@/components/people/PersonChip";
import { useAuth } from "@/contexts/AuthContext";
import type { PeopleGroup, PersonProfile } from "@shared/peopleProfiles";

export default function AdminPeopleGroup() {
  const { id } = useParams();
  if (!id) return <GroupList />;
  return <GroupDetail id={id} />;
}

function GroupList() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<PeopleGroup[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void user.getIdToken().then(async (token) => {
      const response = await fetch("/api/people/groups", { headers: { Authorization: `Bearer ${token}` } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not load groups.");
      if (!cancelled) setGroups(body.groups || []);
    }).catch((err: Error) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [user]);
  return (
    <AdminLayout title="Groups">
      <div className="space-y-3">
        <p className="text-sm text-slate-600">A group shares projects, orders, and listings with its members. Client groups can also share billing. Messaging a group reaches members only.</p>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {groups.map((group) => (
          <Link key={group.id} to={`/admin/groups/${group.id}`} className="block rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <span className="text-lg font-black text-slate-950">{group.name}</span>
            <span className="mt-1 block text-xs font-bold uppercase tracking-widest text-slate-400">{group.kind === "client" ? "Client team" : "Iconic group"} · {group.memberUids.length} members{group.preview ? " · Preview" : ""}</span>
          </Link>
        ))}
      </div>
    </AdminLayout>
  );
}

function GroupDetail({ id }: { id: string }) {
  const { user } = useAuth();
  const [group, setGroup] = useState<PeopleGroup | null>(null);
  const [members, setMembers] = useState<PersonProfile[]>([]);
  const [profiles, setProfiles] = useState<PersonProfile[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void user.getIdToken().then(async (token) => {
      const response = await fetch(`/api/people/groups/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not open that group.");
      if (!cancelled) {
        setGroup(body.group);
        setMembers(body.members || []);
        setProfiles(body.profiles || []);
      }
    }).catch((err: Error) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [user, id]);

  async function save(next: PeopleGroup) {
    if (!user) return;
    const token = await user.getIdToken();
    const response = await fetch(`/api/people/groups/${next.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error || "Could not save the group.");
      return;
    }
    setGroup(body.group);
    setNotice("Group saved.");
    setError("");
  }

  return (
    <AdminLayout title={group?.name || "Group"}>
      <div data-testid="group-page" className="mx-auto max-w-3xl space-y-4">
        <Link to="/admin/groups" className="text-xs font-bold text-[#0d9488]">All groups</Link>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {!group ? <p className="text-sm text-slate-500">Loading group…</p> : (
          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
            {group.preview ? <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Preview sample. Not stored in production.</p> : null}
            <h2 className="text-2xl font-black">{group.name}</h2>
            <p className="mt-2 text-sm text-slate-600">A message sent to this group is delivered only to its members. A lead admin can open the thread from Communications and is not notified unless they are a member.</p>
            {group.customerTeamId ? <p className="mt-2 text-xs text-slate-500">Linked customer team: {group.customerTeamId}</p> : null}
            <h3 className="mt-6 text-[10px] font-black uppercase tracking-widest text-slate-400">Members</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {members.map((member) => (
                <PersonChip key={member.id} name={member.displayName} kind={member.kind} sourceId={member.sourceId} className="text-sm" />
              ))}
            </div>
            <h3 className="mt-6 text-[10px] font-black uppercase tracking-widest text-slate-400">Can message this group</h3>
            <div className="mt-2 space-y-2">
              {profiles.filter((profile) => profile.uid).map((profile) => {
                const on = group.canMessageProfileIds.includes(profile.id);
                return (
                  <label key={profile.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => {
                        const canMessageProfileIds = on
                          ? group.canMessageProfileIds.filter((item) => item !== profile.id)
                          : [...group.canMessageProfileIds, profile.id];
                        setGroup({ ...group, canMessageProfileIds });
                      }}
                    />
                    {profile.displayName}
                    <span className="text-[10px] uppercase text-slate-400">{profile.role}</span>
                  </label>
                );
              })}
            </div>
            <h3 className="mt-6 text-[10px] font-black uppercase tracking-widest text-slate-400">Shared with members</h3>
            <div className="mt-2 flex flex-wrap gap-4 text-sm font-semibold">
              {(["projects", "orders", "listings", "billing"] as const).map((key) => (
                <label key={key} className="flex items-center gap-2 capitalize">
                  <input
                    type="checkbox"
                    checked={group.shared[key]}
                    onChange={(event) => setGroup({ ...group, shared: { ...group.shared, [key]: event.target.checked } })}
                  />
                  {key}
                </label>
              ))}
            </div>
            {group.sampleProjects.length > 0 ? (
              <div className="mt-6">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Shared work on this preview</h3>
                <ul className="mt-2 space-y-2">
                  {group.sampleProjects.map((project) => (
                    <li key={project.id} className="rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold">{project.title}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <button type="button" onClick={() => void save(group)} className="mt-6 rounded-xl bg-[#0d9488] px-4 py-2 text-sm font-bold text-white">Save group</button>
            {notice ? <p className="mt-3 text-sm text-[#0d9488]">{notice}</p> : null}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
