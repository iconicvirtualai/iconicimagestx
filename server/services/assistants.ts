export const GROK_API_URL = "https://api.x.ai/v1/chat/completions";
export const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
export const GROK_MISSING_MESSAGE = "Add XAI_API_KEY to enable Grok";
export const OPENAI_MISSING_MESSAGE = "Add OPENAI_API_KEY to enable OpenAI";

export interface AssistantTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantStatus {
  openai: boolean;
  grok: boolean;
  grokNotice: string;
  openaiNotice: string;
}

type FetchLike = typeof fetch;

let fetchOverride: FetchLike | null = null;

export function setAssistantFetchForTests(next: FetchLike | null): void {
  fetchOverride = next;
}

export function assistantStatus(env: Record<string, string | undefined> = process.env): AssistantStatus {
  const openai = Boolean(env.OPENAI_API_KEY?.trim());
  const grok = Boolean(env.XAI_API_KEY?.trim());
  return {
    openai,
    grok,
    grokNotice: grok ? "" : GROK_MISSING_MESSAGE,
    openaiNotice: openai ? "" : OPENAI_MISSING_MESSAGE,
  };
}

function redact(text: string, secrets: string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret) out = out.split(secret).join("[redacted]");
  }
  return out;
}

export function parseAssistantTurns(body: unknown): AssistantTurn[] | null {
  if (!body || typeof body !== "object") return null;
  const messages = (body as { messages?: unknown }).messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 20) return null;
  const turns: AssistantTurn[] = [];
  for (const item of messages) {
    if (!item || typeof item !== "object") return null;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") return null;
    const text = content.trim();
    if (!text || text.length > 4000) return null;
    turns.push({ role, content: text });
  }
  if (turns[turns.length - 1]?.role !== "user") return null;
  return turns;
}

export async function completeAssistant(input: {
  provider: "grok" | "openai";
  messages: AssistantTurn[];
  env?: Record<string, string | undefined>;
  fetchImpl?: FetchLike;
}): Promise<{ ok: true; reply: string } | { ok: false; status: number; message: string }> {
  const env = input.env || process.env;
  const status = assistantStatus(env);
  if (input.provider === "grok" && !status.grok) {
    return { ok: false, status: 409, message: GROK_MISSING_MESSAGE };
  }
  if (input.provider === "openai" && !status.openai) {
    return { ok: false, status: 409, message: OPENAI_MISSING_MESSAGE };
  }

  const key = (input.provider === "grok" ? env.XAI_API_KEY : env.OPENAI_API_KEY || "").trim();
  const url = input.provider === "grok" ? GROK_API_URL : OPENAI_API_URL;
  const model = input.provider === "grok"
    ? (env.XAI_CHAT_MODEL || "grok-3")
    : (env.OPENAI_CHAT_MODEL || "gpt-4o-mini");
  const fetchImpl = input.fetchImpl || fetchOverride || fetch;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "You are an assistant for Iconic Images staff. Keep replies short and practical. Never ask for or repeat API keys." },
          ...input.messages,
        ],
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Assistant request failed.";
    return { ok: false, status: 502, message: redact(message, [key]) };
  }

  const data = await response.json().catch(() => ({}));
  const reply = (data as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content;
  if (!response.ok || typeof reply !== "string" || !reply.trim()) {
    const upstream = typeof (data as { error?: { message?: string } }).error?.message === "string"
      ? (data as { error: { message: string } }).error.message
      : "The assistant did not return a reply.";
    return { ok: false, status: 502, message: redact(upstream, [key]) };
  }
  return { ok: true, reply: redact(reply.trim(), [key]) };
}
