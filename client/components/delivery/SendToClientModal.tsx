import { useEffect, useState } from "react";
import { Copy, Send } from "lucide-react";
import { BUSINESS_CONTACT_LINE } from "@shared/businessContact";
import {
  deliveryPaymentLabel,
  type ClientDeliveryDraft,
} from "@shared/clientDelivery";
import { formatInvoiceAmount } from "@shared/invoiceProcessing";
import { DeliveryInvoiceCard } from "./DeliveryInvoiceCard";

export function SendToClientButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      data-testid="send-to-client"
      onClick={onClick}
      className={className || "inline-flex min-h-11 items-center gap-2 rounded-xl bg-black px-4 text-xs font-black uppercase tracking-widest text-white"}
    >
      <Send className="h-3.5 w-3.5" /> Send to Client
    </button>
  );
}

export function SendToClientModal({
  open,
  draft,
  onClose,
  onSend,
}: {
  open: boolean;
  draft: ClientDeliveryDraft;
  onClose: () => void;
  onSend: (body: { action: "send" | "test"; to: string; cc: string; subject: string; message: string }) => Promise<{ note: string }>;
}) {
  const [toName, setToName] = useState(draft.toName);
  const [toEmail, setToEmail] = useState(draft.toEmail);
  const [cc, setCc] = useState(draft.cc);
  const [subject, setSubject] = useState(draft.subject);
  const [message, setMessage] = useState(draft.message);
  const [showInvoice, setShowInvoice] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"send" | "test" | "copy" | "">("");
  const preview = draft.notify.mode !== "live";

  useEffect(() => {
    if (!open) return;
    setToName(draft.toName);
    setToEmail(draft.toEmail);
    setCc(draft.cc);
    setSubject(draft.subject);
    setMessage(draft.message);
    setNote("");
  }, [open, draft]);

  if (!open) return null;

  async function submit(action: "send" | "test") {
    setBusy(action);
    setNote("");
    try {
      const result = await onSend({ action, to: toEmail.trim(), cc: cc.trim(), subject: subject.trim(), message });
      setNote(result.note);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not send this delivery.");
    } finally {
      setBusy("");
    }
  }

  async function copyLink() {
    setBusy("copy");
    try {
      await navigator.clipboard.writeText(draft.presentationUrl);
      setNote("Presentation link copied.");
    } catch {
      setNote(draft.presentationUrl);
    } finally {
      setBusy("");
    }
  }

  const status = deliveryPaymentLabel(draft.invoice.status);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-2 sm:items-center sm:p-6" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="send-to-client-title"
        data-testid="send-to-client-modal"
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Projects</p>
            <h2 id="send-to-client-title" className="text-lg font-black text-black">Send to Client</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full px-3 py-1 text-sm font-bold text-gray-500" aria-label="Close">
            Close
          </button>
        </div>
        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <p
            data-testid="delivery-safety-banner"
            className={`rounded-2xl px-4 py-3 text-sm ${preview ? "bg-amber-50 text-amber-950" : "bg-emerald-50 text-emerald-950"}`}
          >
            {draft.notify.banner}
          </p>
          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3" data-testid="delivery-invoice-attached">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold text-black">
                Invoice {draft.invoice.number} · {formatInvoiceAmount(draft.invoice.total)} · {status}
              </p>
              <button type="button" className="text-xs font-bold text-[#0d9488]" onClick={() => setShowInvoice((open) => !open)} data-testid="delivery-invoice-preview">
                {showInvoice ? "Hide preview" : "Preview invoice"}
              </button>
            </div>
            {showInvoice && <div className="mt-3"><DeliveryInvoiceCard invoice={draft.invoice} /></div>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-bold text-gray-500">
              Recipient name
              <input value={toName} onChange={(event) => setToName(event.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-black" data-testid="delivery-to-name" />
            </label>
            <label className="block text-xs font-bold text-gray-500">
              Recipient email
              <input value={toEmail} onChange={(event) => setToEmail(event.target.value)} type="email" className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-black" data-testid="delivery-to-email" />
            </label>
          </div>
          <label className="block text-xs font-bold text-gray-500">
            CC <span className="font-medium text-gray-400">(optional)</span>
            <input value={cc} onChange={(event) => setCc(event.target.value)} type="email" className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-black" data-testid="delivery-cc" placeholder="Add a teammate" />
          </label>
          <label className="block text-xs font-bold text-gray-500">
            Subject
            <input value={subject} onChange={(event) => setSubject(event.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-black" data-testid="delivery-subject" />
          </label>
          <div>
            <p className="text-xs font-bold text-gray-500">Presentation link</p>
            <div className="mt-1 flex gap-2">
              <input readOnly value={draft.presentationUrl} data-testid="delivery-presentation-link" className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-black" />
              <button type="button" onClick={() => void copyLink()} data-testid="copy-presentation-link" className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-gray-200 px-3 text-[10px] font-black uppercase tracking-widest">
                <Copy className="h-3.5 w-3.5" /> {busy === "copy" ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-gray-400">Client media and invoice. This is not the listing website.</p>
          </div>
          <label className="block text-xs font-bold text-gray-500">
            Message
            <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={7} data-testid="delivery-message" className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm leading-relaxed text-black" />
          </label>
          {note && <p className="rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-700" data-testid="delivery-send-note">{note}</p>}
        </div>
        <div className="border-t border-gray-100 px-5 py-3">
          <p className="mb-3 text-[11px] leading-relaxed text-gray-500" data-testid="delivery-footer-line">{BUSINESS_CONTACT_LINE}</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => void submit("test")} disabled={busy !== ""} data-testid="delivery-test-send" className="min-h-11 rounded-xl border border-gray-200 px-4 text-xs font-black uppercase tracking-widest text-black disabled:opacity-50">
            {busy === "test" ? "Sending test…" : "Test send to QA"}
          </button>
          <button type="button" onClick={() => void submit("send")} disabled={busy !== ""} data-testid="delivery-send" className="min-h-11 rounded-xl bg-black px-4 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50">
            {busy === "send" ? "Working…" : preview ? "Preview send (no email)" : "Send to client"}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}
