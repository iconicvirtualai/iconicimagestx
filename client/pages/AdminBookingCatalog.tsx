import * as React from "react";
import { collection, doc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { toast } from "sonner";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { db } from "@/lib/firebase";
import { bookingEmbedAvailability } from "@shared/bookingEmbeds";
import {
  BOOKING_CATALOG_KIND_LABELS,
  BOOKING_PACKAGE_CATEGORY_LABELS,
  BOOKING_PACKAGE_CATEGORY_ORDER,
  catalogPackageSaveData,
  newCatalogPackageData,
  packagesForStaffEditor,
  type BookingCatalogKind,
  type BookingPackageCategory,
  type StaffCatalogPackage,
} from "@shared/bookingCatalog";

interface RowEdits {
  name: string;
  price: string;
  description: string;
  isActive: boolean;
  sortOrder: string;
}

const KINDS: BookingCatalogKind[] = ["service", "basic", "addon", "upgrade"];
const CATEGORIES = BOOKING_PACKAGE_CATEGORY_ORDER;
const SERVICE_GROUPS = ["listings", "branding", "business", "growth", "studio"] as const;

function editsFor(item: StaffCatalogPackage): RowEdits {
  return {
    name: item.name,
    price: String(item.price),
    description: item.description,
    isActive: item.isActive,
    sortOrder: String(item.sortOrder),
  };
}

function money(value: number): string {
  return (Number(value) || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export default function AdminBookingCatalog() {
  const embeds = bookingEmbedAvailability();
  const [rows, setRows] = React.useState<StaffCatalogPackage[]>([]);
  const [edits, setEdits] = React.useState<Record<string, RowEdits>>({});
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState({
    id: "",
    name: "",
    price: "",
    description: "",
    bookingKind: "addon" as BookingCatalogKind,
    category: "addon" as BookingPackageCategory,
    serviceCategory: "listings",
    addonGroup: "",
  });

  const load = React.useCallback(async () => {
    const snap = await getDocs(collection(db, "packages"));
    const catalog = packagesForStaffEditor(
      snap.docs.map((entry) => ({ id: entry.id, ...entry.data() })),
      { includeInactive: true },
    );
    setRows(catalog);
    setEdits(Object.fromEntries(catalog.map((item) => [item.id, editsFor(item)])));
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    load()
      .catch(() => {
        if (!cancelled) toast.error("Could not load the booking catalog.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const visible = rows.filter((item) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return `${item.name} ${item.id} ${item.description}`.toLowerCase().includes(needle);
  });

  const saveRow = async (item: StaffCatalogPackage) => {
    const edit = edits[item.id];
    if (!edit) return;
    const result = catalogPackageSaveData(item, {
      name: edit.name,
      price: Number(edit.price),
      description: edit.description,
      isActive: edit.isActive,
      sortOrder: Number(edit.sortOrder),
    });
    if (result.ok === false) {
      toast.error(result.error);
      return;
    }
    setSavingId(item.id);
    try {
      await setDoc(doc(db, "packages", result.id), {
        ...result.data,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      toast.success(`Saved ${result.data.name}`);
      await load();
    } catch {
      toast.error("Could not save that package.");
    } finally {
      setSavingId(null);
    }
  };

  const addPackage = async () => {
    const result = newCatalogPackageData({
      ...draft,
      price: Number(draft.price),
    });
    if (result.ok === false) {
      toast.error(result.error);
      return;
    }
    if (rows.some((item) => item.id === result.id)) {
      toast.error("That package id already exists.");
      return;
    }
    setSavingId(result.id);
    try {
      await setDoc(doc(db, "packages", result.id), {
        ...result.data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      toast.success(`Added ${result.data.name}`);
      setDraft({
        id: "",
        name: "",
        price: "",
        description: "",
        bookingKind: "addon",
        category: "addon",
        serviceCategory: "listings",
        addonGroup: "",
      });
      setAdding(false);
      await load();
    } catch {
      toast.error("Could not add that package.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <AdminLayout title="Booking catalog">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-slate-600">
            Packages here are what the booking form charges. Turn one off to hide it.
            The invoice editor uses this same list.
          </p>
          <p className="mt-2 text-xs font-medium text-slate-400">{embeds.reason}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search packages"
            className="max-w-sm"
          />
          <Button type="button" variant="outline" onClick={() => setAdding((open) => !open)}>
            {adding ? "Close" : "Add a package"}
          </Button>
        </div>

        {adding && (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-500">New package</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input placeholder="id, such as dusk-hero" value={draft.id} onChange={(event) => setDraft({ ...draft, id: event.target.value })} />
              <Input placeholder="Name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
              <Input type="number" min="0" step="0.01" placeholder="Price" value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} />
              <select
                className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={draft.bookingKind}
                onChange={(event) => setDraft({ ...draft, bookingKind: event.target.value as BookingCatalogKind })}
              >
                {KINDS.map((kind) => (
                  <option key={kind} value={kind}>{BOOKING_CATALOG_KIND_LABELS[kind]}</option>
                ))}
              </select>
              <select
                className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={draft.category}
                onChange={(event) => setDraft({ ...draft, category: event.target.value as BookingPackageCategory })}
              >
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>{BOOKING_PACKAGE_CATEGORY_LABELS[category]}</option>
                ))}
              </select>
              {draft.bookingKind === "service" && (
                <select
                  className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
                  value={draft.serviceCategory}
                  onChange={(event) => setDraft({ ...draft, serviceCategory: event.target.value })}
                >
                  {SERVICE_GROUPS.map((group) => (
                    <option key={group} value={group}>{group}</option>
                  ))}
                </select>
              )}
              {draft.bookingKind === "addon" && (
                <Input
                  placeholder="Add-on group, such as The Space"
                  value={draft.addonGroup}
                  onChange={(event) => setDraft({ ...draft, addonGroup: event.target.value })}
                />
              )}
            </div>
            <Textarea
              placeholder="Description"
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />
            <Button type="button" onClick={addPackage} disabled={savingId === draft.id.trim().toLowerCase()}>
              Save package
            </Button>
          </div>
        )}

        {loading && <p className="text-sm font-medium text-slate-400">Loading catalog…</p>}

        <div className="space-y-3">
          {visible.map((item) => {
            const edit = edits[item.id] || editsFor(item);
            const open = openId === item.id;
            return (
              <div key={item.id} className="rounded-3xl border border-slate-200 bg-white shadow-sm">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left"
                  onClick={() => setOpenId(open ? null : item.id)}
                >
                  <span>
                    <span className="block text-sm font-black text-slate-900">
                      {item.name}
                      {!item.isActive && <span className="ml-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Hidden</span>}
                    </span>
                    <span className="mt-1 block text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      {BOOKING_PACKAGE_CATEGORY_LABELS[item.category]} · {BOOKING_CATALOG_KIND_LABELS[item.bookingKind]} · {item.id}
                    </span>
                  </span>
                  <span className="text-sm font-black text-[#0d9488]">{money(item.price)}</span>
                </button>
                {open && (
                  <div className="space-y-3 border-t border-slate-100 px-6 py-5">
                    <Input
                      value={edit.name}
                      onChange={(event) => setEdits({ ...edits, [item.id]: { ...edit, name: event.target.value } })}
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={edit.price}
                        onChange={(event) => setEdits({ ...edits, [item.id]: { ...edit, price: event.target.value } })}
                      />
                      <Input
                        type="number"
                        value={edit.sortOrder}
                        onChange={(event) => setEdits({ ...edits, [item.id]: { ...edit, sortOrder: event.target.value } })}
                      />
                    </div>
                    <Textarea
                      value={edit.description}
                      onChange={(event) => setEdits({ ...edits, [item.id]: { ...edit, description: event.target.value } })}
                    />
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={edit.isActive}
                        onChange={(event) => setEdits({ ...edits, [item.id]: { ...edit, isActive: event.target.checked } })}
                      />
                      Show on the booking form
                    </label>
                    <Button type="button" onClick={() => saveRow(item)} disabled={savingId === item.id}>
                      {savingId === item.id ? "Saving…" : "Save"}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </AdminLayout>
  );
}
