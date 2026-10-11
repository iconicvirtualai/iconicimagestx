import * as React from "react";
import { AdminOrdersBrowser } from "@/components/admin/AdminOrdersBrowser";
import { sampleAdminOrderRecords, sampleAdminOrderStaff } from "@shared/adminOrderList";

const SANS = "Inter, system-ui, sans-serif";

/** Sample orders only. Live queues stay on /admin/orders. */
export default function AdminOrdersPreview() {
  const storageKey = "adminOrdersView:preview-sample";
  React.useState(() => {
    const requested = new URLSearchParams(window.location.search).get("view");
    if (requested === "list" || requested === "tile") localStorage.setItem(storageKey, requested);
    return requested;
  });
  const [selection, setSelection] = React.useState<Set<string>>(new Set());
  const orders = React.useMemo(() => sampleAdminOrderRecords(), []);
  const staff = React.useMemo(() => sampleAdminOrderStaff(), []);

  const toggle = (id: string) => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectIds = (ids: string[]) => {
    setSelection((prev) => {
      const next = new Set(prev);
      const allIn = ids.length > 0 && ids.every((id) => next.has(id));
      if (allIn) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  return (
    <div className="flex min-h-screen bg-[#f4f7f8] text-[#0F172A]" style={{ fontFamily: SANS }}>
      <aside className="hidden w-60 shrink-0 flex-col bg-[#0a0a0a] text-white sm:flex">
        <div className="border-b border-gray-800 p-5">
          <p className="text-xs font-black uppercase tracking-widest">Iconic</p>
          <p className="mt-1 text-[10px] uppercase tracking-widest text-gray-500">Sample preview</p>
        </div>
        <p className="px-5 py-4 text-xs font-bold uppercase tracking-widest text-[#0d9488]">Orders</p>
      </aside>
      <main className="min-w-0 flex-1 overflow-x-hidden">
        <header className="border-b border-slate-200 bg-white px-4 py-5 sm:px-6">
          <h1 className="text-xl font-black uppercase tracking-tight text-black">Orders</h1>
        </header>
        <div className="w-full min-w-0 px-4 py-6 sm:px-6">
          <p className="mb-4 max-w-3xl text-xs leading-relaxed text-[#64748b]">
            Sample orders for layout review. Names and addresses are fictional.
          </p>
          <AdminOrdersBrowser
            orders={orders}
            staff={staff}
            selection={selection}
            storageKey={storageKey}
            onToggleSelect={toggle}
            onSelectIds={selectIds}
            onStudioChange={() => undefined}
          />
        </div>
      </main>
    </div>
  );
}
