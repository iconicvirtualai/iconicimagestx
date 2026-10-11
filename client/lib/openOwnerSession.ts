/** Exchange a Firebase ID token for the httpOnly owner session. False means no suite access. */
export async function openOwnerSession(user: { getIdToken: () => Promise<string> }): Promise<boolean> {
  try {
    const token = await user.getIdToken();
    const response = await fetch("/api/owners/session", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * The only `next` the login page honors. Anything else is ignored, so the
 * parameter cannot be used as an open redirect.
 */
export function ownerLoginNext(search: string): "/admin/owners" | null {
  const next = new URLSearchParams(search).get("next");
  if (!next) return null;
  const path = next.replace(/\/+$/, "");
  return path === "/admin/owners" || path === "/owners" ? "/admin/owners" : null;
}
