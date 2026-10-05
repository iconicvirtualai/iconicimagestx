import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { ICONIC_DOWNLOAD_LOCK, studioOffersDownloads } from "@shared/paymentAccess";
import { GalleryDownloadLockNotice } from "./GalleryDownloadLock";

describe("gallery download lock notice", () => {
  it("shows Iconic wording and does not offer a file link", () => {
    const html = renderToString(<GalleryDownloadLockNotice />);
    expect(html).toContain(ICONIC_DOWNLOAD_LOCK.title);
    expect(html).toContain("Iconic Images invoices after the shoot");
    expect(html).toContain("gallery-download-lock");
    expect(html).not.toMatch(/aryeo|autohdr/i);
    expect(html).not.toContain("href=");
    expect(studioOffersDownloads("public", true)).toBe(false);
  });
});
