import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { marketingApi } from "@/lib/marketingApi";
import MarketingFrame, { buttonCls, cardCls, ghostCls, inputCls, labelCls } from "@/components/marketing/MarketingFrame";

interface ContactRow {
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
}

export default function ContactsPage() {
  const { user } = useAuth();
  const token = () => user?.getIdToken();
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [source, setSource] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [tagEdit, setTagEdit] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ email: "", firstName: "", lastName: "", company: "", phone: "" });

  async function load(next?: { q?: string; tag?: string; source?: string }) {
    const params = new URLSearchParams();
    const q = next?.q ?? query;
    const tagValue = next?.tag ?? tag;
    const sourceValue = next?.source ?? source;
    if (q) params.set("q", q);
    if (tagValue) params.set("tag", tagValue);
    if (sourceValue) params.set("source", sourceValue);
    const data = await marketingApi<{ contacts: ContactRow[]; tags: string[]; total: number }>(
      token,
      `/api/marketing/contacts?${params.toString()}`,
    );
    setContacts(data.contacts);
    setTags(data.tags);
    setTotal(data.total);
    setSelected([]);
  }

  useEffect(() => {
    load().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load contacts."));
    // Initial load only. Filters call load themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function syncCustomers() {
    setError("");
    try {
      const result = await marketingApi<{ created: number; relinked: number; total: number }>(token, "/api/marketing/contacts/sync", { method: "POST" });
      setNotice(`Synced customers. ${result.created} new, ${result.relinked} moved, ${result.total} contacts.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed.");
    }
  }

  async function applyTags(mode: "add" | "remove") {
    if (!selected.length || !tagEdit.trim()) return;
    setError("");
    try {
      await marketingApi(token, "/api/marketing/contacts/tags", {
        method: "POST",
        body: JSON.stringify({
          emails: selected,
          add: mode === "add" ? [tagEdit] : [],
          remove: mode === "remove" ? [tagEdit] : [],
        }),
      });
      setNotice(`${mode === "add" ? "Added" : "Removed"} “${tagEdit.trim()}” on ${selected.length} contact${selected.length === 1 ? "" : "s"}.`);
      setTagEdit("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update tags.");
    }
  }

  async function saveContact(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await marketingApi(token, "/api/marketing/contacts", { method: "POST", body: JSON.stringify(form) });
      setAdding(false);
      setForm({ email: "", firstName: "", lastName: "", company: "", phone: "" });
      setNotice("Contact saved.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the contact.");
    }
  }

  function toggle(email: string) {
    setSelected((current) => current.includes(email) ? current.filter((item) => item !== email) : [...current, email]);
  }

  return (
    <MarketingFrame
      title="Contacts"
      subtitle={`${total} people. Filter by tag, then add or remove a tag on the ones you select.`}
      action={<button type="button" className={buttonCls} onClick={() => setAdding((open) => !open)}>Add contact</button>}
    >
      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
      {notice ? <p className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-800">{notice}</p> : null}

      {adding ? (
        <form onSubmit={saveContact} className={`${cardCls} mb-4 grid gap-3 p-4 sm:grid-cols-5`}>
          <label className="sm:col-span-2"><span className={labelCls}>Email</span><input className={inputCls} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label>
          <label><span className={labelCls}>First</span><input className={inputCls} value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} /></label>
          <label><span className={labelCls}>Last</span><input className={inputCls} value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} /></label>
          <div className="flex items-end"><button className={buttonCls} type="submit">Save</button></div>
        </form>
      ) : null}

      <div className={`${cardCls} mb-4 flex flex-wrap items-end gap-3 p-4`}>
        <label className="min-w-[180px] flex-1">
          <span className={labelCls}>Search</span>
          <input className={inputCls} value={query} placeholder="Name, email, company" onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") load().catch(() => undefined); }} />
        </label>
        <label>
          <span className={labelCls}>Tag</span>
          <select className={inputCls} value={tag} onChange={(event) => { setTag(event.target.value); load({ tag: event.target.value }).catch(() => undefined); }}>
            <option value="">All tags</option>
            {tags.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span className={labelCls}>Source</span>
          <select className={inputCls} value={source} onChange={(event) => { setSource(event.target.value); load({ source: event.target.value }).catch(() => undefined); }}>
            <option value="">Everyone</option>
            <option value="client">Customers</option>
            <option value="import">Imported</option>
            <option value="manual">Added here</option>
          </select>
        </label>
        <button type="button" className={ghostCls} onClick={() => load().catch(() => undefined)}>Search</button>
        <button type="button" className={ghostCls} onClick={syncCustomers}>Sync customers</button>
      </div>

      {selected.length ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl bg-[#0a0a0a] px-4 py-3 text-white">
          <span className="text-xs font-black uppercase tracking-widest text-teal-300">{selected.length} selected</span>
          <input className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm" placeholder="Tag" value={tagEdit} onChange={(event) => setTagEdit(event.target.value)} />
          <button type="button" className={buttonCls} onClick={() => applyTags("add")}>Add tag</button>
          <button type="button" className={ghostCls} onClick={() => applyTags("remove")}>Remove tag</button>
        </div>
      ) : null}

      <div className={`${cardCls} overflow-hidden`}>
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-[10px] font-black uppercase tracking-widest text-gray-400">
            <tr>
              <th className="px-4 py-3"></th>
              <th className="px-4 py-3">Person</th>
              <th className="px-4 py-3">Tags</th>
              <th className="px-4 py-3">Source</th>
            </tr>
          </thead>
          <tbody>
            {contacts.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-gray-500">No contacts yet. Import a file or sync customers.</td></tr>
            ) : contacts.map((contact) => (
              <tr key={contact.email} className="border-t border-gray-100">
                <td className="px-4 py-3">
                  <input type="checkbox" checked={selected.includes(contact.email)} onChange={() => toggle(contact.email)} aria-label={`Select ${contact.email}`} />
                </td>
                <td className="px-4 py-3">
                  <Link className="font-bold text-gray-900 hover:text-[#0d9488]" to={`/admin/communications/email/contacts/view?email=${encodeURIComponent(contact.email)}`}>
                    {contact.name}
                  </Link>
                  <p className="text-xs text-gray-500">{contact.email}{contact.company ? ` · ${contact.company}` : ""}</p>
                  {contact.suppressed ? <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-red-600">{contact.suppressed}</p> : null}
                  {!contact.emailVerified ? <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-amber-600">Never verified</p> : null}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {contact.tags.map((item) => <span key={item} className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-teal-800">{item}</span>)}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs font-bold uppercase tracking-widest text-gray-500">
                  {contact.clientId ? "Customer" : contact.source}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </MarketingFrame>
  );
}
