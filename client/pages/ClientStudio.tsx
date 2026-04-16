import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import ImageEditorModal from "@/components/ImageEditorModal";
import { Download, AlertCircle, Lock } from "lucide-react";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { toast } from "sonner";

interface ListingData {
  id: string;
  address: string;
  city: string;
  studioEnabled: boolean;
  images: Array<{ url: string; name: string }>;
}

const PLACEHOLDER_IMAGES = [
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80",
  "https://images.unsplash.com/photo-1600585154341-be6161a56a0c?w=1200&q=80",
  "https://images.unsplash.com/photo-1600585154342-be6161a56a0c?w=1200&q=80",
  "https://images.unsplash.com/photo-1600585154343-be6161a56a0c?w=1200&q=80",
  "https://images.unsplash.com/photo-1600585154344-be6161a56a0c?w=1200&q=80",
  "https://images.unsplash.com/photo-1600585154345-be6161a56a0c?w=1200&q=80",
];

export default function ClientStudio() {
  const { listingId } = useParams<{ listingId: string }>();
  const [listing, setListing] = useState<ListingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editorState, setEditorState] = useState<{
    isOpen: boolean;
    imageUrl: string;
  }>({
    isOpen: false,
    imageUrl: "",
  });
  const [selectedImages, setSelectedImages] = useState<Set<number>>(new Set());

  useEffect(() => {
    const loadListing = async () => {
      if (!listingId) {
        setError("Invalid listing ID");
        setLoading(false);
        return;
      }

      try {
        const listingRef = doc(db, "listings", listingId);
        const snapshot = await getDoc(listingRef);

        if (!snapshot.exists()) {
          setError("Listing not found");
          setLoading(false);
          return;
        }

        const data = snapshot.data() as ListingData;

        if (!data.studioEnabled) {
          setError("This studio session is not available");
          setLoading(false);
          return;
        }

        setListing({
          id: snapshot.id,
          ...data,
        });
      } catch (err) {
        console.error("Error loading listing:", err);
        setError("Failed to load listing");
      } finally {
        setLoading(false);
      }
    };

    loadListing();
  }, [listingId]);

  const openEditor = (imageUrl: string) => {
    setEditorState({ isOpen: true, imageUrl });
  };

  const toggleImageSelection = (index: number) => {
    const newSelected = new Set(selectedImages);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedImages(newSelected);
  };

  const handleDownloadSelected = () => {
    if (selectedImages.size === 0) {
      toast.error("Please select at least one image");
      return;
    }
    toast.success(
      `Preparing ${selectedImages.size} image(s) for download...`
    );
  };

  const handleRequestRevisions = () => {
    toast.success("Revision request submitted. We'll get back to you soon!");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-white">
        <div className="text-center">
          <div className="w-12 h-12 rounded-lg bg-[#0d9488] mx-auto mb-4 animate-pulse"></div>
          <p className="text-sm font-bold text-gray-600 uppercase tracking-widest">
            Loading studio...
          </p>
        </div>
      </div>
    );
  }

  if (error || !listing) {
    return (
      <div className="flex items-center justify-center h-screen bg-white">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-lg bg-red-50 mx-auto mb-4 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-xl font-black text-black mb-2 uppercase tracking-tight">
            Access Not Available
          </h1>
          <p className="text-sm text-gray-500 font-bold uppercase tracking-widest">
            {error || "Unable to load this listing"}
          </p>
        </div>
      </div>
    );
  }

  const images = listing.images && listing.images.length > 0
    ? listing.images.map((img) => img.url)
    : PLACEHOLDER_IMAGES;

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-40">
        <div className="container mx-auto px-6 py-6 max-w-7xl">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-[#0d9488] flex items-center justify-center flex-shrink-0">
                <span className="font-black text-white text-lg">I</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-black text-black uppercase tracking-tight">
                    Iconic Images
                  </h1>
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                    / Editing Studio
                  </span>
                </div>
                <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">
                  {listing.address}, {listing.city}
                </p>
              </div>
            </div>
            <button className="px-4 py-2 rounded-lg border border-slate-200 text-gray-700 font-bold text-xs uppercase tracking-widest hover:bg-gray-50 transition-colors flex items-center gap-2">
              <Download className="w-4 h-4" />
              Download All
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-12 max-w-7xl pb-40">
        {/* Photo Grid */}
        <div className="mb-12">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-6">
            {images.length} images available
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {images.map((imageUrl, index) => (
              <div
                key={index}
                className="group relative rounded-2xl overflow-hidden bg-gray-100 aspect-video cursor-pointer"
              >
                <img
                  src={imageUrl}
                  alt={`Photo ${index + 1}`}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />

                {/* Hover Overlay */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                  <button
                    onClick={() => openEditor(imageUrl)}
                    className="px-4 py-2 rounded-lg bg-[#0d9488] hover:bg-[#0f766e] text-white font-bold text-xs uppercase tracking-widest transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => toggleImageSelection(index)}
                    className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-xs uppercase tracking-widest transition-colors ${
                      selectedImages.has(index)
                        ? "bg-white text-[#0d9488]"
                        : "bg-white/20 text-white hover:bg-white/30"
                    }`}
                  >
                    {selectedImages.has(index) ? "✓" : "+"}
                  </button>
                </div>

                {/* Number Badge */}
                <div className="absolute top-3 left-3 w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center text-xs font-bold">
                  {index + 1}
                </div>

                {/* Selection Indicator */}
                {selectedImages.has(index) && (
                  <div className="absolute bottom-3 right-3 w-6 h-6 rounded-full bg-[#0d9488] flex items-center justify-center">
                    <span className="text-white text-xs font-bold">✓</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white shadow-lg">
        <div className="container mx-auto px-6 py-6 max-w-7xl">
          <div className="flex items-center justify-between gap-6">
            <div className="flex-1">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                {selectedImages.size > 0
                  ? `${selectedImages.size} photo${selectedImages.size === 1 ? "" : "s"} selected`
                  : `${images.length} photos ready for download`}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleRequestRevisions}
                className="px-6 py-3 rounded-xl border border-slate-200 text-gray-700 font-bold text-xs uppercase tracking-widest hover:bg-gray-50 transition-colors"
              >
                Request Revisions
              </button>
              <button
                onClick={handleDownloadSelected}
                disabled={selectedImages.size === 0}
                className="px-6 py-3 rounded-xl bg-[#0d9488] hover:bg-[#0f766e] text-white font-bold text-xs uppercase tracking-widest disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download Selected
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Image Editor Modal */}
      <ImageEditorModal
        isOpen={editorState.isOpen}
        onClose={() =>
          setEditorState({ isOpen: false, imageUrl: "" })
        }
        imageUrl={editorState.imageUrl}
      />
    </div>
  );
}
