import * as React from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Users, Search, Plus, Mail, Phone, Pencil, Trash2, Tag, X, Check, Megaphone } from "lucide-react";
import { db } from "@/lib/firebase";
import {
  collection, onSnapshot, doc, updateDoc, addDoc, writeBatch, serverTimestamp,
} from "firebase/firestore";
import { toast } from "sonner";
import {
  asTags, clientInitials, clientName, normEmail, type ClientRecord,
} from "@/lib/clientRecords";

const labelCls = "block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1";
const inputCls = "w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#0d9488]/30";

const EMPTY_FORM = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  company: "",
  address: "",
  group: "",
  status: "active",
  tags: "",
  notes: "",
};

type Outreach = "email" | "text" | "campaign";

function statusClass(status?: string) {
  if (status === "vip") return "bg-purple-50 text-purple-700";
  if (status === "inactive") return "bg-gray-100 text-gray-500";
  return "bg-green-50 text-green-700";
}

export default function AdminCustomerCenter() {
  const navigate = useNavigate();
  const [clients, setClients] = React.useState<ClientRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [groupFilter, setGroupFilter] = React.useState("all");
  const [tagFilter, setTagFilter] = React.useState("all");
  const [selection, setSelection] = React.useState<Set<string>>(new Set());
  const [editing, setEditing] = React.useState<ClientRecord | null | "new">(null);
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);
  const [massOpen, setMassOpen] = React.useState(false);
  const [mass, setMass] = React.useState({ status: "", group: "", setGroup: false, addTag: "", removeTag: "" });
  const [pendingDelete, setPendingDelete] = React.useState<string[]>([]);
  const [outreach, setOutreach] = React.useState<Outreach | null>(null);

  React.useEffect(() => {
    const unsub = onSnapshot(collection(db, "clients"), (snap) => {
      setClients(snap.docs.map((entry) => {
        const data = entry.data();
        return { id: entry.id, ...data, tags: asTags(data.tags) } as ClientRecord;
      }));
      setLoading(false);
      setError("");
    }, (err) => {
      console.error(err);
      setError("Clients could not be loaded. The signed-in admin was not allowed to read the clients collection.");
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const groups = React.useMemo(
    () => Array.from(new Set(clients.map((client) => (client.group || "").trim()).filter(Boolean))).sort(),
    [clients],
  );
  const tags = React.useMemo(
    () => Array.from(new Set(clients.flatMap((client) => asTags(client.tags)))).sort((a, b) => a.localeCompare(b)),
    [clients],
  );

  const filtered = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return clients
      .filter((client) => {
        if (groupFilter !== "all" && (client.group || "") !== groupFilter) return false;
        if (tagFilter !== "all" && !asTags(client.tags).some((tag) => tag.toLowerCase() === tagFilter.toLowerCase())) return false;
        if (!query) return true;
        const haystack = [
          clientName(client),
          client.email,
          client.phone,
          client.company,
          client.group,
          ...asTags(client.tags),
        ].join(" ").toLowerCase();
        return haystack.includes(query);
      })
      .sort((a, b) => clientName(a).localeCompare(clientName(b)));
  }, [clients, search, groupFilter, tagFilter]);

  const selectedClients = clients.filter((client) => selection.has(client.id));

  const toggle = (id: string) => {
    setSelection((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const ids = filtered.map((client) => client.id);
    const allOn = ids.length > 0 && ids.every((id) => selection.has(id));
    setSelection((current) => {
      const next = new Set(current);
      ids.forEach((id) => (allOn ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const openEdit = (client: ClientRecord) => {
    setEditing(client);
    setForm({
      firstName: client.firstName || "",
      lastName: client.lastName || "",
      email: client.email || "",
      phone: client.phone || "",
      company: client.company || "",
      address: client.address || "",
      group: client.group || "",
      status: client.status || "active",
      tags: asTags(client.tags).join(", "),
      notes: client.notes || "",
    });
  };

  const openNew = () => {
    setEditing("new");
    setForm(EMPTY_FORM);
  };

  const saveOne = async () => {
    if (!form.firstName.trim() || !form.email.trim()) {
      toast.error("First name and email are required.");
      return;
    }
    setSaving(true);
    const payload = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: normEmail(form.email),
      phone: form.phone.trim(),
      company: form.company.trim(),
      address: form.address.trim(),
      group: form.group.trim(),
      status: form.status || "active",
      tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      notes: form.notes.trim(),
      updatedAt: serverTimestamp(),
    };
    try {
      if (editing === "new") {
        await addDoc(collection(db, "clients"), {
          ...payload,
          totalOrders: 0,
          totalSpend: 0,
          portalAccess: false,
          createdAt: serverTimestamp(),
        });
        toast.success("Client added.");
      } else if (editing) {
        await updateDoc(doc(db, "clients", editing.id), payload);
        toast.success("Client saved.");
      }
      setEditing(null);
    } catch (err) {
      console.error(err);
      toast.error("Could not save this client.");
    } finally {
      setSaving(false);
    }
  };

  const applyMass = async () => {
    if (selection.size === 0) return;
    if (!mass.status && !mass.setGroup && !mass.addTag.trim() && !mass.removeTag.trim()) {
      toast.error("Choose a status, group, or tag to apply.");
      return;
    }
    setSaving(true);
    try {
      const batch = writeBatch(db);
      selectedClients.forEach((client) => {
        const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };
        if (mass.status) patch.status = mass.status;
        if (mass.setGroup) patch.group = mass.group.trim();
        let nextTags = asTags(client.tags);
        if (mass.addTag.trim()) nextTags = Array.from(new Set([...nextTags, mass.addTag.trim()]));
        if (mass.removeTag.trim()) {
          const remove = mass.removeTag.trim().toLowerCase();
          nextTags = nextTags.filter((tag) => tag.toLowerCase() !== remove);
        }
        if (mass.addTag.trim() || mass.removeTag.trim()) patch.tags = nextTags;
        if (Object.keys(patch).length > 1) batch.update(doc(db, "clients", client.id), patch);
      });
      await batch.commit();
      toast.success(`Updated ${selection.size} client${selection.size === 1 ? "" : "s"}.`);
      setMassOpen(false);
      setMass({ status: "", group: "", setGroup: false, addTag: "", removeTag: "" });
    } catch (err) {
      console.error(err);
      toast.error("Mass edit failed.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (pendingDelete.length === 0) return;
    setSaving(true);
    try {
      const batch = writeBatch(db);
      pendingDelete.forEach((id) => batch.delete(doc(db, "clients", id)));
      await batch.commit();
      setSelection((current) => {
        const next = new Set(current);
        pendingDelete.forEach((id) => next.delete(id));
        return next;
      });
      toast.success(`Deleted ${pendingDelete.length} client${pendingDelete.length === 1 ? "" : "s"}. Orders and projects were kept.`);
      setPendingDelete([]);
    } catch (err) {
      console.error(err);
      toast.error("Could not delete the selected clients.");
    } finally {
      setSaving(false);
    }
  };

  const requireSelection = (kind: Outreach) => {
    if (selection.size === 0) {
      toast.error("Select at least one client.");
      return;
    }
    setOutreach(kind);
  };

  return (
    <AdminLayout title="Clients">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Client list</p>
          <p className="mt-1 text-sm font-bold text-gray-500">{loading ? "Loading…" : `${filtered.length} shown · ${clients.length} total`}</p>
        </div>
        <Button onClick={openNew} className="rounded-xl bg-[#0d9488] font-bold text-white hover:bg-[#0f766e]">
          <Plus className="mr-2 h-4 w-4" /> Add client
        </Button>
      </div>

      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, email, phone, group, or tag"
            className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-xs font-medium outline-none focus:ring-2 focus:ring-[#0d9488]/20"
          />
        </div>
        <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)} className={inputCls + " xl:max-w-[220px]"}>
          <option value="all">All groups</option>
          {groups.map((group) => <option key={group} value={group}>{group}</option>)}
        </select>
        <select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)} className={inputCls + " xl:max-w-[220px]"}>
          <option value="all">All tags</option>
          {tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
        </select>
      </div>

      {error && (
        <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm font-bold text-red-700">{error}</div>
      )}

      <div className="overflow-hidden rounded-[1.5rem] border border-gray-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="w-12 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && filtered.every((client) => selection.has(client.id))}
                    onChange={toggleAll}
                    aria-label="Select shown clients"
                    className="h-4 w-4 rounded border-gray-300 text-[#0d9488]"
                  />
                </th>
                <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400">Client</th>
                <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400">Contact</th>
                <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400">Group</th>
                <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400">Tags</th>
                <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400">Status</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <Users className="mx-auto mb-3 h-8 w-8 text-gray-300" />
                    <p className="text-xs font-black uppercase tracking-widest text-gray-400">No clients match</p>
                  </td>
                </tr>
              )}
              {filtered.map((client) => (
                <tr key={client.id} className="border-b border-gray-50 last:border-0 hover:bg-[#f0fdfa]/40">
                  <td className="px-4 py-4">
                    <input
                      type="checkbox"
                      checked={selection.has(client.id)}
                      onChange={() => toggle(client.id)}
                      aria-label={`Select ${clientName(client)}`}
                      className="h-4 w-4 rounded border-gray-300 text-[#0d9488]"
                    />
                  </td>
                  <td className="px-3 py-4">
                    <button
                      type="button"
                      onClick={() => navigate(`/admin/customers/${client.id}`)}
                      className="flex items-center gap-3 text-left"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-xs font-black uppercase text-gray-500">
                        {clientInitials(client)}
                      </span>
                      <span>
                        <span className="block font-black text-black underline-offset-2 hover:underline">{clientName(client)}</span>
                        {client.company && <span className="block text-[10px] font-bold uppercase tracking-widest text-gray-400">{client.company}</span>}
                      </span>
                    </button>
                  </td>
                  <td className="px-3 py-4">
                    <p className="flex items-center gap-2 text-xs font-bold text-gray-600"><Mail className="h-3 w-3" /> {client.email || "—"}</p>
                    <p className="mt-1 flex items-center gap-2 text-xs text-gray-500"><Phone className="h-3 w-3" /> {client.phone || "—"}</p>
                  </td>
                  <td className="px-3 py-4 text-xs font-bold text-gray-600">{client.group || "—"}</td>
                  <td className="px-3 py-4">
                    <div className="flex max-w-[240px] flex-wrap gap-1">
                      {asTags(client.tags).length === 0 && <span className="text-xs text-gray-300">—</span>}
                      {asTags(client.tags).map((tag) => (
                        <span key={tag} className="rounded-full bg-gray-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-gray-600">{tag}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-widest ${statusClass(client.status)}`}>
                      {client.status || "active"}
                    </span>
                  </td>
                  <td className="px-3 py-4">
                    <div className="flex justify-end gap-1">
                      <button type="button" onClick={() => openEdit(client)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-black" aria-label={`Edit ${clientName(client)}`}>
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => setPendingDelete([client.id])} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label={`Delete ${clientName(client)}`}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selection.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 w-[min(960px,calc(100vw-2rem))] -translate-x-1/2">
          <div className="flex flex-wrap items-center gap-3 rounded-3xl border border-white/10 bg-black px-5 py-4 text-white shadow-2xl">
            <span className="text-xs font-black uppercase tracking-widest">{selection.size} selected</span>
            <button type="button" onClick={() => setMassOpen(true)} className="rounded-xl bg-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-white/20">Mass edit</button>
            <button type="button" onClick={() => requireSelection("email")} className="rounded-xl bg-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-white/20">Email</button>
            <button type="button" onClick={() => requireSelection("text")} className="rounded-xl bg-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-white/20">Text</button>
            <button type="button" onClick={() => requireSelection("campaign")} className="inline-flex items-center gap-1 rounded-xl bg-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-white/20"><Megaphone className="h-3 w-3" /> Campaign</button>
            <button type="button" onClick={() => setPendingDelete(Array.from(selection))} className="rounded-xl bg-red-500/20 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-200 hover:bg-red-500/30">Delete</button>
            <button type="button" onClick={() => setSelection(new Set())} className="ml-auto rounded-full p-2 hover:bg-white/10" aria-label="Clear selection"><X className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      {editing && (
        <Modal title={editing === "new" ? "Add client" : `Edit ${clientName(editing)}`} onClose={() => setEditing(null)}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="First name *"><input className={inputCls} value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} /></Field>
            <Field label="Last name"><input className={inputCls} value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} /></Field>
            <Field label="Email *"><input className={inputCls} type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></Field>
            <Field label="Phone"><input className={inputCls} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
            <Field label="Company"><input className={inputCls} value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} /></Field>
            <Field label="Group"><input className={inputCls} value={form.group} onChange={(event) => setForm({ ...form, group: event.target.value })} placeholder="Brokerage, team, or list" /></Field>
            <Field label="Status">
              <select className={inputCls} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="vip">VIP</option>
              </select>
            </Field>
            <Field label="Tags"><input className={inputCls} value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="vip, realtor, houston" /></Field>
            <div className="sm:col-span-2">
              <Field label="Address"><input className={inputCls} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Notes"><textarea className={`${inputCls} resize-none`} rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field>
            </div>
          </div>
          <div className="mt-5 flex gap-2">
            <Button onClick={saveOne} disabled={saving} className="rounded-xl bg-[#0d9488] font-bold text-white hover:bg-[#0f766e]">
              <Check className="mr-2 h-4 w-4" /> {saving ? "Saving…" : "Save client"}
            </Button>
            <Button variant="outline" onClick={() => setEditing(null)} className="rounded-xl font-bold">Cancel</Button>
          </div>
        </Modal>
      )}

      {massOpen && (
        <Modal title={`Mass edit ${selection.size} clients`} onClose={() => setMassOpen(false)}>
          <div className="space-y-3">
            <Field label="Status">
              <select className={inputCls} value={mass.status} onChange={(event) => setMass({ ...mass, status: event.target.value })}>
                <option value="">Leave unchanged</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="vip">VIP</option>
              </select>
            </Field>
            <label className="flex items-center gap-2 text-xs font-bold text-gray-600">
              <input type="checkbox" checked={mass.setGroup} onChange={(event) => setMass({ ...mass, setGroup: event.target.checked })} />
              Set group on every selected client
            </label>
            <Field label="Group">
              <input className={inputCls} disabled={!mass.setGroup} value={mass.group} onChange={(event) => setMass({ ...mass, group: event.target.value })} placeholder="Leave blank to clear the group" />
            </Field>
            <Field label="Add tag"><input className={inputCls} value={mass.addTag} onChange={(event) => setMass({ ...mass, addTag: event.target.value })} /></Field>
            <Field label="Remove tag"><input className={inputCls} value={mass.removeTag} onChange={(event) => setMass({ ...mass, removeTag: event.target.value })} /></Field>
          </div>
          <div className="mt-5 flex gap-2">
            <Button onClick={applyMass} disabled={saving} className="rounded-xl bg-[#0d9488] font-bold text-white hover:bg-[#0f766e]">
              <Tag className="mr-2 h-4 w-4" /> Apply
            </Button>
            <Button variant="outline" onClick={() => setMassOpen(false)} className="rounded-xl font-bold">Cancel</Button>
          </div>
        </Modal>
      )}

      {pendingDelete.length > 0 && (
        <Modal title="Delete clients" onClose={() => setPendingDelete([])}>
          <p className="text-sm font-bold text-gray-700">
            Delete {pendingDelete.length} client record{pendingDelete.length === 1 ? "" : "s"}? Orders, projects, and invoices stay in place.
          </p>
          <ul className="mt-3 space-y-1 text-xs font-bold text-gray-500">
            {clients.filter((client) => pendingDelete.includes(client.id)).slice(0, 6).map((client) => (
              <li key={client.id}>{clientName(client)}</li>
            ))}
          </ul>
          <div className="mt-5 flex gap-2">
            <Button onClick={confirmDelete} disabled={saving} className="rounded-xl bg-red-600 font-bold text-white hover:bg-red-700">
              <Trash2 className="mr-2 h-4 w-4" /> {saving ? "Deleting…" : "Delete"}
            </Button>
            <Button variant="outline" onClick={() => setPendingDelete([])} className="rounded-xl font-bold">Cancel</Button>
          </div>
        </Modal>
      )}

      {outreach && (
        <Modal title={`${outreach === "email" ? "Email" : outreach === "text" ? "Text" : "Campaign"} draft`} onClose={() => setOutreach(null)}>
          <p className="text-sm font-bold text-gray-600">
            {selectedClients.length} client{selectedClients.length === 1 ? "" : "s"} selected. Nothing is emailed, texted, or launched from this screen.
          </p>
          <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto text-xs font-bold text-gray-500">
            {selectedClients.map((client) => (
              <li key={client.id}>{clientName(client)} · {outreach === "text" ? (client.phone || "No phone") : (client.email || "No email")}</li>
            ))}
          </ul>
          <Field label="Draft">
            <textarea className={`${inputCls} mt-2 resize-none`} rows={4} placeholder="Write a note for yourself. Closing this window discards it." />
          </Field>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={() => navigate("/admin/communications")} className="rounded-xl bg-[#0d9488] font-bold text-white hover:bg-[#0f766e]">
              Open Communications
            </Button>
            <Button variant="outline" onClick={() => setOutreach(null)} className="rounded-xl font-bold">Close</Button>
          </div>
        </Modal>
      )}
    </AdminLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      {children}
    </label>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4">
      <div className="my-8 w-full max-w-xl rounded-[1.5rem] bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-sm font-black uppercase tracking-widest text-black">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close"><X className="h-5 w-5 text-gray-400" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
