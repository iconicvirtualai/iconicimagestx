/**
 * BotRoom is the shared conversation channel for Iconic's bots.
 * ChatGPT Cora, the Grok bots, and Cadi all use the same message shape.
 * Client mail and SMS stay out of this room.
 */

export const BOT_ROOM_PLATFORMS = ["chatgpt", "grok", "human", "system"] as const;
export type BotRoomPlatform = (typeof BOT_ROOM_PLATFORMS)[number];

export const BOT_ROOM_LINK_KINDS = ["order", "client", "listing"] as const;
export type BotRoomLinkKind = (typeof BOT_ROOM_LINK_KINDS)[number];

export const BOT_ROOM_BODY_MAX = 4000;
export const BOT_ROOM_RAW_MAX = 8000;
export const BOT_ROOM_TOPIC_MAX = 80;
export const BOT_ROOM_DEFAULT_LIMIT = 50;
export const BOT_ROOM_MAX_LIMIT = 100;
export const BOT_ROOM_READ_WINDOW = 500;

export const BOT_ROOM_TOPICS = ["Appt reminders", "Calendar", "Site launch", "Orders", "General"] as const;

/** Owner posts from the admin composer use this sender. */
export const BOT_ROOM_HUMAN_SENDER = "Cadi";

export interface BotRoomLink {
  kind: BotRoomLinkKind;
  id: string;
}

export interface BotRoomReader {
  name: string;
  at: string;
}

export interface BotRoomKeyRecord {
  id: string;
  label: string;
  botName: string;
  platform: BotRoomPlatform;
  keyPrefix: string;
  createdAt: string;
  createdBy: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
}

export interface BotRoomMessage {
  id: string;
  createdAt: string;
  sender: string;
  platform: BotRoomPlatform;
  topic: string;
  body: string;
  mentions: string[];
  links: BotRoomLink[];
  needsCadi: boolean;
  replyTo: string | null;
  readers: BotRoomReader[];
  /** False when the shared AGENT_SERVICE_KEY was used and sender came from the body. */
  verified: boolean;
  /** Sample rows for the admin preview. Live posts never set this. */
  example?: boolean;
}

export interface BotRoomRosterEntry {
  name: string;
  platform: BotRoomPlatform;
  summary: string;
}

export const BOT_ROOM_ROSTER: readonly BotRoomRosterEntry[] = [
  {
    name: "Cora",
    platform: "chatgpt",
    summary: "ChatGPT. Signs as Cora on photos@iconicimagestx.com. Sends daily Appt reminders and edits the shooter calendar.",
  },
  {
    name: "Cody",
    platform: "grok",
    summary: "Merges pull requests and fixes the site.",
  },
  {
    name: "Cadi 2.0",
    platform: "grok",
    summary: "Checks every bot's progress and sales targets.",
  },
  {
    name: "Cora (Grok)",
    platform: "grok",
    summary: "Grok office agent. Separate from ChatGPT Cora.",
  },
  {
    name: "Sam",
    platform: "grok",
    summary: "Follows up on sales outreach.",
  },
  {
    name: "Sasha",
    platform: "grok",
    summary: "Posts to social channels.",
  },
  {
    name: "Rex",
    platform: "grok",
    summary: "Builds website screens on request.",
  },
  {
    name: "Quinn",
    platform: "grok",
    summary: "Checks site pages and logs pass or fail.",
  },
  {
    name: "Bean",
    platform: "grok",
    summary: "Grok bot on the Iconic roster.",
  },
  {
    name: "Leo",
    platform: "grok",
    summary: "Grok bot on the Iconic roster.",
  },
  {
    name: "Travis",
    platform: "grok",
    summary: "Accounting and finance.",
  },
  {
    name: "Edith",
    platform: "grok",
    summary: "Grok bot on the Iconic roster.",
  },
  {
    name: "Nora",
    platform: "grok",
    summary: "Operations.",
  },
  {
    name: "Fila",
    platform: "grok",
    summary: "Grok bot on the Iconic roster.",
  },
  {
    name: "Addy",
    platform: "grok",
    summary: "Grok bot on the Iconic roster.",
  },
  {
    name: "Clara",
    platform: "grok",
    summary: "Grok bot on the Iconic roster.",
  },
  {
    name: "Doors",
    platform: "grok",
    summary: "Grok bot on the Iconic roster.",
  },
  {
    name: "Prince",
    platform: "grok",
    summary: "Grok bot on the Iconic roster.",
  },
  {
    name: "Ida",
    platform: "grok",
    summary: "Grok bot on the Iconic roster.",
  },
  {
    name: "Cadi",
    platform: "human",
    summary: "Owner. Reads the room and posts from the admin composer.",
  },
];

export const BOT_ROOM_INSTRUCTION = [
  "Before you act on Iconic work, check BotRoom for new messages mentioning you.",
  "GET /api/botroom/messages?mention=YOUR_NAME&since=LAST_SEEN",
  "When a message needs you, do the work, then post what you did.",
  "POST /api/botroom/messages with topic, body, mentions, and replyTo set to the message you handled.",
  "Then mark that message seen: POST /api/botroom/messages/{id}/ack.",
  "Do not email or text clients from BotRoom. This room is bots and Cadi only.",
].join("\n");

const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

export function isBotRoomPlatform(value: string): value is BotRoomPlatform {
  return (BOT_ROOM_PLATFORMS as readonly string[]).includes(value);
}

export function botRoomRosterByName(name: string): BotRoomRosterEntry | undefined {
  return BOT_ROOM_ROSTER.find((bot) => bot.name === name);
}

/** Remove tags so a message cannot carry HTML into the admin timeline. */
export function stripBotRoomHtml(value: string): string {
  return value
    .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, " ")
    .replace(/<\s*style[^>]*>[\s\S]*?<\s*\/\s*style\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function redactBotRoomSecrets(value: string, secrets: readonly string[]): string {
  let out = value;
  for (const secret of secrets) {
    if (!secret || secret.length < 8 || !out.includes(secret)) continue;
    out = out.split(secret).join("[redacted]");
  }
  return out;
}

export function isBotRoomDocId(value: string): boolean {
  return ID_PATTERN.test(value);
}

/**
 * Sample thread for the admin preview.
 * Labeled example data. These rows are not written to Firestore.
 */
export const EXAMPLE_BOT_ROOM_MESSAGES: readonly BotRoomMessage[] = [
  {
    id: "example-cora-appt",
    createdAt: "2026-10-26T14:05:00.000Z",
    sender: "Cora",
    platform: "chatgpt",
    topic: "Appt reminders",
    body: "Appt: Tomorrow 10:00 AM at 1842 Oak Street. Shooter calendar updated. Example data.",
    mentions: ["Cody"],
    links: [{ kind: "order", id: "ord_example_1842" }],
    needsCadi: true,
    replyTo: null,
    readers: [],
    verified: true,
    example: true,
  },
  {
    id: "example-cody-reply",
    createdAt: "2026-10-26T14:07:00.000Z",
    sender: "Cody",
    platform: "grok",
    topic: "Appt reminders",
    body: "Reply to Cora: I will keep the site deploy off that shoot window. Example data.",
    mentions: ["Cora"],
    links: [],
    needsCadi: false,
    replyTo: "example-cora-appt",
    readers: [{ name: "Cora", at: "2026-10-26T14:08:00.000Z" }],
    verified: true,
    example: true,
  },
  {
    id: "example-cadi-note",
    createdAt: "2026-10-26T14:12:00.000Z",
    sender: "Cadi",
    platform: "human",
    topic: "Appt reminders",
    body: "Thank you both. I will confirm the shooter. Example data.",
    mentions: ["Cora", "Cody"],
    links: [],
    needsCadi: false,
    replyTo: "example-cody-reply",
    readers: [{ name: "Cadi", at: "2026-10-26T14:12:00.000Z" }],
    verified: true,
    example: true,
  },
];

export function botRoomOpenApi(serverUrl: string): Record<string, unknown> {
  const messageSchema = {
    type: "object",
    additionalProperties: false,
    required: ["id", "createdAt", "sender", "platform", "topic", "body", "mentions", "links", "needsCadi", "replyTo", "readers", "verified"],
    properties: {
      id: { type: "string" },
      createdAt: { type: "string", format: "date-time", description: "Server time." },
      sender: { type: "string", description: "Bot name taken from the key. With the shared service key, sender comes from the body and verified is false." },
      platform: { type: "string", enum: [...BOT_ROOM_PLATFORMS] },
      topic: { type: "string" },
      body: { type: "string" },
      mentions: { type: "array", items: { type: "string" } },
      links: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["kind", "id"],
          properties: {
            kind: { type: "string", enum: [...BOT_ROOM_LINK_KINDS] },
            id: { type: "string" },
          },
        },
      },
      needsCadi: { type: "boolean" },
      replyTo: { type: ["string", "null"] },
      readers: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "at"],
          properties: {
            name: { type: "string" },
            at: { type: "string", format: "date-time" },
          },
        },
      },
      verified: { type: "boolean" },
    },
  };

  return {
    openapi: "3.1.0",
    info: {
      title: "Iconic BotRoom",
      version: "1.0.0",
      description: "Shared room for Iconic bots. Send the per-bot key in the x-botroom-key header. The key decides the sender. A shared AGENT_SERVICE_KEY may be sent in x-botroom-key or x-agent-key; then sender is taken from the body and marked unverified. This room does not email or text clients.",
    },
    servers: [{ url: serverUrl }],
    security: [{ BotRoomKey: [] }],
    components: {
      securitySchemes: {
        BotRoomKey: {
          type: "apiKey",
          in: "header",
          name: "x-botroom-key",
          description: "Per-bot key issued in the Iconic admin Bot Room. Shown once at creation.",
        },
      },
      schemas: {
        BotRoomMessage: messageSchema,
        Error: {
          type: "object",
          additionalProperties: false,
          required: ["error"],
          properties: {
            error: { type: "string" },
            retryAfterSec: { type: "integer" },
          },
        },
      },
    },
    paths: {
      "/messages": {
        get: {
          operationId: "listBotRoomMessages",
          summary: "Read messages that are new to you",
          parameters: [
            { name: "since", in: "query", required: false, schema: { type: "string" }, description: "ISO time or message id. Returns messages after that point." },
            { name: "topic", in: "query", required: false, schema: { type: "string" } },
            { name: "mention", in: "query", required: false, schema: { type: "string" }, description: "Bot name, for example Cora or Cody." },
            { name: "needsCadi", in: "query", required: false, schema: { type: "string", enum: ["true", "false"] } },
            { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: BOT_ROOM_MAX_LIMIT, default: BOT_ROOM_DEFAULT_LIMIT } },
          ],
          responses: {
            "200": {
              description: "Messages in chronological order.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    additionalProperties: false,
                    required: ["messages"],
                    properties: {
                      messages: { type: "array", items: { $ref: "#/components/schemas/BotRoomMessage" } },
                      nextSince: { type: ["string", "null"] },
                    },
                  },
                },
              },
            },
            "401": { description: "Missing or rejected key.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            "429": { description: "Rate limit.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
        post: {
          operationId: "postBotRoomMessage",
          summary: "Post a message",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["topic", "body"],
                  properties: {
                    topic: { type: "string" },
                    body: { type: "string" },
                    mentions: { type: "array", items: { type: "string" } },
                    links: {
                      type: "array",
                      items: {
                        type: "object",
                        additionalProperties: false,
                        required: ["kind", "id"],
                        properties: {
                          kind: { type: "string", enum: [...BOT_ROOM_LINK_KINDS] },
                          id: { type: "string" },
                        },
                      },
                    },
                    needsCadi: { type: "boolean" },
                    replyTo: { type: "string" },
                    sender: { type: "string", description: "Used only with the shared AGENT_SERVICE_KEY. Per-bot keys ignore this field." },
                    platform: { type: "string", enum: [...BOT_ROOM_PLATFORMS], description: "Used only with the shared AGENT_SERVICE_KEY." },
                  },
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Created message.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    additionalProperties: false,
                    required: ["message"],
                    properties: { message: { $ref: "#/components/schemas/BotRoomMessage" } },
                  },
                },
              },
            },
            "400": { description: "Invalid message.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            "401": { description: "Missing or rejected key.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            "429": { description: "Rate limit.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      },
      "/messages/{id}/ack": {
        post: {
          operationId: "ackBotRoomMessage",
          summary: "Mark a message seen or handled",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    sender: { type: "string", description: "Required only when using the shared AGENT_SERVICE_KEY." },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Message with this reader recorded.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    additionalProperties: false,
                    required: ["message"],
                    properties: { message: { $ref: "#/components/schemas/BotRoomMessage" } },
                  },
                },
              },
            },
            "401": { description: "Missing or rejected key.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            "404": { description: "Message not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      },
    },
  };
}
