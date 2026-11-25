import { useEffect, useState } from "react";

/** The headshot saved on the client hub profile — the same file the admin record shows. */
export function usePortalHeadshot(
  user: { getIdToken: () => Promise<string> } | null | undefined,
  example = false,
): string {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (example || !user) {
      setUrl("");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch("/api/clients/me/hub/profile", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return;
        const body = await response.json().catch(() => ({}));
        const headshot = body?.profile?.headshotUrl;
        if (!cancelled && typeof headshot === "string") setUrl(headshot);
      } catch {
        if (!cancelled) setUrl("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [example, user]);
  return url;
}
