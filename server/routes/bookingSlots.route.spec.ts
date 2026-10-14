import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../index";

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  const app = createServer();
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a port.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

describe("public booking availability", () => {
  it("lists photographer names and never their calendar addresses", async () => {
    const response = await fetch(`${baseUrl}/api/bookings/photographers`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.noPreference).toEqual({ id: "no-preference", name: "No preference" });
    expect(body.photographers.map((person: { name: string }) => person.name)).toEqual([
      "Mike Luna",
      "Armando Martinez",
      "Daniel Adaclog",
      "Steven Banda",
      "Pedro Hernandez",
      "David Gonzalez",
      "Cadi Torres",
    ]);
    expect(JSON.stringify(body)).not.toContain("@");
  });

  it("keeps the standard time list when calendars cannot be read", async () => {
    const response = await fetch(`${baseUrl}/api/bookings/slots?service=listing-essentials&address=200%20Oak%20Ave`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.live).toBe(false);
    expect(body.slots).toEqual([]);
    expect(body.durationMinutes).toBe(90);
    expect(JSON.stringify(body)).not.toContain("@");
  });
});
