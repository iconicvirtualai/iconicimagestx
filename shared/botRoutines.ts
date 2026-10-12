/**
 * Plain-language list of what each bot does.
 * Edit this file when a routine or schedule changes.
 * Unknown timing stays "Schedule to confirm".
 */

export type BotRoutineStatus = "Active" | "Paused" | "On request";

export interface BotRoutine {
  name: string;
  summary: string;
  when: string;
  status: BotRoutineStatus;
}

export const BOT_ROUTINES: BotRoutine[] = [
  {
    name: "Rex",
    summary: "Builds website screens on request for aICON, Iconic Virtual, and DOT.",
    when: "On request",
    status: "On request",
  },
  {
    name: "Quinn",
    summary: "Checks site pages and logs pass or fail.",
    when: "Schedule to confirm",
    status: "Active",
  },
  {
    name: "Cadi 2.0",
    summary: "Checks every bot's progress and sales targets.",
    when: "Schedule to confirm",
    status: "Active",
  },
  {
    name: "Sam",
    summary: "Follows up on sales outreach.",
    when: "Schedule to confirm",
    status: "Active",
  },
  {
    name: "Sasha",
    summary: "Posts to social channels.",
    when: "Schedule to confirm",
    status: "Active",
  },
  {
    name: "Cody",
    summary: "Merges pull requests and fixes the site.",
    when: "Schedule to confirm",
    status: "Active",
  },
];
