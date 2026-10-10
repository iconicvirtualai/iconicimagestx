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
