import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";
import { OpsBoard } from "@/components/ops/OpsBoard";
import { useAuth } from "@/contexts/AuthContext";
import { fetchAssignedListings } from "@/lib/listingUpload";
import { fetchStudioWorkspace } from "@/lib/studioApi";
import {
  applyMediaDeliveryMove,
  type MediaDeliveryRow,
  type MediaDeliveryStatus,
} from "@shared/mediaDelivery";
import {
  buildOpsBoard,
  isOpsStage,
  opsStageFor,
  sampleOpsBoard,
  type OpsJob,
  type OpsStage,
} from "@shared/opsLifecycle";
import type { PhotographerStudioJob } from "@shared/photographerPortal";
import { toast } from "sonner";

export default function AdminOps() {
  const { user, isAdmin, isCoordinator, staffProfile } = useAuth();
  const [params, setParams] = useSearchParams();
  const [listings, setListings] = useState<Array<Record<string, unknown>>>([]);
  const [studioJobs, setStudioJobs] = useState<PhotographerStudioJob[]>([]);
  const [rows, setRows] = useState<MediaDeliveryRow[]>([]);
  const [demoBoard, setDemoBoard] = useState<OpsJob[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [demo, setDemo] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [holdMessage, setHoldMessage] = useState<{ id: string; message: string } | null>(null);
  const stage: OpsStage = isOpsStage(params.get("stage")) ? params.get("stage") as OpsStage : "shoots";
  const selectedId = params.get("job") || "";
  const iconicPolish = params.get("polish") === "1";
  const role = staffProfile?.role || "";
  const canUpload = role === "admin" || role === "coordinator" || role === "photographer";

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const [assigned, studio, delivery] = await Promise.allSettled([
        fetchAssignedListings(),
        fetchStudioWorkspace(undefined, () => user.getIdToken()),
        fetch("/api/studio/delivery-queue", { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      let deliveryStatus = 0;
      let deliveryRows: MediaDeliveryRow[] = [];
      if (delivery.status === "fulfilled") {
        deliveryStatus = delivery.value.status;
        const data = await delivery.value.json().catch(() => ({}));
        if (delivery.value.ok && Array.isArray(data.rows)) deliveryRows = data.rows;
      }
      if (deliveryStatus === 503) {
        setDemo(true);
        setDemoBoard(sampleOpsBoard());
        setListings([]);
        setStudioJobs([]);
        setRows([]);
        return;
      }

      setDemo(false);
      setDemoBoard(null);
      setRows(deliveryRows);
      if (assigned.status === "fulfilled") setListings(assigned.value);
      else setListings([]);
      if (studio.status === "fulfilled") setStudioJobs((studio.value.jobs || []) as PhotographerStudioJob[]);
      else setStudioJobs([]);
      if (assigned.status === "rejected") {
        const reason = assigned.reason;
        toast.error(reason instanceof Error ? reason.message : "Could not load shoots.");
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const jobs = useMemo(() => {
    if (demoBoard) return demoBoard;
    return buildOpsBoard({ listings, studioJobs, deliveryRows: rows });
  }, [demoBoard, listings, studioJobs, rows]);

  const setQuery = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value == null || value === "") next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
  };

  const onMove = async (row: MediaDeliveryRow, status: MediaDeliveryStatus) => {
    setHoldMessage(null);
    if (demo) {
      const moved = applyMediaDeliveryMove(row, status);
      setDemoBoard((current) => (current || []).map((job) => (
        job.delivery?.id === row.id
          ? { ...job, delivery: moved, stage: opsStageFor(job.card, moved) }
          : job
      )));
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
    <AdminLayout title="Shoots">
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#0d9488] border-t-transparent" />
        </div>
      ) : (
        <OpsBoard
          stage={stage}
          jobs={jobs}
          selectedId={selectedId}
          canMove={isCoordinator}
          canUpload={canUpload}
          showPreview={isAdmin}
          demo={demo}
          iconicPolish={iconicPolish}
          busyId={busyId}
          holdMessage={holdMessage}
          onStage={(next) => setQuery({ stage: next, job: null })}
          onSelect={(id) => setQuery({ job: selectedId === id ? null : id })}
          onIconicPolish={(value) => setQuery({ polish: value ? "1" : null })}
          onMove={onMove}
          getToken={() => user?.getIdToken()}
          onUploaded={load}
        />
      )}
    </AdminLayout>
  );
}
