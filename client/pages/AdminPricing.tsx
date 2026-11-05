import * as React from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { collection, doc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { toast } from "sonner";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/firebase";
import { Link } from "react-router-dom";
import { bookingEmbedAvailability } from "@shared/bookingEmbeds";
import { AdminCatalogPackageTitle } from "@/pages/AdminBookingCatalog";
import {
  APPRENTICESHIP_OVERAGE_LABEL,
  APPRENTICESHIP_RULES,
  BOOKING_CATALOG_KIND_LABELS,
  BOOKING_PACKAGE_CATEGORY_LABELS,
  BOOKING_PACKAGE_CATEGORY_ORDER,
  apprenticeshipPackages,
  catalogPackageSaveData,
  newCatalogPackageData,
  packagesForStaffEditor,
  type BookingCatalogKind,
  type BookingPackageCategory,
  type StaffCatalogPackage,
} from "@shared/bookingCatalog";
import {
  mergePricingAdjustments,
  PRICING_ADJUSTMENTS_COLLECTION,
  pricingAdjustmentRemoval,
  pricingAdjustmentSaveData,
  type PricingAdjustment,
  type PricingAdjustmentKind,
  type PricingAdjustmentMode,
} from "@shared/pricingSettings";

const labelCls = "text-[10px] font-black uppercase tracking-widest text-gray-400";
const inputCls = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-black focus:outline-none focus:ring-2 focus:ring-[#0d9488]/30";

function money(value: number): string {
  return (Number(value) || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

type PriceTab = "packages" | "addons" | "adjustments" | "list";

interface PackageFields {
  name: string;
  price: string;
  description: string;
  active: boolean;
  sortOrder: string;
}

interface LegacySheetRow {
  id: string;
  name: string;
  price: string;
  priceMax: string;
  priceType: string;
  category: string;
  description: string;
  billingNote: string;
}

/** Names that lived only on the old price sheet. They are not charged until added as a package. */
const LEGACY_PRICE_SHEET: LegacySheetRow[] = [
  { id: "business-professional-suite", name: "The Professional Suite", price: "1500", priceMax: "", priceType: "per-month", category: "business", description: "Your Digital Storefront, Fully Managed.", billingNote: "Per Month" },
  { id: "business-signature-tier", name: "The Signature Tier", price: "2800", priceMax: "", priceType: "per-month", category: "business", description: "The High-Volume Authority.", billingNote: "Per Month" },
  { id: "business-iconic-partnership", name: "The Iconic Partnership", price: "4500", priceMax: "", priceType: "per-month", category: "business", description: "Your Personal Media Agency.", billingNote: "Per Month" },
  { id: "business-connected-core", name: "The Connected Core", price: "2000", priceMax: "", priceType: "per-month", category: "business", description: "Social + Database Penetration.", billingNote: "Per Month" },
  { id: "business-authority-stack", name: "The Authority Stack", price: "3200", priceMax: "", priceType: "per-month", category: "business", description: "Total Audience Ownership.", billingNote: "Per Month" },
  { id: "video-addon", name: "Video Add-On", price: "350", priceMax: "500", priceType: "addon", category: "real-estate", description: "Full video production. The booking form charges Basic Video until this is added.", billingNote: "Per Listing" },
  { id: "growth-foundation", name: "The Foundation", price: "0", priceMax: "", priceType: "fixed", category: "brand-identity", description: "Essential visual assets. Price was listed as not set.", billingNote: "Per Project" },
  { id: "growth-evolution", name: "The Evolution", price: "0", priceMax: "", priceType: "fixed", category: "brand-identity", description: "Cutting-edge AI integration. Price was listed as not set.", billingNote: "Per Project" },
  { id: "growth-bundle", name: "The Bundle", price: "0", priceMax: "", priceType: "fixed", category: "brand-identity", description: "Foundation + Evolution. Price was listed as not set.", billingNote: "Per Project" },
];

const SERVICE_GROUPS = ["listings", "branding", "business", "growth", "studio"] as const;

function amountLabel(item: PricingAdjustment): string {
  if (item.mode === "percent") return `${item.amount}%`;
  if (item.mode === "per_sqft") return `${money(item.amount)} / sq ft`;
  return money(item.amount);
}

export default function AdminPricing() {
  const [packages, setPackages] = React.useState<StaffCatalogPackage[]>([]);
  const [adjustments, setAdjustments] = React.useState<PricingAdjustment[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editingPackage, setEditingPackage] = React.useState<string | null>(null);
  const [editingAdjustment, setEditingAdjustment] = React.useState<string | null>(null);
  const [packageDraft, setPackageDraft] = React.useState<Record<string, PackageFields>>({});
  const [adjustmentDraft, setAdjustmentDraft] = React.useState<Record<string, PricingAdjustment>>({});
  const [tab, setTab] = React.useState<PriceTab>("packages");
  const [query, setQuery] = React.useState("");
  const [listFilters, setListFilters] = React.useState<Record<string, string>>({});
  const [addingPackage, setAddingPackage] = React.useState(false);
  const [newPackage, setNewPackage] = React.useState({
    id: "",
    name: "",
    price: "",
    description: "",
    bookingKind: "service" as BookingCatalogKind,
    category: "photography" as BookingPackageCategory,
    serviceCategory: "listings",
    addonGroup: "",
  });
  const [addingAdjustment, setAddingAdjustment] = React.useState(false);
  const [newAdjustment, setNewAdjustment] = React.useState({
    kind: "promo" as PricingAdjustmentKind,
    name: "",
    mode: "flat" as PricingAdjustmentMode,
    amount: "",
    code: "",
  });

  const load = React.useCallback(async () => {
    const [packageResult, adjustmentResult] = await Promise.allSettled([
      getDocs(collection(db, "packages")),
      getDocs(collection(db, PRICING_ADJUSTMENTS_COLLECTION)),
    ]);
    const catalog = packagesForStaffEditor(
      packageResult.status === "fulfilled"
        ? packageResult.value.docs.map((entry) => ({ id: entry.id, ...entry.data() }))
        : [],
      { includeInactive: true },
    );
    const rates = mergePricingAdjustments(
      adjustmentResult.status === "fulfilled"
        ? adjustmentResult.value.docs.map((entry) => ({ id: entry.id, ...entry.data() }))
        : [],
    );
    if (packageResult.status === "rejected" || adjustmentResult.status === "rejected") {
      toast.error("Some saved prices could not be read. Showing the defaults for those.");
    }
    setPackages(catalog);
    setAdjustments(rates);
    setPackageDraft(Object.fromEntries(catalog.map((item) => [item.id, {
      name: item.name,
      price: String(item.price),
      description: item.description,
      active: item.isActive,
      sortOrder: String(item.sortOrder),
    }])));
    setAdjustmentDraft(Object.fromEntries(rates.map((item) => [item.id, item])));
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    load()
      .catch(() => {
        if (!cancelled) toast.error("Could not load prices.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const savePackage = async (item: StaffCatalogPackage) => {
    const draft = packageDraft[item.id];
    if (!draft) return;
    const result = catalogPackageSaveData(item, {
      name: draft.name,
      price: Number(draft.price),
      description: draft.description,
      isActive: draft.active,
      sortOrder: Number(draft.sortOrder),
    });
    if (result.ok === false) {
      toast.error(result.error);
      return;
    }
    await setDoc(doc(db, "packages", result.id), { ...result.data, removed: false, updatedAt: serverTimestamp() }, { merge: true });
    toast.success(`Saved ${result.data.name}`);
    setEditingPackage(null);
    await load();
  };

  const removePackage = async (item: StaffCatalogPackage) => {
    if (!window.confirm(`Remove ${item.name} from the price list? The booking page will stop offering it.`)) return;
    await setDoc(doc(db, "packages", item.id), { removed: true, isActive: false, updatedAt: serverTimestamp() }, { merge: true });
    toast.success(`Removed ${item.name}`);
    await load();
  };

  const addPackage = async () => {
    const result = newCatalogPackageData({
      id: newPackage.id,
      name: newPackage.name,
      price: Number(newPackage.price),
      description: newPackage.description,
      bookingKind: newPackage.bookingKind,
      category: newPackage.category,
      serviceCategory: newPackage.bookingKind === "service" ? newPackage.serviceCategory : undefined,
      addonGroup: newPackage.bookingKind === "addon" ? newPackage.addonGroup : undefined,
    });
    if (result.ok === false) {
      toast.error(result.error);
      return;
    }
    await setDoc(doc(db, "packages", result.id), {
      ...result.data,
      removed: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    toast.success(`Added ${result.data.name}`);
    setAddingPackage(false);
    setNewPackage({
      id: "",
      name: "",
      price: "",
      description: "",
      bookingKind: "service",
      category: "photography",
      serviceCategory: "listings",
      addonGroup: "",
    });
    await load();
  };

  const saveAdjustment = async (item: PricingAdjustment) => {
    const draft = adjustmentDraft[item.id] || item;
    const result = pricingAdjustmentSaveData(draft);
    if (result.ok === false) {
      toast.error(result.error);
      return;
    }
    await setDoc(doc(db, PRICING_ADJUSTMENTS_COLLECTION, result.id), {
      ...result.data,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    toast.success(`Saved ${result.data.name}`);
    setEditingAdjustment(null);
    await load();
  };

  const removeAdjustment = async (item: PricingAdjustment) => {
    if (!window.confirm(`Remove ${item.name}? New orders will stop using it.`)) return;
    await setDoc(doc(db, PRICING_ADJUSTMENTS_COLLECTION, item.id), {
      ...pricingAdjustmentRemoval(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    toast.success(`Removed ${item.name}`);
    await load();
  };

  const addAdjustment = async () => {
    const result = pricingAdjustmentSaveData({
      kind: newAdjustment.kind,
      name: newAdjustment.name,
      mode: newAdjustment.mode,
      amount: Number(newAdjustment.amount),
      code: newAdjustment.kind === "promo" ? newAdjustment.code || newAdjustment.name : undefined,
      active: true,
    });
    if (result.ok === false) {
      toast.error(result.error);
      return;
    }
    await setDoc(doc(db, PRICING_ADJUSTMENTS_COLLECTION, result.id), {
      ...result.data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    toast.success(`Added ${result.data.name}`);
    setAddingAdjustment(false);
    setNewAdjustment({ kind: "promo", name: "", mode: "flat", amount: "", code: "" });
    await load();
  };

  const embeds = bookingEmbedAvailability();
  const needle = query.trim().toLowerCase();
  const matches = (item: StaffCatalogPackage) => !needle || `${item.name} ${item.id} ${item.description}`.toLowerCase().includes(needle);
  const products = packages.filter((item) => (item.bookingKind === "service" || item.bookingKind === "basic") && matches(item));
  const addOns = packages.filter((item) => (item.bookingKind === "addon" || item.bookingKind === "upgrade") && matches(item));
  const knownIds = new Set(packages.map((item) => item.id));
  const legacyRows = LEGACY_PRICE_SHEET.filter((row) => !knownIds.has(row.id));

  return (
    <AdminLayout title="Prices">
      <div className="mx-auto flex max-w-4xl flex-col gap-8">
        <header>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#FFD700]">Iconic Images</p>
          <h2 className="mt-1 text-2xl font-black text-black">Prices</h2>
          <p className="mt-2 max-w-2xl text-sm text-gray-500">
            Packages, add-ons, tax, processing, travel, and promo codes. The booking page and new invoices read these.
            Pencil edits one. The trash can removes it. Nothing here emails a client.
          </p>
          <p className="mt-2 text-xs font-medium text-gray-400">{embeds.reason}</p>
          <Link to="/admin/edit-site" className="mt-3 inline-block text-xs font-bold text-[#0d9488]">Site editor</Link>
        </header>

        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Price sections">
          {([
            ["packages", "Packages"],
            ["addons", "Add-ons"],
            ["adjustments", "Adjustments"],
            ["list", "Price list"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest ${tab === id ? "bg-black text-[#FFD700]" : "bg-white text-gray-500"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "packages" || tab === "addons" ? (
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search packages"
            aria-label="Search packages"
            className={`${inputCls} max-w-sm`}
          />
        ) : null}

        {loading ? <p className="text-sm font-bold text-gray-400">Loading prices…</p> : null}

        {tab === "packages" ? (
        <PriceSection
          title="Products and packages"
          action="Add a package"
          onAdd={() => {
            setNewPackage((current) => ({ ...current, bookingKind: "service", category: "photography" }));
            setAddingPackage(true);
          }}
        >
          {addingPackage && newPackage.bookingKind !== "addon" ? (
            <NewPackageForm
              draft={newPackage}
              setDraft={setNewPackage}
              onSave={addPackage}
              onCancel={() => setAddingPackage(false)}
            />
          ) : null}
          {products.map((item) => (
            <PackageRow
              key={item.id}
              item={item}
              editing={editingPackage === item.id}
              draft={packageDraft[item.id]}
              onDraft={(next) => setPackageDraft((current) => ({ ...current, [item.id]: next }))}
              onEdit={() => setEditingPackage(item.id)}
              onSave={() => savePackage(item)}
              onRemove={() => removePackage(item)}
            />
          ))}
        </PriceSection>
        ) : null}

        {tab === "addons" ? (
        <PriceSection title="Add-ons" action="Add an add-on" onAdd={() => {
          setNewPackage((current) => ({ ...current, bookingKind: "addon", category: "addon" }));
          setAddingPackage(true);
        }}>
          {addingPackage && newPackage.bookingKind === "addon" ? (
            <NewPackageForm
              draft={newPackage}
              setDraft={setNewPackage}
              onSave={addPackage}
              onCancel={() => setAddingPackage(false)}
            />
          ) : null}
          {addOns.map((item) => (
            <PackageRow
              key={item.id}
              item={item}
              editing={editingPackage === item.id}
              draft={packageDraft[item.id]}
              onDraft={(next) => setPackageDraft((current) => ({ ...current, [item.id]: next }))}
              onEdit={() => setEditingPackage(item.id)}
              onSave={() => savePackage(item)}
              onRemove={() => removePackage(item)}
            />
          ))}
        </PriceSection>
        ) : null}

        {tab === "adjustments" ? (
        <PriceSection title="Adjustments" action="Add an adjustment" onAdd={() => setAddingAdjustment(true)}>
          <p className="text-xs text-gray-500">
            Tax rate, processing fee, travel zones, promo codes, and the booking fees for headshots, apprenticeship, and senior living. The Pay at Close row stays editable here. The public page, booking total, and Titus invoice do not add it on top of package prices. Titus shows its own fee. Turning the row off still hides checkout. Checkout stays hidden until PAY_AT_CLOSE_LIVE is true. Card processing on Pay at Close stays off until you turn that row on.
          </p>
          {addingAdjustment ? (
            <div className="grid gap-3 rounded-2xl border border-dashed border-gray-200 p-4 sm:grid-cols-2">
              <label className="block">
                <span className={labelCls}>Kind</span>
                <select className={`${inputCls} mt-1`} value={newAdjustment.kind} onChange={(event) => setNewAdjustment((current) => ({ ...current, kind: event.target.value as PricingAdjustmentKind }))}>
                  <option value="tax">Tax rate</option>
                  <option value="processing">Processing fee</option>
                  <option value="travel">Travel fee</option>
                  <option value="promo">Promo code</option>
                  <option value="fee">Other fee</option>
                </select>
              </label>
              <label className="block">
                <span className={labelCls}>Name</span>
                <input className={`${inputCls} mt-1`} value={newAdjustment.name} onChange={(event) => setNewAdjustment((current) => ({ ...current, name: event.target.value }))} />
              </label>
              <label className="block">
                <span className={labelCls}>Amount type</span>
                <select className={`${inputCls} mt-1`} value={newAdjustment.mode} onChange={(event) => setNewAdjustment((current) => ({ ...current, mode: event.target.value as PricingAdjustmentMode }))}>
                  <option value="flat">Dollars</option>
                  <option value="percent">Percent</option>
                  <option value="per_sqft">Per square foot</option>
                </select>
              </label>
              <label className="block">
                <span className={labelCls}>Amount</span>
                <input className={`${inputCls} mt-1`} type="number" min={0} step="0.01" value={newAdjustment.amount} onChange={(event) => setNewAdjustment((current) => ({ ...current, amount: event.target.value }))} />
              </label>
              {newAdjustment.kind === "promo" ? (
                <label className="block sm:col-span-2">
                  <span className={labelCls}>Code clients type</span>
                  <input className={`${inputCls} mt-1 uppercase`} value={newAdjustment.code} onChange={(event) => setNewAdjustment((current) => ({ ...current, code: event.target.value }))} />
                </label>
              ) : null}
              <div className="flex gap-2 sm:col-span-2">
                <Button type="button" onClick={addAdjustment} className="rounded-xl bg-black text-xs font-bold text-[#FFD700]">Save adjustment</Button>
                <Button type="button" variant="outline" onClick={() => setAddingAdjustment(false)} className="rounded-xl text-xs font-bold">Cancel</Button>
              </div>
            </div>
          ) : null}
          {adjustments.map((item) => {
            const draft = adjustmentDraft[item.id] || item;
            const editing = editingAdjustment === item.id;
            return (
              <div key={item.id} data-testid={`price-adjustment-${item.id}`} className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-black">{item.name}</p>
                  <p className="text-[11px] font-medium text-gray-500">
                    {item.kind} · {item.active ? amountLabel(item) : "Hidden"}
                    {item.code ? ` · ${item.code}` : ""}
                    {item.outerMiles ? ` · through ${item.outerMiles} mi` : ""}
                  </p>
                  {item.note ? <p className="mt-1 text-[11px] text-gray-400">{item.note}</p> : null}
                  {editing ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <input aria-label={`${item.name} name`} className={inputCls} value={draft.name} onChange={(event) => setAdjustmentDraft((current) => ({ ...current, [item.id]: { ...draft, name: event.target.value } }))} />
                      <input aria-label={`${item.name} amount`} type="number" min={0} step="0.01" className={inputCls} value={draft.amount} onChange={(event) => setAdjustmentDraft((current) => ({ ...current, [item.id]: { ...draft, amount: Number(event.target.value) } }))} />
                      <label className="flex items-center gap-2 text-xs font-bold">
                        <input type="checkbox" checked={draft.active} onChange={(event) => setAdjustmentDraft((current) => ({ ...current, [item.id]: { ...draft, active: event.target.checked } }))} />
                        Active
                      </label>
                      {item.kind === "promo" ? (
                        <input aria-label={`${item.name} code`} className={inputCls} value={draft.code || ""} onChange={(event) => setAdjustmentDraft((current) => ({ ...current, [item.id]: { ...draft, code: event.target.value.toUpperCase() } }))} />
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-1">
                  {editing ? (
                    <Button type="button" onClick={() => saveAdjustment(item)} className="rounded-xl bg-[#0d9488] text-xs font-bold text-white">Save</Button>
                  ) : (
                    <button type="button" aria-label={`Edit ${item.name}`} className="rounded-lg p-2 text-gray-500 hover:bg-white hover:text-black" onClick={() => setEditingAdjustment(item.id)}>
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  <button type="button" aria-label={`Remove ${item.name}`} className="rounded-lg p-2 text-gray-400 hover:bg-white hover:text-red-600" onClick={() => removeAdjustment(item)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </PriceSection>
        ) : null}

        {tab === "list" ? <PriceList packages={packages} legacyRows={legacyRows} filters={listFilters} setFilters={setListFilters} /> : null}
      </div>
    </AdminLayout>
  );
}

function PriceSection({
  title,
  action,
  onAdd,
  children,
}: {
  title: string;
  action: string;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[2rem] border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">{title}</h3>
        <button type="button" onClick={onAdd} className="inline-flex items-center gap-1 text-xs font-bold text-[#0d9488]">
          <Plus className="h-3.5 w-3.5" /> {action}
        </button>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function PackageRow({
  item,
  editing,
  draft,
  onDraft,
  onEdit,
  onSave,
  onRemove,
}: {
  item: StaffCatalogPackage;
  editing: boolean;
  draft?: PackageFields;
  onDraft: (next: PackageFields) => void;
  onEdit: () => void;
  onSave: () => void;
  onRemove: () => void;
}) {
  const fields = draft || { name: item.name, price: String(item.price), description: item.description, active: item.isActive, sortOrder: String(item.sortOrder) };
  return (
    <div data-testid={`price-package-${item.id}`} className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <AdminCatalogPackageTitle item={item} />
        <p className="text-[11px] font-medium text-gray-500">
          {BOOKING_PACKAGE_CATEGORY_LABELS[item.category]} · {BOOKING_CATALOG_KIND_LABELS[item.bookingKind]} · {item.id}
          {item.price > 0 ? ` · ${money(item.price)}` : " · No price yet"}
        </p>
        {apprenticeshipPackages.some((pkg) => pkg.id === item.id) ? (
          <p className="mt-2 max-w-md text-xs font-medium text-slate-500 whitespace-normal">
            {item.appointmentLimit}. Overages {APPRENTICESHIP_OVERAGE_LABEL}. {APPRENTICESHIP_RULES.join(" ")}
          </p>
        ) : null}
        {editing ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input aria-label={`${item.name} name`} className={inputCls} value={fields.name} onChange={(event) => onDraft({ ...fields, name: event.target.value })} />
            <input aria-label={`${item.name} price`} type="number" min={0} step="0.01" className={inputCls} value={fields.price} onChange={(event) => onDraft({ ...fields, price: event.target.value })} />
            <input aria-label={`${item.name} sort order`} type="number" className={inputCls} value={fields.sortOrder} onChange={(event) => onDraft({ ...fields, sortOrder: event.target.value })} />
            <label className="flex items-center gap-2 text-xs font-bold">
              <input type="checkbox" checked={fields.active} onChange={(event) => onDraft({ ...fields, active: event.target.checked })} />
              Show on the booking form
            </label>
            <textarea aria-label={`${item.name} description`} className={`${inputCls} sm:col-span-2 whitespace-normal`} rows={3} value={fields.description} onChange={(event) => onDraft({ ...fields, description: event.target.value })} />
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-1">
        {editing ? (
          <Button type="button" onClick={onSave} className="rounded-xl bg-[#0d9488] text-xs font-bold text-white">Save</Button>
        ) : (
          <button type="button" aria-label={`Edit ${item.name}`} className="rounded-lg p-2 text-gray-500 hover:bg-white hover:text-black" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </button>
        )}
        <button type="button" aria-label={`Remove ${item.name}`} className="rounded-lg p-2 text-gray-400 hover:bg-white hover:text-red-600" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function NewPackageForm({
  draft,
  setDraft,
  onSave,
  onCancel,
}: {
  draft: {
    id: string;
    name: string;
    price: string;
    description: string;
    bookingKind: BookingCatalogKind;
    category: BookingPackageCategory;
    serviceCategory: string;
    addonGroup: string;
  };
  setDraft: (next: {
    id: string;
    name: string;
    price: string;
    description: string;
    bookingKind: BookingCatalogKind;
    category: BookingPackageCategory;
    serviceCategory: string;
    addonGroup: string;
  }) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="grid gap-3 rounded-2xl border border-dashed border-gray-200 p-4 sm:grid-cols-2">
      <label className="block">
        <span className={labelCls}>Id</span>
        <input className={`${inputCls} mt-1`} value={draft.id} onChange={(event) => setDraft({ ...draft, id: event.target.value })} />
      </label>
      <label className="block">
        <span className={labelCls}>Name</span>
        <input className={`${inputCls} mt-1`} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
      </label>
      <label className="block">
        <span className={labelCls}>Price</span>
        <input type="number" min={0} step="0.01" className={`${inputCls} mt-1`} value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} />
      </label>
      <label className="block">
        <span className={labelCls}>Kind</span>
        <select className={`${inputCls} mt-1`} value={draft.bookingKind} onChange={(event) => setDraft({ ...draft, bookingKind: event.target.value as BookingCatalogKind })}>
          {(["service", "basic", "addon", "upgrade"] as const).map((kind) => (
            <option key={kind} value={kind}>{BOOKING_CATALOG_KIND_LABELS[kind]}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className={labelCls}>Category</span>
        <select className={`${inputCls} mt-1`} value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as BookingPackageCategory })}>
          {BOOKING_PACKAGE_CATEGORY_ORDER.map((category) => (
            <option key={category} value={category}>{BOOKING_PACKAGE_CATEGORY_LABELS[category]}</option>
          ))}
        </select>
      </label>
      {draft.bookingKind === "service" ? (
        <label className="block">
          <span className={labelCls}>Booking group</span>
          <select className={`${inputCls} mt-1`} value={draft.serviceCategory} onChange={(event) => setDraft({ ...draft, serviceCategory: event.target.value })}>
            {SERVICE_GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}
          </select>
        </label>
      ) : null}
      {draft.bookingKind === "addon" ? (
        <label className="block">
          <span className={labelCls}>Add-on group</span>
          <input className={`${inputCls} mt-1`} placeholder="The Space" value={draft.addonGroup} onChange={(event) => setDraft({ ...draft, addonGroup: event.target.value })} />
        </label>
      ) : null}
      <label className="block sm:col-span-2">
        <span className={labelCls}>Description</span>
        <textarea className={`${inputCls} mt-1 whitespace-normal`} rows={3} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="button" onClick={onSave} className="rounded-xl bg-black text-xs font-bold text-[#FFD700]">Save</Button>
        <Button type="button" variant="outline" onClick={onCancel} className="rounded-xl text-xs font-bold">Cancel</Button>
      </div>
    </div>
  );
}

function PriceList({
  packages,
  legacyRows,
  filters,
  setFilters,
}: {
  packages: StaffCatalogPackage[];
  legacyRows: LegacySheetRow[];
  filters: Record<string, string>;
  setFilters: (next: Record<string, string>) => void;
}) {
  const rows = [
    ...packages.map((item) => ({
      id: item.id,
      name: item.name,
      price: String(item.price),
      priceMax: "",
      category: item.category,
      active: item.isActive ? "true" : "false",
      description: apprenticeshipPackages.some((pkg) => pkg.id === item.id)
        ? [item.appointmentLimit, `Overages ${APPRENTICESHIP_OVERAGE_LABEL}.`, ...APPRENTICESHIP_RULES].filter(Boolean).join(" ")
        : item.description,
      charged: "Yes",
    })),
    ...legacyRows.map((row) => ({
      id: row.id,
      name: row.name,
      price: row.price,
      priceMax: row.priceMax,
      category: row.category,
      active: "sheet",
      description: `${row.description} ${row.billingNote}. ${row.priceType}.`,
      charged: "Not charged until added",
    })),
  ].filter((row) => Object.entries(filters).every(([key, value]) => {
    if (!value) return true;
    return String(row[key as keyof typeof row] || "").toLowerCase().includes(value.toLowerCase());
  }));

  const columns = [
    { key: "id", label: "ID", min: "min-w-[10rem]" },
    { key: "name", label: "Name", min: "min-w-[12rem]" },
    { key: "price", label: "Price", min: "min-w-[7rem]" },
    { key: "priceMax", label: "Price max", min: "min-w-[8rem]" },
    { key: "category", label: "Category", min: "min-w-[8rem]" },
    { key: "active", label: "Active", min: "min-w-[7rem]" },
    { key: "description", label: "Description", min: "min-w-[280px]" },
    { key: "charged", label: "Charged", min: "min-w-[11rem]" },
  ] as const;

  const filter = (column: string) => (
    <input
      aria-label={`Filter ${column}`}
      placeholder="Filter..."
      value={filters[column] || ""}
      onChange={(event) => setFilters({ ...filters, [column]: event.target.value })}
      className="mt-2 box-border h-8 w-full min-w-[6.5rem] rounded-md border border-slate-200 px-2 text-xs font-medium normal-case tracking-normal text-slate-700"
    />
  );

  return (
    <section className="overflow-hidden rounded-[2rem] border border-gray-100 bg-white shadow-sm">
      <div className="border-b border-slate-50 p-6">
        <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Price list</h3>
        <p className="mt-2 text-xs text-gray-500">
          What the booking page charges, plus names that were only on the old price sheet.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-max min-w-full border-collapse">
          <thead className="bg-slate-50/50">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={`whitespace-nowrap px-4 py-3 text-left align-bottom text-[10px] font-black uppercase tracking-widest text-slate-500 ${column.min}`}>
                  <span className="block whitespace-nowrap">{column.label}</span>
                  {filter(column.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-50">
                <td className="whitespace-nowrap px-4 py-2 font-mono text-[11px] font-bold text-[#0d9488]">{row.id}</td>
                <td className="whitespace-nowrap px-4 py-2 text-xs font-black uppercase">{row.name}</td>
                <td className="whitespace-nowrap px-4 py-2 text-xs font-bold">${row.price}</td>
                <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-400">{row.priceMax ? `$${row.priceMax}` : "—"}</td>
                <td className="whitespace-nowrap px-4 py-2 text-[10px] font-black uppercase">{row.category}</td>
                <td className="whitespace-nowrap px-4 py-2 text-[10px] font-black uppercase">{row.active}</td>
                <td className="px-4 py-2 align-top">
                  <p className="line-clamp-3 w-[280px] text-xs font-medium leading-5 text-slate-500" title={row.description}>{row.description}</p>
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-[10px] font-bold uppercase text-slate-500">{row.charged}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
