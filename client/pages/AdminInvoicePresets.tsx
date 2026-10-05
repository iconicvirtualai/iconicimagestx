import * as React from "react";
import { Link } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import {
  createInvoicePreset,
  deleteInvoicePreset,
  updateInvoicePreset,
  watchInvoicePresets,
} from "@/lib/invoicePresets";
import {
  INVOICE_PRESET_KINDS,
  INVOICE_PRESET_KIND_LABELS,
  presetOptionLabel,
  type InvoicePreset,
  type InvoicePresetKind,
  type InvoicePresetMode,
} from "@shared/invoicePresets";

const labelCls = "text-[10px] font-black text-gray-400 uppercase tracking-widest";
const inputCls = "w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold text-black focus:outline-none focus:ring-2 focus:ring-[#1d4ed8]/40";

const emptyDraft = {
  kind: "fees" as InvoicePresetKind,
  name: "",
  mode: "flat" as InvoicePresetMode,
  amount: "",
};

export default function AdminInvoicePresets() {
  const [presets, setPresets] = React.useState<InvoicePreset[]>([]);
  const [draft, setDraft] = React.useState(emptyDraft);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => watchInvoicePresets(setPresets), []);

  const add = async () => {
    setSaving(true);
    try {
      await createInvoicePreset({
        kind: draft.kind,
        name: draft.name,
        mode: draft.mode,
        amount: Number(draft.amount),
      });
      setDraft(emptyDraft);
      toast.success("Preset saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the preset.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout title="Invoice presets">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#FFD700]">Iconic Images</p>
          <h2 className="mt-1 text-2xl font-black text-black">Invoice presets</h2>
          <p className="mt-2 max-w-2xl text-sm text-gray-500">
            Processing, fees, travel, tax, and promotions. Each preset is a flat dollar amount or a percent of the service subtotal.
            Staff pick one on an invoice. Nothing here is charged on its own.
          </p>
        </div>
        <Link to="/admin/orders" className="text-xs font-black uppercase tracking-widest text-[#1d4ed8]">
          Orders
        </Link>
      </div>

      <section className="mb-6 rounded-2xl border border-black bg-white p-6 shadow-sm">
        <div className="mb-4 h-1.5 w-24 bg-[#FFD700]" />
        <h3 className="text-sm font-black uppercase tracking-widest text-black">Add a preset</h3>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <label className="block">
            <span className={labelCls}>Applies to</span>
            <select aria-label="Preset kind" className={`${inputCls} mt-1`} value={draft.kind} onChange={(event) => setDraft((prev) => ({ ...prev, kind: event.target.value as InvoicePresetKind }))}>
              {INVOICE_PRESET_KINDS.map((kind) => (
                <option key={kind} value={kind}>{INVOICE_PRESET_KIND_LABELS[kind]}</option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className={labelCls}>Name</span>
            <input aria-label="Preset name" className={`${inputCls} mt-1`} value={draft.name} onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))} />
          </label>
          <label className="block">
            <span className={labelCls}>Amount type</span>
            <select aria-label="Preset amount type" className={`${inputCls} mt-1`} value={draft.mode} onChange={(event) => setDraft((prev) => ({ ...prev, mode: event.target.value as InvoicePresetMode }))}>
              <option value="flat">Flat dollars</option>
              <option value="percent">Percent</option>
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>{draft.mode === "percent" ? "Percent" : "Dollars"}</span>
            <input
              aria-label="Preset amount"
              type="number"
              min={0}
              step="0.01"
              className={`${inputCls} mt-1`}
              value={draft.amount}
              onChange={(event) => setDraft((prev) => ({ ...prev, amount: event.target.value }))}
            />
          </label>
        </div>
        <Button type="button" onClick={add} disabled={saving} className="mt-4 rounded-xl bg-black text-xs font-bold text-[#FFD700] hover:bg-zinc-900">
          <Plus className="mr-1.5 h-3.5 w-3.5" /> {saving ? "Saving..." : "Add preset"}
        </Button>
      </section>

      {presets.length === 0 ? (
        <p className="text-sm font-bold text-gray-500">No presets yet. Add the amounts your office wants staff to choose from.</p>
      ) : (
        <div className="space-y-3">
          {presets.map((preset) => (
            <PresetRow key={preset.id} preset={preset} />
          ))}
        </div>
      )}
    </AdminLayout>
  );
}

function PresetRow({ preset }: { preset: InvoicePreset }) {
  const [name, setName] = React.useState(preset.name);
  const [mode, setMode] = React.useState<InvoicePresetMode>(preset.mode);
  const [amount, setAmount] = React.useState(String(preset.amount));
  const [active, setActive] = React.useState(preset.active);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setName(preset.name);
    setMode(preset.mode);
    setAmount(String(preset.amount));
    setActive(preset.active);
  }, [preset]);

  const save = async () => {
    setBusy(true);
    try {
      await updateInvoicePreset(preset.id, {
        kind: preset.kind,
        name,
        mode,
        amount: Number(amount),
        active,
        sortOrder: preset.sortOrder,
      });
      toast.success("Preset updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the preset.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteInvoicePreset(preset.id);
      toast.success("Preset removed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove the preset.");
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-[#1d4ed8]">
          {INVOICE_PRESET_KIND_LABELS[preset.kind]}
        </p>
        <p className="text-xs font-medium text-gray-500">{presetOptionLabel({ ...preset, name, mode, amount: Number(amount) || 0, active })}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <label className="block sm:col-span-2">
          <span className={labelCls}>Name</span>
          <input aria-label={`${preset.kind} name`} className={`${inputCls} mt-1`} value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="block">
          <span className={labelCls}>Amount type</span>
          <select aria-label={`${preset.kind} amount type`} className={`${inputCls} mt-1`} value={mode} onChange={(event) => setMode(event.target.value as InvoicePresetMode)}>
            <option value="flat">Flat dollars</option>
            <option value="percent">Percent</option>
          </select>
        </label>
        <label className="block">
          <span className={labelCls}>{mode === "percent" ? "Percent" : "Dollars"}</span>
          <input aria-label={`${preset.kind} amount`} type="number" min={0} step="0.01" className={`${inputCls} mt-1`} value={amount} onChange={(event) => setAmount(event.target.value)} />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs font-bold text-gray-600">
          <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
          Active on invoices
        </label>
        <Button type="button" onClick={save} disabled={busy} className="rounded-xl bg-[#1d4ed8] text-xs font-bold text-white hover:bg-[#1e40af]">
          {busy ? "Saving..." : "Save"}
        </Button>
        <button type="button" onClick={remove} disabled={busy} className="inline-flex items-center gap-1 text-xs font-bold text-red-600">
          <Trash2 className="h-3.5 w-3.5" /> Remove
        </button>
      </div>
    </div>
  );
}
