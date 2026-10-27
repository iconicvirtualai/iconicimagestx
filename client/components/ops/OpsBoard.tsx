import { Link } from "react-router-dom";
import { Camera, MapPin } from "lucide-react";
import { ShootUploader } from "@/components/ops/ShootUploader";
import {
  MEDIA_DELIVERY_LABELS,
  deliveryNotice,
  studioQueueLine,
  type MediaDeliveryRow,
  type MediaDeliveryStatus,
} from "@shared/mediaDelivery";
import {
  OPS_PREVIEW_PATH,
  OPS_STAGES,
  OPS_STAGE_DETAIL,
  OPS_STAGE_LABEL,
  filterOpsStage,
  type OpsJob,
  type OpsStage,
} from "@shared/opsLifecycle";

const quietBtn = "inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gray-700 hover:bg-gray-50";
const studioBtn = "inline-flex items-center gap-1.5 rounded-xl bg-black px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-zinc-800";
const deliverBtn = "rounded-lg bg-[#0d9488] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-40";
const moveBtn = "rounded-lg border border-gray-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gray-700 disabled:opacity-40";

export function OpsBoard({
  stage,
  jobs,
  selectedId,
  canMove,
  canUpload,
  showPreview,
  demo,
  iconicPolish,
  busyId,
  holdMessage,
  onStage,
  onSelect,
  onIconicPolish,
  onMove,
  getToken,
  onUploaded,
}: {
  stage: OpsStage;
  jobs: OpsJob[];
  selectedId: string;
  canMove: boolean;
  canUpload: boolean;
  showPreview: boolean;
  demo: boolean;
  iconicPolish: boolean;
  busyId?: string | null;
  holdMessage?: { id: string; message: string } | null;
  onStage: (stage: OpsStage) => void;
  onSelect: (id: string) => void;
  onIconicPolish: (value: boolean) => void;
  onMove: (row: MediaDeliveryRow, status: MediaDeliveryStatus) => void;
  getToken?: () => Promise<string | undefined> | undefined;
  onUploaded?: () => Promise<void> | void;
}) {
  const visible = filterOpsStage(jobs, stage);
  const counts = OPS_STAGES.reduce((acc, id) => {
    acc[id] = filterOpsStage(jobs, id).length;
    return acc;
  }, {} as Record<OpsStage, number>);

  return (
    <div data-testid="ops-board" className="w-full min-w-0">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-2xl text-xs text-gray-500">
          One shoot, one place. Follow it from the schedule through upload and editing, review, and delivery.
          Pending, Undelivered, and Delivered still follow the gallery. Mark Delivered uses the same hold as sending the gallery.
        </p>
        {showPreview && (
          <Link
            to={OPS_PREVIEW_PATH}
            data-testid="view-as-photographer"
            className="inline-flex shrink-0 items-center rounded-xl bg-black px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-zinc-800"
          >
            View as photographer
          </Link>
        )}
      </div>

      {demo && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
          Sample shoots. Firebase Admin is not configured, so these rows are not live jobs.
        </p>
      )}

      <div role="tablist" aria-label="Shoot lifecycle" className="mb-6 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {OPS_STAGES.map((id) => {
          const active = stage === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`ops-stage-${id}`}
              onClick={() => onStage(id)}
              className={`rounded-2xl border p-4 text-left ${active ? "border-[#0d9488] bg-[#0d9488]/5" : "border-gray-100 bg-white"}`}
            >
              <p className="text-2xl font-black">{counts[id]}</p>
              <p className="text-[10px] font-black uppercase tracking-widest text-black">{OPS_STAGE_LABEL[id]}</p>
              <p className="mt-1 text-[10px] leading-snug text-gray-400">{OPS_STAGE_DETAIL[id]}</p>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white px-6 py-16 text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-gray-400">No shoots in {OPS_STAGE_LABEL[stage]}</p>
          <p className="mt-2 text-xs text-gray-400">Each shoot shows up in the stage it is in now.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((job) => (
            <OpsJobCard
              key={job.id}
              job={job}
              open={selectedId === job.id}
              canMove={canMove}
              canUpload={canUpload}
              iconicPolish={iconicPolish}
              busyId={busyId}
              holdMessage={holdMessage}
              onSelect={() => onSelect(job.id)}
              onIconicPolish={onIconicPolish}
              onMove={onMove}
              getToken={getToken}
              onUploaded={onUploaded}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function OpsJobCard({
  job,
  open,
  canMove,
  canUpload,
  iconicPolish,
  busyId,
  holdMessage,
  onSelect,
  onIconicPolish,
  onMove,
  getToken,
  onUploaded,
}: {
  job: OpsJob;
  open: boolean;
  canMove: boolean;
  canUpload: boolean;
  iconicPolish: boolean;
  busyId?: string | null;
  holdMessage?: { id: string; message: string } | null;
  onSelect: () => void;
  onIconicPolish: (value: boolean) => void;
  onMove: (row: MediaDeliveryRow, status: MediaDeliveryStatus) => void;
  getToken?: () => Promise<string | undefined> | undefined;
  onUploaded?: () => Promise<void> | void;
}) {
  const card = job.card;
  const delivery = job.delivery;
  const notice = delivery ? deliveryNotice(delivery) : null;
  const held = delivery && holdMessage?.id === delivery.id ? holdMessage.message : "";
  const studioHref = card?.studioHref || "";

  return (
    <article data-testid={`ops-job-${job.id}`} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <button type="button" onClick={onSelect} className="flex w-full flex-wrap items-start justify-between gap-3 text-left">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-sm font-black">{job.address}</h2>
            {delivery && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-gray-600">
                {delivery.label}
              </span>
            )}
            {card && (
              <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-teal-800">
                {card.action.statusLabel}
              </span>
            )}
            {delivery?.projectMissing && (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-rose-800">
                Project missing
              </span>
            )}
            {delivery?.galleryMissing && (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-rose-800">
                Gallery missing
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {job.clientName || "No client name"}
            {job.photographerName ? ` · ${job.photographerName}` : ""}
            {card ? ` · ${card.dateLabel} · ${card.timeLabel}` : ""}
          </p>
          {card && <p className="mt-2 text-sm font-bold text-black">{card.action.detail}</p>}
          {job.stage === "uploads" && (
            <p className="mt-1 text-xs font-bold text-gray-700" data-testid={`ops-desk-${job.id}`}>{job.desk.line}</p>
          )}
          {card && job.stage !== "uploads" && <p className="mt-1 text-xs text-gray-500">{card.studio.headline}</p>}
          {delivery && <p className="mt-1 text-[11px] text-gray-400">{studioQueueLine(delivery.studio)}</p>}
        </div>
        <span className="text-[10px] font-black uppercase tracking-widest text-[#0d9488]">{open ? "Close" : "Open"}</span>
      </button>

      {open && (
        <div className="mt-4 border-t border-gray-100 pt-4">
          {card?.accessInfo && (
            <div className="mb-3 rounded-lg bg-yellow-50 p-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Access</p>
              <p className="text-xs font-bold">{card.accessInfo}</p>
            </div>
          )}
          {card?.servicesLabel && <p className="mb-3 text-xs font-bold text-gray-600">{card.servicesLabel}</p>}
          {card?.notes && <p className="mb-3 text-xs text-gray-600">{card.notes}</p>}
          {notice && <p className="mb-3 text-[11px] font-bold text-gray-500">{notice}</p>}
          {held && <p className="mb-3 text-[11px] font-bold text-amber-800">{held}</p>}

          {job.stage === "uploads" && job.listingId && canUpload && (
            <div className="mb-4">
              <ShootUploader
                listingId={job.listingId}
                address={job.address}
                iconicPolish={iconicPolish}
                onIconicPolish={onIconicPolish}
                getToken={getToken}
                onUploaded={onUploaded}
              />
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {card?.mapsHref && (
              <a href={card.mapsHref} target="_blank" rel="noopener noreferrer" className={quietBtn}>
                <MapPin className="h-3.5 w-3.5" /> Directions
              </a>
            )}
            {studioHref && job.listingId && !delivery?.projectMissing && (
              <Link to={studioHref} className={studioBtn}>
                <Camera className="h-3.5 w-3.5" /> Studio
              </Link>
            )}
            {canMove && delivery?.moves.map((status) => (
              <button
                key={status}
                type="button"
                data-testid={`ops-move-${job.id}-${status}`}
                disabled={busyId === delivery.id}
                onClick={() => onMove(delivery, status)}
                className={status === "delivered" ? deliverBtn : moveBtn}
              >
                Mark {MEDIA_DELIVERY_LABELS[status]}
              </button>
            ))}
          </div>
          {job.stage === "shoots" && job.listingId && canUpload && (
            <div className="mt-4">
              <ShootUploader
                listingId={job.listingId}
                address={job.address}
                iconicPolish={iconicPolish}
                onIconicPolish={onIconicPolish}
                getToken={getToken}
                onUploaded={onUploaded}
              />
            </div>
          )}
        </div>
      )}
    </article>
  );
}
