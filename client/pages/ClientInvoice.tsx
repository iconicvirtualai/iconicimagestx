import * as React from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { AlertCircle, CheckCircle2, CreditCard, Download, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import Footer from "@/components/Footer";
import {
  BrandedInvoiceShell,
  InvoiceBillTo,
  InvoiceFaceSummary,
  InvoiceLineTable,
} from "@/components/invoice/BrandedInvoice";
import { downloadBrandedInvoice } from "@/lib/downloadBrandedInvoice";
import { useAuth } from "@/contexts/AuthContext";
import { invoiceFaceFromStored } from "@shared/invoiceFace";
import { invoicePageInvoiceNumber } from "@shared/orderProjectInvoice";
import { ICONIC_DOWNLOAD_LOCK } from "@shared/paymentAccess";

function payQuery(token: string): string {
  if (!token) return "";
  return `?t=${encodeURIComponent(token)}`;
}

export default function ClientInvoice() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const payToken = searchParams.get("t") || "";
  const [invoice, setInvoice] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [checkingOut, setCheckingOut] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!invoiceId || authLoading) return;
    let cancelled = false;
    const query = payQuery(payToken);
    (async () => {
      try {
        const headers: Record<string, string> = {};
        if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
        const res = await fetch(`/api/payments/invoice/${encodeURIComponent(invoiceId)}${query}`, { headers });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        if (!cancelled) setInvoice(data);
      } catch {
        if (!cancelled) setError("We could not open this invoice. Please contact Iconic Images.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [invoiceId, payToken, user, authLoading]);

  if (loading) return <div className="min-h-screen bg-white flex items-center justify-center"><div className="w-8 h-8 border-4 border-[#1d4ed8] border-t-transparent rounded-full animate-spin" /></div>;

  if (error || !invoice) return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="max-w-md text-center">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 text-red-500" />
          <h1 className="text-2xl font-black mb-2">Invoice Unavailable</h1>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
      <Footer />
    </div>
  );

  const paid = Boolean(invoice.paid) || invoice.status === "paid";
  const awaitingSquare = searchParams.get("paid") === "1" && !paid;
  const providerLabel = invoice.paymentProvider === "stripe" ? "Stripe" : "Square";
  const invoiceNumber = invoicePageInvoiceNumber({
    invoiceNumber: invoice.invoiceNumber,
    id: invoiceId,
    createdAt: invoice.createdAt,
  });
  const face = invoiceFaceFromStored(invoice);
  const address = typeof invoice.billToAddress === "string" ? invoice.billToAddress : "";

  const startCheckout = async () => {
    if (!invoiceId) return;
    setCheckingOut(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
      const res = await fetch(`/api/payments/invoice/${encodeURIComponent(invoiceId)}/checkout${payQuery(payToken)}`, {
        method: "POST",
        headers,
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

  const downloadPdf = () => {
    downloadBrandedInvoice({
      invoiceNumber,
      invoiceId,
      issuedAt: invoice.createdAt,
      clientName: String(invoice.clientName || ""),
      billToAddress: address,
      status: paid ? "Paid" : "Payment due",
      face,
    });
  };

  return (
    <div className="min-h-screen bg-[#f4f7f8]">
      <main className="max-w-3xl mx-auto px-4 py-8">
        <BrandedInvoiceShell
          invoiceNumber={invoiceNumber}
          status={paid ? "Paid" : "Payment due"}
          amountPaid={face.amountPaid}
          amountDue={face.amountDue}
          footer={(
            <>
              <button
                type="button"
                data-testid="download-invoice-pdf"
                onClick={downloadPdf}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#FFD700] bg-black px-4 py-3 text-xs font-black uppercase tracking-widest text-[#FFD700] hover:bg-zinc-900"
              >
                <Download className="h-4 w-4" /> Download PDF
              </button>
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
                  {awaitingSquare && (
                    <div className="flex items-start gap-3 text-teal-800 bg-teal-50 border border-teal-100 rounded-xl p-4">
                      <CheckCircle2 className="w-5 h-5 mt-0.5" />
                      <p className="text-sm font-bold">Square checkout finished. This page unlocks downloads after the payment is confirmed. Refresh in a moment if it still shows due.</p>
                    </div>
                  )}
                  <Button onClick={startCheckout} className="w-full h-12 bg-[#0d9488] hover:bg-[#0f766e] text-white rounded-xl font-bold" disabled={checkingOut || !invoice.canPayOnline}>
                    <CreditCard className="w-4 h-4 mr-2" /> {checkingOut ? "Opening Secure Checkout..." : "Pay Securely"}
                  </Button>
                  <div className="flex items-start gap-3 text-gray-500 bg-gray-50 border border-gray-100 rounded-xl p-4">
                    <Lock className="w-5 h-5 mt-0.5" />
                    <p className="text-xs leading-relaxed">{invoice.canPayOnline ? `${ICONIC_DOWNLOAD_LOCK.message} Checkout is handled securely by ${providerLabel}.` : `${providerLabel} checkout is not configured yet. Please contact Iconic Images to complete payment.`}</p>
                  </div>
                </div>
              )}
            </>
          )}
        >
          <InvoiceBillTo name={String(invoice.clientName || "")} email={typeof invoice.clientEmail === "string" ? invoice.clientEmail : ""} address={address} />
          <InvoiceLineTable lines={face.services} />
          <InvoiceFaceSummary face={face} />
          {invoice.notes ? <p className="whitespace-pre-wrap text-sm text-gray-600">{String(invoice.notes)}</p> : null}
        </BrandedInvoiceShell>

        <a href="/" data-testid="invoice-back-home" className="mt-6 inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-gray-400 hover:text-black">
          Back to Home
        </a>
      </main>
      <Footer />
    </div>
  );
}
