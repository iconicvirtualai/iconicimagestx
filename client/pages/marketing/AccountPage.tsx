import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { marketingApi } from "@/lib/marketingApi";
import MarketingFrame, { buttonCls, cardCls, inputCls, labelCls } from "@/components/marketing/MarketingFrame";

interface LinkOut { id: string; label: string; href: string; detail: string }
interface Settings {
  frequencyMax: number;
  frequencyDays: number;
  overlapHours: number;
  gmailDailyLimit: number;
  bounceWarnRate: number;
  bouncePauseRate: number;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  sendingAccounts: { email: string; label: string }[];
}
interface Account {
  configured: boolean;
  writesEnabled: boolean;
  settings: Settings;
  links: LinkOut[];
  inPortal: string[];
  linkOut: string[];
  sendingAccount: string;
  sendingAccounts: { email: string; label: string }[];
  user: Record<string, unknown> | null;
  warmup: unknown;
  domains: unknown;
}

export default function AccountPage() {
  const { user } = useAuth();
  const token = () => user?.getIdToken();
  const [account, setAccount] = useState<Account | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pushEmail, setPushEmail] = useState("");
  const [newLabel, setNewLabel] = useState("News");
  const [newEmail, setNewEmail] = useState("");

  useEffect(() => {
    marketingApi<Account>(token, "/api/marketing/account")
      .then((data) => { setAccount(data); setSettings(data.settings); })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load GMass."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function saveAccounts(next: Settings) {
    const data = await marketingApi<{ settings: Settings }>(token, "/api/marketing/settings", {
      method: "POST",
      body: JSON.stringify(next),
    });
    setSettings(data.settings);
    setAccount((current) => current ? { ...current, settings: data.settings, sendingAccount: data.settings.fromEmail, sendingAccounts: data.settings.sendingAccounts } : current);
    setNotice("Sending accounts saved.");
    setError("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    const data = await marketingApi<{ settings: Settings }>(token, "/api/marketing/settings", {
      method: "POST",
      body: JSON.stringify({
        ...settings,
        bounceWarnRate: Number(settings.bounceWarnRate),
        bouncePauseRate: Number(settings.bouncePauseRate),
      }),
    });
    setSettings(data.settings);
    setNotice("Sending rules saved.");
  }

  async function pushUnsubscribe() {
    await marketingApi(token, "/api/marketing/account/unsubscribes", {
      method: "POST",
      body: JSON.stringify({ email: pushEmail }),
    });
    setNotice(`Pushed ${pushEmail} to the GMass unsubscribe list.`);
  }

  const userFields = account?.user && !("error" in account.user)
    ? Object.entries(account.user).filter(([, value]) => ["string", "number", "boolean"].includes(typeof value)).slice(0, 12)
    : [];

  return (
    <MarketingFrame title="GMass" subtitle="Account details the API actually returns, plus links for billing and the connected Gmail.">
      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
      {notice ? <p className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-800">{notice}</p> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={`${cardCls} p-5`}>
          <h2 className="text-sm font-black uppercase tracking-widest">Connection</h2>
          <p className="mt-2 text-sm text-gray-600">Default from <strong>{account?.sendingAccount || "photos@iconicimagestx.com"}</strong>. Each campaign picks its own from address.</p>
          <p className="mt-1 text-sm font-semibold">{account?.configured ? "API key is set." : "GMASS_API_KEY is not set on the server."}</p>
          <p className="text-sm text-gray-600">{account?.writesEnabled ? "Live sends are enabled." : "Live sends stay off until GMASS_SEND_ENABLED=true."}</p>
          {userFields.length ? (
            <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
              {userFields.map(([key, value]) => (
                <div key={key}><dt className={labelCls}>{key}</dt><dd className="font-semibold break-all">{String(value)}</dd></div>
              ))}
            </dl>
          ) : <p className="mt-4 text-sm text-gray-500">GET /api/user will fill this panel once the key is set. The spec does not list the fields, so whatever GMass returns is shown here.</p>}
          {Array.isArray(account?.warmup) && account.warmup.length ? (
            <p className="mt-3 text-xs text-gray-500">{account.warmup.length} warm-up days from GET /api/user/WarmupStats.</p>
          ) : null}
        </section>
        <section className={`${cardCls} p-5`}>
          <h2 className="text-sm font-black uppercase tracking-widest">Open in GMass</h2>
          <div className="mt-3 space-y-3">
            {(account?.links || []).map((link) => (
              <a key={link.id} href={link.href} target="_blank" rel="noreferrer" className="block rounded-xl border border-gray-100 px-3 py-2 hover:border-[#0d9488]">
                <span className="block text-sm font-black text-gray-900">{link.label}</span>
                <span className="text-xs text-gray-500">{link.detail}</span>
              </a>
            ))}
          </div>
        </section>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className={`${cardCls} p-5`}>
          <h2 className="text-sm font-black uppercase tracking-widest">In this portal</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-gray-600">
            {(account?.inPortal || []).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
        <section className={`${cardCls} p-5`}>
          <h2 className="text-sm font-black uppercase tracking-widest">Dashboard only</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-gray-600">
            {(account?.linkOut || []).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      </div>
      {settings ? (
        <section className={`${cardCls} mt-4 p-5`}>
          <h2 className="text-sm font-black uppercase tracking-widest">Sending accounts</h2>
          <p className="mt-1 text-xs text-gray-500">photos@iconicimagestx.com is ready. Add news@ (or any other Send-as alias) here, then choose it on a campaign. This does not switch the Gmail account connected to GMass.</p>
          <ul className="mt-3 space-y-2">
            {settings.sendingAccounts.map((accountRow) => (
              <li key={accountRow.email} className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2 text-sm">
                <span><strong>{accountRow.label}</strong> · {accountRow.email}{accountRow.email === settings.fromEmail ? " · default" : ""}</span>
                <span className="flex gap-2">
                  {accountRow.email !== settings.fromEmail ? (
                    <button type="button" className="text-[10px] font-black uppercase tracking-widest text-[#0d9488]" onClick={() => saveAccounts({ ...settings, fromEmail: accountRow.email }).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not save."))}>Make default</button>
                  ) : null}
                  {settings.sendingAccounts.length > 1 ? (
                    <button type="button" className="text-[10px] font-black uppercase tracking-widest text-red-700" onClick={() => saveAccounts({
                      ...settings,
                      sendingAccounts: settings.sendingAccounts.filter((item) => item.email !== accountRow.email),
                      fromEmail: settings.fromEmail === accountRow.email ? settings.sendingAccounts.find((item) => item.email !== accountRow.email)?.email || settings.fromEmail : settings.fromEmail,
                    }).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not save."))}>Remove</button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_1.4fr_auto] md:items-end">
            <label><span className={labelCls}>Label</span><input className={inputCls} value={newLabel} onChange={(event) => setNewLabel(event.target.value)} /></label>
            <label><span className={labelCls}>Email</span><input className={inputCls} value={newEmail} placeholder="news@iconicimagestx.com" onChange={(event) => setNewEmail(event.target.value)} /></label>
            <button type="button" className={buttonCls} onClick={() => saveAccounts({
              ...settings,
              sendingAccounts: [...settings.sendingAccounts, { email: newEmail.trim(), label: newLabel.trim() || "News" }],
            }).then(() => setNewEmail("")).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not save."))}>Add address</button>
          </div>
        </section>
      ) : null}
      {settings ? (
        <form onSubmit={(event) => save(event).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not save."))} className={`${cardCls} mt-4 grid gap-3 p-5 md:grid-cols-3`}>
          <h2 className="md:col-span-3 text-sm font-black uppercase tracking-widest">Sending rules</h2>
          <label><span className={labelCls}>Max emails</span><input className={inputCls} type="number" min={0} value={settings.frequencyMax} onChange={(event) => setSettings({ ...settings, frequencyMax: Number(event.target.value) })} /></label>
          <label><span className={labelCls}>Per days</span><input className={inputCls} type="number" min={1} value={settings.frequencyDays} onChange={(event) => setSettings({ ...settings, frequencyDays: Number(event.target.value) })} /></label>
          <label><span className={labelCls}>Overlap hours</span><input className={inputCls} type="number" min={0} value={settings.overlapHours} onChange={(event) => setSettings({ ...settings, overlapHours: Number(event.target.value) })} /></label>
          <label><span className={labelCls}>Gmail daily limit</span><input className={inputCls} type="number" min={1} value={settings.gmailDailyLimit} onChange={(event) => setSettings({ ...settings, gmailDailyLimit: Number(event.target.value) })} /></label>
          <label><span className={labelCls}>Warn bounce rate</span><input className={inputCls} type="number" step="0.01" value={settings.bounceWarnRate} onChange={(event) => setSettings({ ...settings, bounceWarnRate: Number(event.target.value) })} /></label>
          <label><span className={labelCls}>Pause bounce rate</span><input className={inputCls} type="number" step="0.01" value={settings.bouncePauseRate} onChange={(event) => setSettings({ ...settings, bouncePauseRate: Number(event.target.value) })} /></label>
          <div className="md:col-span-3"><button className={buttonCls} type="submit">Save rules</button></div>
        </form>
      ) : null}
      <section className={`${cardCls} mt-4 p-5`}>
        <h2 className="text-sm font-black uppercase tracking-widest">Push one address to GMass</h2>
        <p className="mt-1 text-xs text-gray-500">POST /api/unsubscribes. This does not send email. Our own do-not-email list is still what blocks a campaign.</p>
        <div className="mt-3 flex gap-2">
          <input className={inputCls} value={pushEmail} placeholder="person@example.com" onChange={(event) => setPushEmail(event.target.value)} />
          <button type="button" className={buttonCls} disabled={!account?.configured} onClick={() => pushUnsubscribe().catch((err: unknown) => setError(err instanceof Error ? err.message : "GMass update failed."))}>Push</button>
        </div>
      </section>
    </MarketingFrame>
  );
}
