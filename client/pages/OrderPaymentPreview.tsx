import { useSearchParams } from "react-router-dom";
import { OrderPaymentLines } from "@/components/admin/OrderPaymentLines";

/**
 * Sample admin order summary. Not a live order.
 * /admin/order-payment-preview?state=unpaid
 * /admin/order-payment-preview?state=paid
 */
export default function OrderPaymentPreview() {
  const [params] = useSearchParams();
  const paid = params.get("state") !== "unpaid";
  const record: Record<string, unknown> = paid
    ? {
      paymentMethod: "pay_now",
      paymentStatus: "paid",
      amountPaid: 250.83,
      total: 250.83,
      paidAt: "2026-11-25T18:04:00.000Z",
      invoice: { status: "paid", amountPaid: 250.83, total: 250.83, paidAt: "2026-11-25T18:04:00.000Z" },
    }
    : {
      paymentMethod: "pay_now",
      paymentStatus: "unpaid",
      amountPaid: 0,
      total: 250.83,
      invoice: { status: "draft", amountPaid: 0, total: 250.83 },
    };

  return (
    <main className="min-h-screen bg-[#f4f7f8] text-black" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <div className="mx-auto flex min-w-0 max-w-[1100px] flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10 lg:flex-row">
        <section className="min-w-0 flex-1 space-y-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Sample order · Pay at Booking</p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-black uppercase tracking-tight sm:text-3xl">Order #018</h1>
            <span className="rounded-full bg-yellow-100 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-yellow-700">New Request</span>
          </div>
          <div className="rounded-2xl bg-black p-6 text-white">
            <h2 className="mb-4 text-[10px] font-black uppercase tracking-widest text-gray-500">Client Information</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="First Name" value="Sample" />
              <Field label="Last Name" value="Client" />
              <Field label="Email" value="sample.client@example.com" />
              <Field label="Phone" value="(281) 555-0100" />
            </div>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Services</h2>
            <Row name="Hollywood" amount="$199.00" />
            <Row name="Travel fee — Zone 2" amount="$50.00" />
            <Row name="Pay Now savings" amount="-$5.00" />
            <Row name="Subtotal" amount="$244.00" />
            <Row name="Processing (2.8%)" amount="$6.83" />
            <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-gray-200 px-1 pt-4">
              <span className="text-base font-black uppercase">Total Amount</span>
              <span className="text-xl font-black">$250.83</span>
            </div>
          </div>
        </section>
        <aside className="w-full shrink-0 lg:w-[320px]">
          <div className="rounded-[2rem] bg-black p-6 text-white">
            <h2 className="mb-4 text-[10px] font-black uppercase tracking-widest text-gray-500">Order Summary</h2>
            <div className="flex items-baseline justify-between gap-3 text-lg">
              <span className="font-black text-white">Total</span>
              <span className="font-black text-[#0d9488]">$250.83</span>
            </div>
            <div className="mt-4 space-y-2 border-t border-white/10 pt-4">
              <OrderPaymentLines dark record={record} />
            </div>
            <p className="mt-4 text-[11px] leading-relaxed text-gray-500">
              {paid
                ? "Sample preview. Subtotal is package + travel − Pay Now savings. Processing is 2.8% of that subtotal."
                : "Sample preview before payment. Subtotal $244.00, processing $6.83, total $250.83."}
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">{label}</p>
      <div className="mt-1 flex min-h-[38px] items-center rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-white">{value}</div>
    </div>
  );
}

function Row({ name, amount }: { name: string; amount: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-gray-100 px-1 py-3 first:border-t-0">
      <span className="min-w-0 text-sm font-bold text-gray-900">{name}</span>
      <span className="text-sm font-black text-[#0d9488]">{amount}</span>
    </div>
  );
}
