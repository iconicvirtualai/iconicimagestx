/**
 * Admin controls and the hourly runner for Aryeo-parity email.
 * CLIENT_EMAIL_NOTIFY_LIVE stays the only live switch. This route does not
 * set CLIENT_NOTIFY_LIVE, CAMPAIGN_SEND_LIVE, BOOKING_NOTIFY_LIVE, or
 * CLIENT_PORTAL_ENABLED.
 */

import { Router } from "express";
import { requireAdmin, type AuthenticatedRequest } from "../middleware/auth";
import {
  NOTIFY_DEFINITIONS,
  CLIENT_EMAIL_NOTIFY_TEST_SINK,
  DEFAULT_APPOINTMENT_REMINDER_HOURS,
  PAYMENT_OVERDUE_DAYS,
  NOTIFY_TIME_ZONE,
  clientEmailNotifyLive,
  isNotifyKey,
  renderNotification,
  sampleNotifyContext,
  type NotifyKey,
} from "../../shared/aryeoEmailNotify";
import { readNotifySettings, runDueClientEmailJobs, sendTestNotification, writeNotifySettings } from "../services/aryeoEmailNotify";

const router = Router();

function cronAuthorized(req: { headers: Record<string, string | string[] | undefined> }): boolean {
  const secret = typeof process.env.CRON_SECRET === "string" ? process.env.CRON_SECRET.trim() : "";
  const header = req.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  return Boolean(secret) && value === `Bearer ${secret}`;
}

router.get("/", requireAdmin, async (_req, res) => {
  const settings = await readNotifySettings();
  const sample = sampleNotifyContext();
  res.json({
    live: clientEmailNotifyLive(),
    testSink: CLIENT_EMAIL_NOTIFY_TEST_SINK,
    timeZone: NOTIFY_TIME_ZONE,
    reminderHoursBefore: settings.reminderHoursBefore,
    reminderAssumption: `Aryeo does not show the appointment reminder offset. The default is ${DEFAULT_APPOINTMENT_REMINDER_HOURS} hours before the appointment in ${NOTIFY_TIME_ZONE}.`,
    overdueDays: PAYMENT_OVERDUE_DAYS,
    notifications: NOTIFY_DEFINITIONS.map((item) => {
      const rendered = renderNotification(item.key, sample);
      return {
        key: item.key,
        label: item.label,
        audience: item.audience,
        trigger: item.trigger,
        wired: item.wired,
        wireNote: item.wireNote || "",
        enabled: item.wired && settings.enabled[item.key] !== false,
        subject: rendered.subject,
        gaps: rendered.gaps,
      };
    }),
  });
});

router.patch("/", requireAdmin, async (req, res) => {
  const key = typeof req.body?.key === "string" ? req.body.key : "";
  if (key && !isNotifyKey(key)) return res.status(400).json({ error: "Unknown notification." });
  const settings = await writeNotifySettings({
    key: key ? key as NotifyKey : undefined,
    enabled: typeof req.body?.enabled === "boolean" ? req.body.enabled : undefined,
    reminderHoursBefore: req.body?.reminderHoursBefore,
  });
  res.json({ ok: true, reminderHoursBefore: settings.reminderHoursBefore, enabled: settings.enabled[key as NotifyKey] });
});

router.post("/preview", requireAdmin, async (req, res) => {
  const key = typeof req.body?.key === "string" ? req.body.key : "";
  if (!isNotifyKey(key)) return res.status(400).json({ error: "Unknown notification." });
  const rendered = renderNotification(key, sampleNotifyContext());
  res.json({ subject: rendered.subject, html: rendered.html, text: rendered.text, gaps: rendered.gaps });
});

router.post("/test", requireAdmin, async (req: AuthenticatedRequest, res) => {
  const key = typeof req.body?.key === "string" ? req.body.key : "";
  if (!isNotifyKey(key)) return res.status(400).json({ error: "Unknown notification." });
  const definition = NOTIFY_DEFINITIONS.find((item) => item.key === key);
  if (!definition?.wired) return res.status(400).json({ error: definition?.wireNote || "That email is not sent from this page." });
  const to = req.user?.email || "";
  if (!to) return res.status(400).json({ error: "Your account has no email address." });
  const result = await sendTestNotification({ key, to });
  res.json({
    ...result,
    note: result.live
      ? "Sent to your address."
      : `CLIENT_EMAIL_NOTIFY_LIVE is off. The test went only to ${CLIENT_EMAIL_NOTIFY_TEST_SINK}.`,
  });
});

router.post("/run", async (req, res) => {
  if (!cronAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
  const result = await runDueClientEmailJobs(new Date());
  res.json({ ok: true, ...result });
});

export default router;
