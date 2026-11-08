/**
 * Inbound client email for the task board.
 * Nothing in this adapter sends mail. The live mailbox is not connected.
 */

export interface InboundClientEmail {
  id: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  body: string;
  receivedAt: string;
  orderNumber: string | null;
  /** True when the row is example data, not a mailbox message. */
  sample: boolean;
}

export interface InboundEmailAdapter {
  readonly id: "inbound-email";
  readonly connected: boolean;
  readonly notice: string;
  list(): InboundClientEmail[];
}

export const INBOUND_EMAIL_DISCONNECTED_NOTICE =
  "Inbound email is not connected. Client mail will show up here once a mailbox is wired. This board does not send email.";

/** Live source. Returns no messages until a mailbox is wired. */
export function disconnectedInboundEmailAdapter(): InboundEmailAdapter {
  return {
    id: "inbound-email",
    connected: false,
    notice: INBOUND_EMAIL_DISCONNECTED_NOTICE,
    list: () => [],
  };
}
