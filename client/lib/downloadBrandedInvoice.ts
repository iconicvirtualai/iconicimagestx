import { brandedInvoicePdf, brandedInvoicePdfFilename, type BrandedInvoicePdfInput } from "@shared/brandedInvoicePdf";

export function downloadBrandedInvoice(input: BrandedInvoicePdfInput): void {
  const bytes = brandedInvoicePdf(input);
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const blob = new Blob([copy], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = brandedInvoicePdfFilename(input.invoiceNumber);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
