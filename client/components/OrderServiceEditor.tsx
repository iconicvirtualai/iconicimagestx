import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { MoneyAmount } from "@/components/MoneyAmount";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BOOKING_PROCESSING_LABEL } from "@shared/invoiceProcessing";
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
  tax?: unknown;
  fees?: unknown;
  travel?: unknown;
  onChange: (patch: OrderServiceSavePatch) => void;
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
  tax,
  fees,
  travel,
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

  const context = React.useMemo<OrderServiceQuoteContext>(() => ({
    rawLineItems: initialLines,
    promoDiscount,
    tax,
    fees,
    travel,
  }), [initialLines, promoDiscount, tax, fees, travel]);

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
          onRemove={() => setRows((current) => current.filter((item) => item.key !== row.key))}
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
          data-testid="order-add-custom"
          className="text-xs font-bold text-gray-500"
          onClick={() => setRows((current) => [...current, { key: nextKey(), line: customOrderLine() }])}
        >
          Custom line
        </button>
      </div>
      <p className="text-[11px] font-medium text-gray-400">
        Custom line is for the office only. Type a name and price that are not in the catalog.
      </p>
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
      <div className="mt-3 flex items-end justify-between gap-3">
        <label className="block w-24">
          <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-400">Qty</span>
          <input
            aria-label={`Quantity ${index + 1}`}
            data-testid="order-service-qty"
            type="number"
            min={1}
            step={1}
            value={line.qty}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-black focus:outline-none focus:ring-2 focus:ring-[#0d9488]/40"
            onChange={(event) => onChange(withLineQty(line, Number(event.target.value)))}
          />
        </label>
        <div className="min-w-0 flex-1 text-right">
          {length ? (
            <p data-testid="order-service-duration" className="text-[11px] font-bold text-gray-500">{length}</p>
          ) : null}
          <MoneyAmount className="text-sm font-black text-[#0d9488]">{formatOrderMoney(line.price)}</MoneyAmount>
        </div>
        <button
          type="button"
          aria-label={`Remove service ${index + 1}`}
          className="mb-1 text-xs font-bold text-red-500"
          onClick={onRemove}
        >
          Remove
        </button>
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

function QuoteSummary({ patch }: { patch: OrderServiceSavePatch }) {
  return (
    <div className="space-y-2 border-t border-gray-100 pt-3">
      <SummaryRow label="Services" amount={patch.subtotal} />
      {patch.promotions > 0 ? <SummaryRow label="Promo" amount={-patch.promotions} /> : null}
      <div data-testid="order-processing-line" className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 font-bold text-gray-500">{BOOKING_PROCESSING_LABEL}</span>
        <MoneyAmount className="font-bold text-black">{formatOrderMoney(patch.processing)}</MoneyAmount>
      </div>
      {patch.fees > 0 ? <SummaryRow label="Fees" amount={patch.fees} /> : null}
      {patch.travel > 0 ? <SummaryRow label="Travel" amount={patch.travel} /> : null}
      {patch.tax > 0 ? <SummaryRow label="Tax" amount={patch.tax} /> : null}
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
