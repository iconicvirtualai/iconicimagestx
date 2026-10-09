/**
 * GMass HTTP client. Only the endpoints in https://api.gmass.co/swagger/docs/v1.
 * The API key stays on the server. Sends are refused unless GMASS_SEND_ENABLED=true.
 */

export class GmassSendBlocked extends Error {
  constructor() {
    super("GMass sending is off. Set GMASS_SEND_ENABLED=true after you mean to send.");
    this.name = "GmassSendBlocked";
  }
}

export class GmassNotConfigured extends Error {
  constructor() {
    super("GMass is not configured. Set GMASS_API_KEY on the server.");
    this.name = "GmassNotConfigured";
  }
}

export interface GmassDraftInput {
  subject: string;
  message: string;
  messageType: "html" | "plain";
  fromEmail?: string;
  emailAddresses?: string;
  listAddress?: string;
}

export interface GmassSendInput {
  openTracking: boolean;
  clickTracking: boolean;
  fromName?: string;
  replyTo?: string;
  previewText?: string;
  friendlyName?: string;
  sendTime?: string;
  emailsPerDay?: number;
  suppressionDays?: number;
}

export interface GmassTransactionalInput {
  fromEmail: string;
  fromName: string;
  to: string;
  subject: string;
  message: string;
  settings?: { openTrack?: boolean; clickTrack?: boolean; messageType?: string };
}

export interface GmassClient {
  configured: boolean;
  writesEnabled: boolean;
  getUser(): Promise<unknown>;
  getWarmup(): Promise<unknown>;
  listUnsubscribeDomains(): Promise<unknown>;
  addUnsubscribe(email: string): Promise<unknown>;
  removeUnsubscribe(email: string): Promise<unknown>;
  addUnsubscribeDomain(domain: string): Promise<unknown>;
  removeUnsubscribeDomain(domain: string): Promise<unknown>;
  createDraft(draft: GmassDraftInput): Promise<unknown>;
  sendCampaign(draftId: string, settings: GmassSendInput): Promise<unknown>;
  sendTransactional(message: GmassTransactionalInput): Promise<unknown>;
  listCampaigns(limit?: number): Promise<unknown>;
  getCampaign(campaignId: string): Promise<unknown>;
  report(campaignId: string, metric: "recipients" | "opens" | "clicks" | "bounces" | "blocks" | "unsubscribes" | "replies", query?: { limit?: number; offset?: number }): Promise<unknown>;
}

const SEND_POST = [/^\/api\/campaigndrafts$/, /^\/api\/campaigns\/[^/]+$/, /^\/api\/transactional$/];

export function createGmassClient(env: Record<string, string | undefined> = process.env, fetchImpl: typeof fetch = fetch): GmassClient {
  const apiKey = env.GMASS_API_KEY || "";
  const writesEnabled = env.GMASS_SEND_ENABLED === "true";

  async function request(method: string, path: string, body?: unknown): Promise<unknown> {
    if (!apiKey) throw new GmassNotConfigured();
    const sending = method === "POST" && SEND_POST.some((pattern) => pattern.test(path));
    if (sending && !writesEnabled) throw new GmassSendBlocked();
    const response = await fetchImpl(`https://api.gmass.co${path}`, {
      method,
      headers: {
        "X-apikey": apiKey,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = typeof (data as { message?: unknown }).message === "string"
        ? (data as { message: string }).message
        : `GMass ${method} ${path} failed (${response.status}).`;
      throw new Error(message);
    }
    return data;
  }

  return {
    configured: Boolean(apiKey),
    writesEnabled,
    getUser: () => request("GET", "/api/user"),
    getWarmup: () => request("GET", "/api/user/WarmupStats"),
    listUnsubscribeDomains: () => request("GET", "/api/unsubscribes/domains"),
    addUnsubscribe: (email) => request("POST", "/api/unsubscribes", { emailAddress: email }),
    removeUnsubscribe: (email) => request("DELETE", `/api/unsubscribes?emailAddress=${encodeURIComponent(email)}`),
    addUnsubscribeDomain: (domain) => request("POST", `/api/unsubscribes/domain/${encodeURIComponent(domain)}`),
    removeUnsubscribeDomain: (domain) => request("DELETE", `/api/unsubscribes/domain/${encodeURIComponent(domain)}`),
    createDraft: (draft) => request("POST", "/api/campaigndrafts", draft),
    sendCampaign: (draftId, settings) => request("POST", `/api/campaigns/${encodeURIComponent(draftId)}`, settings),
    sendTransactional: (message) => request("POST", "/api/transactional", message),
    listCampaigns: (limit = 20) => request("GET", `/api/campaigns?limit=${limit}`),
    getCampaign: (campaignId) => request("GET", `/api/campaigns/${encodeURIComponent(campaignId)}`),
    report: (campaignId, metric, query = {}) => {
      const params = new URLSearchParams();
      if (query.limit) params.set("limit", String(query.limit));
      if (query.offset) params.set("offset", String(query.offset));
      const suffix = params.toString() ? `?${params.toString()}` : "";
      return request("GET", `/api/reports/${encodeURIComponent(campaignId)}/${metric}${suffix}`);
    },
  };
}

let override: GmassClient | null = null;

export function setGmassClientForTests(client: GmassClient | null) {
  override = client;
}

export function getGmassClient(): GmassClient {
  return override || createGmassClient();
}
