import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { ICONIC_DOWNLOAD_LOCK } from "@shared/paymentAccess";

export function GalleryDownloadLockNotice({
  title = ICONIC_DOWNLOAD_LOCK.title,
  message = ICONIC_DOWNLOAD_LOCK.message,
  action,
}: {
  title?: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div
      className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      data-testid="gallery-download-lock"
    >
      <div className="flex items-start gap-3">
        <Lock className="w-5 h-5 text-yellow-700 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-black text-yellow-900">{title}</p>
          <p className="text-xs text-yellow-700 mt-1">{message}</p>
        </div>
      </div>
      {action}
    </div>
  );
}
