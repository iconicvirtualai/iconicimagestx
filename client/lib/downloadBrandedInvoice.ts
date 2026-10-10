import { brandedInvoicePdf, brandedInvoicePdfFilename, type BrandedInvoicePdfInput } from "@shared/brandedInvoicePdf";
import { brandedInvoiceNumber } from "@shared/orderProjectInvoice";

export function downloadBrandedInvoice(input: BrandedInvoicePdfInput): void {
  const invoiceNumber = brandedInvoiceNumber({
    invoiceNumber: input.invoiceNumber,
    id: input.invoiceId,
    createdAt: input.issuedAt,
  });
  const resolved = { ...input, invoiceNumber };
  const bytes = brandedInvoicePdf(resolved);
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const blob = new Blob([copy], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = brandedInvoicePdfFilename(invoiceNumber);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
