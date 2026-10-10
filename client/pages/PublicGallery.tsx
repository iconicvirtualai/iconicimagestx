import * as React from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { CreditCard, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import Footer from "@/components/Footer";
import { toast } from "sonner";
import { addressText } from "@shared/addressText";
import { ICONIC_DOWNLOAD_LOCK } from "@shared/paymentAccess";
import { GalleryDownloadLockNotice } from "@/components/GalleryDownloadLock";
import { ClientGalleryBoard } from "@/components/gallery/ClientGalleryMedia";
import type { ClientGalleryItem } from "@/components/gallery/clientGalleryMedia";

export interface PublicGalleryModel {
  address?: unknown;
  title?: string;
  clientName?: string;
  status?: string;
  paymentRequired?: boolean;
  lockTitle?: string | null;
  lockMessage?: string | null;
  invoiceId?: string | null;
  mediaItems?: ClientGalleryItem[];
}

export function PublicGalleryView({
  gallery,
  onCopyLink,
}: {
  gallery: PublicGalleryModel;
  onCopyLink?: (url: string) => void;
}) {
  const media = Array.isArray(gallery.mediaItems) ? gallery.mediaItems : [];
  const needsPayment = Boolean(gallery.paymentRequired);
  const released =
    gallery.status === "delivered" || gallery.status === "approved";

  return (
    <div className="min-h-screen overflow-x-hidden bg-white">
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
        {needsPayment && (
          <GalleryDownloadLockNotice
            title={gallery.lockTitle || ICONIC_DOWNLOAD_LOCK.title}
            message={gallery.lockMessage || ICONIC_DOWNLOAD_LOCK.message}
            action={
              gallery.invoiceId ? (
                <Button
                  asChild
                  className="rounded-xl bg-black text-white hover:bg-gray-800"
                >
                  <Link to={`/invoice/${gallery.invoiceId}`}>
                    <CreditCard className="mr-2 h-4 w-4" /> View Invoice
                  </Link>
                </Button>
              ) : null
            }
          />
        )}

        {!released ? (
          <div className="py-20 text-center">
            <Image className="mx-auto mb-4 h-16 w-16 text-gray-200" />
            <h2 className="mb-2 text-xl font-black">Media Is Being Prepared</h2>
            <p className="text-sm text-gray-500">
              This delivery link is active, but the finished media has not been
              released yet.
            </p>
          </div>
        ) : media.length === 0 ? (
          <div className="py-20 text-center">
            <Image className="mx-auto mb-4 h-16 w-16 text-gray-200" />
            <p className="font-bold text-gray-400">
              No media has been attached yet.
            </p>
          </div>
        ) : (
          <ClientGalleryBoard items={media} onCopyLink={onCopyLink} />
        )}
      </main>
      <Footer />
    </div>
  );
}

export const PUBLIC_GALLERY_MISSING_COPY = "We couldn't find this gallery. Check the link in your email or sign in to your portal.";

export function PublicGalleryMissing() {
  return (
    <div className="min-h-screen bg-white flex flex-col" data-gallery-state="missing">
      <header className="bg-black text-white">
        <div className="max-w-6xl mx-auto px-4 py-10">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500">Iconic Images</p>
          <h1 className="text-3xl font-black mt-2">Gallery not found</h1>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="max-w-md text-center">
          <p className="text-sm text-gray-600">{PUBLIC_GALLERY_MISSING_COPY}</p>
          <Button asChild className="mt-6 bg-black hover:bg-gray-800 text-white rounded-xl">
            <Link to="/portal">Sign in to your portal</Link>
          </Button>
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

  if (loading) return <div className="min-h-screen bg-white flex items-center justify-center"><div className="w-8 h-8 border-4 border-[#0d9488] border-t-transparent rounded-full animate-spin" /></div>;

  if (unavailable || !gallery) return <PublicGalleryMissing />;

  return <PublicGalleryView gallery={gallery} onCopyLink={copyLink} />;
}
