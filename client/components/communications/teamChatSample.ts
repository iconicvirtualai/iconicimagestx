import type {
  TeamChatMessage,
  TeamChatPrefs,
  TeamChatThreadSummary,
  TeamDirectoryPerson,
  TeamSmsLogEntry,
} from "@shared/teamChat";

export const SAMPLE_VIEWER = { uid: "cadi", name: "Cadi", role: "admin" };

export const SAMPLE_DIRECTORY: TeamDirectoryPerson[] = [
  { uid: "cadi", name: "Cadi", role: "admin" },
  { uid: "alex", name: "Alex Rivera", role: "photographer" },
  { uid: "jordan", name: "Jordan Lee", role: "coordinator" },
  { uid: "sam", name: "Sam Ortiz", role: "editor" },
];

export const SAMPLE_THREADS: TeamChatThreadSummary[] = [
  {
    id: "dispatch",
    kind: "channel",
    name: "#dispatch",
    code: "A7K2",
    preview: "Cadi: Client asked to start in the backyard.",
    updatedAt: "2026-11-10T18:05:00.000Z",
    unread: 1,
    memberIds: ["cadi", "alex", "jordan", "sam"],
  },
  {
    id: "studio",
    kind: "channel",
    name: "#studio",
    code: "B3M9",
    preview: "Sam: Twilight set is ready for review.",
    updatedAt: "2026-11-10T17:40:00.000Z",
    unread: 0,
  },
  {
    id: "saturday",
    kind: "group",
    name: "Saturday crew",
    code: "C4P2",
    preview: "Alex Rivera: I'll take the 10am in Spring.",
    updatedAt: "2026-11-10T16:10:00.000Z",
    unread: 2,
    memberIds: ["cadi", "alex", "jordan", "sam"],
  },
  {
    id: "dm-cadi",
    kind: "dm",
    name: "Alex Rivera",
    code: "D8Q1",
    preview: "Cadi: Can you cover the 2pm?",
    updatedAt: "2026-11-10T15:20:00.000Z",
    unread: 0,
  },
  {
    id: "order-example",
    kind: "order",
    name: "Example Agent · 100 Example Street",
    code: "E2R6",
    preview: "Example Agent: Gate code is 4481.",
    updatedAt: "2026-11-10T15:05:00.000Z",
    unread: 1,
  },
];

export const SAMPLE_MESSAGES: Record<string, TeamChatMessage[]> = {
  dispatch: [
    message("dispatch", "jordan", "Jordan Lee", "staff", "Morning. Two shoots moved up in Spring."),
    message("dispatch", "cadi", "Cadi", "staff", "Client asked to start in the backyard."),
  ],
  studio: [
    message("studio", "sam", "Sam Ortiz", "staff", "Twilight set is ready for review."),
  ],
  saturday: [
    message("saturday", "jordan", "Jordan Lee", "staff", "Who can take the 10am?"),
    message("saturday", "alex", "Alex Rivera", "staff", "I'll take the 10am in Spring."),
    message("saturday", "sam", "Sam Ortiz", "staff", "I can edit that set after lunch."),
  ],
  "dm-cadi": [
    message("dm-cadi", "cadi", "Cadi", "staff", "Can you cover the 2pm?"),
    message("dm-cadi", "alex", "Alex Rivera", "staff", "Yes. I'll be there at 1:40."),
  ],
  "order-example": [
    message("order-example", "client-example", "Example Agent", "client", "Gate code is 4481. Can you shoot the backyard first?"),
    message("order-example", "alex", "Alex Rivera", "staff", "Got it. I'll start in the backyard."),
  ],
};

export const SAMPLE_SMS_LOG: TeamSmsLogEntry[] = [
  {
    id: "log-1",
    recipientUid: "alex",
    recipientName: "Alex Rivera",
    threadId: "dispatch",
    threadLabel: "#dispatch",
    body: "[Iconic · #dispatch] Cadi: Client asked to start in the backyard.\nhttps://iconicimagestx.com/shooter?thread=dispatch\nCode A7K2",
    status: "dry-run",
    reason: "TEAM_SMS_LIVE is off.",
    createdAt: "2026-11-10T18:05:00.000Z",
  },
  {
    id: "log-2",
    recipientUid: "alex",
    recipientName: "Alex Rivera",
    threadId: "order-example",
    threadLabel: "Example Agent · 100 Example Street",
    body: "[Iconic · Example Agent · 100 Example Street] Example Agent: Gate code is 4481.\nhttps://iconicimagestx.com/shooter?thread=order-example\nCode E2R6",
    status: "dry-run",
    reason: "No push subscription, and TEAM_SMS_LIVE is off.",
    createdAt: "2026-11-10T15:05:00.000Z",
  },
];

export const SAMPLE_PREFS: TeamChatPrefs & { push: boolean } = {
  smsMuted: false,
  quietStart: "22:00",
  quietEnd: "07:00",
  timeZone: "America/Chicago",
  smsOptOut: false,
  push: true,
};

export const SAMPLE_PORTAL_THREAD = {
  title: "Alex Rivera · 100 Example Street",
  subtitle: "Message shooter · sample",
  messages: SAMPLE_MESSAGES["order-example"],
};

function message(
  threadId: string,
  senderId: string,
  senderName: string,
  senderRole: "staff" | "client",
  body: string,
): TeamChatMessage {
  return {
    id: `${threadId}-${senderId}-${body.slice(0, 12)}`,
    threadId,
    senderId,
    senderName,
    senderRole,
    body,
    source: "app",
    createdAt: "2026-11-10T18:00:00.000Z",
  };
}

export type TeamChatSampleView = "list" | "channel" | "group" | "dm" | "new" | "log";

export function sampleThreadId(view: TeamChatSampleView): string {
  if (view === "group") return "saturday";
  if (view === "dm") return "dm-cadi";
  if (view === "list" || view === "new" || view === "log") return "";
  return "dispatch";
}
