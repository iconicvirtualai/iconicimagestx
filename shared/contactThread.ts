/** Portal contact chat. Shared by the site widget and the staff communications page. */

export interface ContactThreadMessage {
  id: string;
  sender: "client" | "staff";
  senderName: string;
  text: string;
  createdAt: string;
}

/** Staff deep links use this shape. Anything else is not a thread id. */
export const CONTACT_THREAD_ID_RE = /^[a-f0-9]{32}$/;

/** Thread id from a Communications search string, or null when it is not one thread. */
export function contactThreadIdFromSearch(search: string): string | null {
  const query = search.startsWith("?") ? search.slice(1) : search;
  const id = new URLSearchParams(query).get("thread")?.trim() ?? "";
  return CONTACT_THREAD_ID_RE.test(id) ? id : null;
}

/** Thread the client and staff both render. Never includes the visitor access token. */
export interface ContactThreadView {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  createdAt: string;
  updatedAt: string;
  messages: ContactThreadMessage[];
}
