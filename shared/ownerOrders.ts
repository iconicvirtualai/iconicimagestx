/**
 * Orders for Cadi 2.0.
 * The sheet tab and header are the contract the Owners Suite writes.
 * The spreadsheet id stays on the server.
 */

import type { OrderApproval } from "./orderApproval.ts";

export const OWNER_ORDERS_TAB = "Orders";

export const OWNER_ORDERS_HEADERS = [
  "Timestamp CT",
  "Order text",
  "Status",
  "Owner bot",
  "Cadi 2.0 reply",
] as const;

export const OWNER_ORDER_TEXT_MAX = 2000;

export const OWNER_ORDER_STATUS_NEW = "New";

export interface OwnerOrder {
  timestamp: string;
  text: string;
  status: string;
  ownerBot: string;
  reply: string;
  /** Firestore order id, when this row is tied to an order document. */
  id?: string;
  approval?: OrderApproval | null;
}

export interface OwnerOrdersResponse {
  orders: OwnerOrder[];
  configured: boolean;
  notice: string | null;
  readerEmail: string | null;
}
