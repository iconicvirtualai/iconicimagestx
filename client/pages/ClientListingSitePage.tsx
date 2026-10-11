import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Lock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ClientListingSiteGate } from "@/components/gallery/ClientListingSite";
import { invoicePayLinkFor } from "@shared/invoicePayLink";

const SAMPLE_LISTING_ID = "sample-listing-site";

function failureCopy(status: number, data: { code?: string; message?: string; error?: string }, id: string) {
  const message = data.message || data.error || "";
  if (data.code === "studio_disabled") return { title: "Studio link is off", message };
  if (data.code === "studio_locked") return { title: "Studio link is locked", message };
  if (data.code === "unknown" || status === 404) return { title: "Listing not found", message: message || `No listing uses ${id}.` };
  if (status === 403) return { title: "This listing is not open", message };
  return { title: "Listing not found", message: message || `This listing could not be opened.` };
}

export default function ClientListingSitePage() {
  const { listingId } = useParams<{ listingId: string }>();
  const [search] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const fixture = import.meta.env.DEV ? search.get("fixture") : null;
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [failure, setFailure] = useState<{ title: string; message: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!listingId || authLoading) return;
    if (listingId === SAMPLE_LISTING_ID && (fixture === "locked" || fixture === "paid")) {
      setFailure(null);
      setPayload(samplePayload(fixture));
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const headers: Record<string, string> = {};
        if (user) {
          try {
            const token = await user.getIdToken();
            if (token) headers.Authorization = `Bearer ${token}`;
          } catch (err) {
            console.warn("[ClientListingSite] Could not attach the session.", err);
          }
        }
        const res = await fetch(`/api/galleries/link/${encodeURIComponent(listingId)}`, { headers });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && data.kind === "listing" && data.project) {
          setFailure(null);
          setPayload(data);
          return;
        }
        if (res.ok && data.kind === "gallery" && data.galleryId) {
          setPayload(null);
          setFailure({
            title: "This link is a gallery",
            message: "The listing site uses the project id. Downloads and the invoice stay on the gallery.",
          });
          return;
        }
        setPayload(null);
        setFailure(failureCopy(res.status, data, listingId));
      } catch (err) {
        console.warn("[ClientListingSite] Lookup failed.", err);
        if (!cancelled) {
          setPayload(null);
          setFailure({ title: "Listing not found", message: `The lookup for ${listingId} did not finish.` });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listingId, user, authLoading, fixture]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f5f3]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#0d9488] border-t-transparent" />
      </div>
    );
  }

  if (!payload || !listingId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f5f3] px-4">
        <div className="max-w-lg text-center">
          <Lock className="mx-auto mb-4 h-12 w-12 text-gray-300" />
          <h2 className="mb-2 text-xl font-semibold">{failure?.title || "Listing not found"}</h2>
          <p className="text-sm text-gray-600">{failure?.message || "This listing could not be opened."}</p>
          <p className="mt-4 text-sm">
            <Link to="/privacy" className="underline">Privacy Policy</Link>
            {" · "}
            <Link to="/terms" className="underline">Terms and Conditions</Link>
          </p>
        </div>
      </div>
    );
  }

  const project = payload.project as Record<string, unknown> | undefined;
  if (!project) {
    return null;
  }
  const galleryId = typeof payload.openGalleryId === "string" ? payload.openGalleryId : null;

  return (
    <ClientListingSiteGate
      project={project}
      listingId={listingId}
      galleryId={galleryId}
      signedIn={Boolean(user)}
      sampleStills={listingId === SAMPLE_LISTING_ID && (fixture === "locked" || fixture === "paid")}
    />
  );
}

function samplePayload(fixture: "locked" | "paid") {
  const locked = fixture === "locked";
  const payUrl = invoicePayLinkFor(
    { id: "sampleInvoice01", status: "sent", payToken: "samplePayToken0123456789ab" },
    { PUBLIC_SITE_URL: "https://iconicimagestx.vercel.app" },
  );
  return {
    kind: "listing",
    openGalleryId: "sample-gallery-01",
    project: {
      view: "owner",
      downloadsUnlocked: !locked,
      address: "100 Playtest Lane, Austin, TX 78701",
      agentName: "Avery Sample",
      clientName: "Jordan Sample",
      brand: "Iconic Images",
      payUrl,
      invoice: { status: locked ? "sent" : "paid" },
      images: [
        { url: "/media/photos/luxury-exterior.jpg", name: "Front elevation", downloadUrl: "/media/photos/luxury-exterior.jpg" },
        { url: "/media/photos/listing-living-01.jpg", name: "Living room", downloadUrl: "/media/photos/listing-living-01.jpg" },
        { url: "/media/photos/listing-living-02.jpg", name: "Kitchen", downloadUrl: "/media/photos/listing-living-02.jpg" },
        { url: "/media/photos/listing-living-03.jpg", name: "Primary suite", downloadUrl: "/media/photos/listing-living-03.jpg" },
        { url: "/media/photos/drone-hero.jpg", name: "Aerial overlook", downloadUrl: "/media/photos/drone-hero.jpg" },
      ],
      videos: locked
        ? [{
          name: "Property film",
          poster: "/media/photos/luxury-exterior.jpg",
          streamUrl: "",
          url: null,
        }]
        : [{
          name: "Property film",
          poster: "/media/photos/luxury-exterior.jpg",
          url: "/media/videos/snap-reels/snap-reel-01.mp4",
          downloadUrl: "/media/videos/snap-reels/snap-reel-01.mp4",
        }],
      tourUrl: "https://my.matterport.com/show/?m=SxQL3iGyoDo",
      floorPlans: [
        { url: "/media/playtest/TEST-delivery-qa-floorplan.png", name: "Level 1.png", downloadUrl: "/media/playtest/TEST-delivery-qa-floorplan.png" },
        { url: "/media/playtest/TEST-delivery-qa-floorplan.pdf", name: "Level 1.pdf" },
      ],
      files: [{ url: "/media/playtest/TEST-delivery-qa-other.zip", name: "All files.zip" }],
    },
  };
}
