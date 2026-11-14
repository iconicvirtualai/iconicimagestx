import { useEffect, useState } from "react";
import { cardLabel, type BillingProfile, type ClientHubProfile } from "@shared/clientHubSettings";
import { CardOnFileControl } from "@/components/client-hub/SettingsPages";
import { auth } from "@/lib/firebase";
import { prepareProfileImage } from "@/lib/profileImage";
import type { ClientRecord } from "@/lib/clientRecords";

type SquareConfig = { applicationId?: string; locationId?: string; environment?: string; missing?: string[] };

async function staffFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Sign in as staff to update this client.");
  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Could not update this client.");
  return body as T;
}

export function AdminClientHeadshot({ client }: { client: ClientRecord }) {
  const url = client.hubProfile?.headshotUrl || "";
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMessage("");
    try {
      const dataUrl = await prepareProfileImage(file);
      await staffFetch(`/api/clients/${client.id}/hub/profile/asset`, {
        method: "POST",
        body: JSON.stringify({ kind: "headshot", dataUrl }),
      });
      setMessage("Headshot saved on this client.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save that headshot.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 flex items-center gap-3" data-testid="admin-client-headshot">
      {url ? (
        <img src={url} alt="" className="h-16 w-16 rounded-full object-cover bg-white/10" />
      ) : (
        <div className="grid h-16 w-16 place-items-center rounded-full bg-white/10 text-xs font-black">Photo</div>
      )}
      <div>
        <label className="inline-flex min-h-10 cursor-pointer items-center rounded-xl bg-white px-3 text-[10px] font-black uppercase tracking-widest text-black">
          {busy ? "Saving" : url ? "Replace headshot" : "Upload headshot"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Headshot"
            className="sr-only"
            disabled={busy}
            onChange={(event) => void onFile(event.target.files?.[0])}
          />
        </label>
        <p className="mt-1 text-xs text-gray-400">The photo saves as soon as the upload finishes.</p>
        {message ? <p role="status" className="mt-1 text-xs font-bold text-white">{message}</p> : null}
      </div>
    </div>
  );
}

export function AdminClientCard({ clientId, summary }: { clientId: string; summary?: ClientRecord["cardOnFile"] }) {
  const [square, setSquare] = useState<SquareConfig | null>(null);
  const [label, setLabel] = useState(cardLabel(summary?.last4 ? { brand: summary.brand || "Card", last4: summary.last4 } : null) || "No card on file");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    void staffFetch<{ billing: BillingProfile & { square?: SquareConfig } }>(`/api/clients/${clientId}/hub/billing`)
      .then((body) => {
        if (cancelled) return;
        setSquare(body.billing.square || { missing: ["SQUARE_APPLICATION_ID", "SQUARE_LOCATION_ID"] });
        setLabel(cardLabel(body.billing.card) || "No card on file");
      })
      .catch((err: Error) => {
        if (!cancelled) setMessage(err.message);
      });
    return () => { cancelled = true; };
  }, [clientId]);

  return (
    <div className="mb-6" data-testid="admin-client-card">
      <p className="mb-2 text-sm font-bold">{label}</p>
      {message ? <p className="mb-2 text-sm font-bold text-red-700">{message}</p> : null}
      <CardOnFileControl
        square={square || undefined}
        onToken={(sourceId) => {
          setMessage("");
          void staffFetch<{ billing: BillingProfile; profile: ClientHubProfile }>(`/api/clients/${clientId}/hub/billing/card`, {
            method: "POST",
            body: JSON.stringify({ sourceId }),
          }).then((saved) => {
            setLabel(cardLabel(saved.billing.card) || "Card saved");
            setMessage("Card saved with Square.");
          }).catch((err: Error) => setMessage(err.message));
        }}
      />
    </div>
  );
}
