import * as React from "react";
import { useParams, Link } from "react-router-dom";
import { Copy, Download, ExternalLink, Image, Link2, Lock, AlertCircle, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function PublicGallery() {
  const { galleryId } = useParams<{ galleryId: string }>();
  const [gallery, setGallery] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!galleryId) return;
    fetch(`/api/galleries/public/${galleryId}`)
      .then(async res => {
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      })
      .then(setGallery)
      .catch(() => setError("We could not open this gallery. Please contact Iconic Images."))
      .finally(() => setLoading(false));
  }, [galleryId]);

  if (loading) return <div className="min-h-screen bg-white flex items-center justify-center"><div className="w-8 h-8 border-4 border-[#0d9488] border-t-transparent rounded-full animate-spin" /></div>;

  if (error || !gallery) return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="max-w-md text-center">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 text-red-500" />
        <h1 className="text-2xl font-black mb-2">Gallery Unavailable</h1>
        <p className="text-sm text-gray-500">{error}</p>
      </div>
    </div>
  );

  const media: any[] = gallery.mediaItems || [];
  const needsPayment = gallery.paymentRequired && gallery.invoiceId;
  const copyLink = async (url: string) => {
    await navigator.clipboard.writeText(url);
    toast.success("Share link copied.");
  };

  return (
    <div className="min-h-screen bg-white">
      <header className="bg-black text-white">
        <div className="max-w-6xl mx-auto px-4 py-10">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500">Iconic Images</p>
          <h1 className="text-3xl font-black mt-2">{gallery.address || gallery.title || "Your Gallery"}</h1>
          {gallery.clientName && <p className="text-gray-400 mt-1">{gallery.clientName}</p>}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {needsPayment && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Lock className="w-5 h-5 text-yellow-700 mt-0.5" />
              <div>
                <p className="text-sm font-black text-yellow-900">Downloads are locked until payment is recorded.</p>
                <p className="text-xs text-yellow-700 mt-1">You can review the gallery here; download access unlocks after the invoice is paid.</p>
              </div>
            </div>
            <Button asChild className="bg-black hover:bg-gray-800 text-white rounded-xl">
              <Link to={`/invoice/${gallery.invoiceId}`}><CreditCard className="w-4 h-4 mr-2" /> View Invoice</Link>
            </Button>
          </div>
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
                {item.type === "video" || item.type === "reel" ? (
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
    </div>
  );
}
