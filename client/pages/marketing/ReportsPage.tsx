import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { marketingApi } from "@/lib/marketingApi";
import { STATUS_LABEL, type CampaignStatus } from "@shared/channelCampaigns";
import MarketingFrame, { cardCls } from "@/components/marketing/MarketingFrame";

interface Row {
  id: string;
  name: string;
  status: string;
  purpose?: string;
  kind?: "email";
  stats?: { sent?: number; delivered?: number; opened?: number; clicked?: number; unsubscribed?: number; replies?: number };
}

export default function ReportsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    marketingApi<{ campaigns: Row[]; emailCampaigns?: Row[] }>(() => user?.getIdToken(), "/api/channel-campaigns")
      .then((data) => {
        const email = (data.emailCampaigns || []).map((row) => ({ ...row, kind: "email" as const }));
        setRows([...data.campaigns, ...email]);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load reports."));
  }, [user]);

  return (
    <MarketingFrame title="Reports" subtitle="Sent, delivered, opened, clicked, unsubscribed, and replies. Email-only campaigns keep their GMass report.">
      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
      <div className="grid gap-3">
        {rows.length === 0 ? <p className={`${cardCls} p-6 text-sm text-gray-500`}>No campaigns yet.</p> : rows.map((row) => {
          const href = row.kind === "email"
            ? `/admin/marketing/campaigns/email/${row.id}/report`
            : `/admin/marketing/campaigns/${row.id}`;
          return (
            <Link key={`${row.kind || "channel"}-${row.id}`} to={href} className={`${cardCls} flex flex-wrap items-center justify-between gap-3 p-4`}>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#0f766e]">{row.kind === "email" ? "Email" : "Multi-channel"} · {STATUS_LABEL[row.status as CampaignStatus] || row.status}</p>
                <h2 className="font-black text-gray-900">{row.name}</h2>
                <p className="text-sm text-gray-500">{row.purpose || "Open the report"}</p>
              </div>
              {row.stats ? <p className="text-xs font-semibold text-gray-500">{row.stats.sent || 0} sent · {row.stats.opened || 0} opened</p> : <p className="text-xs font-semibold text-gray-500">Open report</p>}
            </Link>
          );
        })}
      </div>
    </MarketingFrame>
  );
}
