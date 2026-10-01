import * as React from "react";
import AdminLayout from "@/components/AdminLayout";
import MediaLibrary from "@/components/MediaLibrary";
import { useAuth } from "@/contexts/AuthContext";
import { fetchAssignedListings } from "@/lib/listingUpload";
import { listingAddressLabel } from "@shared/mediaLibrary";
import { toast } from "sonner";

export default function AdminMediaLibrary() {
  const { user, staffProfile } = useAuth();
  const [listings, setListings] = React.useState<any[]>([]);
  const [selectedId, setSelectedId] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const canMove = staffProfile?.role === "admin" || staffProfile?.role === "coordinator";

  const load = React.useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      const next = await fetchAssignedListings();
      setListings(next);
      setSelectedId((current) => current && next.some((item) => item.id === current) ? current : String(next[0]?.id || ""));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load the library.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  React.useEffect(() => {
    load();
  }, [load]);

  const selected = listings.find((item) => item.id === selectedId);

  return (
    <AdminLayout title="Media Library">
      <div className="space-y-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <label htmlFor="media-listing" className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Listing</label>
          <select
            id="media-listing"
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
            className="mt-2 w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold"
          >
            {listings.map((listing) => (
              <option key={listing.id} value={listing.id}>
                {listingAddressLabel(listing)} · {(listing.images || []).length} files
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-2">
            Photographer uploads stay on the listing. Admins can move a file onto another listing, which is how it changes client and staff context.
          </p>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-24"><div className="w-6 h-6 border-2 border-[#0d9488] border-t-transparent rounded-full animate-spin" /></div>
        ) : selected ? (
          <MediaLibrary
            listing={selected}
            destinations={listings}
            canMove={canMove}
            canOrganize
            onChanged={load}
          />
        ) : (
          <p className="text-sm font-bold text-gray-400 uppercase tracking-widest text-center py-16">No listings yet</p>
        )}
      </div>
    </AdminLayout>
  );
}
