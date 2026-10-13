import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { blankStudioJob } from "../../shared/studioProjects";
import { useAppFirestore } from "../lib/appFirestore";
import { createMemoryFirestore } from "../lib/memoryFirestore";
import { createServer } from "../index";
import { useStudioProjectObjects } from "../services/studioProjectRender";

const savedEnv = {
  ENABLE_TEMP_ADMIN: process.env.ENABLE_TEMP_ADMIN,
  VERCEL: process.env.VERCEL,
  VERCEL_ENV: process.env.VERCEL_ENV,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
};

let server: Server;
let baseUrl = "";
const memory = createMemoryFirestore();
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9, ...Buffer.alloc(32, 4)]);

function seed(ownerUid: string, id = "job-1") {
  const job = {
    ...blankStudioJob({
      id,
      projectId: "project-1",
      ownerUid,
      fileName: "living-room.jpg",
      kind: "edit",
      now: 20,
    }),
    action: "edit",
    prompt: "Brighten the room",
    steps: [{ action: "edit", prompt: "Brighten the room" }],
    inputRef: `studio-projects/${ownerUid}/project-1/${id}/input.jpg`,
  };
  memory.seed(`projects/project-1/jobs`, id, job);
  return job;
}

beforeAll(async () => {
  process.env.ENABLE_TEMP_ADMIN = "true";
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  delete process.env.OPENAI_API_KEY;
  useAppFirestore(memory.db);
  const objects = new Map<string, Buffer>();
  objects.set("studio-projects/temp-admin-uid/project-1/job-1/input.jpg", jpeg);
  useStudioProjectObjects(objects);
  seed("temp-admin-uid");
  const app = createServer();
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a port.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  useAppFirestore(null);
  useStudioProjectObjects(null);
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

describe("studio project job route", () => {
  it("requires the owner and still records a failed render on their job", async () => {
    const open = await fetch(`${baseUrl}/api/studio/projects/project-1/jobs/job-1/render`, { method: "POST" });
    expect(open.status).toBe(401);

    seed("someone-else", "job-2");
    const foreign = await fetch(`${baseUrl}/api/studio/projects/project-1/jobs/job-2/render`, {
      method: "POST",
      headers: { Authorization: "Bearer temp-admin-token", "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "edit", action: "edit", prompt: "Brighten the room", steps: [{ action: "edit", prompt: "Brighten the room" }] }),
    });
    expect(foreign.status).toBe(403);
    expect(memory.get("projects/project-1/jobs", "job-2")?.status).toBe("queued");

    const owned = await fetch(`${baseUrl}/api/studio/projects/project-1/jobs/job-1/render`, {
      method: "POST",
      headers: { Authorization: "Bearer temp-admin-token", "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "edit", action: "edit", prompt: "Brighten the room", steps: [{ action: "edit", prompt: "Brighten the room" }] }),
    });
    expect(owned.status).toBe(200);
    const body = await owned.json();
    expect(body.job.status).toBe("failed");
    expect(body.job.ownerUid).toBe("temp-admin-uid");
    expect(memory.get("projects/project-1/jobs", "job-1")?.ownerUid).toBe("temp-admin-uid");
    expect(memory.get("projects/project-1/jobs", "job-1")?.status).toBe("failed");
  });

  it("downloads a finished output only for the owner", async () => {
    memory.seed("projects/project-1/jobs", "job-3", {
      ...blankStudioJob({
        id: "job-3",
        projectId: "project-1",
        ownerUid: "someone-else",
        fileName: "secret.jpg",
        kind: "edit",
        now: 30,
      }),
      status: "done",
      progress: 100,
      outputRef: "studio-projects/someone-else/project-1/job-3/output.jpg",
    });
    const denied = await fetch(`${baseUrl}/api/studio/projects/project-1/jobs/job-3/file`, {
      headers: { Authorization: "Bearer temp-admin-token" },
    });
    expect(denied.status).toBe(403);
  });
});
