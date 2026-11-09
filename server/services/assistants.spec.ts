import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_OPENAI_CHAT_MODEL,
  OPENAI_API_URL,
  completeAssistant,
  openAiChatModel,
} from "./assistants";

describe("site chat OpenAI model", () => {
  it("defaults to gpt-4o-mini and trims OPENAI_CHAT_MODEL", () => {
    expect(DEFAULT_OPENAI_CHAT_MODEL).toBe("gpt-4o-mini");
    expect(openAiChatModel({})).toBe("gpt-4o-mini");
    expect(openAiChatModel({ OPENAI_CHAT_MODEL: "   " })).toBe("gpt-4o-mini");
    expect(openAiChatModel({ OPENAI_CHAT_MODEL: "  chat-model-override  " })).toBe("chat-model-override");
  });

  it("sends the default model, then a trimmed override, to chat completions", async () => {
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe(OPENAI_API_URL);
      const body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({
        choices: [{ message: { content: `reply:${body.model}` } }],
      }), { status: 200 });
    });

    const fallback = await completeAssistant({
      provider: "openai",
      messages: [{ role: "user", content: "Hello" }],
      env: { OPENAI_API_KEY: "sk-test" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fallback).toEqual({ ok: true, reply: "reply:gpt-4o-mini" });

    const overridden = await completeAssistant({
      provider: "openai",
      messages: [{ role: "user", content: "Hello" }],
      env: { OPENAI_API_KEY: "sk-test", OPENAI_CHAT_MODEL: "  chat-model-override  " },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(overridden).toEqual({ ok: true, reply: "reply:chat-model-override" });

    const bodies = fetchImpl.mock.calls.map((call) => JSON.parse(String(call[1].body)));
    expect(bodies.map((body) => body.model)).toEqual(["gpt-4o-mini", "chat-model-override"]);
  });
});
