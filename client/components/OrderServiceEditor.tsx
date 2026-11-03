import * as React from "react";
import { Check, ChevronsUpDown, Pencil, Trash2 } from "lucide-react";
import { MoneyAmount } from "@/components/MoneyAmount";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BOOKING_PROCESSING_LABEL, processingFee, processingFeeLabel } from "@shared/invoiceProcessing";
import { percentOfDollars, pricingRates, type PricingRates } from "@shared/pricingSettings";
import {
  CATALOG_CHOICE_GROUP_LABELS,
  CATALOG_CHOICE_GROUP_ORDER,
  catalogServiceChoices,
  choiceForLine,
  customOrderLine,
  editorRowsFromStored,
  emptyCatalogLine,
  formatAppointmentLength,
  formatOrderMoney,
  lineFromChoice,
  orderServiceSavePatch,
  withCustomPrice,
  withLineQty,
  withPriceOverride,
  type CatalogServiceChoice,
  type OrderEditorLine,
  type OrderServiceQuoteContext,
  type OrderServiceSavePatch,
} from "@shared/orderRequestServices";
import type { StaffCatalogPackage } from "@shared/bookingCatalog";

interface OrderServiceEditorProps {
  catalog: StaffCatalogPackage[];
  initialLines: unknown;
  resetKey: string;
  promoDiscount?: unknown;
  promoCode?: unknown;
  tax?: unknown;
  fees?: unknown;
  travel?: unknown;
  processing?: unknown;
  rates?: PricingRates;
  onChange: (patch: OrderServiceSavePatch) => void;
}

function askConfirm(message: string): boolean {
  if (typeof window.confirm !== "function") return true;
  return window.confirm(message);
}

function moneyOrZero(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : 0;
}

interface EditorRow {
  key: string;
  line: OrderEditorLine;
}

let rowSerial = 0;
function nextKey(): string {
  rowSerial += 1;
  return `order-line-${rowSerial}`;
}

function rowsFrom(lines: unknown, catalog: StaffCatalogPackage[]): EditorRow[] {
  const stored = editorRowsFromStored(lines, catalog);
  const rows = stored.map((line) => ({ key: nextKey(), line }));
  return rows.length > 0 ? rows : [{ key: nextKey(), line: emptyCatalogLine() }];
}

export function OrderServiceEditor({
  catalog,
  initialLines,
  resetKey,
  promoDiscount,
  promoCode,
  tax,
  fees,
  travel,
  processing,
  rates,
  onChange,
}: OrderServiceEditorProps) {
  const choices = React.useMemo(() => catalogServiceChoices(catalog), [catalog]);
  const [rows, setRows] = React.useState<EditorRow[]>(() => rowsFrom(initialLines, catalog));
  const resetSeen = React.useRef(resetKey);
  if (resetSeen.current !== resetKey) {
    resetSeen.current = resetKey;
    setRows(rowsFrom(initialLines, catalog));
  }

  React.useEffect(() => {
    setRows((current) => current.map((row) => {
      if (!row.line.unlisted) return row;
      const [rematch] = editorRowsFromStored([{
        id: row.line.id,
        catalogId: row.line.catalogId,
        variantId: row.line.variantId,
        name: row.line.name,
        unitPrice: row.line.unitPrice,
        qty: row.line.qty,
        price: row.line.price,
        durationMinutes: row.line.durationMinutes,
        description: row.line.description,
      }], catalog);
      if (!rematch || rematch.custom) return row;
      return { ...row, line: rematch };
    }));
  }, [catalog]);

  const rateCard = rates ?? pricingRates();
  const [adjustments, setAdjustments] = React.useState(() => ({
    processingRemoved: false,
    processingOverridden: typeof processing === "number",
    processingAmount: moneyOrZero(processing),
    taxRemoved: false,
    taxOverridden: moneyOrZero(tax) > 0,
    taxRate: rateCard.taxPercent,
    travelRemoved: false,
    travelOverridden: false,
    travelAmount: moneyOrZero(travel),
    feesRemoved: moneyOrZero(fees) <= 0,
    feesAmount: moneyOrZero(fees),
    promoRemoved: !(typeof promoCode === "string" && promoCode.trim()) && moneyOrZero(promoDiscount) <= 0,
    promoCode: typeof promoCode === "string" ? promoCode : "",
    promoAmount: moneyOrZero(promoDiscount),
    editing: "" as string,
  }));
  const adjustReset = React.useRef(resetKey);
  if (adjustReset.current !== resetKey) {
    adjustReset.current = resetKey;
    setAdjustments({
      processingRemoved: false,
      processingOverridden: typeof processing === "number",
      processingAmount: moneyOrZero(processing),
      taxRemoved: false,
      taxOverridden: moneyOrZero(tax) > 0,
      taxRate: rateCard.taxPercent,
      travelRemoved: false,
      travelOverridden: false,
      travelAmount: moneyOrZero(travel),
      feesRemoved: moneyOrZero(fees) <= 0,
      feesAmount: moneyOrZero(fees),
      promoRemoved: !(typeof promoCode === "string" && promoCode.trim()) && moneyOrZero(promoDiscount) <= 0,
      promoCode: typeof promoCode === "string" ? promoCode : "",
      promoAmount: moneyOrZero(promoDiscount),
      editing: "",
    });
  }

  const serviceSubtotal = rows
    .filter((row) => row.line.name.trim() || row.line.price > 0 || row.line.catalogId)
    .reduce((sum, row) => sum + row.line.price, 0);
  const promoAmount = adjustments.promoRemoved ? 0 : adjustments.promoAmount;
  const taxBase = Math.max(0, serviceSubtotal - promoAmount);
  const taxAmount = adjustments.taxRemoved
    ? 0
    : adjustments.taxOverridden
      ? percentOfDollars(taxBase, adjustments.taxRate)
      : percentOfDollars(taxBase, rateCard.taxActive ? rateCard.taxPercent : 0);
  const defaultProcessing = rateCard.processingActive
    ? processingFee(Math.max(0, taxBase), rateCard.processingPercent)
    : 0;

  const context = React.useMemo<OrderServiceQuoteContext>(() => ({
    rawLineItems: initialLines,
    promoDiscount: adjustments.promoRemoved ? 0 : adjustments.promoAmount,
    promoCode: adjustments.promoCode,
    tax: taxAmount,
    fees: adjustments.feesRemoved ? 0 : adjustments.feesAmount,
    travel: adjustments.travelRemoved ? 0 : adjustments.travelAmount,
    processing: adjustments.processingRemoved
      ? 0
      : adjustments.processingOverridden
        ? adjustments.processingAmount
        : undefined,
    processingPercent: rateCard.processingPercent,
    processingRemoved: adjustments.processingRemoved,
    taxRemoved: adjustments.taxRemoved,
    travelRemoved: adjustments.travelRemoved,
    feesRemoved: adjustments.feesRemoved,
    promoRemoved: adjustments.promoRemoved,
    useAdjustmentFields: true,
  }), [initialLines, adjustments, taxAmount, rateCard.processingPercent]);

  const patch = React.useMemo(
    () => orderServiceSavePatch(rows.map((row) => row.line), context),
    [rows, context],
  );

  React.useEffect(() => {
    onChange(patch);
  }, [patch, onChange]);

  const update = (key: string, line: OrderEditorLine) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, line } : row)));
  };

  return (
    <div data-testid="order-service-editor" className="space-y-3">
      {rows.map((row, index) => (
        <ServiceRow
          key={row.key}
          index={index}
          line={row.line}
          choices={choices}
          onChange={(line) => update(row.key, line)}
          onRemove={() => {
            if (!askConfirm("Remove this service from the order?")) return;
            setRows((current) => current.filter((item) => item.key !== row.key));
          }}
        />
      ))}
      <div className="flex flex-wrap gap-4 pt-1">
        <button
          type="button"
          data-testid="order-add-service"
          className="text-[#0d9488] text-xs font-bold"
          onClick={() => setRows((current) => [...current, { key: nextKey(), line: emptyCatalogLine() }])}
        >
          + Add service
        </button>
        <button
          type="button"
          data-testid="order-add-addon"
          className="text-[#0d9488] text-xs font-bold"
          onClick={() => setRows((current) => [...current, { key: nextKey(), line: emptyCatalogLine() }])}
        >
          + Add add-on
        </button>
        <button
          type="button"
          data-testid="order-add-custom"
          className="text-xs font-bold text-gray-500"
          onClick={() => setRows((current) => [...current, { key: nextKey(), line: customOrderLine() }])}
        >
          Custom line
        </button>
        <button
          type="button"
          data-testid="order-add-promo"
          className="text-[#0d9488] text-xs font-bold"
          onClick={() => setAdjustments((current) => ({ ...current, promoRemoved: false, editing: "promo" }))}
        >
          + Add promo code
        </button>
        <button
          type="button"
          data-testid="order-add-adjustment"
          className="text-[#0d9488] text-xs font-bold"
          onClick={() => setAdjustments((current) => ({
            ...current,
            taxRemoved: false,
            processingRemoved: false,
            travelRemoved: false,
            feesRemoved: false,
          }))}
        >
          + Add adjustment
        </button>
      </div>
      <p className="text-[11px] font-medium text-gray-400">
        Custom line is for the office only. Type a name and price that are not in the catalog.
      </p>
      <AdjustmentList
        patch={patch}
        adjustments={adjustments}
        defaultProcessing={defaultProcessing}
        defaultTaxRate={rateCard.taxActive ? rateCard.taxPercent : 0}
        processingLabel={rateCard.processingPercent === 2.8 ? BOOKING_PROCESSING_LABEL : processingFeeLabel(rateCard.processingPercent)}
        setAdjustments={setAdjustments}
      />
      <QuoteSummary patch={patch} />
    </div>
  );
}

function ServiceRow({
  index,
  line,
  choices,
  onChange,
  onRemove,
}: {
  index: number;
  line: OrderEditorLine;
  choices: CatalogServiceChoice[];
  onChange: (line: OrderEditorLine) => void;
  onRemove: () => void;
}) {
  const length = formatAppointmentLength(line.durationMinutes);
  const [editPrice, setEditPrice] = React.useState(line.custom && !line.unlisted);
  const [editQty, setEditQty] = React.useState(false);
  const catalogDefault = line.defaultUnitPrice;
  const removeLine = () => onRemove();
  return (
    <div data-testid="order-service-line" className="rounded-2xl border border-gray-100 bg-gray-50 p-3">
      {line.custom && !line.unlisted ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-gray-400">Custom line</p>
            <input
              aria-label={`Custom service ${index + 1}`}
              value={line.name}
              placeholder="Service name"
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-black focus:outline-none focus:ring-2 focus:ring-[#0d9488]/40"
              onChange={(event) => onChange({ ...line, name: event.target.value, custom: true, unlisted: false })}
            />
          </div>
          <label className="block sm:w-28">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-400">Price</span>
            <input
              aria-label={`Custom price ${index + 1}`}
              data-testid="order-custom-price"
              type="number"
              min={0}
              step="0.01"
              value={line.unitPrice || ""}
              placeholder="Price"
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-black focus:outline-none focus:ring-2 focus:ring-[#0d9488]/40"
              onChange={(event) => onChange(withCustomPrice({ ...line, unlisted: false }, Number(event.target.value)))}
            />
          </label>
        </div>
      ) : (
        <ServicePicker
          label={`Service ${index + 1}`}
          line={line}
          choices={choices}
          onSelect={(choice) => onChange(lineFromChoice(choice, line.qty || 1))}
        />
      )}
      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Price</p>
            {editPrice ? (
              <input
                aria-label={`Price ${index + 1}`}
                data-testid="order-price-input"
                type="number"
                min={0}
                step="0.01"
                value={line.unitPrice || ""}
                className="mt-1 w-28 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-black focus:outline-none focus:ring-2 focus:ring-[#0d9488]/40"
                onChange={(event) => onChange(line.custom ? withCustomPrice(line, Number(event.target.value)) : withPriceOverride(line, Number(event.target.value)))}
              />
            ) : (
              <MoneyAmount className="text-sm font-black text-[#0d9488]">{formatOrderMoney(line.price)}</MoneyAmount>
            )}
            {catalogDefault != null ? (
              <p className="text-[11px] font-medium text-gray-400">Default {formatOrderMoney(catalogDefault)}</p>
            ) : null}
          </div>
          <FieldIcons
            editLabel={`Edit price ${index + 1}`}
            removeLabel={`Remove price ${index + 1}`}
            onEdit={() => setEditPrice((open) => !open)}
            onRemove={removeLine}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <label className="block w-24">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-400">Qty</span>
            <input
              aria-label={`Quantity ${index + 1}`}
              data-testid="order-service-qty"
              type="number"
              min={1}
              step={1}
              value={line.qty}
              className={`w-full rounded-xl border bg-white px-3 py-2 text-sm font-bold text-black focus:outline-none focus:ring-2 focus:ring-[#0d9488]/40 ${editQty ? "border-[#0d9488]" : "border-gray-200"}`}
              onChange={(event) => onChange(withLineQty(line, Number(event.target.value)))}
            />
          </label>
          <FieldIcons
            editLabel={`Edit quantity ${index + 1}`}
            removeLabel={`Remove quantity ${index + 1}`}
            onEdit={() => setEditQty(true)}
            onRemove={removeLine}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 text-right">
            {length ? (
              <p data-testid="order-service-duration" className="text-[11px] font-bold text-gray-500">{length}</p>
            ) : null}
          </div>
          <button
            type="button"
            aria-label={`Remove service ${index + 1}`}
            className="inline-flex items-center gap-1 text-xs font-bold text-red-500"
            onClick={onRemove}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

function ServicePicker({
  label,
  line,
  choices,
  onSelect,
}: {
  label: string;
  line: OrderEditorLine;
  choices: CatalogServiceChoice[];
  onSelect: (choice: CatalogServiceChoice) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = choiceForLine(line, choices);
  const length = formatAppointmentLength(selected?.durationMinutes ?? line.durationMinutes);
  const groups = CATALOG_CHOICE_GROUP_ORDER
    .map((group) => ({ group, label: CATALOG_CHOICE_GROUP_LABELS[group], items: choices.filter((choice) => choice.group === group) }))
    .filter((group) => group.items.length > 0);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-expanded={open}
          data-testid="order-service-picker"
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left focus:outline-none focus:ring-2 focus:ring-[#0d9488]/40"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-black">
              {selected?.name || line.name || "Choose a service"}
            </span>
            <span className="mt-0.5 block truncate text-[11px] font-medium text-gray-500">
              {selected
                ? `${CATALOG_CHOICE_GROUP_LABELS[selected.group]}${length ? ` · ${length}` : ""}`
                : line.name
                  ? "Not in the catalog yet."
                  : "Search packages, photo sets, add-ons, and variants."}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {selected || line.name ? <span className="text-sm font-black text-[#0d9488]">{formatOrderMoney(line.unitPrice)}</span> : null}
            <ChevronsUpDown className="h-4 w-4 text-gray-400" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder="Search services..." />
          <CommandList className="max-h-80">
            <CommandEmpty>No services match.</CommandEmpty>
            {groups.map((group) => (
              <CommandGroup
                key={group.group}
                heading={group.label}
                className="[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-black [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest"
              >
                {group.items.map((choice) => {
                  const active = choice.key === selected?.key;
                  const choiceLength = formatAppointmentLength(choice.durationMinutes);
                  return (
                    <CommandItem
                      key={choice.key}
                      value={`${choice.key} ${choice.name} ${choice.description}`}
                      onSelect={() => {
                        onSelect(choice);
                        setOpen(false);
                      }}
                      className="items-start gap-2 py-2"
                    >
                      <Check className={`mt-0.5 h-4 w-4 shrink-0 ${active ? "text-[#0d9488] opacity-100" : "opacity-0"}`} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="text-sm font-bold text-black">{choice.name}</span>
                          <span className="shrink-0 text-sm font-black text-[#0d9488]">{formatOrderMoney(choice.price)}</span>
                        </span>
                        <span className="mt-0.5 block text-[11px] font-medium text-gray-500">
                          {choiceLength || choice.description}
                        </span>
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function FieldIcons({
  editLabel,
  removeLabel,
  onEdit,
  onRemove,
}: {
  editLabel: string;
  removeLabel: string;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      <button type="button" aria-label={editLabel} className="rounded-lg p-1.5 text-gray-500 hover:bg-white hover:text-black" onClick={onEdit}>
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <button type="button" aria-label={removeLabel} className="rounded-lg p-1.5 text-gray-400 hover:bg-white hover:text-red-600" onClick={onRemove}>
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </span>
  );
}

function AdjustmentList({
  patch,
  adjustments,
  defaultProcessing,
  defaultTaxRate,
  processingLabel,
  setAdjustments,
}: {
  patch: OrderServiceSavePatch;
  adjustments: {
    processingRemoved: boolean;
    processingOverridden: boolean;
    processingAmount: number;
    taxRemoved: boolean;
    taxOverridden: boolean;
    taxRate: number;
    travelRemoved: boolean;
    travelOverridden: boolean;
    travelAmount: number;
    feesRemoved: boolean;
    feesAmount: number;
    promoRemoved: boolean;
    promoCode: string;
    promoAmount: number;
    editing: string;
  };
  defaultProcessing: number;
  defaultTaxRate: number;
  processingLabel: string;
  setAdjustments: React.Dispatch<React.SetStateAction<{
    processingRemoved: boolean;
    processingOverridden: boolean;
    processingAmount: number;
    taxRemoved: boolean;
    taxOverridden: boolean;
    taxRate: number;
    travelRemoved: boolean;
    travelOverridden: boolean;
    travelAmount: number;
    feesRemoved: boolean;
    feesAmount: number;
    promoRemoved: boolean;
    promoCode: string;
    promoAmount: number;
    editing: string;
  }>>;
}) {
  const drop = (message: string, apply: () => void) => {
    if (!askConfirm(message)) return;
    apply();
  };
  return (
    <div className="space-y-2 border-t border-gray-100 pt-3">
      {!adjustments.taxRemoved ? (
        <div data-testid="order-tax-line" className="flex items-center justify-between gap-3 text-sm">
          <div className="min-w-0">
            <p className="font-bold text-gray-500">Tax rate</p>
            {adjustments.editing === "tax" ? (
              <input
                aria-label="Tax rate"
                type="number"
                min={0}
                step="0.01"
                value={adjustments.taxRate}
                className="mt-1 w-28 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold"
                onChange={(event) => setAdjustments((current) => ({
                  ...current,
                  taxOverridden: true,
                  taxRate: Number(event.target.value) || 0,
                }))}
              />
            ) : (
              <p className="font-bold text-black">{adjustments.taxRate > 0 ? `${adjustments.taxRate}%` : "None"} · {formatOrderMoney(patch.tax)}</p>
            )}
            <p className="text-[11px] font-medium text-gray-400">Default {defaultTaxRate > 0 ? `${defaultTaxRate}%` : "none"}</p>
          </div>
          <FieldIcons
            editLabel="Edit tax rate"
            removeLabel="Remove tax rate"
            onEdit={() => setAdjustments((current) => ({ ...current, editing: current.editing === "tax" ? "" : "tax" }))}
            onRemove={() => drop("Remove tax from this order?", () => setAdjustments((current) => ({ ...current, taxRemoved: true, editing: "" })))}
          />
        </div>
      ) : null}
      {!adjustments.processingRemoved ? (
        <div data-testid="order-processing-line" className="flex items-center justify-between gap-3 text-sm">
          <div className="min-w-0">
            <p className="font-bold text-gray-500">{processingLabel}</p>
            {adjustments.editing === "processing" ? (
              <input
                aria-label="Processing fee"
                type="number"
                min={0}
                step="0.01"
                value={adjustments.processingAmount || patch.processing}
                className="mt-1 w-28 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold"
                onChange={(event) => setAdjustments((current) => ({
                  ...current,
                  processingOverridden: true,
                  processingAmount: Number(event.target.value) || 0,
                }))}
              />
            ) : (
              <MoneyAmount className="font-bold text-black">{formatOrderMoney(patch.processing)}</MoneyAmount>
            )}
            <p className="text-[11px] font-medium text-gray-400">Default {formatOrderMoney(defaultProcessing)}</p>
          </div>
          <FieldIcons
            editLabel="Edit processing fee"
            removeLabel="Remove processing fee"
            onEdit={() => setAdjustments((current) => ({
              ...current,
              editing: current.editing === "processing" ? "" : "processing",
              processingAmount: current.processingAmount || patch.processing,
            }))}
            onRemove={() => drop("Remove the processing fee from this order?", () => setAdjustments((current) => ({ ...current, processingRemoved: true, editing: "" })))}
          />
        </div>
      ) : null}
      {!adjustments.travelRemoved ? (
        <div data-testid="order-travel-line" className="flex items-center justify-between gap-3 text-sm">
          <div className="min-w-0">
            <p className="font-bold text-gray-500">Travel fee</p>
            {adjustments.editing === "travel" ? (
              <input
                aria-label="Travel fee"
                type="number"
                min={0}
                step="0.01"
                value={adjustments.travelAmount}
                className="mt-1 w-28 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold"
                onChange={(event) => setAdjustments((current) => ({
                  ...current,
                  travelOverridden: true,
                  travelAmount: Number(event.target.value) || 0,
                }))}
              />
            ) : (
              <MoneyAmount className="font-bold text-black">{formatOrderMoney(patch.travel)}</MoneyAmount>
            )}
            <p className="text-[11px] font-medium text-gray-400">Default {formatOrderMoney(adjustments.travelOverridden ? adjustments.travelAmount : patch.travel)}</p>
          </div>
          <FieldIcons
            editLabel="Edit travel fee"
            removeLabel="Remove travel fee"
            onEdit={() => setAdjustments((current) => ({ ...current, editing: current.editing === "travel" ? "" : "travel" }))}
            onRemove={() => drop("Remove the travel fee from this order?", () => setAdjustments((current) => ({ ...current, travelRemoved: true, travelAmount: 0, editing: "" })))}
          />
        </div>
      ) : null}
      {!adjustments.promoRemoved ? (
        <div data-testid="order-promo-line" className="flex items-center justify-between gap-3 text-sm">
          <div className="min-w-0">
            <p className="font-bold text-gray-500">Promo code</p>
            {adjustments.editing === "promo" ? (
              <span className="mt-1 flex gap-2">
                <input
                  aria-label="Promo code"
                  value={adjustments.promoCode}
                  className="w-28 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold uppercase"
                  onChange={(event) => setAdjustments((current) => ({ ...current, promoCode: event.target.value.toUpperCase() }))}
                />
                <input
                  aria-label="Promo discount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={adjustments.promoAmount || ""}
                  className="w-24 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold"
                  onChange={(event) => setAdjustments((current) => ({ ...current, promoAmount: Number(event.target.value) || 0 }))}
                />
              </span>
            ) : (
              <p className="font-bold text-black">{adjustments.promoCode || "Discount"} · {formatOrderMoney(-patch.promotions)}</p>
            )}
          </div>
          <FieldIcons
            editLabel="Edit promo code"
            removeLabel="Remove promo code"
            onEdit={() => setAdjustments((current) => ({ ...current, editing: current.editing === "promo" ? "" : "promo" }))}
            onRemove={() => drop("Remove the promo code from this order?", () => setAdjustments((current) => ({ ...current, promoRemoved: true, promoAmount: 0, promoCode: "", editing: "" })))}
          />
        </div>
      ) : null}
      {!adjustments.feesRemoved && patch.fees > 0 ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          <div>
            <p className="font-bold text-gray-500">Fee</p>
            <MoneyAmount className="font-bold text-black">{formatOrderMoney(patch.fees)}</MoneyAmount>
          </div>
          <FieldIcons
            editLabel="Edit fee"
            removeLabel="Remove fee"
            onEdit={() => setAdjustments((current) => ({ ...current, editing: "fees" }))}
            onRemove={() => drop("Remove this fee from the order?", () => setAdjustments((current) => ({ ...current, feesRemoved: true, feesAmount: 0 })))}
          />
        </div>
      ) : null}
    </div>
  );
}

function QuoteSummary({ patch }: { patch: OrderServiceSavePatch }) {
  return (
    <div className="space-y-2 border-t border-gray-100 pt-3">
      <SummaryRow label="Services" amount={patch.subtotal} />
      <div data-testid="order-service-total" className="flex items-baseline justify-between gap-3 pt-1">
        <span className="text-lg font-black text-black">Total</span>
        <MoneyAmount className="text-lg font-black text-[#0d9488]">{formatOrderMoney(patch.total)}</MoneyAmount>
      </div>
    </div>
  );
}

function SummaryRow({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="min-w-0 font-bold text-gray-500">{label}</span>
      <MoneyAmount className="font-bold text-black">{formatOrderMoney(amount)}</MoneyAmount>
    </div>
  );
}
