import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { marketingApi } from "@/lib/marketingApi";
import MarketingFrame, { buttonCls, cardCls } from "@/components/marketing/MarketingFrame";

interface CampaignRow {
  id: string;
  name: string;
  status: string;
  subject: string;
  recipients: number;
  sample?: boolean;
  stats: { sent: number; uniqueOpens: number; bounces: number; pauseRecommended: boolean } | null;
}

interface Overview {
  contacts: number;
  customers: number;
  unverified: number;
  suppressed: number;
  segments: number;
  campaigns?: CampaignRow[];
  alerts?: CampaignRow[];
}

export default function EmailHome() {
  const { user } = useAuth();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    marketingApi<Overview>(() => user?.getIdToken(), "/api/marketing/dashboard")
      .then((overview) => { if (!cancelled) setData(overview); })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : "Could not load email."); });
    return () => { cancelled = true; };
  }, [user]);

  const stats = [
    { label: "Contacts", value: data?.contacts ?? "—", href: "/admin/communications/email/contacts" },
    { label: "Customers linked", value: data?.customers ?? "—", href: "/admin/communications/email/contacts" },
    { label: "Never verified", value: data?.unverified ?? "—", href: "/admin/communications/email/import" },
    { label: "Do not email", value: data?.suppressed ?? "—", href: "/admin/communications/email/suppression" },
    { label: "Segments", value: data?.segments ?? "—", href: "/admin/communications/email/segments" },
  ];

  return (
    <MarketingFrame
      title="Email"
      subtitle="Contacts, tags, and the do-not-email list for Iconic marketing. One person per email, including customers already in the client database."
      action={<Link to="/admin/communications/email/campaigns/new" className={buttonCls}>New campaign</Link>}
    >
      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {stats.map((stat) => (
          <Link key={stat.label} to={stat.href} className={`${cardCls} p-4 hover:border-[#0d9488]/40`}>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{stat.label}</p>
            <p className="mt-2 text-3xl font-black text-gray-900">{stat.value}</p>
          </Link>
        ))}
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className={`${cardCls} p-5`}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-black uppercase tracking-widest text-gray-900">Campaigns</h2>
            <Link to="/admin/communications/email/campaigns" className="text-[10px] font-black uppercase tracking-widest text-[#0d9488]">View all</Link>
          </div>
          <div className="mt-3 space-y-2">
            {(data?.campaigns || []).slice(0, 4).map((campaign) => (
              <Link key={campaign.id} to={`/admin/communications/email/campaigns/${campaign.id}/report`} className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2">
                <span>
                  <span className="block font-bold text-gray-900">{campaign.name}</span>
                  <span className="text-xs text-gray-500">{campaign.status}{campaign.sample ? " · sample, no email sent" : ""}</span>
                </span>
                <span className="text-xs font-bold text-gray-500">{campaign.stats ? `${campaign.stats.sent} sent` : `${campaign.recipients} queued`}</span>
              </Link>
            ))}
            {(data?.campaigns || []).length === 0 ? <p className="text-sm text-gray-500">No campaigns yet.</p> : null}
          </div>
          {(data?.alerts || []).length ? (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
              Bounce rate is high enough to pause. GMass has no pause endpoint, so pause the live send from the GMass dashboard.
            </p>
          ) : null}
        </section>
        <section className={`${cardCls} p-5`}>
          <h2 className="text-sm font-black uppercase tracking-widest text-gray-900">Standing blacklist</h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            Every @thekinkteam.com address is blocked, along with Bruce Kink, Lisa Cagle, Haley Garcia, Shannon Cox, Melissa Franklin, and Justin McClung. Rebecca Nye and Jacki (Jacalyn) Henthorne are on a personal hold. Add their emails on the do-not-email list when you have them.
          </p>
          <Link to="/admin/communications/email/suppression" className={`${buttonCls} mt-4`}>Review do not email</Link>
        </section>
      </div>
    </MarketingFrame>
  );
}
