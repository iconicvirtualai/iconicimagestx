import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";
import StudioScratchPad, {
  type ScratchEditStep,
  type ScratchExportDestination,
  type ScratchFrameView,
  type StagingRequest,
} from "@/components/studio-scratch/StudioScratchPad";
import { stagingApi, stagingGuidance } from "@/components/studio-scratch/scratchDesk";
import { useAuth } from "@/contexts/AuthContext";
import { auth, storage } from "@/lib/firebase";
import { fetchScratchStatus, postScratchEdit } from "@/lib/scratchApi";
import {
  drainOrderEditQueue,
  fetchStudioWorkspace,
  postStudioApprove,
  postStudioOrderEdits,
  postStudioReject,
} from "@/lib/studioApi";
import { pollVsaiJob } from "@/lib/scratchStaging";
import { compressScratchJpeg, readJpegShotTime } from "@/lib/scratchPhoto";
import {
  SCRATCH_SORT_DEFAULT,
  sortScratchItems,
  type ScratchSortMode,
} from "@/lib/scratchSort";
import {
  EMPTY_LISTING_PHOTOS_NOTE,
  framesFromListingImages,
  isRawStudioFile,
  type StudioFrame,
} from "@shared/iconicStudio";
import { studioEditorListingId } from "@shared/studioEditorHref";
import {
  listingOrderQueuePending,
  studioOrderTrayJobs,
  type StudioOrderTrayJob,
} from "@shared/studioOrderTray";
import { zipStored } from "@shared/zipStore";
import {
  SCRATCH_MAX_FILES,
  scratchDownloadName,
  scratchSelection,
} from "@shared/studioScratch";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
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
  editable: boolean;
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

function revokeScratchItem(item: ScratchItem) {
  revokeUrl(item.beforeUrl);
  revokeUrl(item.afterUrl);
  if (item.preFinetune?.afterUrl && item.preFinetune.afterUrl !== item.afterUrl) {
    revokeUrl(item.preFinetune.afterUrl);
  }
}

async function listingPhotoItem(frame: StudioFrame, uploadIndex: number): Promise<ScratchItem> {
  const base: ScratchItem = {
    id: frame.id || crypto.randomUUID(),
    name: frame.name,
    status: "ready",
    uploadIndex,
    byteSize: 0,
    shotAt: 0,
    editable: false,
    beforeUrl: frame.url || fileCard(frame.name),
    source: new Blob(),
  };
  if (frame.raw || !frame.previewable || !frame.url) return base;
  try {
    const response = await fetch(frame.url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return base;
    const blob = await response.blob();
    const file = new File([blob], frame.name, { type: blob.type || frame.contentType || "image/jpeg" });
    const source = await compressScratchJpeg(file);
    return {
      ...base,
      beforeUrl: URL.createObjectURL(blob),
      source,
      byteSize: source.size,
      editable: true,
    };
  } catch {
    return base;
  }
}

function fileCard(name: string) {
  const safe = name.replace(/[<>&"]/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="#111418"/><text x="40" y="250" fill="#e5e7eb" font-size="28" font-family="sans-serif">${safe}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export default function AdminStudioScratch() {
  const [searchParams] = useSearchParams();
  const listingId = studioEditorListingId(searchParams.toString());
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
  const [floorplanUrl, setFloorplanUrl] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [grassReady, setGrassReady] = useState(false);
  const [grassNote, setGrassNote] = useState("Checking the lawn reference…");
  const [sortMode, setSortMode] =
    useState<ScratchSortMode>(SCRATCH_SORT_DEFAULT);
  const [listingLabel, setListingLabel] = useState("");
  const [emptyNote, setEmptyNote] = useState("");
  const [orderJobs, setOrderJobs] = useState<StudioOrderTrayJob[]>([]);
  const [orderBusy, setOrderBusy] = useState(false);
  const sortModeRef = useRef(sortMode);
  sortModeRef.current = sortMode;
  const loadedListing = useRef("");
  const draining = useRef(false);
  const drainFailed = useRef(false);

  const refreshOrderJobs = useCallback(async () => {
    if (!listingId) {
      setOrderJobs([]);
      return;
    }
    const data = await fetchStudioWorkspace(listingId, getToken);
    setOrderJobs(studioOrderTrayJobs(data.jobs, listingId));
  }, [getToken, listingId]);

  useEffect(() => {
    if (!listingId) {
      loadedListing.current = "";
      setListingLabel("");
      setEmptyNote("");
      setOrderJobs([]);
      setProgress((current) => (current === "Loading listing photos…" ? "" : current));
      return;
    }
    if (loadedListing.current === listingId) return;
    let cancel = false;
    setListingLabel("Loading listing photos…");
    setEmptyNote("");
    setProgress("Loading listing photos…");
    const leavePhotoLoading = () => {
      setProgress((current) => (current === "Loading listing photos…" ? "" : current));
    };
    void fetchStudioWorkspace(listingId, getToken)
      .then(async (data) => {
        if (cancel) return;
        setOrderJobs(studioOrderTrayJobs(data.jobs, listingId));
        const address = data.listing?.address || listingId;
        const frames = framesFromListingImages(data.listing?.images);
        const slice = frames.slice(0, SCRATCH_MAX_FILES);
        setListingLabel(address);
        leavePhotoLoading();
        if (slice.length === 0) {
          loadedListing.current = listingId;
          setEmptyNote(EMPTY_LISTING_PHOTOS_NOTE);
          setItems((current) => {
            for (const item of current) revokeScratchItem(item);
            return [];
          });
          setSelectedIds([]);
          setAnchorId(null);
          setFocusId(null);
          return;
        }
        setEmptyNote("");
        if (frames.length > SCRATCH_MAX_FILES) {
          toast.message(`${address}: showing ${SCRATCH_MAX_FILES} of ${frames.length} photos.`);
        }
        const shells: ScratchItem[] = slice.map((frame) => {
          const uploadIndex = uploadSeq.current;
          uploadSeq.current += 1;
          return {
            id: frame.id,
            name: frame.name,
            status: "ready",
            uploadIndex,
            byteSize: 0,
            shotAt: 0,
            editable: false,
            beforeUrl: frame.url || fileCard(frame.name),
            source: new Blob(),
          };
        });
        setItems((current) => {
          for (const item of current) revokeScratchItem(item);
          return shells;
        });
        const firstShell = shells[0];
        setSelectedIds(firstShell ? [firstShell.id] : []);
        setAnchorId(firstShell?.id || null);
        setFocusId(firstShell?.id || null);
        const added: ScratchItem[] = [];
        for (let index = 0; index < slice.length; index += 1) {
          if (cancel) break;
          const frame = slice[index];
          const shell = shells[index];
          const hydrated = await listingPhotoItem(frame, shell.uploadIndex);
          added.push({ ...hydrated, id: shell.id });
        }
        if (cancel) {
          for (const item of added) revokeScratchItem(item);
          return;
        }
        loadedListing.current = listingId;
        setItems(() => sortScratchItems(sortModeRef.current, added));
        const first = added[0];
        setSelectedIds(first ? [first.id] : []);
        setAnchorId(first?.id || null);
        setFocusId(first?.id || null);
      })
      .catch((err: unknown) => {
        if (cancel) return;
        setListingLabel(listingId);
        toast.error(err instanceof Error ? err.message : "Could not load this listing in Studio.");
      })
      .finally(() => {
        if (!cancel) {
          setProgress((current) => (current === "Loading listing photos…" ? "" : current));
        }
      });
    return () => {
      cancel = true;
    };
  }, [getToken, listingId]);

  useEffect(() => {
    drainFailed.current = false;
  }, [listingId]);

  useEffect(() => {
    if (!listingId || orderBusy || draining.current || drainFailed.current) return;
    if (!listingOrderQueuePending(orderJobs)) return;
    draining.current = true;
    let cancelled = false;
    void drainOrderEditQueue(
      getToken,
      listingId,
      (step) => {
        if (cancelled) return;
        if (step.ran?.status === "failed") toast.error(step.ran.note);
        else if (step.shouldFollowUp) setProgress(`Order edit · ${step.remaining} left`);
      },
      () => cancelled,
    ).catch((err: unknown) => {
      drainFailed.current = true;
      if (!cancelled) toast.error(err instanceof Error ? err.message : "Auto-queue stopped.");
    }).finally(() => {
      draining.current = false;
      if (cancelled) return;
      setProgress((current) => (current.startsWith("Order edit") ? "" : current));
      void refreshOrderJobs().catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : "Could not refresh the order edits.");
      });
    });
    return () => {
      cancelled = true;
    };
  }, [getToken, listingId, orderBusy, orderJobs, refreshOrderJobs]);

  const runOrderAction = async (work: () => Promise<void>) => {
    if (!listingId) return;
    setOrderBusy(true);
    try {
      await work();
      await refreshOrderJobs();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "That order edit did not finish.");
    } finally {
      setOrderBusy(false);
    }
  };

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
      const uploadIndex = uploadSeq.current;
      uploadSeq.current += 1;
      const shotAt = (await readJpegShotTime(file).catch(() => null)) ?? file.lastModified;
      const base = {
        id: crypto.randomUUID(),
        name: file.name,
        status: "ready" as const,
        uploadIndex,
        byteSize: file.size,
        shotAt,
      };
      if (isRawStudioFile(file.name, file.type)) {
        added.push({
          ...base,
          beforeUrl: fileCard(file.name),
          source: file,
          editable: false,
        });
        toast.message(`${file.name} is in the batch. Process still needs a JPEG.`);
        continue;
      }
      try {
        const source = await compressScratchJpeg(file);
        added.push({
          ...base,
          beforeUrl: URL.createObjectURL(file),
          source,
          editable: true,
        });
      } catch (err) {
        added.push({
          ...base,
          beforeUrl: fileCard(file.name),
          source: file,
          editable: false,
        });
        toast.message(
          err instanceof Error
            ? `${file.name} is in the batch. ${err.message}`
            : `${file.name} is in the batch. Process still needs a JPEG.`,
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
      if (!job.editable) {
        toast.message(`${job.name} is waiting on a JPEG before Process.`);
        continue;
      }
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

  const commitStaged = (job: ScratchItem, bytes: Uint8Array, downloadName: string, error?: string) => {
    const afterUrl = URL.createObjectURL(bytesBlob(bytes, "image/jpeg"));
    setItems((current) =>
      current.map((item) => {
        if (item.id !== job.id) return item;
        revokeUrl(item.afterUrl);
        if (item.preFinetune?.afterUrl && item.preFinetune.afterUrl !== item.afterUrl) {
          revokeUrl(item.preFinetune.afterUrl);
        }
        return {
          ...item,
          status: error ? "failed" : "done",
          error,
          afterUrl,
          afterBytes: bytes,
          downloadName,
          lastAction: "staging",
          preFinetune: undefined,
        };
      }),
    );
  };

  const runStaging = async (request: StagingRequest) => {
    const targets = checkedItems();
    if (!targets.length) {
      toast.error("Check a photo in the filmstrip.");
      return;
    }
    const user = auth.currentUser;
    if (!user) {
      toast.error("Sign in again before virtual staging.");
      return;
    }
    const api = stagingApi(request);
    const guidance = stagingGuidance(request);
    setBusy(true);
    let index = 0;
    for (const job of targets) {
      index += 1;
      setProgress(`Staging ${index} of ${targets.length}`);
      if (!job.editable) {
        toast.message(`${job.name} needs a JPEG, PNG, or WEBP before staging.`);
        continue;
      }
      patch(job.id, { status: "editing", error: undefined });
      try {
        const blob = job.afterBytes ? bytesBlob(job.afterBytes, "image/jpeg") : job.source;
        const stored = storageRef(storage, `vsai-uploads/${user.uid}/${Date.now()}-${job.id}.jpg`);
        await uploadBytes(stored, blob);
        const imageUrl = await getDownloadURL(stored);
        const token = await getToken();
        const created = await fetch("/api/vsai/create", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ imageUrl, roomType: api.roomType, style: api.style }),
        });
        const createdData = await created.json().catch(() => ({}));
        if (!created.ok) throw new Error(createdData.error || "Virtual staging did not start.");
        await pollVsaiJob(async () => {
          const res = await fetch(`/api/vsai/result/${createdData.jobId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "Could not check the staging job.");
          return data;
        }, (ms) => new Promise((resolve) => setTimeout(resolve, ms)));
        const fileRes = await fetch(`/api/vsai/result/${createdData.jobId}/file`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!fileRes.ok) {
          const data = await fileRes.json().catch(() => ({}));
          throw new Error(data.error || "The staged photo could not be saved on this pad.");
        }
        const downloaded = new Uint8Array(await fileRes.arrayBuffer());
        const stagedFile = new File([downloaded], `${job.id}.jpg`, {
          type: fileRes.headers.get("content-type") || "image/jpeg",
        });
        const jpeg = await compressScratchJpeg(stagedFile);
        let bytes = new Uint8Array(await jpeg.arrayBuffer());
        let downloadName = scratchDownloadName(job.name);
        if (guidance) {
          const revised = await postScratchEdit(getToken, {
            body: bytesBlob(bytes, "image/jpeg"),
            action: "revise",
            prompt: guidance,
            fileName: job.name,
          });
          bytes = new Uint8Array(revised.bytes);
          downloadName = revised.downloadName;
        }
        commitStaged(job, bytes, downloadName);
      } catch (err) {
        const error = err instanceof Error ? err.message : "Virtual staging failed.";
        toast.error(`${job.name}: ${error}`);
        patch(job.id, { status: "failed", error });
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

  const commitJpeg = (dataUrl: string, frameId: string, label: string) => {
    const bytes = dataUrlBytes(dataUrl);
    const afterUrl = URL.createObjectURL(bytesBlob(bytes, "image/jpeg"));
    setItems((current) =>
      current.map((item) => {
        if (item.id !== frameId) return item;
        const snapshot = item.preFinetune ?? {
          afterUrl: item.afterUrl,
          afterBytes: item.afterBytes,
          downloadName: item.downloadName,
          lastAction: item.lastAction,
          status: item.afterBytes ? ("done" as const) : ("ready" as const),
        };
        if (item.afterUrl && item.afterUrl !== snapshot.afterUrl) revokeUrl(item.afterUrl);
        return {
          ...item,
          status: "done",
          error: undefined,
          afterUrl,
          afterBytes: bytes,
          downloadName: scratchDownloadName(item.name),
          lastAction: label,
          preFinetune: snapshot,
        };
      }),
    );
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
    editable: item.editable,
  }));

  return (
    <AdminLayout mainClassName="scrollbar-hide">
      <StudioScratchPad
        frames={frames}
        busy={busy}
        progress={progress}
        grassReady={grassReady}
        grassNote={grassNote}
        listingLabel={listingLabel}
        emptyNote={emptyNote}
        orderJobs={orderJobs}
        orderBusy={orderBusy}
        onApproveOrder={(jobId) => {
          const job = orderJobs.find((item) => item.id === jobId);
          if (!job) return;
          void runOrderAction(async () => {
            const sourcePath = job.resultPath || job.sourcePath;
            const result = await postStudioApprove(getToken, {
              listingId,
              jobId: job.id,
              sourcePath,
              fileName: sourcePath.split("/").pop() || "final.jpg",
            });
            toast.success(result.note || "Final added to the gallery.");
          });
        }}
        onRejectOrder={(jobId) => {
          void runOrderAction(async () => {
            const result = await postStudioReject(getToken, { listingId, jobId });
            toast.success(result.note || "Edit rejected.");
          });
        }}
        onRunOrder={() => {
          void runOrderAction(async () => {
            const result = await postStudioOrderEdits(getToken, listingId);
            if (!result.ran) {
              toast.message(result.waiting ? "Waiting on an exterior photo before twilight can run." : "No photo is waiting to edit.");
            } else if (result.ran.status === "failed") {
              toast.error(result.ran.note);
            } else {
              toast.success("Order edit is ready for review.");
            }
          });
        }}
        sortMode={sortMode}
        floorplanUrl={floorplanUrl}
        onAddFiles={(files) => {
          void addFiles(files);
        }}
        onAddFloorplan={(file) => {
          if (floorplanUrl) URL.revokeObjectURL(floorplanUrl);
          setFloorplanUrl(URL.createObjectURL(file));
        }}
        onSelect={onSelect}
        onSelectAll={() => {
          setSelectedIds(items.map((item) => item.id));
          if (!focusId && items[0]) setFocusId(items[0].id);
        }}
        onClearSelection={() => setSelectedIds([])}
        onSort={onSort}
        onProcess={(request) => {
          void runSteps(checkedItems(), request.steps, {
            fromOriginal: request.fromOriginal,
            label: request.label,
            emptyNote: "Check a photo in the filmstrip.",
          });
        }}
        onStage={(request) => {
          void runStaging(request);
        }}
        onCommitJpeg={commitJpeg}
        onRevert={revertFinetune}
        onDownload={onDownload}
        onExport={onExport}
        onRemove={onRemove}
      />
    </AdminLayout>
  );
}
