import * as React from "react";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface CleanupRow {
  collection: string;
  id: string;
  label: string;
  reason: string;
  links?: Array<{ collection: string; id: string; label: string }>;
  archive?: boolean;
}

interface SquareNote {
  collection: string;
  id: string;
  label: string;
  squareInvoiceId: string;
}

interface DryRun {
  plainList: string;
  matched: CleanupRow[];
  borderline: CleanupRow[];
  squareInvoices: SquareNote[];
  archiveCount: number;
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

function download(filename: string, body: string) {
  const blob = new Blob([body], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function AdminTestDataCleanup() {
  const { user } = useAuth();
  const [busy, setBusy] = React.useState<"dry" | "apply" | "restore" | null>(null);
  const [report, setReport] = React.useState<DryRun | null>(null);
  const [runId, setRunId] = React.useState("");
  const [restoreId, setRestoreId] = React.useState("");
  const [backupJson, setBackupJson] = React.useState("");

  const token = async () => {
    if (!user) throw new Error("Please sign in again.");
    return user.getIdToken();
  };

  const dryRun = async () => {
    setBusy("dry");
    try {
      const data = await staffFetch("/api/admin/test-data/dry-run", await token(), { method: "POST" });
      setReport(data);
      toast.success("Dry run finished. Nothing was written.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Dry run failed.");
    } finally {
      setBusy(null);
    }
  };

  const apply = async () => {
    if (!report) {
      toast.error("Run the dry run and review it first.");
      return;
    }
    setBusy("apply");
    try {
      const data = await staffFetch("/api/admin/test-data/apply", await token(), {
        method: "POST",
        body: JSON.stringify({ confirm: "APPLY" }),
      });
      setRunId(data.runId || "");
      setRestoreId(data.runId || "");
      setBackupJson(JSON.stringify({
        runId: data.runId,
        location: data.location,
        records: data.backup,
        squareInvoices: data.squareInvoices,
      }, null, 2));
      toast.success(`Archived ${data.archived?.length || 0} records. Backup ${data.runId}.`);
      const next = await staffFetch("/api/admin/test-data/dry-run", await token(), { method: "POST" });
      setReport(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Apply failed. Nothing was archived if the backup failed.");
    } finally {
      setBusy(null);
    }
  };

  const unarchive = async () => {
    const id = restoreId.trim();
    if (!id) {
      toast.error("Enter the backup run id.");
      return;
    }
    setBusy("restore");
    try {
      const data = await staffFetch("/api/admin/test-data/unarchive", await token(), {
        method: "POST",
        body: JSON.stringify({ confirm: "UNARCHIVE", runId: id }),
      });
      toast.success(`Restored ${data.restored?.length || 0} records from ${id}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unarchive failed.");
    } finally {
      setBusy(null);
    }
  };

  const copyList = async () => {
    if (!report?.plainList) return;
    await navigator.clipboard.writeText(report.plainList);
    toast.success("List copied. Paste it to Cody.");
  };

  return (
    <AdminLayout title="Test data">
      <div className="max-w-5xl space-y-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <p className="text-sm text-gray-600 leading-relaxed">
            Dry run lists test orders, clients, projects, and queue jobs. It writes nothing.
            Apply archives those records only after a backup is stored at <span className="font-mono text-xs">cleanupBackups</span>.
            Nothing is hard-deleted, and no email, text, Square notice, or client notice is sent.
            Void any listed Square invoice in Square yourself.
          </p>
          <ol className="mt-4 text-sm text-gray-700 space-y-1 list-decimal pl-5">
            <li>Run the dry run.</li>
            <li>Copy the list and paste it to Cody.</li>
            <li>Apply only after that check. Unarchive restores the backup.</li>
          </ol>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button type="button" onClick={dryRun} disabled={busy !== null} className="bg-[#0d9488] hover:bg-[#0f766e] text-white rounded-xl text-xs font-bold">
              {busy === "dry" ? "Scanning…" : "Run dry run"}
            </Button>
            <Button type="button" onClick={copyList} disabled={!report} variant="outline" className="rounded-xl text-xs font-bold">
              Copy list
            </Button>
          </div>
        </div>

        {report && (
          <>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                Paste this to Cody · {report.matched.length} clear · {report.borderline.length} need a look · {report.archiveCount} would be archived
              </p>
              <textarea
                readOnly
                aria-label="Dry run list to paste"
                value={report.plainList}
                className="w-full h-64 font-mono text-xs border border-gray-200 rounded-xl p-3 bg-gray-50"
              />
            </div>

            <RowTable title="Clear matches" rows={report.matched} />
            <RowTable title="Needs a human look — not archived" rows={report.borderline} />

            <div className="bg-amber-50 rounded-2xl border border-amber-100 p-6">
              <p className="text-[10px] font-black text-amber-800 uppercase tracking-widest mb-2">Square invoices to void by hand</p>
              {report.squareInvoices.length === 0 ? (
                <p className="text-sm text-amber-900">None on the matched records.</p>
              ) : (
                <ul className="text-sm text-amber-950 space-y-1">
                  {report.squareInvoices.map((note) => (
                    <li key={`${note.collection}/${note.id}`}>{note.squareInvoiceId} · {note.label} · {note.collection}/{note.id}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-6">
              <p className="text-sm font-bold text-red-700 mb-3">Apply archives the clear matches and their linked projects, invoices, holds, and queue jobs. Clients without their own test signal stay.</p>
              <Button type="button" onClick={apply} disabled={busy !== null} className="bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold">
                {busy === "apply" ? "Writing backup…" : "Apply archive"}
              </Button>
              {runId && <p className="mt-3 text-xs font-mono text-gray-500">Last backup: {runId}</p>}
              {backupJson && (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 rounded-xl text-xs font-bold"
                  onClick={() => download(`${runId || "cleanup-backup"}.json`, backupJson)}
                >
                  Download backup JSON
                </Button>
              )}
            </div>
          </>
        )}

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Unarchive</p>
          <div className="flex flex-wrap gap-3">
            <input
              value={restoreId}
              onChange={(event) => setRestoreId(event.target.value)}
              aria-label="Backup run id"
              placeholder="cleanup-…"
              className="h-10 px-3 rounded-xl border border-gray-200 text-sm font-mono"
            />
            <Button type="button" onClick={unarchive} disabled={busy !== null} variant="outline" className="rounded-xl text-xs font-bold">
              {busy === "restore" ? "Restoring…" : "Unarchive this backup"}
            </Button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

function RowTable({ title, rows }: { title: string; rows: CleanupRow[] }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest p-4">{title}</p>
      <table className="w-full min-w-[720px] text-xs">
        <thead>
          <tr className="border-t border-gray-100 text-left text-[10px] font-black uppercase tracking-widest text-gray-400">
            <th className="px-4 py-2">Collection</th>
            <th className="px-4 py-2">Id</th>
            <th className="px-4 py-2">Label</th>
            <th className="px-4 py-2">Reason</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td className="px-4 py-4 text-gray-400" colSpan={4}>None</td></tr>
          ) : rows.map((row) => (
            <tr key={`${row.collection}/${row.id}`} className="border-t border-gray-100">
              <td className="px-4 py-2 font-mono">{row.collection}</td>
              <td className="px-4 py-2 font-mono">{row.id}</td>
              <td className="px-4 py-2 font-bold">{row.label}</td>
              <td className="px-4 py-2 text-gray-600">{row.reason}{row.links?.length ? ` · linked ${row.links.map((link) => `${link.collection}/${link.id}`).join(", ")}` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
