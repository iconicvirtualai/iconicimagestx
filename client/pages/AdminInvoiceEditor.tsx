import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Copy, Plus, Save, Send } from "lucide-react";
import { collection, doc, getDoc, getDocs, onSnapshot } from "firebase/firestore";
import { toast } from "sonner";
import AdminLayout from "@/components/AdminLayout";
import { PackageCatalogPicker } from "@/components/PackageCatalogPicker";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { deliverInvoiceEmail } from "@/lib/deliverInvoice";
import { saveStaffInvoiceEdits } from "@/lib/staffInvoice";
import {
  BOOKING_CATALOG_KIND_LABELS,
  BOOKING_PACKAGE_CATEGORY_LABELS,
  packagesForStaffEditor,
  promoDiscountFor,
  type StaffCatalogPackage,
} from "@shared/bookingCatalog";
import {
  billToAddressText,
  clientPaymentPath,
  findStaffCatalogPackage,
  professionalInvoiceNumber,
  splitStaffInvoiceLines,
  staffInvoiceSavePatch,
  staffServiceFromPackage,
  staffServiceQty,
  staffServiceUnitPrice,
  type StaffInvoiceForm,
  type StaffServiceLine,
} from "@shared/staffInvoice";

const labelCls = "text-[10px] font-black text-gray-400 uppercase tracking-widest";
const inputCls = "w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold text-black focus:outline-none focus:ring-2 focus:ring-[#0d9488]/40";
const areaCls = "w-full min-h-[7.5rem] bg-white border border-gray-200 rounded-xl px-3 py-3 text-sm font-medium leading-relaxed text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#0d9488]/40";

function money(value: number): string {
  return (Number(value) || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function emptyForm(): StaffInvoiceForm {
  return {
    clientName: "",
    clientEmail: "",
    billToAddress: "",
    notes: "",
    services: [],
    promoCode: "",
    promoDiscount: 0,
    tax: 0,
  };
}

function formFromInvoice(data: Record<string, unknown>): StaffInvoiceForm {
  const split = splitStaffInvoiceLines(data.lineItems, data.promoCode, data.promoDiscount);
  return {
    clientName: String(data.clientName || ""),
    clientEmail: String(data.clientEmail || ""),
    billToAddress: billToAddressText(data.billToAddress),
    notes: String(data.notes || ""),
    services: split.services.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description || "",
      category: item.category,
      bookingKind: item.bookingKind,
      tier: item.tier,
      unitPrice: item.unitPrice,
      qty: item.qty,
      price: item.price,
    })),
    promoCode: split.promoCode,
    promoDiscount: split.promoDiscount,
    tax: Number(data.tax) || 0,
  };
}

export default function AdminInvoiceEditor() {
  const { invoiceId = "" } = useParams<{ invoiceId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [invoice, setInvoice] = React.useState<Record<string, unknown> | null>(null);
  const [missing, setMissing] = React.useState(false);
  const [form, setForm] = React.useState<StaffInvoiceForm>(emptyForm);
  const [catalog, setCatalog] = React.useState<StaffCatalogPackage[]>(() => packagesForStaffEditor([]));
  const [saving, setSaving] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const dirty = React.useRef(false);
  const seededAddress = React.useRef(false);
  const addressTouched = React.useRef(false);

  React.useEffect(() => {
    if (!invoiceId) return;
    dirty.current = false;
    seededAddress.current = false;
    addressTouched.current = false;
    const unsub = onSnapshot(doc(db, "invoices", invoiceId), (snap) => {
      if (!snap.exists()) {
        setInvoice(null);
        setMissing(true);
        return;
      }
      const data = snap.data() as Record<string, unknown>;
      setMissing(false);
      setInvoice({ id: snap.id, ...data });
      if (!dirty.current) setForm(formFromInvoice(data));
    }, () => {
      setMissing(true);
    });
    return unsub;
  }, [invoiceId]);

  React.useEffect(() => {
    let cancelled = false;
    getDocs(collection(db, "packages"))
      .then((snap) => {
        if (cancelled) return;
        setCatalog(packagesForStaffEditor(snap.docs.map((entry) => ({ id: entry.id, ...entry.data() }))));
      })
      .catch(() => {
        if (!cancelled) setCatalog(packagesForStaffEditor([]));
      });
    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => {
    if (dirty.current) return;
    setForm((prev) => {
      let changed = false;
      const services = prev.services.map((line) => {
        const match = findStaffCatalogPackage(line, catalog);
        if (!match) return line;
        const description = line.description?.trim() ? line.description : match.description;
        const category = line.category || match.category;
        const bookingKind = line.bookingKind || match.bookingKind;
        const tier = line.tier || match.tier;
        const id = line.id || match.bookingId || match.id;
        if (
          description === (line.description || "") &&
          category === line.category &&
          bookingKind === line.bookingKind &&
          tier === line.tier &&
          id === line.id
        ) {
          return line;
        }
        changed = true;
        return { ...line, id, description, category, bookingKind, tier };
      });
      return changed ? { ...prev, services } : prev;
    });
  }, [catalog, invoice]);

  React.useEffect(() => {
    if (seededAddress.current || !invoice || form.billToAddress) {
      if (form.billToAddress) seededAddress.current = true;
      return;
    }
    const orderRequestId = typeof invoice.orderRequestId === "string" ? invoice.orderRequestId : "";
    if (!orderRequestId) {
      seededAddress.current = true;
      return;
    }
    let cancelled = false;
    getDoc(doc(db, "orderRequests", orderRequestId)).then((snap) => {
      if (cancelled || addressTouched.current || !snap.exists()) return;
      const address = billToAddressText(snap.data().address);
      seededAddress.current = true;
      if (!address) return;
      setForm((prev) => (prev.billToAddress || addressTouched.current ? prev : { ...prev, billToAddress: address }));
    }).catch(() => {
      seededAddress.current = true;
    });
    return () => { cancelled = true; };
  }, [invoice, form.billToAddress]);

  const quote = staffInvoiceSavePatch(form, { amountPaid: invoice?.amountPaid });
  const orderRequestId = typeof invoice?.orderRequestId === "string" ? invoice.orderRequestId : "";
  const listingId = typeof invoice?.listingId === "string" ? invoice.listingId : "";
  const back = orderRequestId
    ? { href: `/admin/order-request/${orderRequestId}`, label: "Back to order" }
    : listingId
      ? { href: `/admin/listing/${listingId}`, label: "Back to project" }
      : { href: "/admin/orders", label: "Orders" };

  const edit = (patch: Partial<StaffInvoiceForm>) => {
    dirty.current = true;
    if ("billToAddress" in patch) addressTouched.current = true;
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const replaceService = (index: number, next: StaffServiceLine) => {
    edit({ services: form.services.map((row, rowIndex) => rowIndex === index ? next : row) });
  };

  const onPromoCode = (value: string) => {
    const known = promoDiscountFor(value);
    if (known && value.trim().toUpperCase() === known.code) {
      edit({ promoCode: known.code, promoDiscount: known.discount });
      return;
    }
    edit({ promoCode: value });
  };

  const handleSave = async () => {
    if (!invoiceId) return;
    setSaving(true);
    try {
      await saveStaffInvoiceEdits(invoiceId, form);
      dirty.current = false;
      toast.success("Invoice saved.");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Could not save the invoice.");
    } finally {
      setSaving(false);
    }
  };

  const copyPaymentLink = async () => {
    if (!invoiceId) return;
    const url = `${window.location.origin}${clientPaymentPath(invoiceId)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Payment link copied.");
    } catch {
      toast.error("Could not copy the payment link.");
    }
  };

  const handleSend = async () => {
    if (!invoiceId) return;
    if (!user) {
      toast.error("Please sign in again.");
      return;
    }
    setSending(true);
    try {
      const token = await user.getIdToken();
      const action = await deliverInvoiceEmail(invoiceId, token);
      toast.success(action === "payment_receipt" ? "Receipt sent to the client." : "Pay link sent to the client.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send.");
    } finally {
      setSending(false);
    }
  };

  if (!invoice && !missing) {
    return (
      <AdminLayout title="Invoice">
        <div className="flex items-center justify-center py-32">
          <div className="w-8 h-8 border-4 border-[#0d9488] border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  if (missing || !invoice) {
    return (
      <AdminLayout title="Invoice">
        <button type="button" onClick={() => navigate("/admin/orders")} className="flex items-center gap-1.5 text-gray-400 hover:text-black text-xs font-bold uppercase tracking-widest mb-6">
          <ChevronLeft className="w-4 h-4" /> Orders
        </button>
        <p className="text-sm font-bold text-gray-500">We couldn't find this invoice.</p>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Invoice">
      <button type="button" onClick={() => navigate(back.href)} className="flex items-center gap-1.5 text-gray-400 hover:text-black text-xs font-bold uppercase tracking-widest mb-6">
        <ChevronLeft className="w-4 h-4" /> {back.label}
      </button>

      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <p className={labelCls}>Invoice number</p>
          <h2 className="text-2xl font-black text-black mt-1 tracking-tight">
            {professionalInvoiceNumber(invoice.invoiceNumber, invoiceId)}
          </h2>
          <p className="text-sm text-gray-500 mt-1 max-w-xl">
            Saving updates this invoice only. The client is not emailed or texted until you choose Send to client.
          </p>
        </div>
        <span className="px-3 py-1 rounded-full bg-gray-100 text-[10px] font-black uppercase tracking-widest text-gray-600">
          {String(invoice.status || "draft")}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 className={`${labelCls} mb-4`}>Bill to</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block">
                <span className={labelCls}>Name</span>
                <input className={`${inputCls} mt-1`} value={form.clientName} onChange={(e) => edit({ clientName: e.target.value })} />
              </label>
              <label className="block">
                <span className={labelCls}>Email</span>
                <input type="email" className={`${inputCls} mt-1`} value={form.clientEmail} onChange={(e) => edit({ clientEmail: e.target.value })} />
              </label>
              <label className="block sm:col-span-2">
                <span className={labelCls}>Address</span>
                <textarea className={`${inputCls} mt-1 resize-none`} rows={2} value={form.billToAddress} onChange={(e) => edit({ billToAddress: e.target.value })} />
              </label>
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 className={`${labelCls} mb-4`}>Services</h3>
            {form.services.length === 0 && (
              <p className="text-sm text-gray-500 mb-3">No services yet. Add one from the package catalog.</p>
            )}
            <div className="space-y-4">
              {form.services.map((service, index) => {
                const match = findStaffCatalogPackage(service, catalog);
                const categoryLabel = match ? BOOKING_PACKAGE_CATEGORY_LABELS[match.category] : "";
                const kindLabel = match ? BOOKING_CATALOG_KIND_LABELS[match.bookingKind] : "";
                const catalogPrice = match ? match.price : null;
                return (
                  <div key={`${service.id || "line"}-${index}`} className="rounded-2xl border border-gray-200 p-4 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <span className={labelCls}>Package</span>
                        <div className="mt-1">
                          <PackageCatalogPicker
                            catalog={catalog}
                            selectedId={match?.id}
                            fallbackName={service.name}
                            label={`Package ${index + 1}`}
                            onSelect={(packageId) => {
                              const pkg = catalog.find((item) => item.id === packageId);
                              if (!pkg) return;
                              replaceService(index, staffServiceFromPackage(pkg, service.qty || 1));
                            }}
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        aria-label={`Remove service ${index + 1}`}
                        className="mt-6 text-xs font-bold text-red-600 hover:text-red-700"
                        onClick={() => edit({ services: form.services.filter((_, rowIndex) => rowIndex !== index) })}
                      >
                        Remove
                      </button>
                    </div>

                    <label className="block">
                      <span className={labelCls}>Description</span>
                      <textarea
                        aria-label={`Description ${index + 1}`}
                        className={`${areaCls} mt-1`}
                        rows={4}
                        value={service.description || ""}
                        placeholder={match?.description || "Package description"}
                        onChange={(e) => replaceService(index, { ...service, description: e.target.value })}
                      />
                    </label>

                    {match && match.includedServices.length > 0 && (
                      <p className="text-xs font-medium leading-relaxed text-gray-500">
                        <span className="font-bold text-gray-600">Includes </span>
                        {match.includedServices.join(" · ")}
                      </p>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <label className="block">
                        <span className={labelCls}>Quantity</span>
                        <input
                          aria-label={`Quantity ${index + 1}`}
                          type="number"
                          min={1}
                          className={`${inputCls} mt-1`}
                          value={service.qty || 1}
                          onChange={(e) => replaceService(index, staffServiceQty(service, Number(e.target.value)))}
                        />
                      </label>
                      <label className="block">
                        <span className={labelCls}>Unit price</span>
                        <div className="relative mt-1">
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">$</span>
                          <input
                            aria-label={`Unit price ${index + 1}`}
                            type="number"
                            min={0}
                            step="0.01"
                            className={`${inputCls} pl-7`}
                            value={service.unitPrice ?? 0}
                            onChange={(e) => replaceService(index, staffServiceUnitPrice(service, Number(e.target.value)))}
                          />
                        </div>
                        {catalogPrice != null && (
                          <span className="mt-1 block text-xs font-medium text-gray-500">
                            Catalog price {money(catalogPrice)}
                          </span>
                        )}
                      </label>
                      <div>
                        <span className={labelCls}>Line total</span>
                        <p className="mt-1 px-1 py-2.5 text-sm font-black text-black">{money(service.price)}</p>
                        {categoryLabel && (
                          <span className="block text-xs font-medium text-gray-500">{categoryLabel} · {kindLabel}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              className="mt-4 inline-flex items-center gap-1 text-[#0d9488] text-xs font-bold"
              onClick={() => edit({ services: [...form.services, { name: "", description: "", price: 0, unitPrice: 0, qty: 1 }] })}
            >
              <Plus className="w-3.5 h-3.5" /> Add service
            </button>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8 pt-6 border-t border-gray-100">
              <label className="block">
                <span className={labelCls}>Promo code</span>
                <input
                  className={`${inputCls} mt-1 font-mono tracking-wide`}
                  value={form.promoCode}
                  placeholder="ICONICAI"
                  onChange={(e) => onPromoCode(e.target.value)}
                />
                <span className="mt-1 block text-xs font-medium text-gray-500 normal-case tracking-normal">
                  ICONICAI takes $35 off. NEWYEAR takes $50 off.
                </span>
              </label>
              <label className="block">
                <span className={labelCls}>Discount amount</span>
                <div className="relative mt-1">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">$</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    aria-label="Discount amount"
                    className={`${inputCls} pl-7`}
                    value={form.promoDiscount}
                    onChange={(e) => edit({ promoDiscount: Number(e.target.value) })}
                  />
                </div>
                <span className="mt-1 block text-xs font-medium text-gray-500 normal-case tracking-normal">
                  Dollars off the service total, applied once.
                </span>
              </label>
              <label className="block sm:col-span-2">
                <span className={labelCls}>Invoice notes</span>
                <textarea className={`${areaCls} mt-1`} rows={3} value={form.notes} onChange={(e) => edit({ notes: e.target.value })} />
              </label>
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <div className="bg-black rounded-[2rem] p-6 text-white">
            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4">Totals</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-400">Subtotal</span><span>{money(quote.subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Promo</span><span>-{money(quote.promoDiscount)}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Tax</span><span>{money(quote.tax)}</span></div>
              <div className="flex justify-between text-lg pt-2 border-t border-white/10"><span className="font-black">Total</span><span className="font-black text-[#0d9488]">{money(quote.total)}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Paid</span><span>{money(Number(invoice.amountPaid) || 0)}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Due</span><span className="font-black">{money(quote.amountDue)}</span></div>
            </div>
            <label className="block mt-4">
              <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Tax</span>
              <input type="number" min={0} className="mt-1 w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-sm font-bold text-white focus:outline-none" value={form.tax} onChange={(e) => edit({ tax: Number(e.target.value) })} />
            </label>
            <div className="mt-5 space-y-2">
              <Button type="button" onClick={handleSave} disabled={saving} className="w-full rounded-xl bg-[#0d9488] hover:bg-[#0f766e] text-white text-xs font-bold">
                <Save className="w-3.5 h-3.5 mr-1.5" /> {saving ? "Saving..." : "Save invoice"}
              </Button>
              <Button type="button" onClick={copyPaymentLink} variant="outline" className="w-full rounded-xl text-xs font-bold text-black">
                <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy payment link
              </Button>
              <Button type="button" onClick={handleSend} disabled={sending} variant="outline" className="w-full rounded-xl text-xs font-bold text-black">
                <Send className="w-3.5 h-3.5 mr-1.5" /> {sending ? "Sending..." : "Send to client"}
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </AdminLayout>
  );
}
