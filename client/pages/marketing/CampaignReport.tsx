import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { marketingApi } from "@/lib/marketingApi";
import MarketingFrame, { buttonCls, cardCls, labelCls } from "@/components/marketing/MarketingFrame";

interface Derived {
  sent: number;
  delivered: number;
  opens: number;
  uniqueOpens: number;
  clicks: number;
  uniqueClicks: number;
  replies: number;
  bounces: number;
  blocks: number;
  unsubscribes: number;
  rates: { open: number; click: number; bounce: number; unsubscribe: number };
  links: { url: string; clicks: number; unique: number }[];
  recipients: { email: string; sentAt: string; opens: number; clicks: number; replied: boolean; bounced: boolean; blocked: boolean; unsubscribed: boolean }[];
  timeline: { at: string; type: string; email: string; detail: string }[];
  pauseRecommended: boolean;
  warn: boolean;
  bounceRate: number;
}

interface Report {
  sample: boolean;
  fetchedAt: string;
  derived: Derived;
}

export default function CampaignReport() {
  const { id } = useParams();
  const { user } = useAuth();
  const [name, setName] = useState("Report");
  const [status, setStatus] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");

  async function load(force = false) {
    if (force) {
      const data = await marketingApi<{ campaign: { name: string; status: string }; report: Report | null }>(() => user?.getIdToken(), `/api/marketing/campaigns/${id}/report`, { method: "POST", body: JSON.stringify({ force: true }) });
      setName(data.campaign.name);
      setStatus(data.campaign.status);
      setReport(data.report);
      return;
    }
    const data = await marketingApi<{ campaign: { name: string; status: string }; report: Report | null }>(() => user?.getIdToken(), `/api/marketing/campaigns/${id}/report`);
    setName(data.campaign.name);
    setStatus(data.campaign.status);
    setReport(data.report);
  }

  useEffect(() => {
    load().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load the report."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user]);

  const stats = report?.derived;
  const tiles = stats ? [
    ["Sent", stats.sent],
    ["Delivered", stats.delivered],
    ["Opens", stats.opens],
    ["Unique opens", stats.uniqueOpens],
    ["Clicks", stats.clicks],
    ["Unique clicks", stats.uniqueClicks],
    ["Replies", stats.replies],
    ["Bounces", stats.bounces],
    ["Blocks", stats.blocks],
    ["Unsubscribes", stats.unsubscribes],
  ] : [];

  return (
    <MarketingFrame title={name} subtitle={`Status ${status || "draft"}. Numbers come from the GMass report cache.`}>
      <Link to="/admin/communications/email/campaigns" className="mb-4 inline-block text-[10px] font-black uppercase tracking-widest text-[#0d9488]">All campaigns</Link>
      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
      {report?.sample ? <p className="mb-4 rounded-xl bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-700">Sample report for layout. No email was sent.</p> : null}
      {stats?.pauseRecommended ? (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="font-black text-amber-900">Pause this send</p>
          <p className="mt-1 text-sm text-amber-800">Bounce rate is {Math.round(stats.bounceRate * 1000) / 10}%. A scraped list at 12% is how a Gmail account gets in trouble. GMass does not offer a pause API, so pause it in the dashboard.</p>
          <a className={`${buttonCls} mt-3`} href="https://gmass.co/dashboard" target="_blank" rel="noreferrer">Open GMass dashboard</a>
        </div>
      ) : null}
      {stats?.warn && !stats.pauseRecommended ? <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">Bounce rate is climbing. Watch the next refresh before sending again.</p> : null}
      <button type="button" className={`${buttonCls} mb-4`} onClick={() => load(true).catch((err: unknown) => setError(err instanceof Error ? err.message : "Refresh failed."))}>Refresh from GMass</button>
      {stats ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {tiles.map(([label, value]) => (
              <div key={String(label)} className={`${cardCls} p-4`}>
                <p className={labelCls}>{label}</p>
                <p className="mt-1 text-2xl font-black text-gray-900">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            {Object.entries(stats.rates).map(([label, value]) => (
              <div key={label} className={`${cardCls} p-4`}>
                <p className={labelCls}>{label} rate</p>
                <p className="text-2xl font-black">{value}%</p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <section className={`${cardCls} p-4`}>
              <h2 className="text-sm font-black uppercase tracking-widest">Clicks by link</h2>
              <table className="mt-3 w-full text-left text-sm">
                <tbody>
                  {stats.links.length === 0 ? <tr><td className="py-3 text-gray-500">No clicks yet.</td></tr> : stats.links.map((link) => (
                    <tr key={link.url} className="border-t border-gray-100">
                      <td className="py-2 pr-3 font-semibold">{link.url}</td>
                      <td>{link.clicks} clicks</td>
                      <td>{link.unique} people</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section className={`${cardCls} p-4`}>
              <h2 className="text-sm font-black uppercase tracking-widest">Timeline</h2>
              <ol className="mt-3 max-h-64 space-y-2 overflow-auto text-sm">
                {stats.timeline.slice(0, 30).map((event, index) => (
                  <li key={`${event.at}-${event.email}-${index}`}><span className="font-black uppercase text-[#0d9488]">{event.type}</span> {event.email} <span className="text-gray-500">{event.detail}</span></li>
                ))}
              </ol>
            </section>
          </div>
          <section className={`${cardCls} mt-4 overflow-auto p-4`}>
            <h2 className="text-sm font-black uppercase tracking-widest">Recipients</h2>
            <table className="mt-3 w-full text-left text-sm">
              <thead className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                <tr><th className="py-2">Email</th><th>Opens</th><th>Clicks</th><th>Reply</th><th>Bounce</th><th>Block</th><th>Unsub</th></tr>
              </thead>
              <tbody>
                {stats.recipients.slice(0, 100).map((row) => (
                  <tr key={row.email} className="border-t border-gray-100">
                    <td className="py-2 font-semibold">{row.email}</td>
                    <td>{row.opens}</td>
                    <td>{row.clicks}</td>
                    <td>{row.replied ? "Yes" : ""}</td>
                    <td>{row.bounced ? "Yes" : ""}</td>
                    <td>{row.blocked ? "Yes" : ""}</td>
                    <td>{row.unsubscribed ? "Yes" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      ) : <p className={`${cardCls} p-6 text-sm text-gray-500`}>No cached report yet. Refresh after GMass has a campaign id.</p>}
    </MarketingFrame>
  );
}
