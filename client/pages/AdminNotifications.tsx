import * as React from "react";
import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { ChevronLeft, Mail } from "lucide-react";
import { toast } from "sonner";

export interface NotificationRow {
  key: string;
  label: string;
  audience: "customer" | "team" | "account";
  trigger: string;
  wired: boolean;
  wireNote: string;
  enabled: boolean;
  subject: string;
  gaps: Array<{ tag: string; reason: string }>;
}

export interface NotificationSettingsPayload {
  live: boolean;
  testSink: string;
  timeZone: string;
  reminderHoursBefore: number;
  reminderAssumption: string;
  overdueDays: number;
  notifications: NotificationRow[];
}

async function staffFetch(path: string, token: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Request failed.");
  return data;
}

export function AdminNotificationsPanel({
  initial,
  onToggle,
  onHours,
  onPreview,
  onTest,
}: {
  initial: NotificationSettingsPayload;
  onToggle: (key: string, enabled: boolean) => Promise<void>;
  onHours: (hours: number) => Promise<void>;
  onPreview: (key: string) => Promise<{ subject: string; html: string }>;
  onTest: (key: string) => Promise<{ note?: string; status: string }>;
}) {
  const [rows, setRows] = React.useState(initial.notifications);
  const [hours, setHours] = React.useState(String(initial.reminderHoursBefore));
  const [selected, setSelected] = React.useState(initial.notifications.find((row) => row.audience === "customer")?.key || "");
  const [preview, setPreview] = React.useState<{ subject: string; html: string } | null>(null);
  const [busy, setBusy] = React.useState("");

  const selectedRow = rows.find((row) => row.key === selected) || rows[0];

  const loadPreview = async (key: string) => {
    setSelected(key);
    setBusy("preview");
    try {
      setPreview(await onPreview(key));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Preview failed.");
    } finally {
      setBusy("");
    }
  };

  React.useEffect(() => {
    if (selectedRow) void loadPreview(selectedRow.key);
    // Preview the first customer email once the list is ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-[1180px] mx-auto px-6 py-8" data-notifications-page>
      <div className={`rounded-2xl border p-4 mb-6 ${initial.live ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
        <p className="text-sm font-bold text-slate-900" data-live-state={initial.live ? "on" : "off"}>
          {initial.live
            ? "CLIENT_EMAIL_NOTIFY_LIVE is on. Customer and team mail goes to the real recipients."
            : `CLIENT_EMAIL_NOTIFY_LIVE is off. Every email goes only to ${initial.testSink}.`}
        </p>
        <p className="text-xs text-slate-600 mt-1">{initial.reminderAssumption}</p>
        <p className="text-xs text-slate-600">Payment overdue is {initial.overdueDays} days after fulfillment. Time zone {initial.timeZone}. No SMS.</p>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-6">
        <label className="text-xs font-bold uppercase tracking-widest text-slate-500">
          Reminder hours before appointment
          <Input
            aria-label="Reminder hours before appointment"
            value={hours}
            onChange={(event) => setHours(event.target.value)}
            className="mt-1 w-28 rounded-xl"
          />
        </label>
        <Button
          type="button"
          variant="outline"
          className="rounded-xl"
          onClick={() => void onHours(Number(hours)).then(() => toast.success("Reminder timing saved.")).catch((err) => toast.error(err instanceof Error ? err.message : "Could not save."))}
        >
          Save timing
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.key} className={`rounded-2xl border p-3 ${selected === row.key ? "border-slate-900" : "border-slate-200"} bg-white`}>
              <button type="button" className="text-left w-full" onClick={() => void loadPreview(row.key)}>
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{row.audience}</div>
                <div className="font-bold text-slate-900">{row.label}</div>
                <div className="text-xs text-slate-500">{row.trigger}</div>
              </button>
              <div className="flex items-center justify-between mt-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{row.wired ? (row.enabled ? "On" : "Off") : "Not sent"}</span>
                <Switch
                  aria-label={`${row.label} enabled`}
                  checked={row.enabled}
                  disabled={!row.wired || busy === row.key}
                  onCheckedChange={(checked) => {
                    setBusy(row.key);
                    void onToggle(row.key, checked).then(() => {
                      setRows((current) => current.map((item) => item.key === row.key ? { ...item, enabled: checked } : item));
                    }).catch((err) => {
                      toast.error(err instanceof Error ? err.message : "Could not update.");
                    }).finally(() => setBusy(""));
                  }}
                />
              </div>
              {row.wireNote ? <p className="text-xs text-slate-500 mt-2">{row.wireNote}</p> : null}
            </div>
          ))}
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Preview</div>
              <div className="font-bold" data-preview-subject>{preview?.subject || selectedRow?.subject}</div>
            </div>
            <Button
              type="button"
              className="rounded-xl bg-slate-900 text-white"
              disabled={!selectedRow?.wired || busy === "test"}
              onClick={() => {
                if (!selectedRow) return;
                setBusy("test");
                void onTest(selectedRow.key).then((result) => {
                  toast.success(result.note || result.status);
                }).catch((err) => toast.error(err instanceof Error ? err.message : "Test send failed.")).finally(() => setBusy(""));
              }}
            >
              Send test to me
            </Button>
          </div>
          {selectedRow?.gaps?.length ? (
            <ul className="px-4 py-3 text-xs text-slate-600 bg-slate-50 border-b border-slate-200 space-y-1">
              {selectedRow.gaps.map((gap) => (
                <li key={gap.tag}><strong>{gap.tag}:</strong> {gap.reason}</li>
              ))}
            </ul>
          ) : null}
          <iframe
            title="Notification preview"
            sandbox=""
            className="w-full h-[720px] border-0 bg-white"
            srcDoc={preview?.html || ""}
          />
        </div>
      </div>
    </div>
  );
}

export default function AdminNotifications() {
  const { user } = useAuth();
  const [payload, setPayload] = React.useState<NotificationSettingsPayload | null>(null);
  const [error, setError] = React.useState("");

  const token = async () => {
    if (!user) throw new Error("Please sign in again.");
    return user.getIdToken();
  };

  React.useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const data = await staffFetch("/api/client-email-notify", await token());
        if (!cancel) setPayload(data);
      } catch (err) {
        if (!cancel) setError(err instanceof Error ? err.message : "Could not load notifications.");
      }
    })();
    return () => {
      cancel = true;
    };
  }, [user]);

  return (
    <div className="flex flex-col min-h-screen bg-[#f8fafc]">
      <Header />
      <main className="flex-1 pt-24 pb-12">
        <div className="bg-white border-b border-slate-200 px-6 py-3">
          <div className="max-w-[1180px] mx-auto flex items-center gap-3">
            <Button asChild variant="ghost" size="sm" className="rounded-xl h-9">
              <Link to="/admin/email-templates">
                <ChevronLeft className="w-4 h-4 mr-1" /> Email templates
              </Link>
            </Button>
            <div className="p-2 bg-slate-100 rounded-lg">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-black text-slate-900 uppercase tracking-widest">Notifications</h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Aryeo customer and team email</p>
            </div>
          </div>
        </div>
        {error ? <p className="max-w-[1180px] mx-auto px-6 py-8 text-sm text-red-700">{error}</p> : null}
        {payload ? (
          <AdminNotificationsPanel
            initial={payload}
            onToggle={async (key, enabled) => {
              await staffFetch("/api/client-email-notify", await token(), {
                method: "PATCH",
                body: JSON.stringify({ key, enabled }),
              });
            }}
            onHours={async (reminderHoursBefore) => {
              await staffFetch("/api/client-email-notify", await token(), {
                method: "PATCH",
                body: JSON.stringify({ reminderHoursBefore }),
              });
            }}
            onPreview={async (key) => staffFetch("/api/client-email-notify/preview", await token(), {
              method: "POST",
              body: JSON.stringify({ key }),
            })}
            onTest={async (key) => staffFetch("/api/client-email-notify/test", await token(), {
              method: "POST",
              body: JSON.stringify({ key }),
            })}
          />
        ) : null}
      </main>
      <Footer />
    </div>
  );
}
