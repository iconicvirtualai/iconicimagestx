import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { marketingApi } from "@/lib/marketingApi";
import MarketingFrame, { buttonCls, cardCls, inputCls, labelCls } from "@/components/marketing/MarketingFrame";

interface ContactDetail {
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  phone: string;
  tags: string[];
  source: string;
  clientId: string;
  emailVerified: boolean;
  name: string;
  suppressed: string;
  custom: Record<string, string>;
}

interface Activity {
  id: string;
  type: string;
  at: string;
  detail: string;
  campaignName: string;
}

export default function ContactDetailPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const email = params.get("email") || "";
  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [tag, setTag] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const data = await marketingApi<{ contact: ContactDetail; activity: Activity[] }>(
      () => user?.getIdToken(),
      `/api/marketing/contacts/detail?email=${encodeURIComponent(email)}`,
    );
    setContact(data.contact);
    setActivity(data.activity);
  }

  useEffect(() => {
    if (!email) return;
    load().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load this contact."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, email]);

  async function changeTag(mode: "add" | "remove", value: string) {
    await marketingApi(() => user?.getIdToken(), "/api/marketing/contacts/tags", {
      method: "POST",
      body: JSON.stringify({ emails: [email], add: mode === "add" ? [value] : [], remove: mode === "remove" ? [value] : [] }),
    });
    setTag("");
    await load();
  }

  async function markVerified() {
    if (!contact) return;
    await marketingApi(() => user?.getIdToken(), "/api/marketing/contacts", {
      method: "POST",
      body: JSON.stringify({ ...contact, emailVerified: true }),
    });
    await load();
  }

  return (
    <MarketingFrame title={contact?.name || "Contact"} subtitle={email}>
      <Link to="/admin/communications/email/contacts" className="mb-4 inline-block text-[10px] font-black uppercase tracking-widest text-[#0d9488]">Back to contacts</Link>
      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
      {contact ? (
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <section className={`${cardCls} p-5`}>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div><dt className={labelCls}>Email</dt><dd className="font-semibold">{contact.email}</dd></div>
              <div><dt className={labelCls}>Phone</dt><dd className="font-semibold">{contact.phone || "—"}</dd></div>
              <div><dt className={labelCls}>Company</dt><dd className="font-semibold">{contact.company || "—"}</dd></div>
              <div><dt className={labelCls}>Source</dt><dd className="font-semibold">{contact.clientId ? "Customer" : contact.source}</dd></div>
            </dl>
            {contact.clientId ? (
              <Link className="mt-4 inline-block text-sm font-bold text-[#0d9488]" to={`/admin/customers/${contact.clientId}`}>Open customer record</Link>
            ) : null}
            {contact.suppressed ? <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">Do not email · {contact.suppressed}</p> : null}
            {!contact.emailVerified ? (
              <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-amber-50 px-3 py-2">
                <p className="text-sm font-semibold text-amber-800">Imported and never verified.</p>
                <button type="button" className={buttonCls} onClick={() => markVerified().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not update."))} >Mark verified</button>
              </div>
            ) : null}
            <div className="mt-5">
              <p className={labelCls}>Tags</p>
              <div className="mb-3 flex flex-wrap gap-2">
                {contact.tags.map((item) => (
                  <button key={item} type="button" className="rounded-full bg-teal-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-teal-800" onClick={() => changeTag("remove", item).catch(() => undefined)}>
                    {item} ×
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input className={inputCls} value={tag} placeholder="Add a tag" onChange={(event) => setTag(event.target.value)} />
                <button type="button" className={buttonCls} onClick={() => tag.trim() && changeTag("add", tag).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not add the tag."))}>Add</button>
              </div>
            </div>
          </section>
          <section className={`${cardCls} p-5`}>
            <h2 className="text-sm font-black uppercase tracking-widest text-gray-900">Activity</h2>
            <p className="mt-1 text-xs text-gray-500">Campaigns, opens, clicks, bounces, and unsubscribes show up here after a send.</p>
            <ol className="mt-4 space-y-3">
              {activity.length === 0 ? <li className="text-sm text-gray-500">No marketing activity yet.</li> : activity.map((event) => (
                <li key={event.id} className="border-l-2 border-[#0d9488] pl-3">
                  <p className="text-xs font-black uppercase tracking-widest text-[#0d9488]">{event.type}</p>
                  <p className="text-sm font-semibold text-gray-900">{event.detail || event.campaignName || "Marketing email"}</p>
                  <p className="text-xs text-gray-500">{new Date(event.at).toLocaleString()}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      ) : null}
    </MarketingFrame>
  );
}
