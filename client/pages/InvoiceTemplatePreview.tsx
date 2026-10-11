import { useSearchParams } from "react-router-dom";
import { BrandedInvoice } from "@/components/invoice/BrandedInvoice";
import { invoiceFaceFromStored } from "@shared/invoiceFace";
import { computeInvoiceTotals } from "@shared/invoiceProcessing";

function chargedFace(input: {
  lineItems: Array<Record<string, unknown>>;
  subtotal: number;
  promotions?: number;
  fees?: number;
  promoCode?: string;
}) {
  const totals = computeInvoiceTotals({
    subtotal: input.subtotal,
    promotions: input.promotions ?? 0,
    fees: input.fees ?? 0,
    travel: 0,
    tax: 0,
  });
  return invoiceFaceFromStored({
    lineItems: input.lineItems,
    subtotal: totals.subtotal,
    processing: totals.processing,
    promoCode: input.promoCode,
    promoDiscount: totals.promotions,
    fees: totals.fees,
    tax: 0,
    total: totals.total,
    amountPaid: 0,
    amountDue: totals.amountDue,
  });
}

const showcase = {
  invoiceNumber: "12345",
  issuedAt: "2027-01-01",
  clientName: "Drew Feig",
  billToAddress: "123 Anywhere St., Any City",
  notes: "",
  face: chargedFace({
    lineItems: [{ name: "The Showcase", qty: 1, unitPrice: 549, price: 549 }],
    subtotal: 549,
  }),
};

const lines = {
  invoiceNumber: "INV-2026-0042",
  issuedAt: "2026-10-05",
  clientName: "Jordan Hale",
  billToAddress: "88 Oak Lane\nSpring, TX 77380",
  notes: "Gate code is 1234. Please park in the driveway.",
  face: chargedFace({
    lineItems: [
      { name: "The Showcase", qty: 1, price: 549 },
      { name: "Twilight Photos", qty: 1, price: 199 },
      { name: "Drone Aerial", qty: 1, price: 150 },
      { name: "Floor Plan", qty: 2, unitPrice: 75, price: 150 },
    ],
    subtotal: 1048,
    promotions: 50,
    fees: 25,
    promoCode: "SPRING",
  }),
};

/** Fixture page for the owner template. It does not read or write Firestore. */
export default function InvoiceTemplatePreview() {
  const [params] = useSearchParams();
  const sample = params.get("sample") === "lines" ? lines : showcase;
  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto w-full max-w-[840px]">
        <BrandedInvoice
          invoiceNumber={sample.invoiceNumber}
          issuedAt={sample.issuedAt}
          clientName={sample.clientName}
          billToAddress={sample.billToAddress}
          face={sample.face}
          notes={sample.notes}
          footer={(
            <button type="button" className="h-12 w-full rounded-xl bg-[#0d9488] text-sm font-bold text-white">
              Pay Securely
            </button>
          )}
        />
      </div>
    </main>
  );
}
