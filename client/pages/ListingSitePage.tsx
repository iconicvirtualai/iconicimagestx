import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ListingSite } from "@/components/listing-site/ListingSite";
import { loadPortalListingView } from "@/lib/portalListingRead";
import { buildListingSiteModel, listingSiteInputFromDetail } from "@shared/listingSite";
import { portalListingId, type PortalListingDetail } from "@shared/portalListingDetail";
import NotFound from "./NotFound";

export default function ListingSitePage() {
  const { listingId = "" } = useParams();
  const id = portalListingId(listingId);
  const [detail, setDetail] = useState<PortalListingDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState("");
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setFetching(true);
    setError("");
    setMissing(false);
    loadPortalListingView({ listingId: id, asClient: false })
      .then((loaded) => {
        if (cancelled) return;
        if (loaded.kind === "missing") {
          setDetail(null);
          setMissing(true);
          return;
        }
        if (loaded.kind === "error") {
          setDetail(null);
          setError(loaded.message);
          return;
        }
        setDetail(loaded.detail);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load this listing.");
      })
      .finally(() => {
        if (!cancelled) setFetching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id || missing) return <NotFound />;
  if (fetching) return <p className="p-8 text-sm">Loading the listing site…</p>;
  if (error || !detail) {
    return (
      <div className="min-h-screen bg-[#f6f7f8] flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center max-w-md">
          <p className="font-bold">{error || "Could not load this listing."}</p>
          <Link to={`/portal/listings/${id}`} className="inline-block mt-4 text-sm font-bold underline">Back to the listing file</Link>
        </div>
      </div>
    );
  }

  const model = buildListingSiteModel(listingSiteInputFromDetail(detail, detail.website));
  return <ListingSite model={model} />;
}
