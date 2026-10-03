import { useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, useLocation, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { clientPortalAction, staffHomePath } from "@shared/staffAccess";
import {
  PORTAL_LISTING_TABS,
  portalListingTab,
  type PortalListingDetail as PortalListingDetailModel,
  type PortalListingTabId,
  type PortalMediaItem,
  type PortalMediaKind,
  type PortalTourItem,
  type PortalWebsiteSettings,
} from "@shared/portalListingDetail";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Eye, EyeOff, MapPin } from "lucide-react";
import { toast } from "sonner";

export function PortalListingDetailView({
  detail,
  tab,
  editing,
  saving,
  website,
  onTab,
  onToggleEditing,
  onMedia,
  onWebsite,
  onWebsiteSave,
}: {
  detail: PortalListingDetailModel;
  tab: PortalListingTabId;
  editing: PortalMediaKind | null;
  saving: boolean;
  website: PortalWebsiteSettings;
  onTab: (tab: PortalListingTabId) => void;
  onToggleEditing: (kind: PortalMediaKind) => void;
  onMedia: (change: { kind: PortalMediaKind; id: string; hidden?: boolean; move?: "earlier" | "later" }) => void;
  onWebsite: (next: PortalWebsiteSettings) => void;
  onWebsiteSave: () => void;
}) {
  return (
    <div className="min-h-screen bg-[#f6f7f8] text-black" data-testid="portal-listing-detail">
      <header className="bg-black text-white">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <Link to="/portal/home" className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.28em] text-gray-500 hover:text-white">
            <ArrowLeft className="w-3.5 h-3.5" /> Portal home
          </Link>
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
        {tab === "data" && <DataTab detail={detail} />}
        {tab === "photos" && (
          <MediaTab
            title="Photos"
            empty="No photos on this listing yet."
            editing={editing === "photo"}
            saving={saving}
            items={detail.photos}
            onToggleEditing={() => onToggleEditing("photo")}
            onMedia={onMedia}
          />
        )}
        {tab === "video" && (
          <MediaTab
            title="Video"
            empty="No mp4 or mov files on this listing yet."
            editing={editing === "video"}
            saving={saving}
            items={detail.videos}
            onToggleEditing={() => onToggleEditing("video")}
            onMedia={onMedia}
          />
        )}
        {tab === "tours" && <ToursTab tours={detail.tours} editing={editing === "tour"} saving={saving} onToggleEditing={() => onToggleEditing("tour")} onMedia={onMedia} />}
        {tab === "floorplans" && (
          <MediaTab
            title="Floorplans"
            empty="No floorplan images on this listing yet."
            editing={editing === "floorplan"}
            saving={saving}
            items={detail.floorplans}
            onToggleEditing={() => onToggleEditing("floorplan")}
            onMedia={onMedia}
          />
        )}
        {tab === "marketing" && <MarketingTab detail={detail} />}
        {tab === "website" && <WebsiteTab website={website} saving={saving} onWebsite={onWebsite} onSave={onWebsiteSave} />}
        {tab === "orders" && <OrdersTab detail={detail} />}
        {tab === "activity" && <ActivityTab detail={detail} />}
      </main>
    </div>
  );
}

export default function PortalListingDetail() {
  const { listingId = "" } = useParams();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, userType, staffProfile, loading, signOutUser } = useAuth();
  const navigateHome = signOutUser;
  const [detail, setDetail] = useState<PortalListingDetailModel | null>(null);
  const [website, setWebsite] = useState<PortalWebsiteSettings | null>(null);
  const [error, setError] = useState("");
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<PortalMediaKind | null>(null);
  const tab = portalListingTab(searchParams.get("tab"));

  useEffect(() => {
    if (loading || !user || userType !== "client" || !listingId) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/clients/me/listings/${encodeURIComponent(listingId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Could not load this listing.");
        if (!cancelled) {
          setDetail(data);
          setWebsite(data.website);
        }
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load this listing.");
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, userType, loading, listingId]);

  if (loading) return <Pending />;
  if (user && userType === "staff") return <Navigate to={staffHomePath(staffProfile?.role)} replace />;
  const gate = clientPortalAction({ loading, hasUser: Boolean(user), isClient: userType === "client" });
  if (gate.type !== "show-home" || !user) {
    return <Navigate to="/portal" replace state={{ from: location }} />;
  }

  async function send(path: string, body: unknown) {
    setSaving(true);
    try {
      const token = await user!.getIdToken();
      const res = await fetch(path, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save.");
      setDetail(data);
      setWebsite(data.website);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {fetching ? <Pending /> : error || !detail || !website ? (
        <div className="min-h-screen bg-[#f6f7f8] flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center max-w-md">
            <p className="font-bold">{error || "Could not load this listing."}</p>
            <Button asChild className="mt-4 bg-black text-white">
              <Link to="/portal/home">Back to portal home</Link>
            </Button>
            <button type="button" className="block mx-auto mt-4 text-xs text-gray-400 underline" onClick={() => navigateHome()}>Sign out</button>
          </div>
        </div>
      ) : (
        <PortalListingDetailView
          detail={detail}
          tab={tab}
          editing={editing}
          saving={saving}
          website={website}
          onTab={(next) => {
            const params = new URLSearchParams(searchParams);
            params.set("tab", next);
            setSearchParams(params, { replace: true });
          }}
          onToggleEditing={(kind) => setEditing((current) => current === kind ? null : kind)}
          onMedia={(change) => send(`/api/clients/me/listings/${encodeURIComponent(listingId)}/media`, change)}
          onWebsite={setWebsite}
          onWebsiteSave={() => send(`/api/clients/me/listings/${encodeURIComponent(listingId)}/website`, website)}
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

function DataTab({ detail }: { detail: PortalListingDetailModel }) {
  const address = detail.address;
  return (
    <div className="space-y-6">
      <section className="bg-white rounded-2xl border border-gray-100 p-5">
        <h2 className="text-xs font-black uppercase tracking-widest text-[#0d9488] mb-4">Address</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Address line 1" value={address.line1} />
          <Field label="Address line 2" value={address.line2} />
          <Field label="City" value={address.city} />
          <Field label="State" value={address.state} />
          <Field label="Zip" value={address.zip} />
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
      </section>
      <section className="bg-white rounded-2xl border border-gray-100 p-5">
        <h2 className="text-xs font-black uppercase tracking-widest text-[#0d9488] mb-1">Property</h2>
        <p className="text-xs text-gray-500 mb-4">Shown from the booking and listing file. Public record lookups are not part of this page.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {detail.facts.map((fact) => (
            <Field key={fact.id} label={fact.label} value={fact.empty ? "" : fact.value} placeholder={fact.value} />
          ))}
        </div>
      </section>
    </div>
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

function MediaTab({
  title,
  empty,
  items,
  editing,
  saving,
  onToggleEditing,
  onMedia,
}: {
  title: string;
  empty: string;
  items: PortalMediaItem[];
  editing: boolean;
  saving: boolean;
  onToggleEditing: () => void;
  onMedia: (change: { kind: PortalMediaKind; id: string; hidden?: boolean; move?: "earlier" | "later" }) => void;
}) {
  const visible = editing ? items : items.filter((item) => !item.hidden);
  const hiddenCount = items.filter((item) => item.hidden).length;
  return (
    <section>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xs font-black uppercase tracking-widest text-[#0d9488]">{title}</h2>
          <p className="text-xs text-gray-500 mt-1">
            {editing
              ? "Hidden files stay on the listing. They are left out of the presentation."
              : hiddenCount > 0 ? `${hiddenCount} hidden from the presentation.` : "Shown in presentation order."}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={onToggleEditing} disabled={items.length === 0}>
          {editing ? "Done" : "Edit"}
        </Button>
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
              {editing && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => onMedia({ kind: item.kind, id: item.id, hidden: !item.hidden })}>
                    {item.hidden ? <Eye className="w-3.5 h-3.5 mr-1" /> : <EyeOff className="w-3.5 h-3.5 mr-1" />}
                    {item.hidden ? "Show" : "Hide"}
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={saving || index === 0} onClick={() => onMedia({ kind: item.kind, id: item.id, move: "earlier" })}>Earlier</Button>
                  <Button type="button" size="sm" variant="outline" disabled={saving || index === visible.length - 1} onClick={() => onMedia({ kind: item.kind, id: item.id, move: "later" })}>Later</Button>
                </div>
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
  editing,
  saving,
  onToggleEditing,
  onMedia,
}: {
  tours: PortalTourItem[];
  editing: boolean;
  saving: boolean;
  onToggleEditing: () => void;
  onMedia: (change: { kind: PortalMediaKind; id: string; hidden?: boolean }) => void;
}) {
  const visible = editing ? tours : tours.filter((tour) => !tour.hidden);
  return (
    <section>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xs font-black uppercase tracking-widest text-[#0d9488]">Virtual tours</h2>
          <p className="text-xs text-gray-500 mt-1">Matterport and other tour links already saved on the listing.</p>
        </div>
        <Button type="button" variant="outline" onClick={onToggleEditing} disabled={tours.length === 0}>{editing ? "Done" : "Edit"}</Button>
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
              {editing && (
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
  saving,
  onWebsite,
  onSave,
}: {
  website: PortalWebsiteSettings;
  saving: boolean;
  onWebsite: (next: PortalWebsiteSettings) => void;
  onSave: () => void;
}) {
  const swatch = website.color === "teal" ? "#0d9488" : website.color === "warm" ? "#9a3412" : "#111111";
  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-5">
      <h2 className="text-xs font-black uppercase tracking-widest text-[#0d9488] mb-1">Listing site</h2>
      <p className="text-xs text-gray-500 mb-5">Font, color, and which media the listing site should show. The public page is not generated from here yet.</p>
      <div className="grid sm:grid-cols-3 gap-4">
        <Choice label="Font" value={website.font} options={[["sans", "Sans"], ["serif", "Serif"], ["modern", "Modern"]]} onChange={(font) => onWebsite({ ...website, font: font as PortalWebsiteSettings["font"] })} />
        <Choice label="Color" value={website.color} options={[["ink", "Ink"], ["teal", "Teal"], ["warm", "Warm"]]} onChange={(color) => onWebsite({ ...website, color: color as PortalWebsiteSettings["color"] })} />
        <Choice label="Style" value={website.style} options={[["classic", "Classic"], ["editorial", "Editorial"], ["minimal", "Minimal"]]} onChange={(style) => onWebsite({ ...website, style: style as PortalWebsiteSettings["style"] })} />
      </div>
      <div className="mt-5 rounded-2xl border border-gray-100 p-5" style={{ color: swatch }}>
        <p className={`text-lg font-black ${website.font === "serif" ? "font-serif" : "font-sans"}`}>Sample listing title</p>
        <p className="text-xs uppercase tracking-widest mt-1">{website.style} · {website.color}</p>
      </div>
      <div className="mt-5 grid sm:grid-cols-2 gap-3">
        <Toggle label="Show photos" checked={website.showPhotos} onChange={(showPhotos) => onWebsite({ ...website, showPhotos })} />
        <Toggle label="Show video" checked={website.showVideo} onChange={(showVideo) => onWebsite({ ...website, showVideo })} />
        <Toggle label="Show virtual tours" checked={website.showTours} onChange={(showTours) => onWebsite({ ...website, showTours })} />
        <Toggle label="Show floorplans" checked={website.showFloorplans} onChange={(showFloorplans) => onWebsite({ ...website, showFloorplans })} />
      </div>
      <Button type="button" className="mt-6 bg-black text-white" disabled={saving} onClick={onSave}>Save site style</Button>
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
              <p className="text-sm text-gray-600 mt-2">Total {money(invoice.total)} · Due {money(invoice.amountDue)}</p>
              <Link to={invoice.href} className="inline-block mt-3 text-sm font-bold text-[#0d9488]">View invoice</Link>
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
