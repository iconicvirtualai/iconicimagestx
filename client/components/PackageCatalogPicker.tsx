import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import {
  BOOKING_CATALOG_KIND_LABELS,
  BOOKING_PACKAGE_CATEGORY_LABELS,
  BOOKING_PACKAGE_CATEGORY_ORDER,
  type BookingPackageCategory,
  type StaffCatalogPackage,
} from "@shared/bookingCatalog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function money(value: number): string {
  return (Number(value) || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function groupsFor(catalog: StaffCatalogPackage[]): Array<{ category: string; label: string; items: StaffCatalogPackage[] }> {
  const buckets = new Map<string, StaffCatalogPackage[]>();
  for (const item of catalog) {
    const list = buckets.get(item.category) || [];
    list.push(item);
    buckets.set(item.category, list);
  }
  const ordered: Array<{ category: string; label: string; items: StaffCatalogPackage[] }> = BOOKING_PACKAGE_CATEGORY_ORDER
    .filter((category) => buckets.has(category))
    .map((category) => ({
      category,
      label: BOOKING_PACKAGE_CATEGORY_LABELS[category],
      items: buckets.get(category) || [],
    }));
  for (const [category, items] of buckets) {
    if (!BOOKING_PACKAGE_CATEGORY_ORDER.includes(category as BookingPackageCategory)) {
      ordered.push({ category, label: category, items });
    }
  }
  return ordered;
}

export function PackageCatalogPicker({
  catalog,
  selectedId,
  fallbackName,
  onSelect,
  label,
}: {
  catalog: StaffCatalogPackage[];
  selectedId?: string;
  fallbackName?: string;
  onSelect: (packageId: string) => void;
  label: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = catalog.find((item) => item.id === selectedId || item.bookingId === selectedId);
  const groups = groupsFor(catalog);
  const kind = selected ? BOOKING_CATALOG_KIND_LABELS[selected.bookingKind] : "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-expanded={open}
          className="flex w-full min-h-[4.75rem] items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3 text-left focus:outline-none focus:ring-2 focus:ring-[#0d9488]/40"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-black truncate">
              {selected?.name || fallbackName || "Choose a package"}
            </span>
            <span className="mt-0.5 block text-xs font-medium text-gray-500 line-clamp-2">
              {selected
                ? selected.description
                : fallbackName
                  ? "This line is not in the package catalog yet."
                  : "Search by name or description."}
            </span>
            {selected && (
              <span className="mt-1 block text-[10px] font-black uppercase tracking-widest text-gray-400">
                {BOOKING_PACKAGE_CATEGORY_LABELS[selected.category]} · {kind}
              </span>
            )}
          </span>
          <span className="flex items-center gap-2 shrink-0">
            {selected && <span className="text-sm font-black text-[#0d9488]">{money(selected.price)}</span>}
            <ChevronsUpDown className="h-4 w-4 text-gray-400" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder="Search packages..." />
          <CommandList className="max-h-[420px]">
            <CommandEmpty>No packages match.</CommandEmpty>
            {groups.map((group) => (
              <CommandGroup
                key={group.category}
                heading={group.label}
                className="[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-black [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest"
              >
                {group.items.map((item) => {
                  const active = item.id === selected?.id;
                  return (
                    <CommandItem
                      key={item.id}
                      value={`${item.id} ${item.name} ${item.description}`}
                      onSelect={() => {
                        onSelect(item.id);
                        setOpen(false);
                      }}
                      className="items-start gap-2 py-2.5 aria-selected:bg-gray-50"
                    >
                      <Check className={`mt-0.5 h-4 w-4 shrink-0 ${active ? "opacity-100 text-[#0d9488]" : "opacity-0"}`} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="text-sm font-bold text-black">{item.name}</span>
                          <span className="text-sm font-black text-[#0d9488] shrink-0">{money(item.price)}</span>
                        </span>
                        <span className="mt-1 block text-xs font-medium text-gray-500 whitespace-normal leading-snug">
                          {item.description}
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
