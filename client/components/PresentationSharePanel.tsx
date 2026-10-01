import { useState } from "react";
import { Link } from "react-router-dom";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { createPresentationLink } from "@/lib/presentationShare";
import { PRESENTATION_PREVIEW_TOKEN, presentationPath } from "@shared/presentation";

type TokenGetter = () => Promise<string | undefined> | undefined;

async function mintLink(listingId: string, getToken: TokenGetter) {
  const token = await getToken();
  if (!token) throw new Error("Sign in again before creating a presentation link.");
  return createPresentationLink(listingId, token);
}

export function PresentationShareButton({
  listingId,
  getToken,
  className = "",
}: {
  listingId: string;
  getToken: TokenGetter;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  const share = async () => {
    setBusy(true);
    try {
      const link = await mintLink(listingId, getToken);
      const url = link.url || `${window.location.origin}${link.path}`;
      await navigator.clipboard.writeText(url);
      toast.success("Presentation link copied. No email or text was sent.");
    } catch (err) {
      const preview = (err as { previewPath?: string }).previewPath;
      toast.error(err instanceof Error ? err.message : "The presentation link could not be created.");
      if (preview) toast.message("Sample presentation", { description: "Open /present/preview to review the page." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={share}
      disabled={busy || !listingId}
      className={className || "inline-flex items-center justify-center gap-2 rounded-xl bg-black px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-zinc-800 disabled:opacity-50"}
    >
      <Copy className="h-3.5 w-3.5" />
      {busy ? "Saving…" : "Presentation / Share link"}
    </button>
  );
}

export function PresentationSharePanel({
  listingId,
  getToken,
  demo = false,
}: {
  listingId: string;
  getToken: TokenGetter;
  demo?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const samplePath = presentationPath(PRESENTATION_PREVIEW_TOKEN);

  const share = async () => {
    if (demo || listingId === "sampledemo") {
      const sample = `${window.location.origin}${samplePath}`;
      setUrl(sample);
      setNote("This is the sample presentation. A saved client link needs Firebase.");
      await navigator.clipboard.writeText(sample);
      toast.success("Sample presentation link copied. No email or text was sent.");
      return;
    }
    setBusy(true);
    try {
      const link = await mintLink(listingId, getToken);
      const next = link.url || `${window.location.origin}${link.path}`;
      setUrl(next);
      setNote(link.photoCount
        ? `${link.photoCount} photographs on this link. Nothing was emailed or texted.`
        : "Link saved. Add photographs and the page fills in. Nothing was emailed or texted.");
      await navigator.clipboard.writeText(next);
      toast.success("Presentation link copied. No email or text was sent.");
    } catch (err) {
      const preview = (err as { previewPath?: string }).previewPath;
      setNote(err instanceof Error ? err.message : "The presentation link could not be created.");
      if (preview) setUrl(`${window.location.origin}${preview}`);
      toast.error(err instanceof Error ? err.message : "The presentation link could not be created.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-[2rem] border border-gray-100 bg-white p-5 shadow-sm">
      <h3 className="mb-2 text-[10px] font-black uppercase tracking-widest text-gray-400">Presentation</h3>
      <p className="mb-3 text-[11px] leading-relaxed text-gray-500">
        Private link for this client. Copy it and send it yourself. This does not email or text anyone.
      </p>
      <button
        type="button"
        onClick={share}
        disabled={busy || !listingId}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-zinc-800 disabled:opacity-50"
      >
        <Copy className="h-3.5 w-3.5" />
        {busy ? "Saving…" : "Presentation / Share link"}
      </button>
      {url && (
        <div className="mt-3 space-y-2">
          <input readOnly value={url} aria-label="Presentation link" className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] font-bold text-gray-700" />
          <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-[#0d9488]">
            <ExternalLink className="h-3 w-3" /> Open presentation
          </a>
        </div>
      )}
      {note && <p className="mt-2 text-[10px] leading-relaxed text-gray-400">{note}</p>}
      <p className="mt-3 text-[10px] text-gray-400">
        <Link to={samplePath} className="underline">Sample presentation</Link>
      </p>
    </div>
  );
}
