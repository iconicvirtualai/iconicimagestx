import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { loadPortalListingView } from "@/lib/portalListingRead";
import {
  PORTAL_ADDRESS_LIMITS,
  PORTAL_FACT_TEXT_LIMIT,
  PORTAL_LISTING_TABS,
  portalFactsDraftFromDetail,
  portalListingDataApiPath,
  portalListingId,
  portalListingOwnerApiPath,
  portalListingPageMode,
  portalListingTab,
  visitorPortalListingDetail,
  type PortalListingDetail as PortalListingDetailModel,
  type PortalListingFactsDraft,
  type PortalListingTabId,
  type PortalMediaItem,
  type PortalMediaKind,
  type PortalTourItem,
  type PortalWebsiteSettings,
} from "@shared/portalListingDetail";
import {
  PHOTO_EDIT_NOTE_LIMIT,
  photoEditStatusLabel,
  type PhotoEditRequest,
} from "@shared/photoEditRequest";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Eye, EyeOff, MapPin } from "lucide-react";
import { toast } from "sonner";
import NotFound from "./NotFound";

export function PortalListingDetailView({
  detail,
  tab,
  editing,
  saving,
  website,
  canEdit,
  dataEditing,
  dataDraft,
  onTab,
  onToggleEditing,
  onMedia,
  onWebsite,
  onWebsiteSave,
  onDataEditing,
  onDataDraft,
  onDataSave,
  onRequestPhotoEdit,
}: {
  detail: PortalListingDetailModel;
  tab: PortalListingTabId;
  editing: PortalMediaKind | null;
  saving: boolean;
  website: PortalWebsiteSettings;
  canEdit: boolean;
  dataEditing: boolean;
  dataDraft: PortalListingFactsDraft;
  onTab: (tab: PortalListingTabId) => void;
  onToggleEditing: (kind: PortalMediaKind) => void;
  onMedia: (change: { kind: PortalMediaKind; id: string; hidden?: boolean; move?: "earlier" | "later" }) => void;
  onWebsite: (next: PortalWebsiteSettings) => void;
  onWebsiteSave: () => void;
  onDataEditing: (editing: boolean) => void;
  onDataDraft: (draft: PortalListingFactsDraft) => void;
  onDataSave: () => void;
  onRequestPhotoEdit: (photoId: string, note: string) => Promise<boolean>;
}) {
  const mediaEditing = canEdit ? editing : null;
  const shown = canEdit ? detail : visitorPortalListingDetail(detail);
  return (
    <div className="min-h-screen bg-[#f6f7f8] text-black" data-testid="portal-listing-detail" data-can-edit={canEdit ? "true" : "false"}>
      <header className="bg-black text-white">
        <div className="max-w-5xl mx-auto px-4 py-8">
          {canEdit ? (
            <Link to="/portal/home" className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.28em] text-gray-500 hover:text-white">
              <ArrowLeft className="w-3.5 h-3.5" /> Portal home
            </Link>
          ) : (
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-gray-500">Iconic Images</p>
          )}
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500 mt-6">Listing file</p>
          <h1 className="text-3xl font-black mt-2">{detail.title}</h1>
          <p className="text-gray-400 text-sm mt-1 uppercase tracking-widest">{detail.status.replace(/_/g, " ")}</p>
        </div>
      </header>

      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <nav className="max-w-5xl mx-auto px-4 flex gap-1 overflow-x-auto" aria-label="Listing sections">
          {PORTAL_LISTING_TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              data-testid={`listing-tab-${item.id}`}
              onClick={() => onTab(item.id)}
              className={`shrink-0 px-3 py-4 text-[11px] font-black uppercase tracking-widest border-b-2 ${tab === item.id ? "border-[#0d9488] text-[#0d9488]" : "border-transparent text-gray-400"}`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {tab === "data" && (
          <DataTab
            detail={shown}
            canEdit={canEdit}
            editing={dataEditing}
            saving={saving}
            draft={dataDraft}
            onEditing={onDataEditing}
            onDraft={onDataDraft}
            onSave={onDataSave}
          />
        )}
        {tab === "photos" && (
          <MediaTab
            title="Photos"
            empty="No photos on this listing yet."
            canEdit={canEdit}
            editing={mediaEditing === "photo"}
            saving={saving}
            items={shown.photos}
            onToggleEditing={() => onToggleEditing("photo")}
            onMedia={onMedia}
            photoEditRequests={shown.photoEditRequests || []}
            onRequestPhotoEdit={canEdit ? onRequestPhotoEdit : undefined}
          />
        )}
        {tab === "video" && (
          <MediaTab
            title="Video"
            empty="No mp4 or mov files on this listing yet."
            canEdit={canEdit}
            editing={mediaEditing === "video"}
            saving={saving}
            items={shown.videos}
            onToggleEditing={() => onToggleEditing("video")}
            onMedia={onMedia}
          />
        )}
        {tab === "tours" && (
          <ToursTab
            tours={shown.tours}
            canEdit={canEdit}
            editing={mediaEditing === "tour"}
            saving={saving}
            onToggleEditing={() => onToggleEditing("tour")}
            onMedia={onMedia}
          />
        )}
        {tab === "floorplans" && (
          <MediaTab
            title="Floorplans"
            empty="No floorplan images on this listing yet."
            canEdit={canEdit}
            editing={mediaEditing === "floorplan"}
            saving={saving}
            items={shown.floorplans}
            onToggleEditing={() => onToggleEditing("floorplan")}
            onMedia={onMedia}
          />
        )}
        {tab === "marketing" && <MarketingTab detail={shown} />}
        {tab === "website" && <WebsiteTab website={website} canEdit={canEdit} saving={saving} onWebsite={onWebsite} onSave={onWebsiteSave} />}
        {tab === "orders" && <OrdersTab detail={shown} />}
        {tab === "activity" && <ActivityTab detail={shown} />}
      </main>
    </div>
  );
}

export default function PortalListingDetail() {
  const { listingId = "" } = useParams();
  const id = portalListingId(listingId);
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, userType, loading, signOutUser } = useAuth();
  const [detail, setDetail] = useState<PortalListingDetailModel | null>(null);
  const [website, setWebsite] = useState<PortalWebsiteSettings | null>(null);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<PortalMediaKind | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [dataEditing, setDataEditing] = useState(false);
  const [dataDraft, setDataDraft] = useState<PortalListingFactsDraft | null>(null);
  const tab = portalListingTab(searchParams.get("tab"));
  const mode = portalListingPageMode({
    loading,
    isClient: Boolean(user) && userType === "client",
  });

  useEffect(() => {
    if (!id || mode === "pending") return;
    let cancelled = false;
    setFetching(true);
    setError("");
    setMissing(false);
    (async () => {
      try {
        const token = mode === "owner-check" && user ? await user.getIdToken() : "";
        const loaded = await loadPortalListingView({
          listingId: id,
          asClient: mode === "owner-check",
          token,
        });
        if (cancelled) return;
        if (loaded.kind === "missing") {
          setDetail(null);
          setWebsite(null);
          setCanEdit(false);
          setDataDraft(null);
          setDataEditing(false);
          setMissing(true);
          return;
        }
        if (loaded.kind === "error") {
          setDetail(null);
          setWebsite(null);
          setCanEdit(false);
          setDataDraft(null);
          setDataEditing(false);
          setError(loaded.message);
          return;
        }
        setDetail(loaded.detail);
        setWebsite(loaded.detail.website);
        setDataDraft(portalFactsDraftFromDetail(loaded.detail));
        setDataEditing(false);
        setCanEdit(loaded.canEdit);
        setEditing(null);
      } catch (err: unknown) {
        if (!cancelled) {
          setDetail(null);
          setWebsite(null);
          setCanEdit(false);
          setDataDraft(null);
          setDataEditing(false);
          setError(err instanceof Error ? err.message : "Could not load this listing.");
        }
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, mode, user]);

  if (!id || missing) return <NotFound />;
  if (loading || fetching) return <Pending />;

  async function send(path: string, body: unknown, method: "PATCH" | "POST" = "PATCH"): Promise<PortalListingDetailModel | null> {
    if (!canEdit || !user) return null;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(path, {
        method,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save.");
      setDetail(data);
      setWebsite(data.website);
      return data;
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not save.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  const ownerApi = portalListingOwnerApiPath(id);

  return (
    <div>
      {error || !detail || !website ? (
        <div className="min-h-screen bg-[#f6f7f8] flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center max-w-md">
            <p className="font-bold">{error || "Could not load this listing."}</p>
            {canEdit ? (
              <>
                <Button asChild className="mt-4 bg-black text-white">
                  <Link to="/portal/home">Back to portal home</Link>
                </Button>
                <button type="button" className="block mx-auto mt-4 text-xs text-gray-400 underline" onClick={() => signOutUser()}>Sign out</button>
              </>
            ) : (
              <Button asChild className="mt-4 bg-black text-white">
                <a href="/">Return to Home</a>
              </Button>
            )}
          </div>
        </div>
      ) : (
        <PortalListingDetailView
          detail={detail}
          tab={tab}
          editing={editing}
          saving={saving}
          website={website}
          canEdit={canEdit}
          dataEditing={dataEditing}
          dataDraft={dataDraft ?? portalFactsDraftFromDetail(detail)}
          onTab={(next) => {
            const params = new URLSearchParams(searchParams);
            params.set("tab", next);
            setSearchParams(params, { replace: true });
          }}
          onToggleEditing={(kind) => {
            if (!canEdit) return;
            setEditing((current) => current === kind ? null : kind);
          }}
          onMedia={(change) => send(`${ownerApi}/media`, change)}
          onWebsite={setWebsite}
          onWebsiteSave={() => send(`${ownerApi}/website`, website)}
          onDataEditing={(on) => {
            if (!canEdit || saving) return;
            setDataEditing(on);
            setDataDraft(portalFactsDraftFromDetail(detail));
          }}
          onDataDraft={setDataDraft}
          onRequestPhotoEdit={async (photoId, note) => {
            const saved = await send(`${ownerApi}/photo-edit-requests`, { photoId, note }, "POST");
            return Boolean(saved);
          }}
          onDataSave={() => {
            void (async () => {
              const saved = await send(portalListingDataApiPath(id), dataDraft ?? portalFactsDraftFromDetail(detail));
              if (!saved) return;
              setDataDraft(portalFactsDraftFromDetail(saved));
              setDataEditing(false);
            })();
          }}
        />
      )}
    </div>
  );
}

function Pending() {
  return (
    <div className="min-h-screen bg-[#f6f7f8] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-[#0d9488] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function DataTab({
  detail,
  canEdit,
  editing,
  saving,
  draft,
  onEditing,
  onDraft,
  onSave,
}: {
  detail: PortalListingDetailModel;
  canEdit: boolean;
  editing: boolean;
  saving: boolean;
  draft: PortalListingFactsDraft;
  onEditing: (editing: boolean) => void;
  onDraft: (draft: PortalListingFactsDraft) => void;
  onSave: () => void;
}) {
  const showEditor = canEdit && editing;
  const address = detail.address;
  const addressDraft = draft.address;
  return (
    <div className="space-y-6" data-testid="listing-data">
      {canEdit && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-gray-500">Facts stay read-only until Edit is on.</p>
          <div className="flex items-center gap-3 shrink-0">
            {showEditor && (
              <Button type="button" className="bg-black text-white" data-testid="data-save" disabled={saving} onClick={onSave}>
                {saving ? "Saving" : "Save"}
              </Button>
            )}
            <label data-testid="data-edit-toggle" className="inline-flex items-center gap-2 cursor-pointer">
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Edit</span>
              <span className="relative inline-flex items-center">
                <input
                  type="checkbox"
                  role="switch"
                  aria-label="Edit listing facts"
                  aria-checked={editing}
                  checked={editing}
                  disabled={saving}
                  onChange={(event) => onEditing(event.target.checked)}
                  className="peer sr-only"
                />
                <span className="block h-6 w-11 rounded-full bg-gray-200 peer-checked:bg-[#0d9488] peer-focus-visible:ring-2 peer-focus-visible:ring-[#0d9488] peer-disabled:opacity-50" />
                <span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
              </span>
            </label>
          </div>
        </div>
      )}
      <section className="bg-white rounded-2xl border border-gray-100 p-5">
        <h2 className="text-xs font-black uppercase tracking-widest text-[#0d9488] mb-4">Address</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <AddressFact id="line1" label="Address line 1" value={showEditor ? addressDraft.line1 : address.line1} editing={showEditor} maxLength={PORTAL_ADDRESS_LIMITS.line1} onChange={(line1) => onDraft({ ...draft, address: { ...addressDraft, line1 } })} />
          <AddressFact id="line2" label="Address line 2" value={showEditor ? addressDraft.line2 : address.line2} editing={showEditor} maxLength={PORTAL_ADDRESS_LIMITS.line2} onChange={(line2) => onDraft({ ...draft, address: { ...addressDraft, line2 } })} />
          <AddressFact id="city" label="City" value={showEditor ? addressDraft.city : address.city} editing={showEditor} maxLength={PORTAL_ADDRESS_LIMITS.city} onChange={(city) => onDraft({ ...draft, address: { ...addressDraft, city } })} />
          <AddressFact id="state" label="State" value={showEditor ? addressDraft.state : address.state} editing={showEditor} maxLength={PORTAL_ADDRESS_LIMITS.state} onChange={(state) => onDraft({ ...draft, address: { ...addressDraft, state } })} />
          <AddressFact id="zip" label="Zip" value={showEditor ? addressDraft.zip : address.zip} editing={showEditor} maxLength={PORTAL_ADDRESS_LIMITS.zip} onChange={(zip) => onDraft({ ...draft, address: { ...addressDraft, zip } })} />
        </div>
        <div className="mt-5 overflow-hidden rounded-2xl border border-gray-100 bg-gray-50 min-h-[220px]">
          {address.mapUrl ? (
            <iframe title="Listing map" src={address.mapUrl} className="w-full h-[280px] border-0" loading="lazy" />
          ) : (
            <div className="h-[220px] flex flex-col items-center justify-center text-center px-6 text-gray-500">
              <MapPin className="w-8 h-8 text-[#0d9488] mb-3" />
              <p className="text-sm font-bold text-black">{address.formatted || "Address not on file yet"}</p>
              <p className="text-xs mt-1">The map pin shows when this order has coordinates.</p>
            </div>
          )}
        </div>
        {showEditor && (
          <p className="text-xs text-gray-500 mt-3">The map pin stays on the coordinates already saved with this order.</p>
        )}
      </section>
      <section className="bg-white rounded-2xl border border-gray-100 p-5">
        <h2 className="text-xs font-black uppercase tracking-widest text-[#0d9488] mb-1">Property</h2>
        <p className="text-xs text-gray-500 mb-4">Shown from the booking and listing file. Public record lookups are not part of this page.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {detail.facts.map((fact) => (
            showEditor ? (
              <label key={fact.id} className="block">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{fact.label}</span>
                <input
                  data-testid={`data-field-${fact.id}`}
                  value={draft.facts[fact.id] ?? ""}
                  placeholder="Not on file yet"
                  maxLength={PORTAL_FACT_TEXT_LIMIT}
                  autoComplete="off"
                  onChange={(event) => onDraft({ ...draft, facts: { ...draft.facts, [fact.id]: event.target.value } })}
                  className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold"
                />
              </label>
            ) : (
              <Field key={fact.id} label={fact.label} value={fact.empty ? "" : fact.value} placeholder={fact.value} />
            )
          ))}
        </div>
      </section>
    </div>
  );
}

function AddressFact({
  id,
  label,
  value,
  editing,
  maxLength,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  editing: boolean;
  maxLength: number;
  onChange: (value: string) => void;
}) {
  if (!editing) return <Field label={label} value={value} />;
  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</span>
      <input
        data-testid={`data-field-${id}`}
        value={value}
        placeholder="Not on file yet"
        maxLength={maxLength}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold"
      />
    </label>
  );
}

function Field({ label, value, placeholder = "—" }: { label: string; value: string; placeholder?: string }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</p>
      <p className={`text-sm font-bold mt-1 ${value ? "text-black" : "text-gray-400"}`}>{value || placeholder}</p>
    </div>
  );
}

function PhotoEditNote({
  item,
  requests,
  saving,
  onRequest,
}: {
  item: PortalMediaItem;
  requests: PhotoEditRequest[];
  saving: boolean;
  onRequest?: (photoId: string, note: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const mine = requests.filter((request) => request.photoId === item.id);
  const pending = mine.some((request) => request.status !== "received_back");
  if (!onRequest && mine.length === 0) return null;
  return (
    <div className="mt-3 space-y-2">
      {mine.map((request) => (
        <div key={request.id} data-testid={`photo-edit-status-${request.id}`} className="rounded-xl bg-gray-50 px-3 py-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-[#0d9488]">{photoEditStatusLabel(request.status)}</p>
          <p className="text-sm text-gray-700 mt-1">{request.note}</p>
          <ol className="mt-2 space-y-1">
            {request.timeline.map((entry) => (
              <li key={`${entry.status}-${entry.at}`} className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                {photoEditStatusLabel(entry.status)}
              </li>
            ))}
          </ol>
          {request.replacement && (
            <a href={request.replacement.url} target="_blank" rel="noopener noreferrer" className="inline-block mt-2 text-xs font-bold text-[#0d9488]">
              {request.replacement.name}
            </a>
          )}
        </div>
      ))}
      {onRequest && !pending && !open && (
        <Button type="button" size="sm" variant="outline" data-testid={`photo-edit-open-${item.id}`} onClick={() => setOpen(true)}>
          Request edit
        </Button>
      )}
      {onRequest && !pending && open && (
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-gray-400" htmlFor={`photo-edit-note-${item.id}`}>
            Note
          </label>
          <textarea
            id={`photo-edit-note-${item.id}`}
            data-testid={`photo-edit-note-${item.id}`}
            value={note}
            maxLength={PHOTO_EDIT_NOTE_LIMIT}
            rows={3}
            placeholder="What should change on this photo?"
            onChange={(event) => setNote(event.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-[10px] text-gray-400">The note is saved on this photo. It does not send a message or create a charge.</p>
          <div className="mt-2 flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => { setOpen(false); setNote(""); }}>Cancel</Button>
            <Button
              type="button"
              size="sm"
              data-testid={`photo-edit-submit-${item.id}`}
              disabled={saving || !note.trim()}
              onClick={() => {
                void onRequest(item.id, note).then((ok) => {
                  if (!ok) return;
                  setNote("");
                  setOpen(false);
                });
              }}
            >
              Send request
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function MediaTab({
  title,
  empty,
  items,
  canEdit,
  editing,
  saving,
  onToggleEditing,
  onMedia,
  photoEditRequests = [],
  onRequestPhotoEdit,
}: {
  title: string;
  empty: string;
  items: PortalMediaItem[];
  canEdit: boolean;
  editing: boolean;
  saving: boolean;
  onToggleEditing: () => void;
  onMedia: (change: { kind: PortalMediaKind; id: string; hidden?: boolean; move?: "earlier" | "later" }) => void;
  photoEditRequests?: PhotoEditRequest[];
  onRequestPhotoEdit?: (photoId: string, note: string) => Promise<boolean>;
}) {
  const showEditor = canEdit && editing;
  const visible = showEditor ? items : items.filter((item) => !item.hidden);
  const hiddenCount = items.filter((item) => item.hidden).length;
  return (
    <section>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xs font-black uppercase tracking-widest text-[#0d9488]">{title}</h2>
          <p className="text-xs text-gray-500 mt-1">
            {showEditor
              ? "Hidden files stay on the listing. They are left out of the presentation."
              : canEdit && hiddenCount > 0 ? `${hiddenCount} hidden from the presentation.` : "Shown in presentation order."}
          </p>
        </div>
        {canEdit && (
          <Button type="button" variant="outline" onClick={onToggleEditing} disabled={items.length === 0}>
            {editing ? "Done" : "Edit"}
          </Button>
        )}
      </div>
      {visible.length === 0 ? (
        <Empty>{items.length === 0 ? empty : "All files are hidden from the presentation."}</Empty>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visible.map((item, index) => (
            <article key={item.id} className={`bg-white rounded-2xl border p-3 ${item.hidden ? "border-dashed border-gray-300" : "border-gray-100"}`} data-testid={`media-${item.kind}-${item.id}`}>
              {item.kind === "video" ? (
                <video src={item.url} className="w-full aspect-video rounded-xl bg-black" controls preload="metadata" />
              ) : (
                <img src={item.url} alt={item.name} className="w-full aspect-[4/3] object-cover rounded-xl bg-gray-100" />
              )}
              <div className="mt-3 flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold truncate">{item.name}</p>
                  {item.hidden && <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Hidden</p>}
                </div>
              </div>
              {showEditor && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => onMedia({ kind: item.kind, id: item.id, hidden: !item.hidden })}>
                    {item.hidden ? <Eye className="w-3.5 h-3.5 mr-1" /> : <EyeOff className="w-3.5 h-3.5 mr-1" />}
                    {item.hidden ? "Show" : "Hide"}
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={saving || index === 0} onClick={() => onMedia({ kind: item.kind, id: item.id, move: "earlier" })}>Earlier</Button>
                  <Button type="button" size="sm" variant="outline" disabled={saving || index === visible.length - 1} onClick={() => onMedia({ kind: item.kind, id: item.id, move: "later" })}>Later</Button>
                </div>
              )}
              {item.kind === "photo" && (
                <PhotoEditNote
                  item={item}
                  requests={photoEditRequests}
                  saving={saving}
                  onRequest={onRequestPhotoEdit}
                />
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ToursTab({
  tours,
  canEdit,
  editing,
  saving,
  onToggleEditing,
  onMedia,
}: {
  tours: PortalTourItem[];
  canEdit: boolean;
  editing: boolean;
  saving: boolean;
  onToggleEditing: () => void;
  onMedia: (change: { kind: PortalMediaKind; id: string; hidden?: boolean }) => void;
}) {
  const showEditor = canEdit && editing;
  const visible = showEditor ? tours : tours.filter((tour) => !tour.hidden);
  return (
    <section>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xs font-black uppercase tracking-widest text-[#0d9488]">Virtual tours</h2>
          <p className="text-xs text-gray-500 mt-1">Matterport and other tour links already saved on the listing.</p>
        </div>
        {canEdit && (
          <Button type="button" variant="outline" onClick={onToggleEditing} disabled={tours.length === 0}>{editing ? "Done" : "Edit"}</Button>
        )}
      </div>
      {visible.length === 0 ? (
        <Empty>No tour links on this listing yet.</Empty>
      ) : (
        <div className="space-y-4">
          {visible.map((tour) => (
            <article key={tour.id} className="bg-white rounded-2xl border border-gray-100 p-5" data-testid={`tour-${tour.id}`}>
              <p className="text-[10px] font-black uppercase tracking-widest text-[#0d9488]">{tour.provider}</p>
              <h3 className="font-black mt-1">{tour.name}</h3>
              {tour.hidden && <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-1">Hidden</p>}
              {tour.embedUrl && !tour.hidden && (
                <iframe title={tour.name} src={tour.embedUrl} className="w-full h-[360px] rounded-xl border border-gray-100 mt-4" loading="lazy" />
              )}
              <a href={tour.url} target="_blank" rel="noreferrer" className="inline-block mt-4 text-sm font-bold text-[#0d9488]">Open tour</a>
              {showEditor && (
                <div className="mt-3">
                  <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => onMedia({ kind: "tour", id: tour.id, hidden: !tour.hidden })}>
                    {tour.hidden ? "Show" : "Hide"}
                  </Button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function MarketingTab({ detail }: { detail: PortalListingDetailModel }) {
  return (
    <section>
      <h2 className="text-xs font-black uppercase tracking-widest text-[#0d9488] mb-1">Marketing kit</h2>
      <p className="text-xs text-gray-500 mb-4">Pick a flyer, social post, or reel here once design tools are connected.</p>
      <div className="grid sm:grid-cols-3 gap-3">
        {detail.marketing.map((card) => (
          <article key={card.id} className="bg-white rounded-2xl border border-dashed border-gray-200 p-5" data-testid={`marketing-${card.id}`}>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Not connected</p>
            <h3 className="font-black mt-2">{card.title}</h3>
            <p className="text-sm text-gray-500 mt-2">{card.note}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function WebsiteTab({
  website,
  canEdit,
  saving,
  onWebsite,
  onSave,
}: {
  website: PortalWebsiteSettings;
  canEdit: boolean;
  saving: boolean;
  onWebsite: (next: PortalWebsiteSettings) => void;
  onSave: () => void;
}) {
  const swatch = website.color === "teal" ? "#0d9488" : website.color === "warm" ? "#9a3412" : "#111111";
  const fontLabel = website.font === "serif" ? "Serif" : website.font === "modern" ? "Modern" : "Sans";
  const colorLabel = website.color === "teal" ? "Teal" : website.color === "warm" ? "Warm" : "Ink";
  const styleLabel = website.style === "editorial" ? "Editorial" : website.style === "minimal" ? "Minimal" : "Classic";
  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-5">
      <h2 className="text-xs font-black uppercase tracking-widest text-[#0d9488] mb-1">Listing site</h2>
      <p className="text-xs text-gray-500 mb-5">Font, color, and which media the listing site should show. The public page is not generated from here yet.</p>
      {canEdit ? (
        <div className="grid sm:grid-cols-3 gap-4">
          <Choice label="Font" value={website.font} options={[["sans", "Sans"], ["serif", "Serif"], ["modern", "Modern"]]} onChange={(font) => onWebsite({ ...website, font: font as PortalWebsiteSettings["font"] })} />
          <Choice label="Color" value={website.color} options={[["ink", "Ink"], ["teal", "Teal"], ["warm", "Warm"]]} onChange={(color) => onWebsite({ ...website, color: color as PortalWebsiteSettings["color"] })} />
          <Choice label="Style" value={website.style} options={[["classic", "Classic"], ["editorial", "Editorial"], ["minimal", "Minimal"]]} onChange={(style) => onWebsite({ ...website, style: style as PortalWebsiteSettings["style"] })} />
        </div>
      ) : (
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Font" value={fontLabel} />
          <Field label="Color" value={colorLabel} />
          <Field label="Style" value={styleLabel} />
        </div>
      )}
      <div className="mt-5 rounded-2xl border border-gray-100 p-5" style={{ color: swatch }}>
        <p className={`text-lg font-black ${website.font === "serif" ? "font-serif" : "font-sans"}`}>Sample listing title</p>
        <p className="text-xs uppercase tracking-widest mt-1">{website.style} · {website.color}</p>
      </div>
      <div className="mt-5 grid sm:grid-cols-2 gap-3">
        {canEdit ? (
          <>
            <Toggle label="Show photos" checked={website.showPhotos} onChange={(showPhotos) => onWebsite({ ...website, showPhotos })} />
            <Toggle label="Show video" checked={website.showVideo} onChange={(showVideo) => onWebsite({ ...website, showVideo })} />
            <Toggle label="Show virtual tours" checked={website.showTours} onChange={(showTours) => onWebsite({ ...website, showTours })} />
            <Toggle label="Show floorplans" checked={website.showFloorplans} onChange={(showFloorplans) => onWebsite({ ...website, showFloorplans })} />
          </>
        ) : (
          <>
            <Field label="Photos" value={website.showPhotos ? "Shown" : "Hidden"} />
            <Field label="Video" value={website.showVideo ? "Shown" : "Hidden"} />
            <Field label="Virtual tours" value={website.showTours ? "Shown" : "Hidden"} />
            <Field label="Floorplans" value={website.showFloorplans ? "Shown" : "Hidden"} />
          </>
        )}
      </div>
      {canEdit && (
        <Button type="button" className="mt-6 bg-black text-white" disabled={saving} onClick={onSave}>Save site style</Button>
      )}
    </section>
  );
}

function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold">
        {options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 bg-gray-50 rounded-xl px-3 py-3">
      <span className="text-sm font-bold">{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function OrdersTab({ detail }: { detail: PortalListingDetailModel }) {
  return (
    <section>
      <h2 className="text-xs font-black uppercase tracking-widest text-[#0d9488] mb-1">Orders</h2>
      <p className="text-xs text-gray-500 mb-4">Invoice status for this listing. Nothing is sent for payment from this page.</p>
      {detail.invoices.length === 0 ? (
        <Empty>No invoice is linked to this listing yet.</Empty>
      ) : (
        <div className="grid gap-3">
          {detail.invoices.map((invoice) => (
            <article key={invoice.id} className="bg-white rounded-2xl border border-gray-100 p-5" data-testid={`invoice-${invoice.id}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="font-black">{invoice.invoiceNumber}</p>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">{invoice.status.replace(/_/g, " ")}</p>
              </div>
              <p className="text-sm text-gray-600 mt-2">Total {money(invoice.total)}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ActivityTab({ detail }: { detail: PortalListingDetailModel }) {
  return (
    <section>
      <h2 className="text-xs font-black uppercase tracking-widest text-[#0d9488] mb-4">Activity</h2>
      {detail.activity.length === 0 ? (
        <Empty>No activity is recorded on this listing yet.</Empty>
      ) : (
        <ol className="space-y-3">
          {detail.activity.map((event) => (
            <li key={event.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex gap-3" data-testid={`activity-${event.id}`}>
              <span className="w-2 h-2 rounded-full bg-[#0d9488] mt-1.5 shrink-0" />
              <div>
                <p className="text-sm font-bold">{event.summary}</p>
                <p className="text-[10px] uppercase tracking-widest text-gray-400 mt-1">{event.at ? new Date(event.at).toLocaleString() : "Time not recorded"}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-6 text-sm text-gray-500">{children}</div>;
}

function money(value: number) {
  return "$" + (Number(value) || 0).toLocaleString("en-US", { minimumFractionDigits: 2 });
}
