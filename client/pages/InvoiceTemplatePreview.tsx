import { useSearchParams } from "react-router-dom";
import { BrandedInvoice } from "@/components/invoice/BrandedInvoice";
import { invoiceFaceFromStored } from "@shared/invoiceFace";
import type { InvoiceProcessingMode } from "@shared/invoiceProcessing";

const showcase = {
  invoiceNumber: "12345",
  issuedAt: "2027-01-01",
  clientName: "Drew Feig",
  billToAddress: "123 Anywhere St., Any City",
  notes: "",
  face: invoiceFaceFromStored({
    lineItems: [{ name: "The Showcase", qty: 1, unitPrice: 549, price: 549 }],
    subtotal: 549,
    promoDiscount: 0,
    fees: 0,
    tax: 0,
    total: 549,
    amountPaid: 0,
    amountDue: 549,
  }),
};

const lines = {
  invoiceNumber: "INV-2026-0042",
  issuedAt: "2026-10-05",
  clientName: "Jordan Hale",
  billToAddress: "88 Oak Lane\nSpring, TX 77380",
  notes: "Gate code is 1234. Please park in the driveway.",
  face: invoiceFaceFromStored({
    lineItems: [
      { name: "The Showcase", qty: 1, price: 549 },
      { name: "Twilight Photos", qty: 1, price: 199 },
      { name: "Drone Aerial", qty: 1, price: 150 },
      { name: "Floor Plan", qty: 2, unitPrice: 75, price: 150 },
    ],
    subtotal: 1048,
    promoCode: "SPRING",
    promoDiscount: 50,
    fees: 25,
    tax: 0,
    total: 1023,
    amountPaid: 0,
    amountDue: 1023,
  }),
};

/** Fixture page for the owner template. It does not read or write Firestore. */
export default function InvoiceTemplatePreview() {
  const [params] = useSearchParams();
  const sample = params.get("sample") === "lines" ? lines : showcase;
  const mode: InvoiceProcessingMode = params.get("mode") === "charge" ? "charge" : "display";
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
        processingMode={mode}
      />
      </div>
    </main>
  );
}
