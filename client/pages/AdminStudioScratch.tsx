import { useCallback, useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import StudioScratchPad, {
  type ScratchApplyScope,
  type ScratchExportDestination,
  type ScratchFrameView,
} from "@/components/studio-scratch/StudioScratchPad";
import { useAuth } from "@/contexts/AuthContext";
import { fetchScratchStatus, postScratchEdit } from "@/lib/scratchApi";
import { compressScratchJpeg, loadScratchImage } from "@/lib/scratchPhoto";
import { renderAdjustedJpeg } from "@/lib/studioCanvas";
import {
  adjustmentsAreNeutral,
  type StudioAdjustments,
} from "@shared/iconicStudio";
import { zipStored } from "@shared/zipStore";
import {
  SCRATCH_MAX_FILES,
  scratchDownloadName,
  scratchJpegAllowed,
  scratchSelection,
  type ScratchAction,
} from "@shared/studioScratch";
import { toast } from "sonner";

interface ScratchItem {
  id: string;
  name: string;
  beforeUrl: string;
  source: Blob;
  status: "ready" | "editing" | "done" | "failed";
  error?: string;
  afterUrl?: string;
  afterBytes?: Uint8Array;
  downloadName?: string;
  lastAction?: string;
}

function dataUrlBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] || "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesBlob(bytes: Uint8Array, type: string): Blob {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return new Blob([copy], { type });
}

function downloadBytes(name: string, bytes: Uint8Array, type: string) {
  const url = URL.createObjectURL(bytesBlob(bytes, type));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export default function AdminStudioScratch() {
  const { user } = useAuth();
  const getToken = useCallback(() => {
    if (!user)
      return Promise.reject(
        new Error("Sign in again before using the scratch pad."),
      );
    return user.getIdToken();
  }, [user]);

  const [items, setItems] = useState<ScratchItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [revision, setRevision] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [grassReady, setGrassReady] = useState(false);
  const [grassNote, setGrassNote] = useState("Checking the lawn reference…");

  useEffect(() => {
    let cancel = false;
    fetchScratchStatus(getToken)
      .then((status) => {
        if (cancel) return;
        setGrassReady(status.grass.ready);
        setGrassNote(status.grass.note);
      })
      .catch((err: unknown) => {
        if (cancel) return;
        setGrassReady(false);
        setGrassNote(
          err instanceof Error
            ? err.message
            : "Could not check the grass reference.",
        );
      });
    return () => {
      cancel = true;
    };
  }, [getToken]);

  const patch = (id: string, update: Partial<ScratchItem>) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...update } : item)),
    );
  };

  const addFiles = async (files: File[]) => {
    const room = SCRATCH_MAX_FILES - items.length;
    if (room <= 0) {
      toast.error(
        `The scratch pad holds ${SCRATCH_MAX_FILES} photos at a time.`,
      );
      return;
    }
    const accepted = files.slice(0, room);
    if (files.length > room)
      toast.error(
        `Only ${room} more photo${room === 1 ? "" : "s"} fit in this set.`,
      );
    const added: ScratchItem[] = [];
    for (const file of accepted) {
      const check = scratchJpegAllowed(file.name, file.type);
      if (check.ok === false) {
        toast.error(`${file.name}: ${check.error}`);
        continue;
      }
      try {
        const source = await compressScratchJpeg(file);
        added.push({
          id: crypto.randomUUID(),
          name: file.name,
          beforeUrl: URL.createObjectURL(file),
          source,
          status: "ready",
        });
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : `${file.name} could not be prepared.`,
        );
      }
    }
    if (!added.length) return;
    setItems((current) => [...current, ...added]);
    setSelectedIds((current) => [...current, ...added.map((item) => item.id)]);
    setAnchorId(added[0].id);
    setFocusId(added[0].id);
  };

  const onSelect = (id: string, mode: "replace" | "toggle" | "range") => {
    const next = scratchSelection({
      ids: items.map((item) => item.id),
      selectedIds,
      anchorId,
      clickedId: id,
      mode,
    });
    setSelectedIds(next.selectedIds);
    setAnchorId(next.anchorId);
    setFocusId(next.focusId);
  };

  const onRemove = (id: string) => {
    const item = items.find((entry) => entry.id === id);
    if (item) {
      URL.revokeObjectURL(item.beforeUrl);
      if (item.afterUrl) URL.revokeObjectURL(item.afterUrl);
    }
    const remaining = items.filter((entry) => entry.id !== id);
    setItems(remaining);
    const nextSelected = selectedIds.filter((entry) => entry !== id);
    setSelectedIds(
      nextSelected.length
        ? nextSelected
        : remaining[0]
          ? [remaining[0].id]
          : [],
    );
    if (focusId === id) setFocusId(remaining[0]?.id || null);
    if (anchorId === id) setAnchorId(remaining[0]?.id || null);
  };

  const targetsFor = (scope: ScratchApplyScope) => {
    if (scope === "set") return items;
    const focus = focusId || items[0]?.id;
    return items.filter((item) => item.id === focus);
  };

  const run = async (
    action: ScratchAction,
    scope: ScratchApplyScope,
    promptOverride?: string,
  ) => {
    const targets = targetsFor(scope);
    if (!targets.length) {
      toast.error("Choose a photo first.");
      return;
    }
    const text = (
      promptOverride ?? (action === "revise" ? revision : prompt)
    ).trim();
    if ((action === "edit" || action === "revise") && text.length < 3) {
      toast.error(
        action === "revise" ? "Describe the revision." : "Describe the edit.",
      );
      return;
    }
    const jobs = targets.filter(
      (item) => action !== "revise" || item.afterBytes,
    );
    if (action === "revise" && !jobs.length) {
      toast.error("Apply a first edit before a revision.");
      return;
    }
    setBusy(true);
    let index = 0;
    for (const job of jobs) {
      index += 1;
      setProgress(`${index} of ${jobs.length}`);
      patch(job.id, { status: "editing", error: undefined });
      try {
        const body =
          action === "revise" && job.afterBytes
            ? bytesBlob(job.afterBytes, "image/jpeg")
            : job.source;
        const result = await postScratchEdit(getToken, {
          body,
          action,
          prompt: text,
          fileName: job.name,
        });
        const afterUrl = URL.createObjectURL(
          bytesBlob(result.bytes, "image/jpeg"),
        );
        setItems((current) =>
          current.map((item) => {
            if (item.id !== job.id) return item;
            if (item.afterUrl) URL.revokeObjectURL(item.afterUrl);
            return {
              ...item,
              status: "done",
              error: undefined,
              afterUrl,
              afterBytes: result.bytes,
              downloadName: result.downloadName,
              lastAction: action,
            };
          }),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "The edit failed.";
        patch(job.id, { status: "failed", error: message });
        toast.error(`${job.name}: ${message}`);
      }
    }
    setProgress("");
    setBusy(false);
  };

  const onDownload = () => {
    const focus = items.find((item) => item.id === focusId) || items[0];
    if (!focus) return;
    if (focus.afterBytes) {
      downloadBytes(
        focus.downloadName || "scratch-edit.jpg",
        focus.afterBytes,
        "image/jpeg",
      );
      return;
    }
    const url = URL.createObjectURL(focus.source);
    const link = document.createElement("a");
    link.href = url;
    link.download = /\.jpe?g$/i.test(focus.name)
      ? focus.name
      : `${focus.name}.jpg`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const onDownloadZip = () => {
    const edited = items.filter((item) => item.afterBytes);
    if (!edited.length) {
      toast.error("Apply an edit before exporting a zip.");
      return;
    }
    const zip = zipStored(
      edited.map((item) => ({
        name: item.downloadName || "scratch-edit.jpg",
        data: item.afterBytes as Uint8Array,
      })),
    );
    downloadBytes("scratch-edits.zip", zip, "application/zip");
  };

  const onExport = (destination: ScratchExportDestination) => {
    if (destination === "zip") {
      onDownloadZip();
      return;
    }
    const description =
      destination === "gallery"
        ? "Gallery export is not connected on the scratch pad. Photos stay in this browser."
        : destination === "dropbox"
          ? "Dropbox export is not connected yet. Download the JPEG or the edited zip instead."
          : "Google Drive export is not connected yet. Download the JPEG or the edited zip instead.";
    toast.message("Export to…", { description });
  };

  const applyFinetune = async (
    adjustments: StudioAdjustments,
    scope: ScratchApplyScope,
    useOriginal: boolean,
  ) => {
    if (adjustmentsAreNeutral(adjustments)) {
      toast.error("Move a finetune control before applying.");
      return false;
    }
    const targets = targetsFor(scope);
    if (!targets.length) {
      toast.error("Choose a photo first.");
      return false;
    }
    setBusy(true);
    let index = 0;
    let applied = false;
    for (const job of targets) {
      index += 1;
      setProgress(`${index} of ${targets.length}`);
      patch(job.id, { status: "editing", error: undefined });
      try {
        const sourceUrl =
          scope === "photo" && useOriginal
            ? job.beforeUrl
            : job.afterUrl || job.beforeUrl;
        const image = await loadScratchImage(sourceUrl);
        const dataUrl = renderAdjustedJpeg(image, adjustments);
        const bytes = dataUrlBytes(dataUrl);
        const afterUrl = URL.createObjectURL(bytesBlob(bytes, "image/jpeg"));
        applied = true;
        setItems((current) =>
          current.map((item) => {
            if (item.id !== job.id) return item;
            if (item.afterUrl) URL.revokeObjectURL(item.afterUrl);
            return {
              ...item,
              status: "done",
              error: undefined,
              afterUrl,
              afterBytes: bytes,
              downloadName: scratchDownloadName(item.name),
              lastAction: "finetune",
            };
          }),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Finetune failed.";
        patch(job.id, { status: "failed", error: message });
        toast.error(`${job.name}: ${message}`);
      }
    }
    setProgress("");
    setBusy(false);
    return applied;
  };

  const frames: ScratchFrameView[] = items.map((item) => ({
    id: item.id,
    name: item.name,
    beforeUrl: item.beforeUrl,
    status: item.status,
    error: item.error,
    afterUrl: item.afterUrl,
    selected: selectedIds.includes(item.id),
    focused: item.id === focusId,
    lastAction: item.lastAction,
  }));

  return (
    <AdminLayout title="Scratch Pad">
      <StudioScratchPad
        frames={frames}
        prompt={prompt}
        revision={revision}
        busy={busy}
        progress={progress}
        grassReady={grassReady}
        grassNote={grassNote}
        onPrompt={setPrompt}
        onRevision={setRevision}
        onAddFiles={(files) => {
          void addFiles(files);
        }}
        onSelect={onSelect}
        onRun={(action, scope) => {
          void run(action, scope);
        }}
        onApplyPreset={(presetPrompt, scope) => {
          void run("edit", scope, presetPrompt);
        }}
        onApplyFinetune={applyFinetune}
        onDownload={onDownload}
        onExport={onExport}
        onRemove={onRemove}
      />
    </AdminLayout>
  );
}
