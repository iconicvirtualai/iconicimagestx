import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft, CreditCard, Home, FileText, Receipt, ClipboardList, Image as ImageIcon,
  Camera, Share2, Contact, Megaphone, Sparkles, Presentation, ExternalLink, Save,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, doc, onSnapshot, updateDoc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import {
  asTags, belongsToClient, clientName, formatMoney, formatWhen, money, recordAddress,
  type ClientRecord,
} from "@/lib/clientRecords";
import { staffInvoicePath } from "@shared/staffInvoice";

const labelCls = "block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1";
const inputCls = "w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#0d9488]/30";

const SECTIONS = [
  { id: "billing", label: "Billing & payments", icon: CreditCard },
  { id: "listings", label: "Listings", icon: Home },
  { id: "invoices", label: "Past invoices", icon: FileText },
  { id: "tax", label: "Tax", icon: Receipt },
  { id: "orders", label: "Order history", icon: ClipboardList },
  { id: "media", label: "Media & branding", icon: ImageIcon },
  { id: "studio", label: "Studio", icon: Camera },
  { id: "social", label: "Social media", icon: Share2 },
  { id: "crm", label: "CRM", icon: Contact },
  { id: "marketing", label: "Marketing assistant", icon: Megaphone },
  { id: "concierge", label: "Landing / concierge", icon: Sparkles },
  { id: "presentation", label: "Presentation guide", icon: Presentation },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export default function AdminClientAccount() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [client, setClient] = React.useState<ClientRecord | null>(null);
  const [missing, setMissing] = React.useState(false);
  const [listings, setListings] = React.useState<any[]>([]);
  const [orders, setOrders] = React.useState<any[]>([]);
  const [invoices, setInvoices] = React.useState<any[]>([]);
  const [section, setSection] = React.useState<SectionId>("billing");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, "clients", id), (snap) => {
      if (!snap.exists()) {
        setMissing(true);
        setClient(null);
        return;
      }
      const data = snap.data();
      setClient({ id: snap.id, ...data, tags: asTags(data.tags) } as ClientRecord);
      setMissing(false);
    }, (err) => {
      console.error(err);
      toast.error("Could not open this client.");
      setMissing(true);
    });
    return () => unsub();
  }, [id]);

  React.useEffect(() => {
    const unsubs = [
      onSnapshot(collection(db, "listings"), (snap) => {
        setListings(snap.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
      }, () => setListings([])),
      onSnapshot(collection(db, "orderRequests"), (snap) => {
        setOrders(snap.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
      }, () => setOrders([])),
      onSnapshot(collection(db, "invoices"), (snap) => {
        setInvoices(snap.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
      }, () => setInvoices([])),
    ];
    return () => unsubs.forEach((unsub) => unsub());
  }, []);

  const save = async (patch: Record<string, unknown>, message = "Saved.") => {
    if (!id) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "clients", id), { ...patch, updatedAt: serverTimestamp() });
      toast.success(message);
    } catch (err) {
      console.error(err);
      toast.error("Could not save.");
    } finally {
      setSaving(false);
    }
  };

  if (missing) {
    return (
      <AdminLayout title="Client">
        <p className="text-sm font-bold text-gray-500">This client record was not found.</p>
        <Button onClick={() => navigate("/admin/customers")} className="mt-4 rounded-xl bg-[#0d9488] text-white">Back to clients</Button>
      </AdminLayout>
    );
  }

  if (!client) {
    return (
      <AdminLayout title="Client">
        <div className="flex justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#0d9488] border-t-transparent" />
        </div>
      </AdminLayout>
    );
  }

  const projects = listings.filter((listing) => belongsToClient(listing, client));
  const history = orders.filter((order) => belongsToClient(order, client));
  const storedInvoices = invoices.filter((invoice) => belongsToClient(invoice, client));
  const orderInvoices = history.filter((order) => order.invoice?.invoiceNumber || money(order.invoice?.total) !== null);
  const taxLines = [
    ...history.map((order) => ({ id: order.id, source: "Order", label: recordAddress(order), tax: money(order.pricing?.tax) })),
    ...storedInvoices.map((invoice) => ({ id: invoice.id, source: "Invoice", label: invoice.invoiceNumber || invoice.id, tax: money(invoice.tax) })),
  ].filter((line) => line.tax !== null);
  const billed = [
    ...history.filter((order) => money(order.total) !== null || money(order.pricing?.total) !== null),
    ...projects.filter((project) => money(project.total) !== null),
  ];

  return (
    <AdminLayout title="Client account">
      <button type="button" onClick={() => navigate("/admin/customers")} className="mb-4 flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-gray-400 hover:text-black">
        <ChevronLeft className="h-4 w-4" /> Clients
      </button>

      <div className="mb-6 rounded-[1.5rem] bg-black p-6 text-white">
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">{client.company || client.group || "Client"}</p>
        <h2 className="mt-1 text-2xl font-black uppercase tracking-tight">{clientName(client)}</h2>
        <p className="mt-2 text-sm text-gray-400">{client.email || "No email"}{client.phone ? ` · ${client.phone}` : ""}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-full bg-white/10 px-3 py-1 text-[9px] font-black uppercase tracking-widest">{client.status || "active"}</span>
          {client.group && <span className="rounded-full bg-[#0d9488] px-3 py-1 text-[9px] font-black uppercase tracking-widest">{client.group}</span>}
          {asTags(client.tags).map((tag) => (
            <span key={tag} className="rounded-full bg-white/10 px-3 py-1 text-[9px] font-black uppercase tracking-widest">{tag}</span>
          ))}
        </div>
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto rounded-2xl bg-gray-100 p-1">
        {SECTIONS.map((item) => {
          const Icon = item.icon;
          const active = section === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest ${active ? "bg-white text-black shadow-sm" : "text-gray-400 hover:text-gray-700"}`}
            >
              <Icon className="h-3.5 w-3.5" /> {item.label}
            </button>
          );
        })}
      </div>

      <div className="min-w-0 rounded-[1.5rem] border border-gray-100 bg-white p-6 shadow-sm">
        {section === "billing" && (
          <Section title="Billing & payments" hint="Amounts already stored on this client's orders and projects. Payment collection stays in Billing.">
            {billed.length === 0 ? <Empty text="No billing amounts are stored for this client yet." /> : (
              <div className="space-y-2">
                {history.map((order) => {
                  const total = money(order.total) ?? money(order.pricing?.total);
                  if (total === null) return null;
                  const paid = money(order.invoice?.amountPaid);
                  return (
                    <Row key={order.id} title={recordAddress(order)} meta={`${formatWhen(order.createdAt)} · ${order.invoice?.status || order.status || "order"}`} value={formatMoney(total)} extra={paid === null ? undefined : `Paid ${formatMoney(paid)}`} href={`/admin/order-request/${order.id}`} />
                  );
                })}
                {projects.filter((project) => money(project.total) !== null).map((project) => (
                  <Row key={project.id} title={recordAddress(project)} meta={project.invoiceStatus || project.status || "project"} value={formatMoney(project.total)} href={`/admin/listing/${project.id}`} />
                ))}
              </div>
            )}
            <Link to="/admin/client-billing" className="mt-4 inline-flex text-[10px] font-black uppercase tracking-widest text-[#0d9488]">Open billing</Link>
          </Section>
        )}

        {section === "listings" && (
          <Section title="Listings" hint="Projects linked by client id or email.">
            {projects.length === 0 ? <Empty text="No projects are linked to this client yet." /> : (
              <div className="space-y-2">
                {projects.map((project) => (
                  <Row
                    key={project.id}
                    title={recordAddress(project)}
                    meta={`${project.projectType === "business" ? "Business" : "Real Estate"} · ${project.status || "unscheduled"}`}
                    href={`/admin/listing/${project.id}`}
                  />
                ))}
              </div>
            )}
          </Section>
        )}

        {section === "invoices" && (
          <Section title="Past invoices" hint="Invoice numbers are shown only when one is already stored.">
            {storedInvoices.length === 0 && orderInvoices.length === 0 ? <Empty text="No invoices are stored for this client yet." /> : (
              <div className="space-y-2">
                {storedInvoices.map((invoice) => (
                  <Row key={invoice.id} title={invoice.invoiceNumber || "Invoice"} meta={invoice.status || "stored"} value={formatMoney(invoice.total)} href={invoice.id ? staffInvoicePath(invoice.id) : undefined} />
                ))}
                {orderInvoices.map((order) => (
                  <Row key={order.id} title={order.invoice.invoiceNumber} meta={order.invoice.status || "on order"} value={formatMoney(order.invoice.total ?? order.total)} href={`/admin/order-request/${order.id}`} />
                ))}
              </div>
            )}
          </Section>
        )}

        {section === "tax" && (
          <Section title="Tax" hint="Tax lines appear only when an order or invoice already recorded a tax amount.">
            {taxLines.length === 0 ? <Empty text="No tax has been recorded for this client." /> : (
              <div className="space-y-2">
                {taxLines.map((line) => (
                  <Row key={`${line.source}-${line.id}`} title={line.label} meta={line.source} value={formatMoney(line.tax)} />
                ))}
              </div>
            )}
            <NotesField
              label="Tax notes"
              initial={client.taxNotes || ""}
              saving={saving}
              onSave={(taxNotes) => save({ taxNotes })}
            />
          </Section>
        )}

        {section === "orders" && (
          <Section title="Order history">
            {history.length === 0 ? <Empty text="No orders match this client's email or id." /> : (
              <div className="space-y-2">
                {history.map((order) => (
                  <Row
                    key={order.id}
                    title={recordAddress(order)}
                    meta={`${formatWhen(order.createdAt || order.submittedAt)} · ${order.status || "new"}`}
                    value={money(order.total) === null && money(order.pricing?.total) === null ? undefined : formatMoney(order.total ?? order.pricing?.total)}
                    href={`/admin/order-request/${order.id}`}
                  />
                ))}
              </div>
            )}
          </Section>
        )}

        {section === "media" && (
          <Section title="Media & branding" hint="Photos and brand fields already saved on this client's projects.">
            {projects.every((project) => !(project.images || []).length) && projects.every((project) => !project.brandColors && !project.businessName) ? (
              <Empty text="No project media or brand fields are stored yet." />
            ) : (
              <div className="space-y-6">
                {projects.map((project) => (
                  <div key={project.id}>
                    <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-500">{recordAddress(project)}</p>
                    {(project.businessName || project.brandColors) && (
                      <p className="mb-2 text-xs font-bold text-gray-600">{[project.businessName, project.brandColors].filter(Boolean).join(" · ")}</p>
                    )}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {(project.images || []).map((image: any, index: number) => (
                        <a key={image.url || index} href={image.url} target="_blank" rel="noreferrer" className="aspect-square overflow-hidden rounded-xl bg-gray-100">
                          <img src={image.url} alt={image.name || "Project photo"} className="h-full w-full object-cover" />
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

        {section === "studio" && (
          <Section title="Studio" hint="Client studio links for projects that already have studio access.">
            {projects.filter((project) => project.studioEnabled).length === 0 ? <Empty text="No studio link is turned on for this client's projects." /> : (
              <div className="space-y-2">
                {projects.filter((project) => project.studioEnabled).map((project) => (
                  <Row key={project.id} title={recordAddress(project)} meta="Studio enabled" href={`/studio/${project.id}`} external />
                ))}
              </div>
            )}
          </Section>
        )}

        {section === "social" && (
          <Section title="Social media">
            <div className="mb-4 space-y-2">
              {projects.length === 0 ? <Empty text="No projects to show social permission for." /> : projects.map((project) => (
                <Row key={project.id} title={recordAddress(project)} meta={project.socialPermission ? "Social permission on" : "Social permission off"} href={`/admin/listing/${project.id}`} />
              ))}
            </div>
            <SocialForm client={client} saving={saving} onSave={(social) => save({ social })} />
          </Section>
        )}

        {section === "crm" && (
          <Section title="CRM">
            <CrmForm client={client} saving={saving} onSave={(patch) => save(patch)} />
          </Section>
        )}

        {section === "marketing" && (
          <Section title="Marketing assistant" hint="Notes stay on the client record. This screen does not send email, text, or campaigns.">
            <p className="mb-3 text-sm font-bold text-gray-600">
              {client.email ? `Communications can use ${client.email}.` : "Add an email on the CRM tab before messaging this client."}
            </p>
            <Link to="/admin/communications" className="mb-4 inline-flex text-[10px] font-black uppercase tracking-widest text-[#0d9488]">Open Communications</Link>
            <NotesField label="Assistant notes" initial={client.marketingNotes || ""} saving={saving} onSave={(marketingNotes) => save({ marketingNotes })} />
          </Section>
        )}

        {section === "concierge" && (
          <Section title="Landing page / portfolio / listing concierge" hint="Premium service workspace. No public page is published from here.">
            <ConciergeForm client={client} saving={saving} onSave={(patch) => save(patch)} />
          </Section>
        )}

        {section === "presentation" && (
          <Section title="Listing presentation / goal guide" hint="Notes for a client presentation. Nothing is filled in until you write it.">
            <PresentationForm client={client} saving={saving} onSave={(presentation) => save({ presentation })} />
          </Section>
        )}
      </div>
    </AdminLayout>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">{title}</h3>
      {hint && <p className="mt-2 mb-4 text-sm font-bold text-gray-500">{hint}</p>}
      {!hint && <div className="mb-4" />}
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-2xl bg-gray-50 px-4 py-8 text-center text-xs font-black uppercase tracking-widest text-gray-400">{text}</p>;
}

function Row({ title, meta, value, extra, href, external }: { title: string; meta?: string; value?: string; extra?: string; href?: string; external?: boolean }) {
  const body = (
    <div className="flex items-center justify-between gap-4 rounded-xl bg-gray-50 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-black text-black">{title}</p>
        {meta && <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{meta}</p>}
        {extra && <p className="text-xs font-bold text-gray-500">{extra}</p>}
      </div>
      <div className="flex items-center gap-2">
        {value && <span className="text-sm font-black text-black">{value}</span>}
        {href && <ExternalLink className="h-3.5 w-3.5 text-[#0d9488]" />}
      </div>
    </div>
  );
  if (!href) return body;
  if (external) return <a href={href} target="_blank" rel="noreferrer">{body}</a>;
  return <Link to={href}>{body}</Link>;
}

function NotesField({ label, initial, saving, onSave }: { label: string; initial: string; saving: boolean; onSave: (value: string) => void }) {
  const [value, setValue] = React.useState(initial);
  React.useEffect(() => setValue(initial), [initial]);
  return (
    <div className="mt-4">
      <label className={labelCls}>{label}</label>
      <textarea className={`${inputCls} resize-none`} rows={4} value={value} onChange={(event) => setValue(event.target.value)} />
      <Button onClick={() => onSave(value)} disabled={saving} className="mt-3 rounded-xl bg-[#0d9488] font-bold text-white hover:bg-[#0f766e]">
        <Save className="mr-2 h-4 w-4" /> Save
      </Button>
    </div>
  );
}

function SocialForm({ client, saving, onSave }: { client: ClientRecord; saving: boolean; onSave: (social: ClientRecord["social"]) => void }) {
  const [form, setForm] = React.useState({
    instagram: client.social?.instagram || "",
    facebook: client.social?.facebook || "",
    tiktok: client.social?.tiktok || "",
    website: client.social?.website || "",
  });
  React.useEffect(() => {
    setForm({
      instagram: client.social?.instagram || "",
      facebook: client.social?.facebook || "",
      tiktok: client.social?.tiktok || "",
      website: client.social?.website || "",
    });
  }, [client]);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {(["instagram", "facebook", "tiktok", "website"] as const).map((key) => (
        <label key={key}>
          <span className={labelCls}>{key}</span>
          <input className={inputCls} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} />
        </label>
      ))}
      <div className="sm:col-span-2">
        <Button onClick={() => onSave(form)} disabled={saving} className="rounded-xl bg-[#0d9488] font-bold text-white hover:bg-[#0f766e]">
          <Save className="mr-2 h-4 w-4" /> Save handles
        </Button>
      </div>
    </div>
  );
}

function CrmForm({ client, saving, onSave }: { client: ClientRecord; saving: boolean; onSave: (patch: Record<string, unknown>) => void }) {
  const [form, setForm] = React.useState({
    group: client.group || "",
    status: client.status || "active",
    tags: asTags(client.tags).join(", "),
    notes: client.notes || "",
    phone: client.phone || "",
    company: client.company || "",
  });
  React.useEffect(() => {
    setForm({
      group: client.group || "",
      status: client.status || "active",
      tags: asTags(client.tags).join(", "),
      notes: client.notes || "",
      phone: client.phone || "",
      company: client.company || "",
    });
  }, [client]);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label><span className={labelCls}>Group</span><input className={inputCls} value={form.group} onChange={(event) => setForm({ ...form, group: event.target.value })} /></label>
      <label>
        <span className={labelCls}>Status</span>
        <select className={inputCls} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="vip">VIP</option>
        </select>
      </label>
      <label><span className={labelCls}>Phone</span><input className={inputCls} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
      <label><span className={labelCls}>Company</span><input className={inputCls} value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} /></label>
      <label className="sm:col-span-2"><span className={labelCls}>Tags</span><input className={inputCls} value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="Comma separated" /></label>
      <label className="sm:col-span-2"><span className={labelCls}>Notes</span><textarea className={`${inputCls} resize-none`} rows={4} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
      <div>
        <Button
          onClick={() => onSave({
            group: form.group.trim(),
            status: form.status,
            phone: form.phone.trim(),
            company: form.company.trim(),
            tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
            notes: form.notes.trim(),
          })}
          disabled={saving}
          className="rounded-xl bg-[#0d9488] font-bold text-white hover:bg-[#0f766e]"
        >
          <Save className="mr-2 h-4 w-4" /> Save CRM
        </Button>
      </div>
    </div>
  );
}

function ConciergeForm({ client, saving, onSave }: { client: ClientRecord; saving: boolean; onSave: (patch: Record<string, unknown>) => void }) {
  const [status, setStatus] = React.useState(client.conciergeStatus || "");
  const [notes, setNotes] = React.useState(client.conciergeNotes || "");
  React.useEffect(() => {
    setStatus(client.conciergeStatus || "");
    setNotes(client.conciergeNotes || "");
  }, [client]);
  return (
    <div className="space-y-3">
      <label>
        <span className={labelCls}>Service status</span>
        <select className={inputCls} value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">Not set</option>
          <option value="not_started">Not started</option>
          <option value="interested">Interested</option>
          <option value="active">Active</option>
        </select>
      </label>
      <label>
        <span className={labelCls}>Notes</span>
        <textarea className={`${inputCls} resize-none`} rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} />
      </label>
      <Button onClick={() => onSave({ conciergeStatus: status, conciergeNotes: notes })} disabled={saving} className="rounded-xl bg-[#0d9488] font-bold text-white hover:bg-[#0f766e]">
        <Save className="mr-2 h-4 w-4" /> Save concierge
      </Button>
    </div>
  );
}

function PresentationForm({ client, saving, onSave }: { client: ClientRecord; saving: boolean; onSave: (presentation: ClientRecord["presentation"]) => void }) {
  const [form, setForm] = React.useState({
    goal: client.presentation?.goal || "",
    audience: client.presentation?.audience || "",
    talkingPoints: client.presentation?.talkingPoints || "",
  });
  React.useEffect(() => {
    setForm({
      goal: client.presentation?.goal || "",
      audience: client.presentation?.audience || "",
      talkingPoints: client.presentation?.talkingPoints || "",
    });
  }, [client]);
  return (
    <div className="space-y-3">
      <label><span className={labelCls}>Goal</span><input className={inputCls} value={form.goal} onChange={(event) => setForm({ ...form, goal: event.target.value })} /></label>
      <label><span className={labelCls}>Audience</span><input className={inputCls} value={form.audience} onChange={(event) => setForm({ ...form, audience: event.target.value })} /></label>
      <label><span className={labelCls}>Talking points</span><textarea className={`${inputCls} resize-none`} rows={5} value={form.talkingPoints} onChange={(event) => setForm({ ...form, talkingPoints: event.target.value })} /></label>
      <Button onClick={() => onSave(form)} disabled={saving} className="rounded-xl bg-[#0d9488] font-bold text-white hover:bg-[#0f766e]">
        <Save className="mr-2 h-4 w-4" /> Save guide
      </Button>
    </div>
  );
}
