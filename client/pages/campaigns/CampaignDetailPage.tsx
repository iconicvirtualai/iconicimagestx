import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { marketingApi } from "@/lib/marketingApi";
import {
  POST_PLATFORMS,
  STATUS_LABEL,
  campaignSmsBody,
  smsMetrics,
  type CampaignPost,
  type CampaignStatus,
  type ChannelCampaign,
  type PostPlatform,
} from "@shared/channelCampaigns";
import CampaignFrame, { buttonCls, cardCls, ghostCls, inputCls, labelCls } from "@/components/campaigns/CampaignFrame";

interface Audience {
  emailCount: number;
  smsCount: number;
  unsubscribe: number;
  bounce: number;
  doNotContact: number;
  held: number;
  recipients: { name: string; email: string; phone: string; channels: string[] }[];
  recipientTotal: number;
  source: string;
  sheetNote: string;
  truncated: boolean;
}

interface LogLine {
  channel: string;
  to: string;
  name: string;
  detail: string;
}

interface SendLog {
  id: string;
  kind: string;
  note: string;
  lines: LogLine[];
  live: boolean;
}

const STATUSES: CampaignStatus[] = ["idea", "draft", "ready", "approved", "scheduled", "sent", "archived"];

export default function CampaignDetailPage() {
  const { id = "" } = useParams();
  const { user, staffProfile, isAdmin } = useAuth();
  const [campaign, setCampaign] = useState<ChannelCampaign | null>(null);
  const [audience, setAudience] = useState<Audience | null>(null);
  const [segments, setSegments] = useState<{ id: string; name: string }[]>([]);
  const [live, setLive] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [testResult, setTestResult] = useState<SendLog | null>(null);
  const [dryRun, setDryRun] = useState<SendLog | null>(null);

  async function load(segmentId?: string) {
    const [detail, options] = await Promise.all([
      marketingApi<{ campaign: ChannelCampaign; audience: Audience; live: boolean; logs: SendLog[] }>(
        () => user?.getIdToken(),
        `/api/channel-campaigns/${id}`,
      ),
      marketingApi<{ segments: { id: string; name: string }[]; audience: Audience }>(
        () => user?.getIdToken(),
        `/api/channel-campaigns/audience?segmentId=${encodeURIComponent(segmentId ?? "")}`,
      ),
    ]);
    setCampaign(detail.campaign);
    setLive(detail.live);
    setSegments(options.segments);
    setAudience(segmentId === undefined ? detail.audience : options.audience);
    const testLog = detail.logs.find((log) => log.kind === "test");
    if (testLog) setTestResult(testLog);
    const latest = detail.logs.find((log) => log.kind === "dry-run" || log.kind === "send");
    if (latest) setDryRun(latest);
  }

  useEffect(() => {
    load().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load this campaign."));
    // The campaign id is the only load key. load reads the latest token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user]);

  const smsPreview = useMemo(() => campaignSmsBody(campaign?.sms.body || "", "there"), [campaign?.sms.body]);
  const smsCount = smsMetrics(smsPreview);

  async function save() {
    if (!campaign) return;
    setBusy("save");
    setError("");
    try {
      const data = await marketingApi<{ campaign: ChannelCampaign; reopened: boolean }>(() => user?.getIdToken(), `/api/channel-campaigns/${campaign.id}`, {
        method: "POST",
        body: JSON.stringify(campaign),
      });
      setCampaign(data.campaign);
      setNotice(data.reopened ? "Saved. Approval was cleared because the content changed." : "Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy("");
    }
  }

  async function setStatus(status: CampaignStatus) {
    if (!campaign) return;
    setBusy(status);
    setError("");
    try {
      const data = await marketingApi<{ campaign: ChannelCampaign }>(() => user?.getIdToken(), `/api/channel-campaigns/${campaign.id}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      setCampaign(data.campaign);
      setNotice(status === "approved" ? "Approved." : `Moved to ${STATUS_LABEL[status]}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the status.");
    } finally {
      setBusy("");
    }
  }

  async function changeSegment(segmentId: string) {
    if (!campaign) return;
    setCampaign({ ...campaign, segmentId });
    try {
      const data = await marketingApi<{ audience: Audience }>(() => user?.getIdToken(), `/api/channel-campaigns/audience?segmentId=${encodeURIComponent(segmentId)}`);
      setAudience(data.audience);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not count that segment.");
    }
  }

  async function sendTest() {
    if (!campaign) return;
    setBusy("test");
    setError("");
    try {
      const data = await marketingApi<{ log: SendLog }>(() => user?.getIdToken(), `/api/channel-campaigns/${campaign.id}/test`, {
        method: "POST",
        body: JSON.stringify({ firstName: staffProfile?.firstName || "there" }),
      });
      setTestResult(data.log);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test send failed.");
    } finally {
      setBusy("");
    }
  }

  async function send() {
    if (!campaign) return;
    setBusy("send");
    setError("");
    try {
      const data = await marketingApi<{ log: SendLog; dryRun: boolean }>(() => user?.getIdToken(), `/api/channel-campaigns/${campaign.id}/send`, { method: "POST", body: "{}" });
      setDryRun(data.log);
      await load(campaign.segmentId);
      setNotice(data.dryRun ? "Dry run saved. Nobody was emailed or texted." : "Send finished.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed.");
    } finally {
      setBusy("");
    }
  }

  async function queuePost(post: CampaignPost) {
    if (!campaign) return;
    setBusy(post.id);
    try {
      const data = await marketingApi<{ campaign: ChannelCampaign }>(() => user?.getIdToken(), `/api/channel-campaigns/${campaign.id}/posts/${post.id}/queue`, { method: "POST", body: "{}" });
      setCampaign(data.campaign);
      setNotice(`Queued the ${post.platform} post for the social handoff. Nothing was posted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not queue the post.");
    } finally {
      setBusy("");
    }
  }

  function downloadPost(post: CampaignPost) {
    const blob = new Blob([JSON.stringify({ campaign: campaign?.name, ...post }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${post.platform}-${post.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function copyPost(post: CampaignPost) {
    await navigator.clipboard.writeText(post.copy);
    setNotice(`Copied the ${post.platform} caption.`);
  }

  async function uploadImage(file: File, apply: (url: string, name: string) => void) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Could not read that image."));
      reader.readAsDataURL(file);
    });
    const data = await marketingApi<{ url: string; name: string }>(() => user?.getIdToken(), "/api/channel-campaigns/media", {
      method: "POST",
      body: JSON.stringify({ name: file.name, dataUrl }),
    });
    apply(data.url, data.name);
  }

  if (!campaign) {
    return (
      <CampaignFrame title="Campaign">
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : <p className="text-sm text-gray-500">Loading campaign…</p>}
      </CampaignFrame>
    );
  }

  const locked = campaign.status === "sent";
  const stats: { label: string; value: number }[] = [
    { label: "Sent", value: campaign.stats.sent },
    { label: "Delivered", value: campaign.stats.delivered },
    { label: "Opened", value: campaign.stats.opened },
    { label: "Clicked", value: campaign.stats.clicked },
    { label: "Unsubscribed", value: campaign.stats.unsubscribed },
    { label: "Replies", value: campaign.stats.replies },
  ];

  return (
    <CampaignFrame
      title={campaign.name}
      subtitle={live ? "Live sending is on." : "Live sending is off. Send writes a dry-run log."}
      action={<Link to="/admin/campaigns" className={ghostCls}>All campaigns</Link>}
    >
      <div data-testid="campaign-detail" className="space-y-4">
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
        {notice ? <p className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-[#0f766e]" role="status">{notice}</p> : null}

        <section className={`${cardCls} grid gap-3 p-4 md:grid-cols-4`}>
          <label className="md:col-span-2">
            <span className={labelCls}>Name</span>
            <input className={inputCls} disabled={locked} value={campaign.name} onChange={(event) => setCampaign({ ...campaign, name: event.target.value })} />
          </label>
          <label>
            <span className={labelCls}>Owner</span>
            <input className={inputCls} disabled={locked} value={campaign.ownerName} onChange={(event) => setCampaign({ ...campaign, ownerName: event.target.value })} />
          </label>
          <label>
            <span className={labelCls}>Status</span>
            <select className={inputCls} value={campaign.status} onChange={(event) => setStatus(event.target.value as CampaignStatus)}>
              {STATUSES.filter((status) => status !== "sent" || campaign.status === "sent").map((status) => (
                <option key={status} value={status}>{STATUS_LABEL[status]}</option>
              ))}
            </select>
          </label>
          <label>
            <span className={labelCls}>Starts</span>
            <input type="date" className={inputCls} disabled={locked} value={campaign.startsOn} onChange={(event) => setCampaign({ ...campaign, startsOn: event.target.value })} />
          </label>
          <label>
            <span className={labelCls}>Ends</span>
            <input type="date" className={inputCls} disabled={locked} value={campaign.endsOn} onChange={(event) => setCampaign({ ...campaign, endsOn: event.target.value })} />
          </label>
          <label className="md:col-span-2">
            <span className={labelCls}>Purpose</span>
            <input className={inputCls} disabled={locked} value={campaign.purpose} onChange={(event) => setCampaign({ ...campaign, purpose: event.target.value })} />
          </label>
        </section>

        <div data-testid="campaign-channels" className="grid gap-4 lg:grid-cols-3">
          <article className={`${cardCls} p-4`}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-extrabold uppercase tracking-widest text-gray-900">Email</h2>
              <input type="checkbox" checked={campaign.email.enabled} disabled={locked} onChange={(event) => setCampaign({ ...campaign, email: { ...campaign.email, enabled: event.target.checked } })} aria-label="Email channel" />
            </div>
            <label className={`${labelCls} mt-3`}>Subject</label>
            <input className={inputCls} disabled={locked} value={campaign.email.subject} onChange={(event) => setCampaign({ ...campaign, email: { ...campaign.email, subject: event.target.value } })} />
            <label className={`${labelCls} mt-3`}>Preheader</label>
            <input className={inputCls} disabled={locked} value={campaign.email.preheader} onChange={(event) => setCampaign({ ...campaign, email: { ...campaign.email, preheader: event.target.value } })} />
            <label className={`${labelCls} mt-3`}>Scheduled</label>
            <input type="datetime-local" className={inputCls} disabled={locked} value={localInput(campaign.email.scheduledAt)} onChange={(event) => setCampaign({ ...campaign, email: { ...campaign.email, scheduledAt: event.target.value ? new Date(event.target.value).toISOString() : "" } })} />
            <div className="mt-3 flex gap-2">
              <button type="button" className={campaign.email.mode === "builder" ? buttonCls : ghostCls} disabled={locked} onClick={() => setCampaign({ ...campaign, email: { ...campaign.email, mode: "builder" } })}>Builder</button>
              <button type="button" className={campaign.email.mode === "html" ? buttonCls : ghostCls} disabled={locked} onClick={() => setCampaign({ ...campaign, email: { ...campaign.email, mode: "html" } })}>Paste HTML</button>
            </div>
            {campaign.email.mode === "html" ? (
              <textarea className={`${inputCls} mt-3 font-mono`} rows={6} disabled={locked} value={campaign.email.html} onChange={(event) => setCampaign({ ...campaign, email: { ...campaign.email, html: event.target.value } })} />
            ) : (
              <ul className="mt-3 space-y-2 text-sm text-gray-700">
                {campaign.email.blocks.map((block) => (
                  <li key={block.id} className="rounded-xl bg-[#f5f2ea] px-3 py-2">
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#0f766e]">{block.type}</span>
                    <p>{block.text || block.url}</p>
                  </li>
                ))}
                {campaign.email.blocks.length === 0 ? <li className="text-sm text-gray-400">Add a block, or paste HTML.</li> : null}
              </ul>
            )}
            {!locked && campaign.email.mode === "builder" ? (
              <button
                type="button"
                className={`${ghostCls} mt-3`}
                onClick={() => setCampaign({
                  ...campaign,
                  email: {
                    ...campaign.email,
                    blocks: [...campaign.email.blocks, { id: `block-${campaign.email.blocks.length + 1}`, type: "text", text: "Hello {FirstName},", url: "", href: "" }],
                  },
                })}
              >
                Add text block
              </button>
            ) : null}
            <p className="mt-3 text-xs text-gray-500">Merge tags: {"{FirstName}"}, {"{LastName}"}, {"{Company}"}. Images can live in /marketing or /email. Every send adds the address and an unsubscribe link.</p>
            {!locked ? (
              <label className={`${ghostCls} mt-3 cursor-pointer`}>
                Host an image
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    uploadImage(file, (url, name) => {
                      setCampaign({
                        ...campaign,
                        email: {
                          ...campaign.email,
                          blocks: [...campaign.email.blocks, { id: `img-${Date.now()}`, type: "image", text: name, url, href: "" }],
                        },
                      });
                    }).catch((err: unknown) => setError(err instanceof Error ? err.message : "Upload failed."));
                  }}
                />
              </label>
            ) : null}
          </article>

          <article className={`${cardCls} p-4`}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-extrabold uppercase tracking-widest text-gray-900">Text</h2>
              <input type="checkbox" checked={campaign.sms.enabled} disabled={locked} onChange={(event) => setCampaign({ ...campaign, sms: { ...campaign.sms, enabled: event.target.checked } })} aria-label="Text channel" />
            </div>
            <textarea className={`${inputCls} mt-3`} rows={5} disabled={locked} value={campaign.sms.body} onChange={(event) => setCampaign({ ...campaign, sms: { ...campaign.sms, body: event.target.value } })} />
            <p className="mt-2 text-xs font-semibold text-gray-500" data-testid="sms-count">
              {smsCount.chars} characters · {smsCount.segments} {smsCount.segments === 1 ? "segment" : "segments"} · {smsCount.encoding.toUpperCase()}
            </p>
            <p className="mt-2 text-xs text-gray-500">STOP is added when the message does not already include it. A reply of STOP is stored as do-not-text.</p>
            <label className={`${labelCls} mt-3`}>Scheduled</label>
            <input type="datetime-local" className={inputCls} disabled={locked} value={localInput(campaign.sms.scheduledAt)} onChange={(event) => setCampaign({ ...campaign, sms: { ...campaign.sms, scheduledAt: event.target.value ? new Date(event.target.value).toISOString() : "" } })} />
          </article>

          <article className={`${cardCls} p-4`}>
            <h2 className="text-sm font-extrabold uppercase tracking-widest text-gray-900">Posts</h2>
            <p className="mt-1 text-xs text-gray-500">Copy, download, or queue. Nothing is posted to a network from here.</p>
            <div className="mt-3 space-y-3">
              {campaign.posts.map((post, index) => (
                <div key={post.id} className="rounded-xl bg-[#f5f2ea] p-3">
                  <label className={labelCls}>Platform</label>
                  <select
                    className={inputCls}
                    disabled={locked}
                    value={post.platform}
                    onChange={(event) => updatePost(campaign, index, { platform: event.target.value as PostPlatform }, setCampaign)}
                  >
                    {POST_PLATFORMS.map((platform) => <option key={platform.id} value={platform.id}>{platform.label}</option>)}
                  </select>
                  <textarea className={`${inputCls} mt-2`} rows={3} disabled={locked} value={post.copy} onChange={(event) => updatePost(campaign, index, { copy: event.target.value }, setCampaign)} />
                  {post.mediaUrl ? <img src={post.mediaUrl} alt={post.mediaName || "Post media"} className="mt-2 h-24 w-full rounded-xl object-cover" /> : null}
                  <input className={`${inputCls} mt-2`} disabled={locked} placeholder="Media URL" value={post.mediaUrl} onChange={(event) => updatePost(campaign, index, { mediaUrl: event.target.value }, setCampaign)} />
                  <label className={`${labelCls} mt-2`}>Scheduled</label>
                  <input type="datetime-local" className={inputCls} disabled={locked} value={localInput(post.scheduledAt)} onChange={(event) => updatePost(campaign, index, { scheduledAt: event.target.value ? new Date(event.target.value).toISOString() : "" }, setCampaign)} />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" className={ghostCls} onClick={() => copyPost(post).catch(() => setError("Could not copy."))}>Copy</button>
                    <button type="button" className={ghostCls} onClick={() => downloadPost(post)}>Download</button>
                    <button type="button" className={ghostCls} disabled={busy === post.id} onClick={() => queuePost(post)}>{post.queuedAt ? "Queued" : "Queue handoff"}</button>
                  </div>
                </div>
              ))}
            </div>
            {!locked ? (
              <button
                type="button"
                className={`${ghostCls} mt-3`}
                onClick={() => setCampaign({
                  ...campaign,
                  posts: [...campaign.posts, { id: `post-${Date.now()}`, platform: "facebook", copy: "", mediaUrl: "", mediaName: "", scheduledAt: "", queuedAt: "" }],
                })}
              >
                Add post
              </button>
            ) : null}
          </article>
        </div>

        <section className="rounded-2xl border border-[#e8c872] bg-white p-4 shadow-sm" data-testid="campaign-review">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#0f766e]">Review</p>
          <h2 className="mt-1 text-xl font-black text-gray-900">What this is for</h2>
          <p className="mt-2 text-sm text-gray-700">{campaign.purpose || "Add a purpose before this goes out."}</p>
          <div className="mt-4 grid gap-3 md:grid-cols-[240px_1fr]">
            <label>
              <span className={labelCls}>Audience</span>
              <select className={inputCls} data-testid="audience-picker" value={campaign.segmentId} onChange={(event) => changeSegment(event.target.value)}>
                <option value="">All contacts</option>
                {segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.name}</option>)}
              </select>
            </label>
            <div>
              <p className="text-3xl font-black text-gray-900" data-testid="audience-count">{audience ? audience.emailCount : "—"}</p>
              <p className="text-xs font-semibold text-gray-500">
                email recipients · {audience?.smsCount ?? "—"} texts · {audience?.unsubscribe ?? 0} unsubscribed · {audience?.bounce ?? 0} bounced · {audience?.doNotContact ?? 0} do not contact
              </p>
              <p className="mt-1 text-xs text-gray-400">{audience?.sheetNote}{audience?.truncated ? " The count stopped at the page limit." : ""}</p>
            </div>
          </div>
          <ul className="mt-3 max-h-40 space-y-1 overflow-auto text-sm text-gray-700">
            {(audience?.recipients || []).map((person) => (
              <li key={`${person.email}-${person.phone}`}>{person.name} · {person.email || person.phone} · {person.channels.join(", ")}</li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={buttonCls} data-testid="send-test" disabled={busy === "test"} onClick={sendTest}>
              {busy === "test" ? "Sending test" : "Send test to me"}
            </button>
            {isAdmin && campaign.status === "ready" ? (
              <button type="button" className={buttonCls} disabled={busy === "approved"} onClick={() => setStatus("approved")}>Approve</button>
            ) : null}
            {!isAdmin ? <p className="self-center text-xs text-gray-500">Only an admin can move this to Approved.</p> : null}
            <button type="button" className={ghostCls} disabled={locked || busy === "save"} onClick={save}>{busy === "save" ? "Saving" : "Save"}</button>
          </div>
          {testResult ? (
            <div className="mt-4 rounded-xl bg-[#f5f2ea] p-3" data-testid="test-send-result">
              <p className="text-sm font-semibold text-gray-900">{testResult.note}</p>
              {testResult.lines.map((line) => (
                <p key={line.to} className="mt-1 text-sm text-gray-600">{line.channel} → {line.to} · {line.detail}</p>
              ))}
            </div>
          ) : null}
        </section>

        <section className={`${cardCls} p-4`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-extrabold uppercase tracking-widest text-gray-900">Send</h2>
              <p className="text-sm text-gray-500">{live ? "This will email and text the audience." : "CAMPAIGN_SEND_LIVE is off, so this records who would get what."}</p>
            </div>
            <button type="button" className={buttonCls} data-testid="send-campaign" disabled={busy === "send" || locked} onClick={send}>
              {busy === "send" ? "Working" : "Send"}
            </button>
          </div>
          {dryRun ? (
            <div className="mt-4" data-testid="dry-run-log">
              <p className="text-sm font-semibold text-gray-900">{dryRun.note}</p>
              <ul className="mt-2 max-h-64 space-y-1 overflow-auto text-sm text-gray-700">
                {dryRun.lines.map((line, index) => (
                  <li key={`${line.channel}-${line.to}-${index}`}><span className="font-extrabold uppercase tracking-widest text-[#0f766e]">{line.channel}</span> {line.name} → {line.to}: {line.detail}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section className={`${cardCls} p-4`} data-testid="campaign-report">
          <h2 className="text-sm font-extrabold uppercase tracking-widest text-gray-900">Report</h2>
          <p className="mt-1 text-xs text-gray-500">Opens and clicks count when someone loads the tracking image or a tracked link. SMTP does not report those on its own. Twilio STOP counts as unsubscribed. Other replies count when the inbound text matches a number we texted.</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-xl bg-[#f5f2ea] p-3">
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-400">{stat.label}</p>
                <p className="text-2xl font-black text-gray-900">{stat.value}</p>
              </div>
            ))}
          </div>
          {campaign.stats.failed > 0 ? <p className="mt-2 text-sm font-semibold text-red-700">{campaign.stats.failed} failed.</p> : null}
        </section>
      </div>
    </CampaignFrame>
  );
}

function localInput(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function updatePost(
  campaign: ChannelCampaign,
  index: number,
  patch: Partial<CampaignPost>,
  setCampaign: (campaign: ChannelCampaign) => void,
) {
  setCampaign({
    ...campaign,
    posts: campaign.posts.map((post, itemIndex) => itemIndex === index ? { ...post, ...patch } : post),
  }  );
}
