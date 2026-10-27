import { describe, expect, it } from "vitest";
import {
  BOT_ROOM_INSTRUCTION,
  BOT_ROOM_ROSTER,
  EXAMPLE_BOT_ROOM_MESSAGES,
  botRoomOpenApi,
  stripBotRoomHtml,
} from "./botRoom";

describe("bot room contract", () => {
  it("lists ChatGPT Cora separately from the Grok office agent", () => {
    expect(BOT_ROOM_ROSTER.find((bot) => bot.name === "Cora")?.platform).toBe("chatgpt");
    expect(BOT_ROOM_ROSTER.find((bot) => bot.name === "Cora (Grok)")?.platform).toBe("grok");
    expect(BOT_ROOM_ROSTER.map((bot) => bot.name)).toEqual(expect.arrayContaining([
      "Cody",
      "Cadi 2.0",
      "Sam",
      "Sasha",
      "Rex",
      "Quinn",
      "Bean",
      "Leo",
      "Travis",
      "Edith",
      "Nora",
      "Fila",
      "Addy",
      "Clara",
      "Doors",
      "Prince",
      "Ida",
      "Cadi",
    ]));
  });

  it("strips HTML and tells every bot to check the room before acting", () => {
    expect(stripBotRoomHtml("<p>Hello <b>Cadi</b></p><script>alert(1)</script>")).toBe("Hello Cadi");
    expect(BOT_ROOM_INSTRUCTION).toContain("check BotRoom for new messages mentioning you");
    expect(BOT_ROOM_INSTRUCTION).toContain("post what you did");
    expect(EXAMPLE_BOT_ROOM_MESSAGES.every((message) => message.example && message.body.includes("Example data"))).toBe(true);
    expect(EXAMPLE_BOT_ROOM_MESSAGES.map((message) => message.sender)).toEqual(["Cora", "Cody", "Cadi"]);
  });

  it("publishes an OpenAPI 3.1 document with header api-key auth", () => {
    const spec = botRoomOpenApi("https://iconic.example/api/botroom");
    expect(spec.openapi).toBe("3.1.0");
    const schemes = spec.components as { securitySchemes: { BotRoomKey: { name: string; in: string } } };
    expect(schemes.securitySchemes.BotRoomKey).toMatchObject({ name: "x-botroom-key", in: "header" });
  });
});
