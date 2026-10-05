import { iconicStudioHref } from "@shared/iconicStudio";
import {
  MEDIA_DELIVERY_LABELS,
  MEDIA_DELIVERY_STATUSES,
  deliveryNotice,
  studioQueueLine,
  type MediaDeliveryRow,
  type MediaDeliveryStatus,
} from "@shared/mediaDelivery";

export type DeliveryFilter = "all" | MediaDeliveryStatus;

const FILTERS: Array<{ id: DeliveryFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "pending", label: MEDIA_DELIVERY_LABELS.pending },
  { id: "undelivered", label: MEDIA_DELIVERY_LABELS.undelivered },
  { id: "delivered", label: MEDIA_DELIVERY_LABELS.delivered },
];

const PILL: Record<MediaDeliveryStatus, string> = {
  pending: "bg-gray-100 text-gray-600",
  undelivered: "bg-amber-100 text-amber-800",
  delivered: "bg-teal-100 text-teal-800",
};

export default function MediaDeliveryQueue({
  rows,
  filter,
  canMove,
  busyId,
  holdMessage,
  onFilter,
  onMove,
}: {
  rows: MediaDeliveryRow[];
  filter: DeliveryFilter;
  canMove: boolean;
  busyId?: string | null;
  holdMessage?: { id: string; message: string } | null;
  onFilter: (filter: DeliveryFilter) => void;
  onMove: (row: MediaDeliveryRow, status: MediaDeliveryStatus) => void;
}) {
  const counts = MEDIA_DELIVERY_STATUSES.reduce((acc, status) => {
    acc[status] = rows.filter((row) => row.deliveryStatus === status).length;
    return acc;
  }, {} as Record<MediaDeliveryStatus, number>);
  const visible = filter === "all" ? rows : rows.filter((row) => row.deliveryStatus === filter);

  return (
    <div data-testid="delivery-queue">
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {FILTERS.map((item) => {
          const count = item.id === "all" ? rows.length : counts[item.id];
          const active = filter === item.id;
          return (
            <button
              key={item.id}
              type="button"
              data-testid={`delivery-filter-${item.id}`}
              onClick={() => onFilter(item.id)}
              className={`rounded-2xl border p-4 text-left transition-all ${active ? "border-[#0d9488] bg-[#0d9488]/5" : "border-gray-100 bg-white"}`}
            >
              <p className="text-2xl font-black">{count}</p>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{item.label}</p>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white px-6 py-16 text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-gray-400">No jobs in this delivery state</p>
          <p className="mt-2 text-xs text-gray-400">Galleries and Iconic Studio jobs show up here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((row) => {
            const notice = deliveryNotice(row);
            const held = holdMessage?.id === row.id ? holdMessage.message : "";
            return (
              <article
                key={row.id}
                data-testid={`delivery-row-${row.id}`}
                className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-sm font-black">{row.address}</h2>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${PILL[row.deliveryStatus]}`}>
                        {row.label}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {row.clientName || "No client name"}
                      {row.mediaCount > 0 ? ` · ${row.mediaCount} file${row.mediaCount === 1 ? "" : "s"}` : ""}
                    </p>
                    <p className="mt-1 text-[11px] text-gray-400">{studioQueueLine(row.studio)}</p>
                    {notice && <p className="mt-2 text-[11px] font-bold text-gray-500">{notice}</p>}
                    {held && <p className="mt-2 text-[11px] font-bold text-amber-800">{held}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {row.listingId && (
                      <a
                        href={iconicStudioHref(row.listingId)}
                        className="rounded-lg border border-gray-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gray-600"
                      >
                        Iconic Studio
                      </a>
                    )}
                    {canMove && row.moves.map((status) => (
                      <button
                        key={status}
                        type="button"
                        data-testid={`delivery-move-${row.id}-${status}`}
                        disabled={busyId === row.id}
                        onClick={() => onMove(row, status)}
                        className={`rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-widest disabled:opacity-40 ${
                          status === "delivered"
                            ? "bg-[#0d9488] text-white"
                            : "border border-gray-200 text-gray-700"
                        }`}
                      >
                        Mark {MEDIA_DELIVERY_LABELS[status]}
                      </button>
                    ))}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
