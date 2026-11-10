import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { marketingApi } from "@/lib/marketingApi";
import { STATUS_LABEL, type CampaignStatus } from "@shared/channelCampaigns";
import CampaignFrame, { buttonCls, cardCls, ghostCls, inputCls, labelCls } from "@/components/campaigns/CampaignFrame";

interface Row {
  id: string;
  name: string;
  purpose: string;
  status: string;
  ownerName: string;
  startsOn?: string;
  endsOn?: string;
  updatedAt: string;
  kind?: "email" | "channel";
}

function rowHref(row: Row): string {
  return row.kind === "email"
    ? `/admin/marketing/campaigns/email/${row.id}`
    : `/admin/marketing/campaigns/${row.id}`;
}

function statusText(status: string): string {
  return STATUS_LABEL[status as CampaignStatus] || status;
}

export default function CampaignListPage() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [counter, setCounter] = useState<{ total: number; byStatus: Record<string, number> }>({ total: 0, byStatus: {} });
  const [live, setLive] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    marketingApi<{ campaigns: Row[]; emailCampaigns?: Row[]; counter: { total: number; byStatus: Record<string, number> }; live: boolean }>(
      () => user?.getIdToken(),
      "/api/channel-campaigns",
    )
      .then((data) => {
        const email = (data.emailCampaigns || []).map((row) => ({ ...row, kind: "email" as const }));
        const channel = data.campaigns.map((row) => ({ ...row, kind: "channel" as const }));
        setRows([...channel, ...email].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "")));
        setCounter(data.counter);
        setLive(data.live);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load campaigns."));
  }, [user]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const data = await marketingApi<{ campaign: Row }>(() => user?.getIdToken(), "/api/channel-campaigns", {
        method: "POST",
        body: JSON.stringify({ name, purpose, ownerName: "Cadi" }),
      });
      navigate(`/admin/marketing/campaigns/${data.campaign.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the campaign.");
      setSaving(false);
    }
  }

  return (
    <CampaignFrame
      title="All campaigns"
      subtitle="One place for the emails, texts, and posts going out together. Live sending stays off until CAMPAIGN_SEND_LIVE is true."
      action={<Link to="/admin/marketing/campaigns/calendar" className={ghostCls}>Calendar</Link>}
    >
      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
      <p className={`mb-4 rounded-xl px-4 py-3 text-sm font-semibold ${live ? "bg-amber-50 text-amber-900" : "bg-white text-gray-600"}`}>
        {live ? "Live sending is on. Approved campaigns can reach recipients." : "Live sending is off. Send writes a dry-run log and does not email or text anyone."}
      </p>
      <div className="mb-4 flex gap-2 overflow-x-auto" data-testid="campaign-counts">
        <span className="rounded-full bg-[#0d9488] px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest text-white">{rows.length} total</span>
        {Object.entries(counter.byStatus).filter(([, count]) => count > 0).map(([status, count]) => (
          <span key={status} className="rounded-full border border-[#e8c872] bg-white px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest text-gray-700">
            {STATUS_LABEL[status as CampaignStatus] || status} {count}
          </span>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <form onSubmit={create} className={`${cardCls} order-2 h-fit p-4 lg:order-1`}>
          <h2 className="text-sm font-extrabold uppercase tracking-widest text-gray-900">New campaign</h2>
          <label className={`${labelCls} mt-3`}>Name</label>
          <input className={inputCls} value={name} onChange={(event) => setName(event.target.value)} required />
          <label className={`${labelCls} mt-3`}>Purpose</label>
          <textarea className={inputCls} rows={3} value={purpose} onChange={(event) => setPurpose(event.target.value)} />
          <button type="submit" className={`${buttonCls} mt-3 w-full`} disabled={saving}>{saving ? "Saving" : "Create"}</button>
          {isAdmin ? <Link to="/admin/marketing/campaigns/email/new" className={`${ghostCls} mt-2 w-full`}>Email only</Link> : null}
        </form>
        <div className="order-1 grid gap-3 lg:order-2" data-testid="campaign-list">
          {rows.length === 0 ? <p className={`${cardCls} p-6 text-sm text-gray-500`}>No campaigns yet.</p> : rows.map((row) => (
            <article key={`${row.kind}-${row.id}`} className={`${cardCls} flex flex-wrap items-center justify-between gap-3 p-4`} data-testid="campaign-row">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#0f766e]">
                  {row.kind === "email" ? "Email" : "Multi-channel"} · {statusText(row.status)}
                </p>
                <h2 className="font-black text-gray-900">{row.name}</h2>
                <p className="text-sm text-gray-600">{row.purpose || "No purpose yet"}</p>
                <p className="mt-1 text-xs text-gray-400">{row.ownerName || "Unassigned"}{row.startsOn ? ` · ${row.startsOn}` : ""}{row.endsOn ? ` – ${row.endsOn}` : ""}</p>
              </div>
              <div className="flex gap-2">
                <Link className={buttonCls} to={rowHref(row)}>Open</Link>
                {row.kind === "email" ? <Link className={ghostCls} to={`/admin/marketing/campaigns/email/${row.id}/report`}>Report</Link> : null}
              </div>
            </article>
          ))}
        </div>
      </div>
    </CampaignFrame>
  );
}
