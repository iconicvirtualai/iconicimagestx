import { Link, useParams, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { previewProfiles, ROLE_LABEL, type PersonProfile } from "@shared/peopleProfiles";
import { useAuth } from "@/contexts/AuthContext";

/** Limited profile inside the portal. The portal flag still gates the route. */
export default function PortalPerson() {
  const { kind = "", id = "" } = useParams();
  const [params] = useSearchParams();
  const example = params.get("example") === "1";
  const { user } = useAuth();
  const [profile, setProfile] = useState<PersonProfile | null>(() => example
    ? previewProfiles().find((item) => item.kind === kind && item.sourceId === id) || null
    : null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (example || !user) return;
    let cancelled = false;
    void user.getIdToken().then(async (token) => {
      const response = await fetch(`/api/people/${kind}/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "That profile is not available.");
      if (!cancelled) setProfile(body.profile);
    }).catch((err: Error) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [example, user, kind, id]);

  return (
    <main className="min-h-screen bg-[#f4f7f8] px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-lg rounded-[2rem] bg-white p-6 shadow-sm">
        <Link to={example ? "/portal/home?example=1&section=messages" : "/portal/home?section=messages"} className="text-xs font-bold text-[#0d9488]">Messages</Link>
        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
        {profile ? (
          <div className="mt-4" data-testid="portal-person">
            <h1 className="text-2xl font-black">{profile.displayName}</h1>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{ROLE_LABEL[profile.role]}</p>
            {profile.brokerage ? <p className="mt-3 text-sm">{profile.brokerage}</p> : null}
            {profile.bio ? <p className="mt-3 text-sm text-slate-600">{profile.bio}</p> : null}
          </div>
        ) : <p className="mt-4 text-sm text-slate-500">Loading profile…</p>}
      </div>
    </main>
  );
}
