import * as React from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { collection, doc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { toast } from "sonner";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/firebase";
import {
  BOOKING_CATALOG_KIND_LABELS,
  catalogPackageSaveData,
  newCatalogPackageData,
  packagesForStaffEditor,
  type BookingCatalogKind,
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
  const [packageDraft, setPackageDraft] = React.useState<Record<string, { name: string; price: string; description: string; active: boolean }>>({});
  const [adjustmentDraft, setAdjustmentDraft] = React.useState<Record<string, PricingAdjustment>>({});
  const [addingPackage, setAddingPackage] = React.useState<"service" | "addon" | null>(null);
  const [newPackage, setNewPackage] = React.useState({ id: "", name: "", price: "", description: "" });
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
      sortOrder: item.sortOrder,
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
    const kind: BookingCatalogKind = addingPackage === "addon" ? "addon" : "service";
    const result = newCatalogPackageData({
      id: newPackage.id,
      name: newPackage.name,
      price: Number(newPackage.price),
      description: newPackage.description,
      bookingKind: kind,
      category: kind === "addon" ? "addon" : "photography",
      serviceCategory: kind === "service" ? "listings" : undefined,
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
    setAddingPackage(null);
    setNewPackage({ id: "", name: "", price: "", description: "" });
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

  const products = packages.filter((item) => item.bookingKind === "service" || item.bookingKind === "basic");
  const addOns = packages.filter((item) => item.bookingKind === "addon" || item.bookingKind === "upgrade");

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
        </header>

        {loading ? <p className="text-sm font-bold text-gray-400">Loading prices…</p> : null}

        <PriceSection
          title="Products and packages"
          action="Add a package"
          onAdd={() => setAddingPackage("service")}
        >
          {addingPackage === "service" ? (
            <NewPackageForm
              draft={newPackage}
              setDraft={setNewPackage}
              onSave={addPackage}
              onCancel={() => setAddingPackage(null)}
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

        <PriceSection title="Add-ons" action="Add an add-on" onAdd={() => setAddingPackage("addon")}>
          {addingPackage === "addon" ? (
            <NewPackageForm
              draft={newPackage}
              setDraft={setNewPackage}
              onSave={addPackage}
              onCancel={() => setAddingPackage(null)}
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

        <PriceSection title="Adjustments" action="Add an adjustment" onAdd={() => setAddingAdjustment(true)}>
          <p className="text-xs text-gray-500">
            Tax rate, processing fee, travel zones, promo codes, and the booking fees for headshots, apprenticeship, and senior living.
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
  draft?: { name: string; price: string; description: string; active: boolean };
  onDraft: (next: { name: string; price: string; description: string; active: boolean }) => void;
  onEdit: () => void;
  onSave: () => void;
  onRemove: () => void;
}) {
  const fields = draft || { name: item.name, price: String(item.price), description: item.description, active: item.isActive };
  return (
    <div data-testid={`price-package-${item.id}`} className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-black text-black">
          {item.name}
          {!item.isActive ? <span className="ml-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Hidden</span> : null}
        </p>
        <p className="text-[11px] font-medium text-gray-500">
          {BOOKING_CATALOG_KIND_LABELS[item.bookingKind]} · {item.price > 0 ? money(item.price) : "No price yet"}
        </p>
        {editing ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input aria-label={`${item.name} name`} className={inputCls} value={fields.name} onChange={(event) => onDraft({ ...fields, name: event.target.value })} />
            <input aria-label={`${item.name} price`} type="number" min={0} step="0.01" className={inputCls} value={fields.price} onChange={(event) => onDraft({ ...fields, price: event.target.value })} />
            <label className="flex items-center gap-2 text-xs font-bold sm:col-span-2">
              <input type="checkbox" checked={fields.active} onChange={(event) => onDraft({ ...fields, active: event.target.checked })} />
              Active on the booking page
            </label>
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
  draft: { id: string; name: string; price: string; description: string };
  setDraft: (next: { id: string; name: string; price: string; description: string }) => void;
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
        <span className={labelCls}>Description</span>
        <input className={`${inputCls} mt-1`} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="button" onClick={onSave} className="rounded-xl bg-black text-xs font-bold text-[#FFD700]">Save</Button>
        <Button type="button" variant="outline" onClick={onCancel} className="rounded-xl text-xs font-bold">Cancel</Button>
      </div>
    </div>
  );
}
