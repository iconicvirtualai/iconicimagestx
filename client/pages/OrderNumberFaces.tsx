/**
 * Dev-only sample of the order-number treatments.
 * Uses the same components as order detail, the client portal, and booking
 * confirmation. It does not read Firestore and does not send messages.
 */

import { BookingConfirmation } from "@/components/BookingConfirmation";
import { OrderNumberMark } from "@/components/OrderNumberMark";
import { AdminOrderTile } from "@/components/admin/AdminOrderTile";
import { buildAdminOrderTile } from "@shared/adminOrderTile";
import "@/styles/portal-v2.css";

const tile = buildAdminOrderTile({
  id: "sample-order-face",
  orderNumber: "#014",
  clientName: "Example Agent",
  address: "100 Example Street, Spring, TX",
  status: "scheduled",
  selectedService: "The Essentials",
  total: 199,
});

export default function OrderNumberFaces() {
  return (
    <main className="min-h-screen bg-[#f4f7f8] px-4 py-6 text-[#0F172A]" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <p className="mb-6 text-center text-xs font-bold text-amber-950">Sample order numbers. Not a live order.</p>
      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5" data-testid="order-face-detail">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Order detail</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-red-100 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-red-700">Unscheduled</span>
            <OrderNumberMark value="#014" />
          </div>
          <p className="mt-4 text-sm font-semibold text-slate-700">Example Agent · 100 Example Street</p>
        </section>
        <section className="portal-v2 rounded-2xl border border-slate-200 bg-white p-5" data-testid="order-face-portal">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Client portal</p>
          <div className="mt-3">
            <OrderNumberMark value="#014" />
          </div>
          <p className="mt-4 text-sm text-slate-700">100 Example Street, Spring, TX</p>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-4" data-testid="order-face-tile">
          <AdminOrderTile order={tile} />
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-4" data-testid="order-face-confirm">
          <BookingConfirmation result={{ orderNumber: "#014", requestId: "sample-order-face" }} onBookAnother={() => undefined} />
        </section>
      </div>
    </main>
  );
}
