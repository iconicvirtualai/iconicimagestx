import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Copy, Plus, Save, Send } from "lucide-react";
import { collection, doc, getDoc, getDocs, onSnapshot } from "firebase/firestore";
import { toast } from "sonner";
import AdminLayout from "@/components/AdminLayout";
import { PackageCatalogPicker } from "@/components/PackageCatalogPicker";
import {
  BrandedInvoiceShell,
  InvoiceFaceSummary,
  money,
} from "@/components/invoice/BrandedInvoice";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { deliverInvoiceEmail } from "@/lib/deliverInvoice";
import { watchInvoicePresets } from "@/lib/invoicePresets";
import { saveStaffInvoiceEdits } from "@/lib/staffInvoice";
import {
  BOOKING_CATALOG_KIND_LABELS,
  BOOKING_PACKAGE_CATEGORY_LABELS,
  packagesForStaffEditor,
  type StaffCatalogPackage,
} from "@shared/bookingCatalog";
import { invoiceFaceFromStored } from "@shared/invoiceFace";
import {
  INVOICE_PRESET_KINDS,
  INVOICE_PRESET_KIND_LABELS,
  presetFilledAmount,
  presetOptionLabel,
  presetsForKind,
  type InvoicePreset,
  type InvoicePresetKind,
} from "@shared/invoicePresets";
import {
  billToAddressText,
  clientPaymentPath,
  findStaffCatalogPackage,
  professionalInvoiceNumber,
  repriceInvoiceAdjustments,
  splitStaffInvoiceLines,
  staffInvoiceSavePatch,
  staffServiceFromPackage,
  staffServiceQty,
  staffServiceUnitPrice,
  type StaffInvoiceForm,
  type StaffServiceLine,
} from "@shared/staffInvoice";

const labelCls = "text-[10px] font-black text-gray-400 uppercase tracking-widest";
const inputCls = "w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold text-black focus:outline-none focus:ring-2 focus:ring-[#1d4ed8]/40";
const areaCls = "w-full min-h-[7.5rem] bg-white border border-gray-200 rounded-xl px-3 py-3 text-sm font-medium leading-relaxed text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1d4ed8]/40";

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
    processing: 0,
    fees: 0,
    travel: 0,
    processingPresetId: "",
    feesPresetId: "",
    travelPresetId: "",
    taxPresetId: "",
    promoPresetId: "",
    processingOverridden: false,
    feesOverridden: false,
    travelOverridden: false,
    taxOverridden: false,
    promoOverridden: false,
  };
}

function textId(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function formFromInvoice(data: Record<string, unknown>): StaffInvoiceForm {
  const split = splitStaffInvoiceLines(data.lineItems, data.promoCode, data.promoDiscount);
  const face = invoiceFaceFromStored(data);
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
    promoDiscount: face.promotions,
    tax: face.tax,
    processing: face.processing ?? 0,
    fees: face.fees,
    travel: face.travel,
    processingPresetId: textId(data.processingPresetId),
    feesPresetId: textId(data.feesPresetId),
    travelPresetId: textId(data.travelPresetId),
    taxPresetId: textId(data.taxPresetId),
    promoPresetId: textId(data.promoPresetId),
    processingOverridden: data.processingOverridden === true,
    feesOverridden: data.feesOverridden === true,
    travelOverridden: data.travelOverridden === true,
    taxOverridden: data.taxOverridden === true,
    promoOverridden: data.promoOverridden === true,
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
  const [presets, setPresets] = React.useState<InvoicePreset[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const dirty = React.useRef(false);
  const seededAddress = React.useRef(false);
  const addressTouched = React.useRef(false);
  const presetsRef = React.useRef<InvoicePreset[]>([]);
  presetsRef.current = presets;

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

  React.useEffect(() => watchInvoicePresets(setPresets), []);

  React.useEffect(() => {
    setForm((prev) => repriceInvoiceAdjustments(prev, presets));
  }, [presets]);

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

  const quote = staffInvoiceSavePatch(form, {
    amountPaid: invoice?.amountPaid,
    processing: invoice?.processing,
    fees: invoice?.fees,
    travel: invoice?.travel,
    id: invoiceId,
    invoiceNumber: invoice?.invoiceNumber,
  });
  const face = invoiceFaceFromStored({
    lineItems: quote.lineItems,
    subtotal: quote.subtotal,
    tax: quote.tax,
    total: quote.total,
    amountPaid: invoice?.amountPaid,
    amountDue: quote.amountDue,
    processing: quote.processing ?? null,
    fees: quote.fees ?? 0,
    travel: quote.travel ?? 0,
    promoDiscount: quote.promoDiscount,
    promoCode: quote.promoCode,
  });
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
    setForm((prev) => repriceInvoiceAdjustments({ ...prev, ...patch }, presetsRef.current));
  };

  const replaceService = (index: number, next: StaffServiceLine) => {
    edit({ services: form.services.map((row, rowIndex) => rowIndex === index ? next : row) });
  };

  const onPreset = (kind: InvoicePresetKind, presetId: string) => {
    const preset = presets.find((item) => item.id === presetId && item.kind === kind);
    const subtotal = quote.subtotal;
    if (!preset) {
      if (kind === "promotions") edit({ promoPresetId: "", promoOverridden: true });
      else if (kind === "tax") edit({ taxPresetId: "", taxOverridden: true });
      else edit({ [`${kind}PresetId`]: "", [`${kind}Overridden`]: true });
      return;
    }
    const amount = presetFilledAmount(preset, subtotal);
    if (kind === "promotions") {
      edit({
        promoPresetId: preset.id,
        promoOverridden: false,
        promoDiscount: amount,
        promoCode: form.promoCode.trim() || preset.name,
      });
      return;
    }
    if (kind === "tax") {
      edit({ taxPresetId: preset.id, taxOverridden: false, tax: amount });
      return;
    }
    edit({
      [`${kind}PresetId`]: preset.id,
      [`${kind}Overridden`]: false,
      [kind]: amount,
    });
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
          <div className="w-8 h-8 border-4 border-[#1d4ed8] border-t-transparent rounded-full animate-spin" />
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

  const invoiceNumber = professionalInvoiceNumber(invoice.invoiceNumber, invoiceId);

  return (
    <AdminLayout title="Invoice">
      <button type="button" onClick={() => navigate(back.href)} className="flex items-center gap-1.5 text-gray-400 hover:text-black text-xs font-bold uppercase tracking-widest mb-6">
        <ChevronLeft className="w-4 h-4" /> {back.label}
      </button>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <p className="max-w-xl text-sm text-gray-500">
          Saving updates this invoice only. The client is not emailed or texted until you choose Send to client.
        </p>
        <Link to="/admin/invoice-presets" className="text-xs font-black uppercase tracking-widest text-[#1d4ed8]">
          Edit presets
        </Link>
      </div>

      <BrandedInvoiceShell
        invoiceNumber={invoiceNumber}
        status={String(invoice.status || "draft")}
        amountPaid={Number(invoice.amountPaid) || 0}
        amountDue={quote.amountDue}
        footer={(
          <>
            <Button type="button" onClick={handleSave} disabled={saving} className="w-full rounded-xl bg-[#FFD700] text-xs font-bold text-black hover:bg-[#e6c200]">
              <Save className="w-3.5 h-3.5 mr-1.5" /> {saving ? "Saving..." : "Save invoice"}
            </Button>
            <Button type="button" onClick={copyPaymentLink} variant="outline" className="w-full rounded-xl text-xs font-bold text-black">
              <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy payment link
            </Button>
            <Button type="button" onClick={handleSend} disabled={sending} variant="outline" className="w-full rounded-xl text-xs font-bold text-black">
              <Send className="w-3.5 h-3.5 mr-1.5" /> {sending ? "Sending..." : "Send to client"}
            </Button>
          </>
        )}
      >
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#FFD700]">Bill to</p>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        </div>

        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#1d4ed8]">Line items</p>
          {form.services.length === 0 && (
            <p className="mt-3 text-sm text-gray-500">No services yet. Add one from the package catalog.</p>
          )}
          <div className="mt-3 space-y-4">
            {form.services.map((service, index) => {
              const match = findStaffCatalogPackage(service, catalog);
              const categoryLabel = match ? BOOKING_PACKAGE_CATEGORY_LABELS[match.category] : "";
              const kindLabel = match ? BOOKING_CATALOG_KIND_LABELS[match.bookingKind] : "";
              const catalogPrice = match ? match.price : null;
              return (
                <div key={`${service.id || "line"}-${index}`} className="space-y-4 rounded-2xl border border-gray-200 border-l-4 border-l-[#FFD700] p-4">
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

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
            className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-[#1d4ed8]"
            onClick={() => edit({ services: [...form.services, { name: "", description: "", price: 0, unitPrice: 0, qty: 1 }] })}
          >
            <Plus className="w-3.5 h-3.5" /> Add service
          </button>
        </div>

        <PresetFields form={form} presets={presets} onPreset={onPreset} onAmount={edit} />

        <InvoiceFaceSummary face={face} />

        <label className="block">
          <span className={labelCls}>Invoice notes</span>
          <textarea className={`${areaCls} mt-1`} rows={3} value={form.notes} onChange={(e) => edit({ notes: e.target.value })} />
        </label>
      </BrandedInvoiceShell>
    </AdminLayout>
  );
}

function PresetFields({
  form,
  presets,
  onPreset,
  onAmount,
}: {
  form: StaffInvoiceForm;
  presets: InvoicePreset[];
  onPreset: (kind: InvoicePresetKind, presetId: string) => void;
  onAmount: (patch: Partial<StaffInvoiceForm>) => void;
}) {
  return (
    <div className="rounded-2xl border border-black/10 bg-[#f8fafc] p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-black">Presets</p>
      <p className="mt-1 text-xs text-gray-500">
        Choose a saved preset to fill the amount. You can type over any amount. Processing shows on the invoice only when this invoice has one.
      </p>
      <div className="mt-4 space-y-4">
        {INVOICE_PRESET_KINDS.map((kind) => (
          <PresetRow key={kind} kind={kind} form={form} presets={presets} onPreset={onPreset} onAmount={onAmount} />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 border-t border-gray-200 pt-4 sm:grid-cols-2">
        <label className="block">
          <span className={labelCls}>Promo code</span>
          <input
            className={`${inputCls} mt-1 font-mono tracking-wide`}
            value={form.promoCode}
            placeholder="Promo code"
            onChange={(e) => onAmount({ promoCode: e.target.value })}
          />
        </label>
        <p className="self-end text-xs font-medium text-gray-500">
          The promotion amount is applied once, under Promotions.
        </p>
      </div>
    </div>
  );
}

function PresetRow({
  kind,
  form,
  presets,
  onPreset,
  onAmount,
}: {
  kind: InvoicePresetKind;
  form: StaffInvoiceForm;
  presets: InvoicePreset[];
  onPreset: (kind: InvoicePresetKind, presetId: string) => void;
  onAmount: (patch: Partial<StaffInvoiceForm>) => void;
}) {
  const options = presetsForKind(presets, kind).filter((preset) => preset.active || preset.id === selectedPresetId(form, kind));
  const amount = kind === "promotions" ? form.promoDiscount : kind === "tax" ? form.tax : Number(form[kind]) || 0;
  const selected = selectedPresetId(form, kind);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="block">
        <span className={labelCls}>{INVOICE_PRESET_KIND_LABELS[kind]} preset</span>
        <select
          aria-label={`${INVOICE_PRESET_KIND_LABELS[kind]} preset`}
          className={`${inputCls} mt-1`}
          value={selected}
          onChange={(event) => onPreset(kind, event.target.value)}
        >
          <option value="">No preset</option>
          {options.map((preset) => (
            <option key={preset.id} value={preset.id}>{presetOptionLabel(preset)}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className={labelCls}>{kind === "promotions" ? "Discount amount" : `${INVOICE_PRESET_KIND_LABELS[kind]} amount`}</span>
        <div className="relative mt-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">$</span>
          <input
            type="number"
            min={0}
            step="0.01"
            aria-label={kind === "promotions" ? "Discount amount" : `${INVOICE_PRESET_KIND_LABELS[kind]} amount`}
            className={`${inputCls} pl-7`}
            value={amount}
            onChange={(event) => onAmount(amountPatch(kind, Number(event.target.value)))}
          />
        </div>
      </label>
    </div>
  );
}

function selectedPresetId(form: StaffInvoiceForm, kind: InvoicePresetKind): string {
  if (kind === "promotions") return form.promoPresetId || "";
  if (kind === "tax") return form.taxPresetId || "";
  if (kind === "processing") return form.processingPresetId || "";
  if (kind === "fees") return form.feesPresetId || "";
  return form.travelPresetId || "";
}

function amountPatch(kind: InvoicePresetKind, amount: number): Partial<StaffInvoiceForm> {
  if (kind === "promotions") return { promoDiscount: amount, promoOverridden: true };
  if (kind === "tax") return { tax: amount, taxOverridden: true };
  if (kind === "processing") return { processing: amount, processingOverridden: true };
  if (kind === "fees") return { fees: amount, feesOverridden: true };
  return { travel: amount, travelOverridden: true };
}
