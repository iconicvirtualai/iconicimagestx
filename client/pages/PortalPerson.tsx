import { Link, useParams, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { previewProfiles, ROLE_LABEL, type PersonProfile } from "@shared/peopleProfiles";
import { portalPortrait } from "@shared/portalAvatar";
import { PortalShell, portalHref } from "@/components/client-hub/PortalShell";
import { useAuth } from "@/contexts/AuthContext";

/** Limited profile inside the portal. The portal flag still gates the route. */
export default function PortalPerson() {
  const { kind = "", id = "" } = useParams();
  const [params] = useSearchParams();
  const example = params.get("example") === "1";
  const { user, signOutUser } = useAuth();
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

  const portrait = portalPortrait({ photoUrl: profile?.photoUrl, headshotUrl: profile?.photoUrl });
  const name = profile?.displayName || "Profile";
  const letters = name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "II";

  return (
    <PortalShell
      firstName={name.split(" ")[0] || "there"}
      accountName={profile?.displayName}
      active="messages"
      example={example}
      onSignOut={user ? () => void signOutUser() : undefined}
    >
      <div className="page-head">
        <div>
          <Link className="back" to={portalHref("/portal/home", example, "messages")}>Messages</Link>
          <h1>{name}</h1>
        </div>
      </div>
      <article className="card" data-testid="portal-person" style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <span className="av" data-testid="portal-person-avatar" data-avatar-kind={portrait.kind} style={{ width: 72, height: 72, fontSize: 22 }}>
          {portrait.url ? <img src={portrait.url} alt="" /> : letters}
        </span>
        <div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {profile ? (
            <>
              <p className="kicker">{ROLE_LABEL[profile.role]}</p>
              {profile.brokerage ? <p>{profile.brokerage}</p> : null}
              {profile.bio ? <p className="ink3">{profile.bio}</p> : null}
            </>
          ) : <p className="ink3">Loading profile…</p>}
        </div>
      </article>
    </PortalShell>
  );
}
