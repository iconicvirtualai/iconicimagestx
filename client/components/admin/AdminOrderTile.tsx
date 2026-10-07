import { Check } from "lucide-react";
import {
  ADMIN_STUDIOS,
  type AdminDeliveryState,
  type AdminOrderTileModel,
  type AdminPaidState,
  type AdminStudioId,
} from "@shared/adminOrderTile";
import { cn } from "@/lib/utils";

const PAID_CLASS: Record<AdminPaidState, string> = {
  paid: "border-[#99f6e4] bg-[#f0fdfa] text-[#0f766e]",
  unpaid: "border-[#fdba74] bg-[#fff7ed] text-[#b45309]",
  partial: "border-[#fcd34d] bg-[#fffbeb] text-[#92400e]",
};

const PAID_DOT: Record<AdminPaidState, string> = {
  paid: "bg-[#0d9488]",
  unpaid: "bg-[#b45309]",
  partial: "bg-[#c9a227]",
};

const DELIVERY_CLASS: Record<AdminDeliveryState, string> = {
  delivered: "border-[#99f6e4] bg-[#f0fdfa] text-[#0f766e]",
  in_progress: "border-[#94a3b8] bg-[#f1f5f9] text-[#334155]",
  not_delivered: "border-[#cbd5e1] bg-[#f8fafc] text-[#64748b]",
};

const DELIVERY_DOT: Record<AdminDeliveryState, string> = {
  delivered: "bg-[#0d9488]",
  in_progress: "bg-[#64748b]",
  not_delivered: "bg-[#94a3b8]",
};

export function AdminOrderTile({
  order,
  selected = false,
  onOpen,
  onToggleSelect,
  onStudioChange,
}: {
  order: AdminOrderTileModel;
  selected?: boolean;
  onOpen?: () => void;
  onToggleSelect?: () => void;
  onStudioChange?: (studio: AdminStudioId) => void;
}) {
  return (
    <article
      data-admin-order-tile=""
      data-kind={order.kind}
      data-paid={order.paid}
      data-delivery={order.delivery}
      data-studio={order.studio || ""}
      onClick={onOpen}
      style={{ fontFamily: "Inter, system-ui, sans-serif" }}
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-2xl border border-[#cbd5e1] bg-white text-[#0F172A] shadow-[0_12px_28px_rgba(15,23,42,0.12)] [&_p]:[overflow-wrap:normal] [&_p]:[word-break:normal] [&_span]:[overflow-wrap:normal] [&_span]:[word-break:normal]",
        onOpen && "cursor-pointer",
        selected && "ring-2 ring-[#0d9488] ring-offset-2",
      )}
      aria-label={`${order.typeLabel} order ${order.packageName}, ${order.paidLabel}, ${order.deliveryLabel}`}
    >
      <div className="relative h-[148px] shrink-0 overflow-hidden bg-[#1e293b]">
        <img src={order.heroUrl} alt="" className="h-full w-full object-cover" data-slot="hero" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-b from-transparent to-white" />
        <span className="absolute left-2.5 top-2.5 z-[2] rounded-[4px] bg-[#0F172A] px-2 py-1 text-[9px] font-extrabold uppercase tracking-[0.16em] text-[#5eead4]">
          Admin
        </span>
        <span
          data-slot="type"
          className="absolute right-2.5 top-2.5 z-[2] rounded-[4px] border border-[#cbd5e1] bg-white/90 px-2 py-1 text-[9px] font-extrabold uppercase tracking-[0.12em] text-[#0F172A]"
        >
          {order.typeLabel}
        </span>
        {onToggleSelect ? (
          <button
            type="button"
            aria-label={selected ? "Deselect order" : "Select order"}
            aria-pressed={selected}
            onClick={(event) => {
              event.stopPropagation();
              onToggleSelect();
            }}
            className={cn(
              "absolute bottom-4 left-2.5 z-[2] flex h-5 w-5 items-center justify-center rounded-md border-2",
              selected ? "border-[#0d9488] bg-[#0d9488] text-white" : "border-white/80 bg-black/25 text-white",
            )}
          >
            {selected ? <Check className="h-3 w-3" /> : null}
          </button>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 px-4 pb-4 pt-[14px]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p data-slot="package" className="text-[18px] font-extrabold uppercase leading-[1.15] tracking-[-0.02em] text-[#0F172A]">
              {order.packageName}
            </p>
            <p data-slot="skin" className="mt-[3px] text-[11px] font-semibold text-[#64748b]">
              {order.skinLabel}
            </p>
          </div>
          <p data-slot="price" className="whitespace-nowrap text-right text-[22px] font-extrabold leading-none tracking-[-0.02em] text-[#0f766e]">
            {order.priceLabel}
            {order.priceNote ? (
              <small data-slot="price-note" className="mt-[3px] block text-right text-[10px] font-semibold text-[#64748b]">
                {order.priceNote}
              </small>
            ) : null}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Status className={PAID_CLASS[order.paid]} dot={PAID_DOT[order.paid]} slot="paid" label={order.paidLabel} />
          <Status className={DELIVERY_CLASS[order.delivery]} dot={DELIVERY_DOT[order.delivery]} slot="delivery" label={order.deliveryLabel} />
        </div>

        <div className="grid grid-cols-2 gap-x-3.5 gap-y-2.5 rounded-[10px] border border-[#e2e8f0] bg-[#f8fafc] p-3">
          <Field k="Client" v={order.clientName} slot="client" />
          <Field k="Appt date" v={order.appointmentDate} slot="appointment" />
          <Field k="Location:" v={order.location} slot="location" full />
        </div>

        {order.studio ? (
          <div data-slot="studio">
            <p className="mb-2 text-[9px] font-extrabold uppercase tracking-[0.12em] text-[#64748b]">Studio</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Studio">
              {ADMIN_STUDIOS.map((studio) => {
                const active = order.studio === studio.id;
                return (
                  <button
                    key={studio.id}
                    type="button"
                    aria-pressed={active}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (!active) onStudioChange?.(studio.id);
                    }}
                    className={cn(
                      "rounded-full border bg-white px-3 py-1.5 text-[12px] font-semibold leading-none",
                      active
                        ? "border-[#0d9488] font-bold text-[#0f766e]"
                        : "border-[#cbd5e1] text-[#334155]",
                    )}
                  >
                    {studio.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="mt-0.5 flex items-center justify-between gap-3 border-t border-[#e2e8f0] pt-3">
          <span data-slot="order-code" className="text-[10px] font-bold tabular-nums tracking-[0.06em] text-[#64748b]">
            {order.orderCode}
          </span>
          <span data-slot="channel" className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#334155]">
            {order.channel}
          </span>
        </div>
      </div>
    </article>
  );
}

function Status({ className, dot, slot, label }: { className: string; dot: string; slot: string; label: string }) {
  return (
    <span data-slot={slot} className={cn("inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold tracking-[0.02em]", className)}>
      <span className={cn("h-[7px] w-[7px] shrink-0 rounded-full", dot)} />
      {label}
    </span>
  );
}

function Field({ k, v, slot, full = false }: { k: string; v: string; slot: string; full?: boolean }) {
  return (
    <div data-slot={slot} className={cn("min-w-0", full && "col-span-2")}>
      <p className="mb-[3px] text-[9px] font-extrabold uppercase tracking-[0.12em] text-[#64748b]">{k}</p>
      <p className="text-[13px] font-bold leading-[1.25] text-[#0F172A] [word-break:break-word]">{v}</p>
    </div>
  );
}
