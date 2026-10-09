import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { marketingApi } from "@/lib/marketingApi";
import { applyMerge } from "@shared/emailMarketing/merge";
import MarketingFrame, { buttonCls, cardCls, ghostCls, inputCls, labelCls } from "@/components/marketing/MarketingFrame";

interface Segment { id: string; name: string; count?: number }
interface Template { id: string; name: string; subject: string; preheader: string; html: string }
interface Campaign {
  id: string;
  name: string;
  status: string;
  audienceMode: "all" | "segment" | "tags";
  segmentId: string;
  tags: string[];
  subject: string;
  preheader: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  html: string;
  templateId: string;
}
interface Confirmation {
  token: string;
  recipientCount: number;
  suppressed: number;
  frequencyCapped: number;
  overlapHeld: number;
  duplicatesRemoved: number;
  unverified: number;
  warnings: string[];
  removedPreview: { email: string; reason: string; detail: string }[];
  fromEmail: string;
}
interface SendingAccount { email: string; label: string }

const STEPS = ["Audience", "Setup", "Content", "Preview", "Test", "Confirm"];

export default function CampaignBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const token = () => user?.getIdToken();
  const [step, setStep] = useState(0);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [sampleFirst, setSampleFirst] = useState("Ada");
  const [testTo, setTestTo] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [overlapOverride, setOverlapOverride] = useState(false);
  const [scheduleLocal, setScheduleLocal] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [accounts, setAccounts] = useState<SendingAccount[]>([]);
  const [newFromLabel, setNewFromLabel] = useState("News");
  const [newFromEmail, setNewFromEmail] = useState("");
  const [tagsText, setTagsText] = useState("");
  const loadedId = useRef("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const listed = await marketingApi<{ segments: Segment[] }>(token, "/api/marketing/segments");
      const saved = await marketingApi<{ templates: Template[] }>(token, "/api/marketing/templates");
      const rules = await marketingApi<{ settings: { sendingAccounts: SendingAccount[] } }>(token, "/api/marketing/settings");
      if (cancelled) return;
      setSegments(listed.segments);
      setTemplates(saved.templates);
      setAccounts(rules.settings.sendingAccounts || []);
      if (!id || id === "new") {
        const created = await marketingApi<{ campaign: Campaign }>(token, "/api/marketing/campaigns", { method: "POST", body: JSON.stringify({ name: "Untitled campaign" }) });
        if (!cancelled) navigate(`/admin/communications/email/campaigns/${created.campaign.id}`, { replace: true });
        return;
      }
      if (loadedId.current === id) return;
      const data = await marketingApi<{ campaign: Campaign }>(token, `/api/marketing/campaigns/${id}`);
      if (!cancelled) {
        loadedId.current = id;
        setCampaign(data.campaign);
        setTagsText(data.campaign.tags.join(", "));
      }
    }
    load().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not open the campaign."));
    return () => { cancelled = true; };
    // Load once per campaign id. Repeating this when the auth object changes wiped subject and from-address edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.uid]);

  const previewHtml = useMemo(() => {
    if (!campaign) return "";
    return applyMerge(campaign.html, {
      FirstName: sampleFirst,
      LastName: "Lovelace",
      Email: "ada@example.com",
      Company: "Iconic Images",
      UnsubscribeUrl: "/unsubscribe",
    });
  }, [campaign, sampleFirst]);

  async function addSendingAccount() {
    const email = newFromEmail.trim();
    if (!email.includes("@")) {
      setError("Enter the full from address, such as news@iconicimagestx.com.");
      return;
    }
    const data = await marketingApi<{ settings: { sendingAccounts: SendingAccount[] } }>(token, "/api/marketing/settings", {
      method: "POST",
      body: JSON.stringify({ sendingAccounts: [...accounts, { email, label: newFromLabel.trim() || "News" }] }),
    });
    const saved = data.settings.sendingAccounts;
    setAccounts(saved);
    const match = saved.find((account) => account.email === email.toLowerCase());
    if (match && campaign) {
      setCampaign({
        ...campaign,
        fromEmail: match.email,
        replyTo: campaign.replyTo === campaign.fromEmail ? match.email : campaign.replyTo,
      });
    }
    setNewFromEmail("");
    setNotice(`${match?.email || email} is available as a from address.`);
    setError("");
  }

  async function save(next = campaign) {
    if (!next) return;
    const data = await marketingApi<{ campaign: Campaign }>(token, `/api/marketing/campaigns/${next.id}`, {
      method: "POST",
      body: JSON.stringify(next),
    });
    setCampaign(data.campaign);
    setConfirmation(null);
  }

  async function saveTemplate() {
    if (!campaign) return;
    const name = window.prompt("Template name");
    if (!name) return;
    await marketingApi(token, "/api/marketing/templates", {
      method: "POST",
      body: JSON.stringify({ name, subject: campaign.subject, preheader: campaign.preheader, html: campaign.html }),
    });
    const saved = await marketingApi<{ templates: Template[] }>(token, "/api/marketing/templates");
    setTemplates(saved.templates);
    setNotice("Template saved.");
  }

  async function review() {
    if (!campaign) return;
    setError("");
    await save();
    const data = await marketingApi<{ confirmation: Confirmation }>(token, `/api/marketing/campaigns/${campaign.id}/preview`, {
      method: "POST",
      body: JSON.stringify({ overlapOverride, scheduleLocal }),
    });
    setConfirmation(data.confirmation);
    setAccepted(false);
    setStep(5);
  }

  async function send(mode: "now" | "later") {
    if (!campaign || !confirmation || !accepted) return;
    setError("");
    const data = await marketingApi<{ campaign?: Campaign; confirmation?: Confirmation; error?: string }>(token, `/api/marketing/campaigns/${campaign.id}/send`, {
      method: "POST",
      body: JSON.stringify({
        token: confirmation.token,
        overlapOverride,
        scheduleLocal: mode === "later" ? scheduleLocal : "",
      }),
    }).catch(async (err: unknown) => {
      const message = err instanceof Error ? err.message : "Send failed.";
      if (message.includes("Review the recipient count")) {
        const again = await marketingApi<{ confirmation: Confirmation }>(token, `/api/marketing/campaigns/${campaign.id}/preview`, {
          method: "POST",
          body: JSON.stringify({ overlapOverride, scheduleLocal: mode === "later" ? scheduleLocal : "" }),
        });
        setConfirmation(again.confirmation);
        setAccepted(false);
      }
      throw new Error(message);
    });
    if (data.campaign) navigate(`/admin/communications/email/campaigns/${campaign.id}/report`);
  }

  async function sendTest() {
    if (!campaign) return;
    setError("");
    setNotice("");
    await save();
    await marketingApi(token, `/api/marketing/campaigns/${campaign.id}/test`, {
      method: "POST",
      body: JSON.stringify({ to: testTo }),
    });
    setNotice(`Test queued for ${testTo}.`);
  }

  if (!campaign) {
    return <MarketingFrame title="Campaign">{error ? <p className="text-sm font-semibold text-red-700">{error}</p> : <p className="text-sm text-gray-500">Loading campaign…</p>}</MarketingFrame>;
  }

  return (
    <MarketingFrame title={campaign.name} subtitle="Audience, message, preview, test, then an explicit confirm.">
      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
      {notice ? <p className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-800">{notice}</p> : null}
      <ol className="mb-4 flex gap-2 overflow-x-auto">
        {STEPS.map((label, index) => (
          <li key={label}>
            <button type="button" onClick={() => { if (index === step) return; save().then(() => setStep(index)).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not save.")); }} className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${step === index ? "bg-[#0d9488] text-white" : "bg-white text-gray-500"}`}>
              {index + 1} {label}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <section className={`${cardCls} space-y-4 p-5`}>
          <label><span className={labelCls}>Campaign name</span><input className={inputCls} value={campaign.name} onChange={(event) => setCampaign({ ...campaign, name: event.target.value })} /></label>
          <div className="grid gap-3 md:grid-cols-3">
            {(["all", "segment", "tags"] as const).map((mode) => (
              <button key={mode} type="button" className={`${campaign.audienceMode === mode ? buttonCls : ghostCls}`} onClick={() => setCampaign({ ...campaign, audienceMode: mode })}>
                {mode === "all" ? "All contacts" : mode === "segment" ? "Saved segment" : "Tags"}
              </button>
            ))}
          </div>
          {campaign.audienceMode === "segment" ? (
            <label><span className={labelCls}>Segment</span>
              <select className={inputCls} value={campaign.segmentId} onChange={(event) => setCampaign({ ...campaign, segmentId: event.target.value })}>
                <option value="">Choose</option>
                {segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.name}</option>)}
              </select>
            </label>
          ) : null}
          {campaign.audienceMode === "tags" ? (
            <label><span className={labelCls}>Tags, comma separated</span>
              <input className={inputCls} value={tagsText} placeholder="vip, austin" onChange={(event) => { setTagsText(event.target.value); setCampaign({ ...campaign, tags: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) }); }} />
            </label>
          ) : null}
          <button type="button" className={buttonCls} onClick={() => save().then(() => setStep(1)).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not save."))}>Continue</button>
        </section>
      ) : null}

      {step === 1 ? (
        <section className={`${cardCls} grid gap-3 p-5 md:grid-cols-2`}>
          <label className="md:col-span-2"><span className={labelCls}>Subject</span><input className={inputCls} value={campaign.subject} onChange={(event) => setCampaign({ ...campaign, subject: event.target.value })} /></label>
          <label className="md:col-span-2"><span className={labelCls}>Preheader</span><input className={inputCls} value={campaign.preheader} onChange={(event) => setCampaign({ ...campaign, preheader: event.target.value })} /></label>
          <label><span className={labelCls}>From name</span><input className={inputCls} value={campaign.fromName} onChange={(event) => setCampaign({ ...campaign, fromName: event.target.value })} /></label>
          <label><span className={labelCls}>Reply-to</span><input className={inputCls} value={campaign.replyTo} onChange={(event) => setCampaign({ ...campaign, replyTo: event.target.value })} /></label>
          <label className="md:col-span-2"><span className={labelCls}>Sending account</span>
            <select className={inputCls} value={campaign.fromEmail} onChange={(event) => {
              const email = event.target.value;
              setCampaign({
                ...campaign,
                fromEmail: email,
                replyTo: campaign.replyTo === campaign.fromEmail ? email : campaign.replyTo,
              });
            }}>
              {accounts.map((account) => <option key={account.email} value={account.email}>{account.label} · {account.email}</option>)}
            </select>
          </label>
          <div className="md:col-span-2 grid gap-2 md:grid-cols-[1fr_1.4fr_auto] md:items-end">
            <label><span className={labelCls}>Add a from address</span><input className={inputCls} value={newFromLabel} onChange={(event) => setNewFromLabel(event.target.value)} placeholder="News" /></label>
            <label><span className={labelCls}>Email</span><input className={inputCls} value={newFromEmail} placeholder="news@iconicimagestx.com" onChange={(event) => setNewFromEmail(event.target.value)} /></label>
            <button type="button" className={ghostCls} onClick={() => addSendingAccount().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not add that address."))}>Add</button>
          </div>
          <p className="md:col-span-2 text-xs text-gray-500">photos@iconicimagestx.com sends today. A future mailbox such as news@ can be chosen per campaign after it is a Send mail as alias on the Gmail connected to GMass. Adding it here does not change that connected Gmail.</p>
          <button type="button" className={buttonCls} onClick={() => save().then(() => setStep(2)).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not save."))}>Continue</button>
        </section>
      ) : null}

      {step === 2 ? (
        <section className={`${cardCls} p-5`}>
          <div className="mb-3 flex flex-wrap gap-2">
            {["{FirstName|there}", "{LastName}", "{Company|Iconic}", "{UnsubscribeUrl}"].map((tag) => (
              <button key={tag} type="button" className={ghostCls} onClick={() => setCampaign({ ...campaign, html: `${campaign.html}${tag}` })}>{tag}</button>
            ))}
            <select className={inputCls} value="" onChange={(event) => {
              const chosen = templates.find((item) => item.id === event.target.value);
              if (!chosen) return;
              setCampaign({ ...campaign, html: chosen.html, subject: chosen.subject || campaign.subject, preheader: chosen.preheader || campaign.preheader, templateId: chosen.id });
            }}>
              <option value="">Use a template</option>
              {templates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <button type="button" className={ghostCls} onClick={() => saveTemplate().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not save the template."))}>Save as template</button>
          </div>
          <textarea className={`${inputCls} min-h-64 font-mono text-xs`} value={campaign.html} onChange={(event) => setCampaign({ ...campaign, html: event.target.value })} />
          <p className="mt-2 text-xs text-gray-500">GMass sends one HTML body for the whole campaign. {"{FirstName|there}"} uses the name in preview and test sends, and the fallback in the live campaign unless the address is on a Google Sheet list. The API cannot create that sheet.</p>
          <button type="button" className={`${buttonCls} mt-3`} onClick={() => save().then(() => setStep(3)).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not save."))}>Continue</button>
        </section>
      ) : null}

      {step === 3 ? (
        <section className={`${cardCls} p-5`}>
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <label><span className={labelCls}>Sample first name</span><input className={inputCls} value={sampleFirst} onChange={(event) => setSampleFirst(event.target.value)} /></label>
            <button type="button" className={previewMode === "desktop" ? buttonCls : ghostCls} onClick={() => setPreviewMode("desktop")}>Desktop</button>
            <button type="button" className={previewMode === "mobile" ? buttonCls : ghostCls} onClick={() => setPreviewMode("mobile")}>Mobile</button>
          </div>
          <p className="mb-2 text-sm text-gray-600"><strong>{campaign.subject || "No subject"}</strong> <span className="text-gray-400">{campaign.preheader}</span></p>
          <div className={`mx-auto overflow-hidden rounded-2xl border border-gray-200 bg-white ${previewMode === "mobile" ? "max-w-[375px]" : "max-w-3xl"}`}>
            <iframe title="Email preview" sandbox="" className="h-[420px] w-full" srcDoc={previewHtml} />
          </div>
          <button type="button" className={`${buttonCls} mt-4`} onClick={() => setStep(4)}>Continue</button>
        </section>
      ) : null}

      {step === 4 ? (
        <section className={`${cardCls} p-5`}>
          <label><span className={labelCls}>Send a test to</span><input className={inputCls} value={testTo} placeholder="you@iconicimagestx.com" onChange={(event) => setTestTo(event.target.value)} /></label>
          <p className="mt-2 text-xs text-gray-500">A test uses GMass transactional email and still requires the send lock to be on. It does not count toward the frequency cap.</p>
          <div className="mt-4 flex gap-2">
            <button type="button" className={buttonCls} onClick={() => sendTest().catch((err: unknown) => setError(err instanceof Error ? err.message : "Test failed."))}>Send test</button>
            <button type="button" className={ghostCls} onClick={() => setStep(5)}>Skip to confirm</button>
          </div>
        </section>
      ) : null}

      {step === 5 ? (
        <section className={`${cardCls} p-5`}>
          <button type="button" className={buttonCls} onClick={() => review().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not review the list."))}>Calculate recipients</button>
          {confirmation ? (
            <div className="mt-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">After suppression</p>
              <p className="text-5xl font-black text-gray-900">{confirmation.recipientCount}</p>
              <p className="mt-1 text-sm font-semibold text-red-700">{confirmation.suppressed} removed by the do-not-email list</p>
              <p className="mt-2 text-sm text-gray-700">From <strong>{campaign.fromName || "Iconic Images"}</strong> &lt;{confirmation.fromEmail || campaign.fromEmail}&gt;</p>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <div className="rounded-xl bg-gray-50 p-3"><dt className={labelCls}>Frequency cap</dt><dd className="text-xl font-black">{confirmation.frequencyCapped}</dd></div>
                <div className="rounded-xl bg-gray-50 p-3"><dt className={labelCls}>Overlap</dt><dd className="text-xl font-black">{confirmation.overlapHeld}</dd></div>
                <div className="rounded-xl bg-gray-50 p-3"><dt className={labelCls}>Duplicates</dt><dd className="text-xl font-black">{confirmation.duplicatesRemoved}</dd></div>
                <div className="rounded-xl bg-amber-50 p-3"><dt className={labelCls}>Never verified</dt><dd className="text-xl font-black">{confirmation.unverified}</dd></div>
              </dl>
              {confirmation.warnings.map((warning) => <p key={warning} className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">{warning}</p>)}
              {confirmation.overlapHeld > 0 ? (
                <label className="mt-3 flex items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" checked={overlapOverride} onChange={(event) => { setOverlapOverride(event.target.checked); setConfirmation(null); }} />
                  Send to people who already got another campaign in this window
                </label>
              ) : null}
              <ul className="mt-3 max-h-36 space-y-1 overflow-auto text-xs text-gray-600">
                {confirmation.removedPreview.map((item) => <li key={`${item.email}-${item.reason}`}>{item.email} · {item.detail}</li>)}
              </ul>
              <label className="mt-4 block"><span className={labelCls}>Schedule, America/Chicago</span><input className={inputCls} type="datetime-local" value={scheduleLocal} onChange={(event) => { setScheduleLocal(event.target.value); setConfirmation(null); }} /></label>
              <label className="mt-4 flex items-start gap-2 text-sm font-semibold text-gray-800">
                <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
                I confirm this send to {confirmation.recipientCount} people after {confirmation.suppressed} were removed.
              </label>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" disabled={!accepted} className={buttonCls} onClick={() => send("now").catch((err: unknown) => setError(err instanceof Error ? err.message : "Send failed."))}>Send now</button>
                <button type="button" disabled={!accepted || !scheduleLocal} className={ghostCls} onClick={() => send("later").catch((err: unknown) => setError(err instanceof Error ? err.message : "Schedule failed."))}>Schedule</button>
              </div>
            </div>
          ) : null}
          <Link to="/admin/communications/email/campaigns" className="mt-6 inline-block text-[10px] font-black uppercase tracking-widest text-[#0d9488]">Back to campaigns</Link>
        </section>
      ) : null}
    </MarketingFrame>
  );
}
