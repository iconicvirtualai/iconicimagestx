import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
const scratch = readFileSync(new URL("../pages/AdminStudioScratch.tsx", import.meta.url), "utf8");
const iconic = readFileSync(new URL("../pages/AdminIconicStudio.tsx", import.meta.url), "utf8");

describe("studio information architecture routes", () => {
  it("lands staff on one Studio home with three subsections", () => {
    expect(app).toContain('path="/admin/studio" element={<ProtectedRoute requiredRole="staff"><AdminStudioHome /></ProtectedRoute>}');
    expect(app).toContain('path="/admin/studio/projects" element={<ProtectedRoute requiredRole="staff"><AdminStudioProjects /></ProtectedRoute>}');
    expect(app).toContain('path="/admin/studio/marketing" element={<ProtectedRoute requiredRole="staff"><AdminStudioMarketing /></ProtectedRoute>}');
  });

  it("keeps the scratch editor on its pathway and on the photo editing alias", () => {
    expect(app).toContain('path="/admin/studio/scratch" element={<ProtectedRoute requiredRole="coordinator"><AdminStudioScratch /></ProtectedRoute>}');
    expect(app).toContain('path="/admin/studio/editing" element={<ProtectedRoute requiredRole="coordinator"><AdminStudioScratch /></ProtectedRoute>}');
    expect(scratch).toContain("StudioScratchPad");
  });

  it("retires the bare Iconic Studio entry and keeps listing jobs on the editor", () => {
    expect(app).toContain('path="/admin/iconic-studio" element={<Navigate to="/admin/studio" replace />}');
    expect(app).toContain('path="/admin/iconic-studio/:listingId" element={<ProtectedRoute requiredRole="staff"><AdminIconicStudio /></ProtectedRoute>}');
    expect(iconic).toContain("IconicStudioWorkspace");
  });

  it("keeps delivery, photographer upload, booking, and the old operations screen reachable", () => {
    expect(app).toContain('path="/admin/delivery"');
    expect(app).toContain('path="/admin/photographer"');
    expect(app).toContain('path="/admin/upload"');
    expect(app).toContain('path="/admin/booking-catalog"');
    expect(app).toContain('path="/admin/invoice-presets"');
    expect(app).toContain('path="/admin/listings"');
    expect(app).toContain('path="/admin/studio/operations" element={<ProtectedRoute requiredRole="staff"><AdminStudio /></ProtectedRoute>}');
  });
});
