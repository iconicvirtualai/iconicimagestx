/**
 * Renders Aryeo customer emails and the notifications settings page to HTML,
 * then screenshots desktop and phone widths with Chrome. Does not send mail
 * and does not write Firestore.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import {
  CLIENT_EMAIL_NOTIFY_TEST_SINK,
  DEFAULT_APPOINTMENT_REMINDER_HOURS,
  NOTIFY_DEFINITIONS,
  NOTIFY_TIME_ZONE,
  PAYMENT_OVERDUE_DAYS,
  renderNotification,
  sampleNotifyContext,
  type NotifyKey,
} from "../shared/aryeoEmailNotify.ts";

const outDir = "/opt/cursor/artifacts/aryeo-emails";
mkdirSync(outDir, { recursive: true });

const customerKeys = NOTIFY_DEFINITIONS.filter((item) => item.audience === "customer").map((item) => item.key);

function pageHtml(key: NotifyKey, outstanding = false): string {
  const ctx = sampleNotifyContext();
  if (outstanding) {
    ctx.mediaOutstanding = true;
    ctx.mediaOutstandingDetail = "Twilight photos are still outstanding.";
  }
  return renderNotification(key, ctx).html;
}

const files: Array<{ name: string; html: string }> = customerKeys.map((key) => ({
  name: key,
  html: pageHtml(key),
}));
files.push({
  name: "listing_delivery_pending",
  html: pageHtml("listing_delivery", true),
});

const rows = NOTIFY_DEFINITIONS.map((item) => {
  const rendered = renderNotification(item.key, sampleNotifyContext());
  return `<article style="border:1px solid #e2e8f0;border-radius:16px;padding:12px 14px;margin:0 0 10px;background:#fff;">
    <div style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#94a3b8;font-weight:700;">${item.audience}</div>
    <div style="font-weight:700;color:#0f172a;">${item.label}</div>
    <div style="font-size:13px;color:#64748b;">${item.trigger}</div>
    <div style="margin-top:8px;display:flex;justify-content:space-between;align-items:center;">
      <span style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8;">${item.wired ? "On" : "Not sent"}</span>
      <span style="width:44px;height:24px;border-radius:999px;background:${item.wired ? "#0f172a" : "#e2e8f0"};position:relative;display:inline-block;">
        <span style="position:absolute;top:2px;${item.wired ? "right:2px" : "left:2px"};width:20px;height:20px;border-radius:999px;background:#fff;"></span>
      </span>
    </div>
    ${item.wireNote ? `<p style="font-size:12px;color:#64748b;margin:8px 0 0;">${item.wireNote}</p>` : ""}
    ${rendered.gaps.length ? `<p style="font-size:12px;color:#64748b;margin:8px 0 0;"><strong>Gap:</strong> ${rendered.gaps.map((gap) => gap.tag).join(", ")}</p>` : ""}
  </article>`;
}).join("");

const preview = renderNotification("customer_order_confirmation", sampleNotifyContext());
const adminHtml = `<!doctype html><html><head><meta charset="utf-8"><title>Notifications</title></head>
<body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
  <header style="background:#fff;border-bottom:1px solid #e2e8f0;padding:16px 24px;">
    <div style="font-size:12px;letter-spacing:.16em;font-weight:800;">NOTIFICATIONS</div>
    <div style="font-size:11px;color:#94a3b8;letter-spacing:.08em;">ARYEO CUSTOMER AND TEAM EMAIL</div>
  </header>
  <main style="max-width:1100px;margin:0 auto;padding:24px;">
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:16px;padding:16px;margin-bottom:16px;">
      <strong>CLIENT_EMAIL_NOTIFY_LIVE is off.</strong> Every email goes only to ${CLIENT_EMAIL_NOTIFY_TEST_SINK}.
      <div style="font-size:13px;color:#475569;margin-top:6px;">Aryeo does not show the appointment reminder offset. The default is ${DEFAULT_APPOINTMENT_REMINDER_HOURS} hours before the appointment in ${NOTIFY_TIME_ZONE}. Payment overdue is ${PAYMENT_OVERDUE_DAYS} days after fulfillment. No SMS.</div>
    </div>
    <label style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#64748b;">Reminder hours before appointment
      <div style="margin-top:6px;"><input value="${DEFAULT_APPOINTMENT_REMINDER_HOURS}" style="width:80px;padding:8px;border:1px solid #e2e8f0;border-radius:12px;"></div>
    </label>
    <div style="display:grid;grid-template-columns:340px 1fr;gap:16px;margin-top:16px;">
      <div>${rows}</div>
      <section style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
        <div style="padding:16px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;gap:12px;align-items:center;">
          <div>
            <div style="font-size:10px;letter-spacing:.12em;color:#94a3b8;font-weight:700;">PREVIEW</div>
            <div style="font-weight:700;">${preview.subject}</div>
          </div>
          <button style="background:#0f172a;color:#fff;border:0;border-radius:12px;padding:10px 14px;">Send test to me</button>
        </div>
        <iframe title="preview" style="width:100%;height:640px;border:0;" srcdoc="${preview.html.replace(/"/g, "&quot;")}"></iframe>
      </section>
    </div>
  </main>
</body></html>`;

files.push({ name: "admin-notifications", html: adminHtml });

for (const file of files) writeFileSync(`${outDir}/${file.name}.html`, file.html);

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const shots: string[] = [];
for (const file of files) {
  for (const [label, width] of [["desktop", 1280], ["phone", 390]] as const) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto(`file://${outDir}/${file.name}.html`, { waitUntil: "load" });
    await page.waitForTimeout(400);
    const path = `${outDir}/${file.name}-${label}.png`;
    await page.screenshot({ path, fullPage: true });
    await page.close();
    shots.push(path);
  }
}
await browser.close();
console.log(shots.join("\n"));
