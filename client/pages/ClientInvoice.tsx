import * as React from "react";
import { useParams, Link } from "react-router-dom";
import { AlertCircle, CheckCircle2, CreditCard, FileText, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

function money(value: number) {
  return "$" + (Number(value) || 0).toLocaleString("en-US", { minimumFractionDigits: 2 });
}

export default function ClientInvoice() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const [invoice, setInvoice] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [checkingOut, setCheckingOut] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!invoiceId) return;
    fetch(`/api/payments/invoice/${invoiceId}`)
      .then(async res => {
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      })
      .then(setInvoice)
      .catch(() => setError("We could not open this invoice. Please contact Iconic Images."))
      .finally(() => setLoading(false));
  }, [invoiceId]);

  if (loading) return <div className="min-h-screen bg-white flex items-center justify-center"><div className="w-8 h-8 border-4 border-[#0d9488] border-t-transparent rounded-full animate-spin" /></div>;

  if (error || !invoice) return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="max-w-md text-center">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 text-red-500" />
        <h1 className="text-2xl font-black mb-2">Invoice Unavailable</h1>
        <p className="text-sm text-gray-500">{error}</p>
      </div>
    </div>
  );

  const paid = invoice.status === "paid" || Number(invoice.amountDue || 0) <= 0;
  const lineItems: any[] = invoice.lineItems || [];
  const providerLabel = invoice.paymentProvider === "stripe" ? "Stripe" : "Square";

  const startCheckout = async () => {
    if (!invoiceId) return;
    setCheckingOut(true);
    try {
      const res = await fetch(`/api/payments/invoice/${invoiceId}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || "Could not start payment.");
      if (result.redirectUrl) {
        window.location.href = result.redirectUrl;
        return;
      }
      if (!result.checkoutUrl) throw new Error("Payment link was not created.");
      window.location.href = result.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start payment.");
      setCheckingOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <header className="bg-black text-white">
        <div className="max-w-3xl mx-auto px-4 py-10">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500">Iconic Images</p>
          <h1 className="text-3xl font-black mt-2">Invoice {invoice.invoiceNumber}</h1>
          <p className="text-gray-400 mt-1">{invoice.clientName}</p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6">
          <div className="flex items-start justify-between gap-4 border-b border-gray-100 pb-5 mb-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Amount Due</p>
              <p className="text-4xl font-black mt-1">{money(invoice.amountDue)}</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${paid ? "bg-teal-100 text-teal-700" : "bg-yellow-100 text-yellow-700"}`}>
              {paid ? "Paid" : "Payment Due"}
            </span>
          </div>

          <div className="space-y-3 mb-6">
            {lineItems.map((item, index) => (
              <div key={index} className="flex justify-between gap-4 text-sm">
                <span className="font-bold">{item.name || item.label || "Service"}</span>
                <span>{money(item.price || item.amount || 0)}</span>
              </div>
            ))}
          </div>

          <div className="border-t border-gray-100 pt-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{money(invoice.subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Tax</span><span>{money(invoice.tax)}</span></div>
            <div className="flex justify-between text-lg font-black"><span>Total</span><span>{money(invoice.total)}</span></div>
          </div>

          <div className="mt-8">
            {paid ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-teal-700 bg-teal-50 border border-teal-100 rounded-xl p-4">
                <CheckCircle2 className="w-5 h-5" />
                <p className="text-sm font-bold">Payment is recorded. Your downloads can be unlocked from the gallery link.</p>
                </div>
                {invoice.galleryId && (
                  <Button asChild className="w-full h-12 bg-black hover:bg-gray-900 text-white rounded-xl font-bold">
                    <Link to={`/gallery/${invoice.galleryId}`}>Open Gallery</Link>
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <Button onClick={startCheckout} className="w-full h-12 bg-[#0d9488] hover:bg-[#0f766e] text-white rounded-xl font-bold" disabled={checkingOut || !invoice.canPayOnline}>
                  <CreditCard className="w-4 h-4 mr-2" /> {checkingOut ? "Opening Secure Checkout..." : "Pay Securely"}
                </Button>
                <div className="flex items-start gap-3 text-gray-500 bg-gray-50 border border-gray-100 rounded-xl p-4">
                  <Lock className="w-5 h-5 mt-0.5" />
                  <p className="text-xs leading-relaxed">{invoice.canPayOnline ? `Downloads stay locked until payment is recorded. Checkout is handled securely by ${providerLabel}.` : `${providerLabel} checkout is not configured yet. Please contact Iconic Images to complete payment.`}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <Link to="/" className="mt-6 inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-gray-400 hover:text-black">
          <FileText className="w-4 h-4" /> Iconic Images
        </Link>
      </main>
    </div>
  );
}
