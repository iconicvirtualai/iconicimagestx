import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Download, Lock } from "lucide-react";
import { OrderNumberMark } from "@/components/OrderNumberMark";
import { DeliveryInvoiceCard } from "@/components/delivery/DeliveryInvoiceCard";
import {
  DELIVERY_UNLOCK_PROMPT,
  groupDeliveryMedia,
  type ClientDeliveryMedia,
  type ClientDeliveryPresentation,
} from "@shared/clientDelivery";

function focusPay() {
  const node = document.getElementById("delivery-pay-button");
  node?.scrollIntoView({ behavior: "smooth", block: "center" });
  if (node instanceof HTMLElement) node.focus();
}

function DownloadChoices({
  item,
  paid,
}: {
  item: ClientDeliveryMedia;
  paid: boolean;
}) {
  if (!paid || (!item.highUrl && !item.webUrl)) return null;
  return (
    <div className="mt-2 grid gap-2">
      {item.highUrl && (
        <a href={item.highUrl} data-testid={`delivery-high-${item.id}`} className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl bg-black px-3 text-[10px] font-black uppercase tracking-widest text-white">
          <Download className="h-3.5 w-3.5" /> High-Res (Print)
        </a>
      )}
      {item.webUrl && (
        <a href={item.webUrl} data-testid={`delivery-web-${item.id}`} className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-gray-200 px-3 text-[10px] font-black uppercase tracking-widest text-black">
          <Download className="h-3.5 w-3.5" /> Web / MLS
        </a>
      )}
    </div>
  );
}

function MediaCard({ item, paid }: { item: ClientDeliveryMedia; paid: boolean }) {
  return (
    <article className="min-w-0" data-testid={`delivery-media-${item.id}`} data-watermarked={item.watermarked ? "true" : "false"}>
      <div className="relative overflow-hidden rounded-2xl bg-gray-100">
        <img src={item.previewUrl} alt={item.name} className="h-20 w-full object-cover sm:aspect-[4/3] sm:h-auto" />
        {item.watermarked && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10" aria-hidden>
            <p className="rotate-[-18deg] text-center text-sm font-black uppercase tracking-[0.25em] text-white drop-shadow">Iconic Images</p>
          </div>
        )}
      </div>
      <p className="mt-2 truncate text-sm font-semibold text-black">{item.name}</p>
      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{item.kind}</p>
      <DownloadChoices item={item} paid={paid} />
    </article>
  );
}

function MediaGroup({
  name,
  items,
  paid,
}: {
  name: string;
  items: ClientDeliveryMedia[];
  paid: boolean;
}) {
  if (!items.length) return null;
  return (
    <section>
      <h2 className="mb-3 text-sm font-black uppercase tracking-widest text-gray-500">{name}</h2>
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {items.map((item) => <MediaCard key={item.id} item={item} paid={paid} />)}
      </div>
    </section>
  );
}

export function ClientDeliveryView({ presentation }: { presentation: ClientDeliveryPresentation }) {
  const groups = groupDeliveryMedia(presentation.media);
  return (
    <div className="iframe-safe-page min-h-screen bg-[#f6f7f6] text-black" data-testid="client-delivery" data-paid={presentation.paid ? "true" : "false"}>
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:py-6">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-400">Iconic Images · Delivery</p>
          <h1 className="mt-2 text-lg font-black leading-tight sm:text-2xl" data-testid="delivery-address">{presentation.address}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
            <span data-testid="delivery-order-number">
              <OrderNumberMark value={presentation.orderNumber} />
            </span>
            {presentation.clientName && <span>{presentation.clientName}</span>}
          </div>
          <p className="mt-2 text-sm text-gray-700" data-testid="delivery-package">{presentation.packageSummary}</p>
          <p className="mt-1 text-sm text-gray-500">
            {presentation.shootDate ? `Shoot ${presentation.shootDate}` : "Shoot date on the order"}
            {presentation.deliveryDate ? ` · Delivered ${presentation.deliveryDate}` : ""}
          </p>
          <p className="mt-2 text-sm text-gray-600" data-testid="delivery-contact">{presentation.contactLine}</p>
        </div>
      </header>
      <main className="mx-auto grid max-w-6xl gap-4 px-4 py-4 sm:gap-6 sm:py-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="order-1 min-w-0 space-y-4 lg:space-y-6">
          <section className="rounded-3xl border border-gray-200 bg-white p-4" data-testid="delivery-downloads">
            {presentation.paid ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                {presentation.zipPrintUrl && (
                  <a href={presentation.zipPrintUrl} data-testid="delivery-zip-print" className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-black px-4 text-xs font-black uppercase tracking-widest text-white">
                    <Download className="h-4 w-4" /> Download all · High-Res (Print)
                  </a>
                )}
                {presentation.zipWebUrl && (
                  <a href={presentation.zipWebUrl} data-testid="delivery-zip-web" className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 text-xs font-black uppercase tracking-widest">
                    <Download className="h-4 w-4" /> Download all · Web / MLS
                  </a>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-2">
                  <Lock className="mt-0.5 h-4 w-4 text-amber-700" />
                  <p className="text-sm font-semibold text-amber-950" data-testid="delivery-lock-prompt">{DELIVERY_UNLOCK_PROMPT}</p>
                </div>
                <button type="button" onClick={focusPay} className="min-h-11 rounded-xl bg-black px-4 text-xs font-black uppercase tracking-widest text-white" data-testid="delivery-focus-pay">
                  Pay invoice
                </button>
              </div>
            )}
          </section>
          <div className="hidden sm:block space-y-6">
            {groups.map((group) => (
              <MediaGroup key={group.name} name={group.name} items={group.items} paid={presentation.paid} />
            ))}
          </div>
          <div className="sm:hidden">
            {groups.filter((group) => group.name === "Photos").map((group) => (
              <MediaGroup key={group.name} name={group.name} items={group.items.slice(0, 2)} paid={presentation.paid} />
            ))}
          </div>
        </div>
        <div className="order-3 space-y-4 sm:hidden">
          {groups.map((group) => (
            <MediaGroup
              key={group.name}
              name={group.name}
              items={group.name === "Photos" ? group.items.slice(2) : group.items}
              paid={presentation.paid}
            />
          ))}
        </div>
        <div className="order-2 lg:sticky lg:top-4 lg:self-start">
          <DeliveryInvoiceCard invoice={presentation.invoice} />
          {presentation.sample && (
            <p className="mt-3 text-xs text-gray-400">Sample delivery. No card is charged from this preview.</p>
          )}
        </div>
      </main>
    </div>
  );
}

export default function ClientDelivery() {
  const { deliveryId } = useParams<{ deliveryId: string }>();
  const [presentation, setPresentation] = useState<ClientDeliveryPresentation | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!deliveryId) return;
    let cancelled = false;
    setPresentation(null);
    setError("");
    void fetch(`/api/deliver/${encodeURIComponent(deliveryId)}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : "This delivery link is not active.");
        if (!cancelled) setPresentation(body as ClientDeliveryPresentation);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "This delivery link is not active.");
      });
    return () => {
      cancelled = true;
    };
  }, [deliveryId]);

  if (error) {
    return (
      <div className="iframe-safe-page flex min-h-screen items-center justify-center bg-white px-6 text-center">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Iconic Images</p>
          <h1 className="mt-2 text-xl font-black">Delivery unavailable</h1>
          <p className="mt-2 text-sm text-gray-500">{error}</p>
        </div>
      </div>
    );
  }
  if (!presentation) {
    return <div className="iframe-safe-page flex min-h-screen items-center justify-center bg-white text-sm font-bold text-gray-400">Opening delivery…</div>;
  }
  return <ClientDeliveryView presentation={presentation} />;
}
