import { useCallback, useEffect, useRef, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import StudioScratchPad, {
  type ScratchEditStep,
  type ScratchExportDestination,
  type ScratchFrameView,
} from "@/components/studio-scratch/StudioScratchPad";
import { useAuth } from "@/contexts/AuthContext";
import { fetchScratchStatus, postScratchEdit } from "@/lib/scratchApi";
import {
  compressScratchJpeg,
  loadScratchImage,
  readJpegShotTime,
} from "@/lib/scratchPhoto";
import {
  SCRATCH_SORT_DEFAULT,
  sortScratchItems,
  type ScratchSortMode,
} from "@/lib/scratchSort";
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
} from "@shared/studioScratch";
import { toast } from "sonner";

interface FinetuneSnapshot {
  afterUrl?: string;
  afterBytes?: Uint8Array;
  downloadName?: string;
  lastAction?: string;
  status: "ready" | "done" | "failed";
}

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
  uploadIndex: number;
  byteSize: number;
  shotAt: number;
  preFinetune?: FinetuneSnapshot;
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

function revokeUrl(url?: string) {
  if (url) URL.revokeObjectURL(url);
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

  const uploadSeq = useRef(0);
  const [items, setItems] = useState<ScratchItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [revision, setRevision] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [grassReady, setGrassReady] = useState(false);
  const [grassNote, setGrassNote] = useState("Checking the lawn reference…");
  const [sortMode, setSortMode] =
    useState<ScratchSortMode>(SCRATCH_SORT_DEFAULT);

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
        const shotAt = (await readJpegShotTime(file)) ?? file.lastModified;
        const uploadIndex = uploadSeq.current;
        uploadSeq.current += 1;
        added.push({
          id: crypto.randomUUID(),
          name: file.name,
          beforeUrl: URL.createObjectURL(file),
          source,
          status: "ready",
          uploadIndex,
          byteSize: file.size,
          shotAt,
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
    const next = sortScratchItems(sortMode, [...items, ...added]);
    setItems(next);
    if (!items.length) {
      const first = next[0];
      setSelectedIds(first ? [first.id] : []);
      setAnchorId(first?.id || null);
      setFocusId(first?.id || null);
      return;
    }
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

  const onSort = (mode: ScratchSortMode) => {
    setSortMode(mode);
    setItems((current) => sortScratchItems(mode, current));
  };

  const onRemove = (id: string) => {
    const item = items.find((entry) => entry.id === id);
    if (item) {
      URL.revokeObjectURL(item.beforeUrl);
      if (item.afterUrl) URL.revokeObjectURL(item.afterUrl);
      if (
        item.preFinetune?.afterUrl &&
        item.preFinetune.afterUrl !== item.afterUrl
      ) {
        URL.revokeObjectURL(item.preFinetune.afterUrl);
      }
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

  const checkedItems = () =>
    items.filter((item) => selectedIds.includes(item.id));

  const runSteps = async (
    targets: ScratchItem[],
    steps: ScratchEditStep[],
    options: { fromOriginal: boolean; label?: string; emptyNote: string },
  ) => {
    if (!targets.length) {
      toast.error(options.emptyNote);
      return;
    }
    const runnable = steps.filter(
      (step) =>
        step.action === "twilight" ||
        step.action === "grass" ||
        step.prompt.trim().length >= 3,
    );
    if (!runnable.length) {
      toast.error("Choose a tool or write a request.");
      return;
    }
    if (runnable.some((step) => step.action === "revise")) {
      const editable = targets.filter((item) => item.afterBytes);
      if (!editable.length) {
        toast.error("Apply a first edit before a final request.");
        return;
      }
    }
    setBusy(true);
    let index = 0;
    for (const job of targets) {
      index += 1;
      setProgress(`${index} of ${targets.length}`);
      if (
        runnable.some((step) => step.action === "revise") &&
        !job.afterBytes
      ) {
        continue;
      }
      patch(job.id, { status: "editing", error: undefined });
      let working = options.fromOriginal ? undefined : job.afterBytes;
      let produced = false;
      let error: string | undefined;
      let downloadName = job.downloadName;
      let lastAction = options.label || runnable[runnable.length - 1].action;
      for (const step of runnable) {
        if (step.action === "revise" && !working) break;
        try {
          const result = await postScratchEdit(getToken, {
            body: working ? bytesBlob(working, "image/jpeg") : job.source,
            action: step.action,
            prompt: step.prompt,
            fileName: job.name,
          });
          working = result.bytes;
          produced = true;
          downloadName = result.downloadName;
          lastAction = options.label || step.action;
        } catch (err) {
          error = err instanceof Error ? err.message : "The edit failed.";
          toast.error(`${job.name}: ${error}`);
          break;
        }
      }
      if (!produced || !working) continue;
      const afterUrl = URL.createObjectURL(bytesBlob(working, "image/jpeg"));
      const bytes = working;
      setItems((current) =>
        current.map((item) => {
          if (item.id !== job.id) return item;
          revokeUrl(item.afterUrl);
          if (
            item.preFinetune?.afterUrl &&
            item.preFinetune.afterUrl !== item.afterUrl
          ) {
            revokeUrl(item.preFinetune.afterUrl);
          }
          return {
            ...item,
            status: error ? "failed" : "done",
            error,
            afterUrl,
            afterBytes: bytes,
            downloadName,
            lastAction,
            preFinetune: undefined,
          };
        }),
      );
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

  const applyFinetune = async (adjustments: StudioAdjustments) => {
    if (adjustmentsAreNeutral(adjustments)) {
      toast.error("Move a finetune control before applying.");
      return false;
    }
    const targets = checkedItems();
    if (!targets.length) {
      toast.error("Check a photo in the filmstrip.");
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
        const image = await loadScratchImage(job.afterUrl || job.beforeUrl);
        const dataUrl = renderAdjustedJpeg(image, adjustments);
        const bytes = dataUrlBytes(dataUrl);
        const afterUrl = URL.createObjectURL(bytesBlob(bytes, "image/jpeg"));
        applied = true;
        setItems((current) =>
          current.map((item) => {
            if (item.id !== job.id) return item;
            const snapshot = item.preFinetune ?? {
              afterUrl: item.afterUrl,
              afterBytes: item.afterBytes,
              downloadName: item.downloadName,
              lastAction: item.lastAction,
              status: item.afterBytes ? ("done" as const) : ("ready" as const),
            };
            if (item.afterUrl && item.afterUrl !== snapshot.afterUrl)
              revokeUrl(item.afterUrl);
            return {
              ...item,
              status: "done",
              error: undefined,
              afterUrl,
              afterBytes: bytes,
              downloadName: scratchDownloadName(item.name),
              lastAction: "finetune",
              preFinetune: snapshot,
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

  const revertFinetune = () => {
    const targets = checkedItems().filter((item) => item.preFinetune);
    if (!checkedItems().length) {
      toast.error("Check a photo in the filmstrip.");
      return;
    }
    if (!targets.length) {
      toast.error("No finetune to revert on the checked photos.");
      return;
    }
    setItems((current) =>
      current.map((item) => {
        if (!selectedIds.includes(item.id) || !item.preFinetune) return item;
        if (item.afterUrl && item.afterUrl !== item.preFinetune.afterUrl)
          revokeUrl(item.afterUrl);
        const previous = item.preFinetune;
        return {
          ...item,
          afterUrl: previous.afterUrl,
          afterBytes: previous.afterBytes,
          downloadName: previous.downloadName,
          lastAction: previous.lastAction,
          status: previous.status,
          preFinetune: undefined,
          error: undefined,
        };
      }),
    );
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
    canRevert: Boolean(item.preFinetune),
  }));

  return (
    <AdminLayout title="Scratch Pad" mainClassName="scrollbar-hide">
      <StudioScratchPad
        frames={frames}
        revision={revision}
        busy={busy}
        progress={progress}
        grassReady={grassReady}
        grassNote={grassNote}
        sortMode={sortMode}
        onRevision={setRevision}
        onAddFiles={(files) => {
          void addFiles(files);
        }}
        onSelect={onSelect}
        onSort={onSort}
        onProcessSet={(steps, label) => {
          void runSteps(items, steps, {
            fromOriginal: true,
            label,
            emptyNote: "Upload photos before processing.",
          });
        }}
        onProcessSelection={(steps) => {
          void runSteps(checkedItems(), steps, {
            fromOriginal: false,
            emptyNote: "Check a photo in the filmstrip.",
          });
        }}
        onApplyFinetune={applyFinetune}
        onRevertFinetune={revertFinetune}
        onDownload={onDownload}
        onExport={onExport}
        onRemove={onRemove}
      />
    </AdminLayout>
  );
}
