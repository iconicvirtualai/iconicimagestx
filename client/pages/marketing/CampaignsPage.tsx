import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { marketingApi } from "@/lib/marketingApi";
import MarketingFrame, { buttonCls, cardCls, ghostCls } from "@/components/marketing/MarketingFrame";

interface Campaign {
  id: string;
  name: string;
  status: string;
  subject: string;
  updatedAt: string;
}

export default function CampaignsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    marketingApi<{ campaigns: Campaign[] }>(() => user?.getIdToken(), "/api/marketing/campaigns")
      .then((data) => setCampaigns(data.campaigns))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load campaigns."));
  }, [user]);

  async function duplicate(id: string) {
    const data = await marketingApi<{ campaign: Campaign }>(() => user?.getIdToken(), `/api/marketing/campaigns/${id}/duplicate`, { method: "POST" });
    navigate(`/admin/communications/email/campaigns/${data.campaign.id}`);
  }

  return (
    <MarketingFrame
      title="Campaigns"
      subtitle="Draft, duplicate, and send. Every send stops on a confirm step that shows who was removed."
      action={<Link to="/admin/communications/email/campaigns/new" className={buttonCls}>New campaign</Link>}
    >
      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
      <div className="grid gap-3">
        {campaigns.length === 0 ? <p className={`${cardCls} p-6 text-sm text-gray-500`}>No campaigns yet.</p> : campaigns.map((campaign) => (
          <article key={campaign.id} className={`${cardCls} flex flex-wrap items-center justify-between gap-3 p-4`}>
            <div>
              <h2 className="font-black text-gray-900">{campaign.name}</h2>
              <p className="text-sm text-gray-500">{campaign.subject || "No subject"} · {campaign.status}</p>
            </div>
            <div className="flex gap-2">
              <Link className={ghostCls} to={`/admin/communications/email/campaigns/${campaign.id}`}>Edit</Link>
              <Link className={ghostCls} to={`/admin/communications/email/campaigns/${campaign.id}/report`}>Report</Link>
              <button type="button" className={ghostCls} onClick={() => duplicate(campaign.id).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not duplicate."))}>Duplicate</button>
            </div>
          </article>
        ))}
      </div>
    </MarketingFrame>
  );
}
