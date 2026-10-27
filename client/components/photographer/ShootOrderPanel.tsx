import * as React from "react";
import { toast } from "sonner";
import PhotographerSetBoard from "@/components/photographer/PhotographerSetBoard";
import { mergeBracketToJpeg } from "@/lib/hdrMergeImage";
import {
  fetchListing,
  publishGallerySequence,
  saveListingPhotoOrder,
  uploadListingFile,
} from "@/lib/listingUpload";
import {
  cullWorkingShot,
  mergeStoredOrder,
  readStoredPhotoOrder,
  readStoredSequenceAddress,
  reorderWorkingShots,
  shotsFromListingImages,
  writeStoredPhotoOrder,
  zipWorkingShots,
  type WorkingShot,
} from "@/lib/photoOrder";
import { addressSlug } from "@shared/gallerySequence";
import { photographerUploadFolder } from "@shared/photographerPortal";

/**
 * Shoot order from the old upload tab: cull, HDR merge, drag order, then
 * publish the gallery sequence. Office staff see it on Shoots. Photographers
 * see it on the job the upload bookmark opens.
 */
export function ShootOrderPanel({
  listingId,
  fallbackAddress,
  revision = 0,
}: {
  listingId: string;
  fallbackAddress: string;
  revision?: number;
}) {
  const [shots, setShots] = React.useState<WorkingShot[]>([]);
  const [sequenceAddress, setSequenceAddress] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const shotsRef = React.useRef<WorkingShot[]>([]);
  shotsRef.current = shots;

  const rememberShots = React.useCallback((next: WorkingShot[], address = sequenceAddress) => {
    shotsRef.current = next;
    setShots(next);
    writeStoredPhotoOrder(listingId, next, address);
    const order = next.flatMap((shot) => (shot.path ? [{ key: shot.path, culled: shot.culled }] : []));
    if (order.length) {
      void saveListingPhotoOrder(listingId, order).catch(() => undefined);
    }
  }, [listingId, sequenceAddress]);

  React.useEffect(() => {
    const stored = readStoredSequenceAddress(listingId);
    setSequenceAddress(stored || fallbackAddress || "");
  }, [listingId, fallbackAddress]);

  React.useEffect(() => {
    let cancelled = false;
    const apply = (next: WorkingShot[]) => {
      if (cancelled) return;
      shotsRef.current = next;
      setShots(next);
      writeStoredPhotoOrder(listingId, next);
    };
    fetchListing(listingId)
      .then((listing) => {
        const fromServer = shotsFromListingImages(listing.images);
        const stored = readStoredPhotoOrder(listingId);
        const locals = shotsRef.current.filter((shot) => !shot.path && !fromServer.some((item) => item.key === shot.key));
        apply(mergeStoredOrder([...fromServer, ...locals], stored));
      })
      .catch(() => {
        const stored = readStoredPhotoOrder(listingId);
        if (stored.length) apply(mergeStoredOrder(shotsRef.current, stored));
      });
    return () => {
      cancelled = true;
    };
  }, [listingId, revision]);

  const uploadOrderedSet = async () => {
    setBusy(true);
    try {
      let current = shotsRef.current.slice();
      for (const shot of current) {
        if (shot.path || !shot.file) continue;
        const saved = await uploadListingFile({
          listingId,
          file: shot.file,
          folder: photographerUploadFolder(shot.file.name, shot.file.type),
        });
        const image = saved?.image || {};
        const path = typeof image.path === "string" ? image.path : "";
        if (!path) continue;
        current = current.map((item) => item.key === shot.key ? {
          ...item,
          key: path,
          path,
          url: typeof image.url === "string" && image.url ? image.url : item.url,
          name: typeof image.name === "string" && image.name ? image.name : item.name,
          file: undefined,
        } : item);
      }
      rememberShots(current);
      const order = current.flatMap((shot) => (shot.path ? [{ key: shot.path, culled: shot.culled }] : []));
      if (order.length) await saveListingPhotoOrder(listingId, order);
      const result = await publishGallerySequence(listingId, sequenceAddress);
      toast.success(result.note || "Gallery files follow the photographer order.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not upload the gallery in order.");
    } finally {
      setBusy(false);
    }
  };

  const exportSequenceZip = async () => {
    setBusy(true);
    try {
      const bytes = await zipWorkingShots(shotsRef.current, sequenceAddress || "listing");
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      const blob = new Blob([copy], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${addressSlug(sequenceAddress || "listing")}-photos.zip`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not export that zip.");
    } finally {
      setBusy(false);
    }
  };

  const mergeBracket = async (ids: string[]) => {
    const frames = ids.flatMap((id) => {
      const shot = shotsRef.current.find((item) => item.key === id);
      return shot ? [shot] : [];
    });
    setBusy(true);
    try {
      const file = await mergeBracketToJpeg(frames.map((shot) => ({ name: shot.name, url: shot.url })));
      const merged: WorkingShot = {
        key: `local:${file.name}:${file.size}:${Date.now()}`,
        name: file.name,
        url: URL.createObjectURL(file),
        culled: false,
        file,
        shotAt: Date.now(),
      };
      const idSet = new Set(ids);
      const next: WorkingShot[] = [];
      let inserted = false;
      for (const shot of shotsRef.current) {
        if (!idSet.has(shot.key)) {
          next.push(shot);
          continue;
        }
        if (!inserted) {
          next.push(merged);
          inserted = true;
        }
        next.push({ ...shot, culled: true });
      }
      rememberShots(next);
      toast.success("HDR bracket merged. The source frames are culled.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not merge that bracket.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PhotographerSetBoard
      listingId={listingId}
      address={sequenceAddress}
      shots={shots}
      busy={busy}
      onAddress={(value) => {
        setSequenceAddress(value);
        writeStoredPhotoOrder(listingId, shotsRef.current, value);
      }}
      onReorder={(fromKey, toKey) => rememberShots(reorderWorkingShots(shotsRef.current, fromKey, toKey))}
      onCull={(key, culled) => rememberShots(cullWorkingShot(shotsRef.current, key, culled))}
      onMerge={(ids) => { void mergeBracket(ids); }}
      onUploadGallery={() => { void uploadOrderedSet(); }}
      onExportZip={() => { void exportSequenceZip(); }}
    />
  );
}
