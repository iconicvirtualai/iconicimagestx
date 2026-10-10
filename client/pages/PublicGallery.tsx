import * as React from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Copy, Download, ExternalLink, Image, Link2, Lock, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import Footer from "@/components/Footer";
import { toast } from "sonner";
import { addressText } from "@shared/addressText";
import { ICONIC_DOWNLOAD_LOCK } from "@shared/paymentAccess";
import { GalleryDownloadLockNotice } from "@/components/GalleryDownloadLock";

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
  const [gallery, setGallery] = React.useState<any>(null);
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

  if (loading) return <div className="min-h-screen bg-white flex items-center justify-center"><div className="w-8 h-8 border-4 border-[#0d9488] border-t-transparent rounded-full animate-spin" /></div>;

  if (unavailable || !gallery) return <PublicGalleryMissing />;

  const media: any[] = gallery.mediaItems || [];
  const needsPayment = Boolean(gallery.paymentRequired);
  const copyLink = async (url: string) => {
    await navigator.clipboard.writeText(url);
    toast.success("Share link copied.");
  };

  return (
    <div className="min-h-screen bg-white">
      <header className="bg-black text-white">
        <div className="max-w-6xl mx-auto px-4 py-10">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500">Iconic Images</p>
          <h1 className="text-3xl font-black mt-2">{addressText(gallery.address) || gallery.title || "Your Gallery"}</h1>
          {gallery.clientName && <p className="text-gray-400 mt-1">{gallery.clientName}</p>}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {needsPayment && (
          <GalleryDownloadLockNotice
            title={gallery.lockTitle || ICONIC_DOWNLOAD_LOCK.title}
            message={gallery.lockMessage || ICONIC_DOWNLOAD_LOCK.message}
            action={gallery.invoiceId ? (
              <Button asChild className="bg-black hover:bg-gray-800 text-white rounded-xl">
                <Link to={`/invoice/${gallery.invoiceId}`}><CreditCard className="w-4 h-4 mr-2" /> View Invoice</Link>
              </Button>
            ) : null}
          />
        )}

        {gallery.status !== "delivered" && gallery.status !== "approved" ? (
          <div className="text-center py-20">
            <Image className="w-16 h-16 text-gray-200 mx-auto mb-4" />
            <h2 className="text-xl font-black mb-2">Media Is Being Prepared</h2>
            <p className="text-sm text-gray-500">This delivery link is active, but the finished media has not been released yet.</p>
          </div>
        ) : media.length === 0 ? (
          <div className="text-center py-20">
            <Image className="w-16 h-16 text-gray-200 mx-auto mb-4" />
            <p className="text-gray-400 font-bold">No media has been attached yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {media.map((item, index) => (
              <div key={item.id || index} className="aspect-[4/3] rounded-xl overflow-hidden bg-gray-100 relative group">
                {item.locked || !item.url ? (
                  <div className="w-full h-full flex flex-col items-center justify-center text-center p-4">
                    <Lock className="w-6 h-6 text-gray-400 mb-2" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">{item.title || item.fileName || "Locked"}</p>
                  </div>
                ) : item.type === "video" || item.type === "reel" ? (
                  <video src={item.embedUrl || item.url} controls className="w-full h-full object-cover" />
                ) : item.type === "tour" || item.type === "matterport" ? (
                  <div className="w-full h-full bg-black text-white flex flex-col items-center justify-center text-center p-4">
                    <Link2 className="w-8 h-8 mb-3 text-[#0d9488]" />
                    <p className="text-sm font-black">{item.title || "3D Tour"}</p>
                    <p className="text-[10px] text-gray-400 mt-1 break-all">{item.shareUrl || item.url}</p>
                  </div>
                ) : (
                  <img src={item.url} alt={item.fileName || `Media ${index + 1}`} className="w-full h-full object-cover" loading="lazy" />
                )}
                {(item.type === "video" || item.type === "reel" || item.type === "tour" || item.type === "matterport") && (item.shareUrl || item.url) && (
                  <div className="absolute left-2 right-2 bottom-2 flex gap-2">
                    <button onClick={() => copyLink(item.shareUrl || item.url)} className="flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-2 bg-white rounded-lg shadow-sm text-[10px] font-black uppercase tracking-widest">
                      <Copy className="w-3 h-3" /> Share
                    </button>
                    <a href={item.shareUrl || item.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center px-2 py-2 bg-white rounded-lg shadow-sm">
                      <ExternalLink className="w-4 h-4 text-black" />
                    </a>
                  </div>
                )}
                {item.canDownload && !["video", "reel", "tour", "matterport"].includes(item.type) && (
                  <a href={item.url} download className="absolute bottom-2 right-2 p-2 bg-white rounded-lg shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                    <Download className="w-4 h-4 text-black" />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
