/** Portal contact chat. Shared by the site widget and the staff communications page. */

export interface ContactThreadMessage {
  id: string;
  sender: "client" | "staff";
  senderName: string;
  text: string;
  createdAt: string;
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
