import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { CLIENT_EMAIL_SAMPLE, clientBuiltinEmailHtml } from "./clientEmailTemplates.ts";
import {
  clientPortalEnabled,
  isClientLoginChrome,
  presentClientEmailHtml,
  presentClientEmailText,
} from "./clientPortal.ts";

const saved = process.env.CLIENT_PORTAL_ENABLED;

afterEach(() => {
  if (saved === undefined) delete process.env.CLIENT_PORTAL_ENABLED;
  else process.env.CLIENT_PORTAL_ENABLED = saved;
});

describe("CLIENT_PORTAL_ENABLED", () => {
  it("stays off unless the flag is exactly true", () => {
    delete process.env.CLIENT_PORTAL_ENABLED;
    expect(clientPortalEnabled()).toBe(false);
    expect(clientPortalEnabled({ CLIENT_PORTAL_ENABLED: "" })).toBe(false);
    expect(clientPortalEnabled({ CLIENT_PORTAL_ENABLED: "TRUE" })).toBe(false);
    expect(clientPortalEnabled({ CLIENT_PORTAL_ENABLED: "1" })).toBe(false);
    expect(clientPortalEnabled({ CLIENT_PORTAL_ENABLED: "false" })).toBe(false);
    expect(clientPortalEnabled({ CLIENT_PORTAL_ENABLED: "true" })).toBe(true);
  });

  it("is documented as off and does not change the other notify flags", () => {
    const envExample = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
    expect(envExample).toMatch(/^CLIENT_PORTAL_ENABLED=$/m);
    expect(envExample).not.toMatch(/^CLIENT_PORTAL_ENABLED=true/m);
    expect(envExample).toMatch(/^CLIENT_NOTIFY_LIVE=$/m);
    expect(envExample).toMatch(/^THANKFUL_RSVP_CONFIRM_LIVE=$/m);
    expect(envExample).not.toMatch(/^BOOKING_NOTIFY_LIVE=/m);
  });

  it("hides login chrome, including a saved CMS login item, until the flag is on", () => {
    expect(isClientLoginChrome("/login", "Members")).toBe(true);
    expect(isClientLoginChrome("/portal", "Account")).toBe(true);
    expect(isClientLoginChrome("/portal/home", "Home")).toBe(true);
    expect(isClientLoginChrome("https://iconicimagestx.com/login", "Go")).toBe(true);
    expect(isClientLoginChrome("/book", "Client Login")).toBe(true);
    expect(isClientLoginChrome("/admin/login", "Staff")).toBe(false);
    expect(isClientLoginChrome("/book", "Book Now")).toBe(false);
    const footer = readFileSync(new URL("../client/components/Footer.tsx", import.meta.url), "utf8");
    const header = readFileSync(new URL("../client/components/Header.tsx", import.meta.url), "utf8");
    const missing = readFileSync(new URL("../public/404.html", import.meta.url), "utf8");
    expect(footer).toContain("Client Login");
    expect(footer).toContain("isClientLoginChrome");
    expect(header).toContain("isClientLoginChrome");
    expect(header).toContain("portalOpen");
    expect(missing).not.toContain("Client Login");
    expect(missing).not.toContain("/login");
  });

  it("drops portal CTAs from client email while off and restores them when on", () => {
    delete process.env.CLIENT_PORTAL_ENABLED;
    const hidden = clientBuiltinEmailHtml("order_confirmed", CLIENT_EMAIL_SAMPLE);
    expect(hidden).toContain("Your appointment is confirmed");
    expect(hidden).toContain(CLIENT_EMAIL_SAMPLE.scheduledDate);
    expect(hidden).toContain(CLIENT_EMAIL_SAMPLE.photographerName);
    expect(hidden).not.toContain("View Your Portal");
    expect(hidden).not.toContain("client portal");
    expect(hidden).toContain("iconicimagestx.vercel.app");
    expect(presentClientEmailText("Sign in at the client portal when you are ready.")).toBe("");

    process.env.CLIENT_PORTAL_ENABLED = "true";
    const shown = clientBuiltinEmailHtml("order_confirmed", CLIENT_EMAIL_SAMPLE);
    expect(shown).toContain("View Your Portal");
    expect(shown).toContain("message us through your client portal");
    const html = '<p><a href="https://iconicimagestx.com/portal">Open the client portal</a></p>';
    expect(presentClientEmailHtml(html, { CLIENT_PORTAL_ENABLED: "true" })).toContain("Open the client portal");
    expect(presentClientEmailHtml(html, {})).not.toContain("Open the client portal");
  });

  it("still creates booking accounts and withholds only the password email while off", () => {
    const bookings = readFileSync(new URL("../server/routes/bookings.ts", import.meta.url), "utf8");
    const clients = readFileSync(new URL("../server/routes/clients.ts", import.meta.url), "utf8");
    const email = readFileSync(new URL("../server/services/email.ts", import.meta.url), "utf8");
    expect(bookings).toContain("attachBookingClient");
    expect(bookings).toContain("clientPortalEnabled() && (clientNotifyLive() || isNotifyTestAllowlisted(normalizedEmail))");
    expect(bookings).toContain('template: "account_password_setup"');
    expect(bookings).toContain('template: "booking_received"');
    expect(bookings).toContain('template: "order_confirmed"');
    expect(clients.indexOf("client_portal_disabled")).toBeGreaterThan(-1);
    expect(clients.indexOf("client_portal_disabled")).toBeLessThan(clients.indexOf("admin.auth().createUser"));
    expect(email).toContain('template === "account_password_setup" && !clientPortalEnabled()');
    expect(email).toContain("presentClientEmailHtml");
  });
});
