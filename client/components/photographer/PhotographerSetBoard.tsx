import { useState } from "react";
import { Link } from "react-router-dom";
import { hdrBracketGroups } from "@shared/gallerySequence";
import { studioEditorHref } from "@shared/studioEditorHref";
import { sequenceNamesFor, type WorkingShot } from "@/lib/photoOrder";

export default function PhotographerSetBoard({
  listingId,
  address,
  shots,
  busy = false,
  onAddress,
  onReorder,
  onCull,
  onMerge,
  onUploadGallery,
  onExportZip,
}: {
  listingId?: string;
  address: string;
  shots: WorkingShot[];
  busy?: boolean;
  onAddress: (value: string) => void;
  onReorder: (fromKey: string, toKey: string) => void;
  onCull: (key: string, culled: boolean) => void;
  onMerge: (ids: string[]) => void;
  onUploadGallery: () => void;
  onExportZip: () => void;
}) {
  const [dragKey, setDragKey] = useState("");
  const names = sequenceNamesFor(shots, address || "listing");
  const nameByKey = new Map(names.map((item) => [item.key, item.name]));
  const groups = hdrBracketGroups(shots.map((shot) => ({
    id: shot.key,
    name: shot.name,
    shotAt: shot.shotAt,
  }))).filter((ids) => ids.every((id) => !shots.find((shot) => shot.key === id)?.culled));

  return (
    <section data-testid="photographer-set" className="mb-6 rounded-[2rem] border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-black uppercase tracking-widest">Shoot order</h2>
          <p className="mt-1 max-w-xl text-xs text-gray-500">
            Merge a bracket, cull the misses, then drag the keepers into the order the client should see. Culled shots stay off the gallery. The order is saved on this job.
          </p>
        </div>
        {listingId ? (
          <Link to={studioEditorHref(listingId)} className="text-[10px] font-black uppercase tracking-widest text-[#0d9488]">
            Edit in Studio
          </Link>
        ) : null}
      </div>

      <label className="mb-4 block text-[10px] font-black uppercase tracking-widest text-gray-500">
        Filename address
        <input
          data-testid="sequence-address"
          value={address}
          onChange={(event) => onAddress(event.target.value)}
          placeholder="123 Main St"
          className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold normal-case tracking-normal text-black"
        />
      </label>

      {groups.length > 0 && (
        <div data-testid="hdr-groups" className="mb-4 space-y-2">
          {groups.map((ids) => (
            <div key={ids.join("-")} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-gray-50 px-3 py-2">
              <p className="text-xs font-bold text-gray-700">
                HDR bracket · {ids.map((id) => shots.find((shot) => shot.key === id)?.name).filter(Boolean).join(", ")}
              </p>
              <button
                type="button"
                data-testid="hdr-merge"
                disabled={busy}
                onClick={() => onMerge(ids)}
                className="rounded-full bg-[#0d9488] px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-40"
              >
                Merge HDR
              </button>
            </div>
          ))}
        </div>
      )}

      {shots.length === 0 ? (
        <p className="rounded-xl bg-gray-50 px-4 py-6 text-center text-xs font-bold text-gray-400">
          Drop the shoot above. The frames show up here for culling and order.
        </p>
      ) : (
        <div data-testid="reorder-grid" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {shots.map((shot) => (
            <article
              key={shot.key}
              data-testid={`set-shot-${shot.key}`}
              draggable
              onDragStart={() => setDragKey(shot.key)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (dragKey) onReorder(dragKey, shot.key);
                setDragKey("");
              }}
              className={`overflow-hidden rounded-2xl border bg-gray-50 ${shot.culled ? "border-red-200 opacity-60" : "border-gray-100"}`}
            >
              <img src={shot.url} alt={shot.name} className="aspect-[4/3] w-full object-cover" />
              <div className="space-y-1 p-2">
                <p className="truncate text-[11px] font-bold text-gray-800">{shot.name}</p>
                <p data-testid={`sequence-name-${shot.key}`} className="truncate text-[10px] font-black uppercase tracking-widest text-[#0d9488]">
                  {shot.culled ? "Culled" : nameByKey.get(shot.key)}
                </p>
                <button
                  type="button"
                  data-testid={`cull-${shot.key}`}
                  onClick={() => onCull(shot.key, !shot.culled)}
                  className="text-[10px] font-black uppercase tracking-widest text-gray-500"
                >
                  {shot.culled ? "Restore" : "Cull"}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <div data-testid="sequence-names" className="mt-4 rounded-xl bg-gray-50 p-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Export filenames</p>
        <ul className="mt-2 space-y-1">
          {names.length === 0 ? (
            <li className="text-xs text-gray-400">Kept shots will be named here.</li>
          ) : names.map((item) => (
            <li key={item.key} className="font-mono text-xs text-gray-800">{item.name}</li>
          ))}
        </ul>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="upload-gallery-order"
          disabled={busy || names.length === 0 || !listingId}
          onClick={onUploadGallery}
          className="rounded-xl bg-[#0d9488] px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-40"
        >
          Upload to gallery
        </button>
        <button
          type="button"
          data-testid="export-sequence-zip"
          disabled={busy || names.length === 0}
          onClick={onExportZip}
          className="rounded-xl border border-gray-200 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-gray-700 disabled:opacity-40"
        >
          Export zip
        </button>
      </div>
    </section>
  );
}
