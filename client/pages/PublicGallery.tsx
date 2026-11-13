import * as React from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { CreditCard, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import Footer from "@/components/Footer";
import { toast } from "sonner";
import { addressText } from "@shared/addressText";
import { isGuessableInvoiceId } from "@shared/invoicePayLink";
import { ICONIC_DOWNLOAD_LOCK } from "@shared/paymentAccess";
import { GalleryDownloadLockNotice } from "@/components/GalleryDownloadLock";
import { DoorsOpenDeliveryNote } from "@/components/DoorsOpenTour";
import { ClientGalleryBoard } from "@/components/gallery/ClientGalleryMedia";
import { GallerySelectionPanel } from "@/components/gallery/GallerySelectionPanel";
import type { ClientGalleryItem } from "@/components/gallery/clientGalleryMedia";
import { clientPortalEnabled } from "@shared/clientPortal";
import { isSelectableGalleryPhoto, type SelectionBilling, type SelectionMode } from "@shared/gallerySelections";

export interface PublicGalleryModel {
  address?: unknown;
  title?: string;
  clientName?: string;
  status?: string;
  paymentRequired?: boolean;
  lockTitle?: string | null;
  lockMessage?: string | null;
  invoiceId?: string | null;
  /** Absolute tokenized pay link from the public site. A legacy auto-id falls back to /invoice/{id}. */
  invoicePayPath?: string | null;
  mediaItems?: ClientGalleryItem[];
  selection?: {
    open: boolean;
    mode: SelectionMode;
    billing?: SelectionBilling;
    allowance: number | null;
    extraPhotoPrice: number | null;
    selectedIds: string[];
    submitted: boolean;
  } | null;
}

function responseError(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const message = (payload as { error?: unknown }).error;
  return typeof message === "string" && message.trim() ? message : fallback;
}

function publicInvoiceHref(gallery: PublicGalleryModel): string {
  if (gallery.invoicePayPath) return gallery.invoicePayPath;
  const id = typeof gallery.invoiceId === "string" ? gallery.invoiceId.trim() : "";
  if (!id || isGuessableInvoiceId(id)) return "";
  return `/invoice/${id}`;
}

export function PublicGalleryView({
  gallery,
  galleryId,
  onCopyLink,
  selectedIds,
  savingSelection,
  onToggleSelection,
  onSubmitSelection,
}: {
  gallery: PublicGalleryModel;
  galleryId?: string;
  onCopyLink?: (url: string) => void;
  selectedIds?: string[];
  savingSelection?: boolean;
  onToggleSelection?: (id: string) => void;
  onSubmitSelection?: () => void;
}) {
  const media = Array.isArray(gallery.mediaItems) ? gallery.mediaItems : [];
  const needsPayment = Boolean(gallery.paymentRequired);
  const released =
    gallery.status === "delivered" || gallery.status === "approved";
  const selection = gallery.selection || null;
  const picks = selectedIds || selection?.selectedIds || [];
  const choosable = media.filter((item) => isSelectableGalleryPhoto(item));
  const otherMedia = media.filter((item) => !isSelectableGalleryPhoto(item));

  return (
    <div className="iframe-safe-page overflow-x-hidden bg-white">
      <header className="bg-black text-white">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500">
            Iconic Images
          </p>
          <h1 className="mt-2 break-words text-2xl font-black sm:text-3xl">
            {addressText(gallery.address) || gallery.title || "Your Gallery"}
          </h1>
          {gallery.clientName && (
            <p className="mt-1 break-words text-gray-400">
              {gallery.clientName}
            </p>
          )}
        </div>
      </header>

      <main className="mx-auto min-w-0 max-w-6xl px-4 py-8">
        <div className="mb-6">
          <DoorsOpenDeliveryNote />
        </div>
        {needsPayment && (
          <GalleryDownloadLockNotice
            title={gallery.lockTitle || ICONIC_DOWNLOAD_LOCK.title}
            message={gallery.lockMessage || ICONIC_DOWNLOAD_LOCK.message}
            action={
              publicInvoiceHref(gallery) ? (
                <Button
                  asChild
                  className="rounded-xl bg-black text-white hover:bg-gray-800"
                >
                  <Link to={publicInvoiceHref(gallery)}>
                    <CreditCard className="mr-2 h-4 w-4" /> View Invoice
                  </Link>
                </Button>
              ) : null
            }
          />
        )}

        {selection ? (
          <GallerySelectionPanel
            mode={selection.mode}
            billing={selection.billing === "charge" ? "charge" : "selections"}
            allowance={selection.allowance}
            extraPhotoPrice={selection.extraPhotoPrice}
            submitted={selection.submitted}
            items={choosable}
            selectedIds={picks}
            saving={savingSelection}
            onToggle={onToggleSelection}
            onSubmit={onSubmitSelection}
          />
        ) : null}

        {!released && !selection ? (
          <div className="py-20 text-center">
            <Image className="mx-auto mb-4 h-16 w-16 text-gray-200" />
            <h2 className="mb-2 text-xl font-black">Media Is Being Prepared</h2>
            <p className="text-sm text-gray-500">
              This delivery link is active, but the finished media has not been
              released yet.
            </p>
          </div>
        ) : selection ? (
          <>
            {released && otherMedia.length > 0 ? (
              <ClientGalleryBoard items={otherMedia} onCopyLink={onCopyLink} />
            ) : null}
            {released && galleryId && !needsPayment ? (
              <div className="mt-6 flex justify-end">
                <a
                  href={`/api/galleries/public/${encodeURIComponent(galleryId)}/photos.zip`}
                  data-testid="gallery-download-zip"
                  className="inline-flex min-h-11 items-center rounded-xl bg-black px-4 text-[10px] font-black uppercase tracking-widest text-white"
                >
                  Download all
                </a>
              </div>
            ) : null}
          </>
        ) : media.length === 0 ? (
          <div className="py-20 text-center">
            <Image className="mx-auto mb-4 h-16 w-16 text-gray-200" />
            <p className="font-bold text-gray-400">
              No media has been attached yet.
            </p>
          </div>
        ) : (
          <ClientGalleryBoard
            items={media}
            onCopyLink={onCopyLink}
            zipHref={galleryId && !needsPayment ? `/api/galleries/public/${encodeURIComponent(galleryId)}/photos.zip` : undefined}
          />
        )}
      </main>
      <Footer />
    </div>
  );
}

export const PUBLIC_GALLERY_MISSING_COPY = "We couldn't find this gallery. Check the link in your email or sign in to your portal.";
export const PUBLIC_GALLERY_MISSING_COPY_OFF = "We couldn't find this gallery. Check the link in your email, or email photos@iconicimagestx.com and we will help you get your files.";

export function PublicGalleryMissing() {
  const portalOpen = clientPortalEnabled();
  return (
    <div className="iframe-safe-page bg-white flex flex-col" data-gallery-state="missing">
      <header className="bg-black text-white">
        <div className="max-w-6xl mx-auto px-4 py-10">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500">Iconic Images</p>
          <h1 className="text-3xl font-black mt-2">Gallery not found</h1>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="max-w-md text-center">
          <p className="text-sm text-gray-600">{portalOpen ? PUBLIC_GALLERY_MISSING_COPY : PUBLIC_GALLERY_MISSING_COPY_OFF}</p>
          {portalOpen ? (
          <Button asChild className="mt-6 bg-black hover:bg-gray-800 text-white rounded-xl">
            <Link to="/portal">Sign in to your portal</Link>
          </Button>
          ) : null}
          <p className="mt-6 text-sm text-gray-500">
            <a href="mailto:photos@iconicimagestx.com" className="font-semibold text-black underline underline-offset-4">photos@iconicimagestx.com</a>
            {" / "}
            <a href="tel:2813560965" className="font-semibold text-black underline underline-offset-4">281.356.0965</a>
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}

export default function PublicGallery() {
  const { galleryId } = useParams<{ galleryId: string }>();
  const navigate = useNavigate();
  const [gallery, setGallery] = React.useState<PublicGalleryModel | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [unavailable, setUnavailable] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [savingSelection, setSavingSelection] = React.useState(false);
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (!galleryId) {
      setUnavailable(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    let redirecting = false;
    setLoading(true);
    setUnavailable(false);
    setGallery(null);
    (async () => {
      try {
        const res = await fetch(`/api/galleries/public/${encodeURIComponent(galleryId)}`);
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && data && typeof data === "object") {
          setGallery(data);
          const picks = data.selection && Array.isArray(data.selection.selectedIds)
            ? data.selection.selectedIds.filter((id: unknown) => typeof id === "string")
            : [];
          setSelectedIds(picks);
          return;
        }
        // A project id shared on /gallery/:id can still open its studio or delivery gallery.
        // Resolver text is for staff logs. This page never renders it.
        if (res.status === 404) {
          const linkRes = await fetch(`/api/galleries/link/${encodeURIComponent(galleryId)}`);
          const link = await linkRes.json().catch(() => null);
          if (cancelled) return;
          const openGalleryId = link && typeof link.openGalleryId === "string" ? link.openGalleryId : "";
          if (linkRes.ok && link?.kind === "listing" && openGalleryId && openGalleryId !== galleryId) {
            redirecting = true;
            navigate(`/gallery/${openGalleryId}`, { replace: true });
            return;
          }
          if (linkRes.ok && link?.kind === "listing") {
            redirecting = true;
            navigate(`/studio/${galleryId}`, { replace: true });
            return;
          }
        }
        setUnavailable(true);
      } catch {
        if (!cancelled) setUnavailable(true);
      } finally {
        if (!cancelled && !redirecting) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [galleryId, navigate]);

  const copyLink = async (url: string) => {
    await navigator.clipboard.writeText(url);
    toast.success("Share link copied.");
  };

  if (loading) return <div className="iframe-safe-page bg-white flex items-center justify-center"><div className="w-8 h-8 border-4 border-[#0d9488] border-t-transparent rounded-full animate-spin" /></div>;

  const savePicks = (ids: string[]) => {
    if (!galleryId || gallery?.selection?.submitted) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void fetch(`/api/galleries/public/${encodeURIComponent(galleryId)}/selections`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaIds: ids }),
      }).then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          toast.error(responseError(data, "Could not save your selections."));
        }
      }).catch(() => toast.error("Could not save your selections."));
    }, 400);
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      savePicks(next);
      return next;
    });
  };

  const submitSelection = async () => {
    if (!galleryId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSavingSelection(true);
    try {
      const res = await fetch(`/api/galleries/public/${encodeURIComponent(galleryId)}/selections/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaIds: selectedIds }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(responseError(data, "Could not submit your selections."));
      setGallery((current) => current?.selection ? {
        ...current,
        selection: { ...current.selection, submitted: true, open: false, selectedIds },
      } : current);
      toast.success("Selections submitted.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit your selections.");
    } finally {
      setSavingSelection(false);
    }
  };

  if (unavailable || !gallery) return <PublicGalleryMissing />;

  return (
    <PublicGalleryView
      gallery={gallery}
      galleryId={galleryId}
      onCopyLink={copyLink}
      selectedIds={selectedIds}
      savingSelection={savingSelection}
      onToggleSelection={toggleSelection}
      onSubmitSelection={() => { void submitSelection(); }}
    />
  );
}
