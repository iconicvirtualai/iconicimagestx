import { sampleAdminOrderTiles } from "@shared/adminOrderTile";
import { AdminOrderTile } from "@/components/admin/AdminOrderTile";

const [listing, business] = sampleAdminOrderTiles();

/** Ops chrome reference. Sample orders only — live queues stay on Orders and Projects. */
export default function AdminOrderTiles() {
  return (
    <main className="min-h-screen bg-[#e2e8f0] px-6 py-10 text-[#0F172A]" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <div className="mx-auto max-w-[900px]">
        <h1 className="text-2xl font-extrabold tracking-[-0.02em]">Admin order tiles</h1>
        <p className="mb-7 mt-1.5 max-w-3xl text-[13px] leading-relaxed text-[#64748b]">
          Ops-only. Listing and business orders share the same slots. Package name, client skin, and price come from the shared package catalog.
        </p>
        <div className="flex flex-col items-start gap-7 lg:flex-row">
          <section>
            <p className="mb-2.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#64748b]">Listing / property order</p>
            <div className="w-full max-w-[400px]">
              <AdminOrderTile order={listing} />
            </div>
          </section>
          <section>
            <p className="mb-2.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#64748b]">Business / brand / social order</p>
            <div className="w-full max-w-[400px]">
              <AdminOrderTile order={business} />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
