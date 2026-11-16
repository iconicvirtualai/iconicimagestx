import { defineConfig, devices } from "@playwright/test";

const port = 8080;

export default defineConfig({
  testDir: "e2e",
  testMatch: /.*\.e2e\.ts/,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm exec vite --host 127.0.0.1 --port 8080",
    url: `http://127.0.0.1:${port}/portal`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      CLIENT_PORTAL_ENABLED: "true",
      VITE_USE_EMULATORS: "true",
      CLIENT_NOTIFY_LIVE: "",
      BOOKING_NOTIFY_LIVE: "",
      THANKFUL_RSVP_CONFIRM_LIVE: "",
      TEAM_SMS_LIVE: "",
      CAMPAIGN_SEND_LIVE: "",
    },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
});
