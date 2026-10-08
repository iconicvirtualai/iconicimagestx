import { useCallback, useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import MediaDeliveryQueue, { type DeliveryFilter } from "@/components/delivery/MediaDeliveryQueue";
import { useAuth } from "@/contexts/AuthContext";
import {
  applyMediaDeliveryMove,
  sampleMediaDeliveryRows,
  type MediaDeliveryRow,
  type MediaDeliveryStatus,
} from "@shared/mediaDelivery";
import { toast } from "sonner";

export default function AdminDeliveryQueue() {
  const { user, isCoordinator } = useAuth();
  const [rows, setRows] = useState<MediaDeliveryRow[]>([]);
  const [filter, setFilter] = useState<DeliveryFilter>("all");
  const [loading, setLoading] = useState(true);
  const [demo, setDemo] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [holdMessage, setHoldMessage] = useState<{ id: string; message: string } | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/studio/delivery-queue", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 503) {
        setDemo(true);
        setRows(sampleMediaDeliveryRows());
        return;
      }
      if (!res.ok) throw new Error(data.error || "Could not load the delivery queue.");
      setDemo(false);
      setRows(Array.isArray(data.rows) ? data.rows : []);
    } catch (err) {
      setRows([]);
      toast.error(err instanceof Error ? err.message : "Could not load the delivery queue.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const onMove = async (row: MediaDeliveryRow, status: MediaDeliveryStatus) => {
    setHoldMessage(null);
    if (demo) {
      setRows((current) => current.map((item) => item.id === row.id ? applyMediaDeliveryMove(item, status) : item));
      toast.message("Sample queue", {
        description: "A live gallery uses the delivery hold and the client notice.",
      });
      return;
    }
    if (!row.galleryId || !user) return;
    setBusyId(row.id);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/studio/delivery-queue/move", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ galleryId: row.galleryId, status }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        const message = data.error || "Gallery stays held.";
        setHoldMessage({ id: row.id, message });
        toast.error(message);
        return;
      }
      if (!res.ok) throw new Error(data.error || "Could not update delivery.");
      toast.success(status === "delivered" ? "Marked Delivered." : `Marked ${data.label || status}.`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update delivery.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AdminLayout title="Delivery">
      <p className="mb-6 max-w-2xl text-xs text-gray-500">
        Pending, Undelivered, and Delivered follow the gallery on each Studio job.
        Mark Delivered uses the same hold as sending the gallery to the client.
      </p>
      {demo && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
          Sample queue. Firebase Admin is not configured, so these rows are not live jobs.
        </p>
      )}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#0d9488] border-t-transparent" />
        </div>
      ) : (
        <MediaDeliveryQueue
          rows={rows}
          filter={filter}
          canMove={isCoordinator}
          busyId={busyId}
          holdMessage={holdMessage}
          onFilter={setFilter}
          onMove={onMove}
        />
      )}
    </AdminLayout>
  );
}
