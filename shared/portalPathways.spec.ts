import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = new URL("..", import.meta.url).pathname;

const SOURCES = [
  "client/components/client-hub/PortalShell.tsx",
  "client/components/client-hub/SettingsPages.tsx",
  "client/components/client-home/ClientHomeDashboard.tsx",
  "client/components/client-home/PortalListingsHome.tsx",
  "client/components/portal/ClientFilesPanel.tsx",
  "client/pages/PortalSettings.tsx",
  "client/pages/PortalOrder.tsx",
  "client/pages/PortalListingDetail.tsx",
  "client/pages/PortalPerson.tsx",
  "client/pages/ClientPortal.tsx",
  "client/pages/AdminOrders.tsx",
  "client/pages/AdminCustomerCenter.tsx",
  "client/pages/AdminClientAccount.tsx",
  "client/pages/AdminPeople.tsx",
  "client/pages/AdminPersonProfile.tsx",
  "client/pages/AdminPeopleGroup.tsx",
  "client/pages/AdminListingFile.tsx",
  "client/pages/AdminOps.tsx",
  "client/pages/AdminOrderDetail.tsx",
  "client/pages/AdminOrderRequest.tsx",
  "client/components/admin/ordersDeskFace.tsx",
  "client/components/admin/AdminOrderList.tsx",
  "client/lib/adminNav.ts",
  "client/App.tsx",
];

function routesFromApp(): string[] {
  const source = readFileSync(join(ROOT, "client/App.tsx"), "utf8");
  return [...source.matchAll(/path="([^"]+)"/g)].map((match) => match[1]);
}

function matchesRoute(route: string, path: string): boolean {
  const left = route.split("/").filter(Boolean);
  const right = path.split("/").filter(Boolean);
  if (left.length !== right.length) return false;
  return left.every((part, index) => part.startsWith(":") || part === right[index]);
}

function quotedPaths(source: string): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(/["'`](\/(?:portal|admin)[^"'`\s]*)["'`]/g)) {
    const path = match[1].split("?")[0].replace(/\$\{[^}]+\}/g, ":id");
    if (path.includes("${")) continue;
    found.add(path);
  }
  return [...found];
}

describe("portal and admin pathways", () => {
  const routes = routesFromApp();

  it("sends every portal and feeding-admin link to a route that exists", () => {
    const failures: string[] = [];
    for (const file of SOURCES) {
      const source = readFileSync(join(ROOT, file), "utf8");
      for (const path of quotedPaths(source)) {
        if (path === "/admin" || path === "/portal") continue;
        const ok = routes.some((route) => matchesRoute(route, path) || route === path);
        if (!ok) failures.push(`${file} -> ${path}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("keeps the client portal routes this desk uses", () => {
    for (const path of [
      "/portal",
      "/portal/home",
      "/portal/order",
      "/portal/settings/:section",
      "/portal/listings/:listingId",
      "/portal/people/:kind/:id",
      "/admin/orders",
      "/admin/customers",
      "/admin/customers/:id",
      "/admin/people",
      "/admin/people/:kind/:id",
      "/admin/order/:id",
      "/admin/order-request/:id",
      "/admin/listing/:id",
      "/admin/ops",
      "/admin/delivery",
    ]) {
      expect(routes.some((route) => route === path)).toBe(true);
    }
  });
});

describe("portal page files exist", () => {
  it("does not point the inventory at a missing source file", () => {
    for (const file of SOURCES) {
      expect(statSync(join(ROOT, file)).isFile()).toBe(true);
    }
    expect(readdirSync(join(ROOT, "client/pages")).some((name) => name.startsWith("Admin"))).toBe(true);
  });
});
