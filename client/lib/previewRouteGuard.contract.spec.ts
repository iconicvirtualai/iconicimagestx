import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");

describe("sample preview routes", () => {
  it("keeps the orders preview and the invoice template behind the coordinator guard", () => {
    expect(app).toContain(
      'path="/admin/orders-preview" element={<ProtectedRoute requiredRole="coordinator"><AdminOrdersPreview /></ProtectedRoute>}',
    );
    expect(app).toContain(
      'path="/dev/invoice-template" element={<ProtectedRoute requiredRole="coordinator"><InvoiceTemplatePreview /></ProtectedRoute>}',
    );
    expect(app).toContain('path="/admin/orders" element={<ProtectedRoute requiredRole="coordinator"><AdminOrders />');
  });
});
