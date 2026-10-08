import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Calendar, Camera, MapPin, Upload } from "lucide-react";
import {
  filterPhotographerJobs,
  photographerEmptyCopy,
  photographerPayEstimate,
  photographerSummary,
  photographerUploadHref,
  type PhotographerJobCard,
  type PhotographerTab,
  type PhotographerTone,
} from "@shared/photographerPortal";
import { ICONIC_POLISH_TREATMENTS } from "@shared/orderEditPlan";

const TONE_CLASS: Record<PhotographerTone, string> = {
  action: "bg-yellow-100 text-yellow-800",
  review: "bg-teal-100 text-teal-800",
  wait: "bg-blue-100 text-blue-800",
  shoot: "bg-green-100 text-green-800",
  done: "bg-gray-100 text-gray-600",
  closed: "bg-gray-100 text-gray-400",
};

const TABS: { id: PhotographerTab; label: string }[] = [
  { id: "next", label: "Next" },
  { id: "today", label: "Today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "all", label: "All jobs" },
  { id: "pay", label: "Pay estimate" },
];

const labelCls = "text-[10px] font-black uppercase tracking-widest text-gray-400";
const primaryBtn = "inline-flex items-center gap-1.5 rounded-xl bg-[#0d9488] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-[#0f766e] disabled:opacity-40";
const quietBtn = "inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gray-700 hover:bg-gray-50";
const studioBtn = "inline-flex items-center gap-1.5 rounded-xl bg-black px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-zinc-800";

export function PhotographerJobBanner({ job }: { job: PhotographerJobCard }) {
  return (
    <div data-testid="photographer-job-banner" className="rounded-2xl border border-gray-100 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-black">{job.address}</p>
          <p className="text-xs text-gray-500">{job.clientName}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${TONE_CLASS[job.action.tone]}`}>
          {job.action.statusLabel}
        </span>
      </div>
      <p data-testid="photographer-next" className="mt-3 text-sm font-bold text-black">{job.action.detail}</p>
      <p data-testid="photographer-studio" className="mt-1 text-xs text-gray-500">{job.studio.headline}</p>
    </div>
  );
}

export function PhotographerPortal({
  firstName,
  jobs,
  tab,
  onTab,
  loading = false,
  error = "",
  studioNote = "",
  iconicPolish,
  onIconicPolish,
  uploading = false,
  uploadProgress = 0,
  queueNote = "",
  payRate,
  onUpload,
  shareSlot,
}: {
  firstName?: string;
  jobs: PhotographerJobCard[];
  tab: PhotographerTab;
  onTab: (tab: PhotographerTab) => void;
  loading?: boolean;
  error?: string;
  studioNote?: string;
  iconicPolish: boolean;
  onIconicPolish: (value: boolean) => void;
  uploading?: boolean;
  uploadProgress?: number;
  queueNote?: string;
  payRate: number;
  onUpload: (jobId: string) => void;
  shareSlot?: (job: PhotographerJobCard) => ReactNode;
}) {
  const summary = photographerSummary(jobs);
  const visible = filterPhotographerJobs(jobs, tab);
  const estimate = photographerPayEstimate(jobs, payRate);
  const greeting = firstName ? `${firstName}, your assigned shoots are on this page.` : "Your assigned shoots are on this page.";

  return (
    <div data-testid="photographer-portal" className="w-full min-w-0">
      <section className="mb-6 overflow-hidden rounded-2xl bg-black text-white">
        <div className="px-6 py-5">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#5eead4]">Iconic Images</p>
          <h2 className="mt-1 text-lg font-black uppercase tracking-tight">Photographer portal</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-300">
            {greeting} Upload on the job. The line under each address is the next step.
          </p>
        </div>
        <ol className="grid gap-px bg-white/10 sm:grid-cols-3">
          {[
            ["1", "Open the job"],
            ["2", "Upload the shoot"],
            ["3", "Read the status"],
          ].map(([step, text]) => (
            <li key={step} className="bg-black px-6 py-3 text-[10px] font-black uppercase tracking-widest text-gray-300">
              <span className="text-[#5eead4]">{step}</span>
              <span className="mx-2 text-gray-600">·</span>
              {text}
            </li>
          ))}
        </ol>
      </section>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Waiting on you" value={summary.needsYou} onClick={() => onTab("next")} active={tab === "next"} />
        <Stat label="Today" value={summary.today} onClick={() => onTab("today")} active={tab === "today"} />
        <Stat label="Upcoming" value={summary.upcoming} onClick={() => onTab("upcoming")} active={tab === "upcoming"} />
        <Stat label="In Iconic Studio" value={summary.inStudio} />
      </div>

      <div role="tablist" aria-label="Photographer jobs" className="mb-6 flex gap-1 overflow-x-auto rounded-2xl bg-gray-100 p-1">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => onTab(item.id)}
            className={`shrink-0 whitespace-nowrap rounded-xl px-5 py-2 text-[10px] font-black uppercase tracking-widest ${tab === item.id ? "bg-white text-black shadow-sm" : "text-gray-400 hover:text-gray-700"}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="mb-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>
      )}
      {studioNote && (
        <p className="mb-4 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">{studioNote}</p>
      )}

      {uploading && (
        <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-4" data-testid="upload-progress">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-black uppercase tracking-widest">Uploading the shoot</p>
            <p className="text-xs font-black text-[#0d9488]">{uploadProgress}%</p>
          </div>
          <div className="h-2 rounded-full bg-gray-200">
            <div className="h-2 rounded-full bg-[#0d9488] transition-all" style={{ width: `${uploadProgress}%` }} />
          </div>
        </div>
      )}

      {tab !== "pay" && (
        <label className="mb-4 flex items-start gap-3 rounded-2xl border border-gray-100 bg-white p-4">
          <input
            type="checkbox"
            className="mt-1"
            checked={iconicPolish}
            onChange={(event) => onIconicPolish(event.target.checked)}
          />
          <span>
            <span className="block text-xs font-black uppercase tracking-widest">Iconic Polish</span>
            <span className="mt-1 block text-xs text-gray-500">
              Applies to the next upload. It adds the full Iconic Polish on top of the order: {ICONIC_POLISH_TREATMENTS.join("; ")}. It does not add people. Standalone grass replacement is a separate edit. The gallery stays with the office.
            </span>
          </span>
        </label>
      )}

      {queueNote && <p className="mb-4 text-xs font-bold text-gray-600" data-testid="queue-note">{queueNote}</p>}

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#0d9488] border-t-transparent" />
        </div>
      ) : tab === "pay" ? (
        <PayEstimate
          jobs={visible}
          estimate={estimate}
          payRate={payRate}
          hasAnyJobs={jobs.length > 0}
          loadFailed={Boolean(error) && jobs.length === 0}
        />
      ) : visible.length === 0 ? (
        <EmptyState tab={tab} hasAnyJobs={jobs.length > 0} loadFailed={Boolean(error) && jobs.length === 0} />
      ) : (
        <div className="space-y-3">
          {visible.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              iconicPolish={iconicPolish}
              onUpload={onUpload}
              shareSlot={shareSlot}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  onClick,
  active = false,
}: {
  label: string;
  value: number;
  onClick?: () => void;
  active?: boolean;
}) {
  const className = `rounded-2xl border bg-white p-4 text-center shadow-sm ${active ? "border-[#0d9488]" : "border-gray-100"} ${onClick ? "hover:border-[#0d9488]" : ""}`;
  const body = (
    <>
      <p className="text-2xl font-black">{value}</p>
      <p className={labelCls}>{label}</p>
    </>
  );
  if (!onClick) return <div className={className}>{body}</div>;
  return (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  );
}

function EmptyState({
  tab,
  hasAnyJobs,
  loadFailed = false,
}: {
  tab: PhotographerTab;
  hasAnyJobs: boolean;
  loadFailed?: boolean;
}) {
  const message = loadFailed
    ? "Jobs did not load. Refresh this page. The upload button appears on each job once the list is back."
    : photographerEmptyCopy(tab, hasAnyJobs);
  return (
    <div className="py-20 text-center">
      <Calendar className="mx-auto mb-4 h-12 w-12 text-gray-200" />
      <p className="mx-auto max-w-md text-sm font-bold text-gray-500">{message}</p>
    </div>
  );
}

function PayEstimate({
  jobs,
  estimate,
  payRate,
  hasAnyJobs,
  loadFailed = false,
}: {
  jobs: PhotographerJobCard[];
  estimate: { completed: number; amount: number };
  payRate: number;
  hasAnyJobs: boolean;
  loadFailed?: boolean;
}) {
  if (jobs.length === 0) return <EmptyState tab="pay" hasAnyJobs={hasAnyJobs} loadFailed={loadFailed} />;
  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-black p-6 text-white">
        <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-gray-500">Pay estimate</p>
        <p className="text-3xl font-black text-[#5eead4]">${estimate.amount.toLocaleString()}</p>
        <p className="mt-1 text-xs text-gray-400">
          {estimate.completed} past {estimate.completed === 1 ? "shoot" : "shoots"} with photos, at ${payRate} each.
        </p>
      </div>
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h3 className={`${labelCls} mb-4`}>Past shoots</h3>
        <div className="space-y-3">
          {jobs.map((job) => (
            <div key={job.id} className="flex items-center justify-between border-b border-gray-100 py-2 last:border-0">
              <div>
                <p className="text-xs font-bold">{job.address}</p>
                <p className="text-[10px] text-gray-400">{job.dateLabel} · {job.action.statusLabel}</p>
              </div>
              <p className="text-sm font-black">${payRate}</p>
            </div>
          ))}
        </div>
      </div>
      <p className="text-center text-[10px] text-gray-400">
        Pay rates shown are estimates. Actual payouts are calculated by the office based on project scope and completion.
      </p>
    </div>
  );
}

function JobCard({
  job,
  iconicPolish,
  onUpload,
  shareSlot,
}: {
  job: PhotographerJobCard;
  iconicPolish: boolean;
  onUpload: (jobId: string) => void;
  shareSlot?: (job: PhotographerJobCard) => ReactNode;
}) {
  const uploadHref = photographerUploadHref(job.id, iconicPolish);
  return (
    <article data-testid={`job-${job.id}`} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-black text-black">{job.address}</p>
          <p className="text-xs text-gray-500">{job.clientName}</p>
        </div>
        <span data-testid={`status-${job.id}`} className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${TONE_CLASS[job.action.tone]}`}>
          {job.action.statusLabel}
        </span>
      </div>

      <p data-testid={`next-${job.id}`} className="mb-3 text-sm font-bold leading-snug text-black">{job.action.detail}</p>
      <p className="mb-3 text-xs text-gray-500">{job.studio.headline}</p>

      {job.studio.counts.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {job.studio.counts.map((count) => (
            <span key={count.label} className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-gray-600">
              {count.label} {count.value}
            </span>
          ))}
        </div>
      )}

      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Meta label="Shoot" value={job.dateLabel} />
        <Meta label="Time" value={job.timeLabel} />
        <Meta label="Photos" value={String(job.imageCount)} />
        <Meta label="Office status" value={job.officeStatus} />
      </div>
      {job.durationLabel && <p className="mb-3 text-xs text-gray-500">{job.durationLabel}</p>}
      {job.servicesLabel && (
        <div className="mb-3">
          <p className={labelCls}>Services</p>
          <p className="text-xs font-bold">{job.servicesLabel}</p>
        </div>
      )}
      {job.accessInfo && (
        <div className="mb-3 rounded-lg bg-yellow-50 p-2">
          <p className={labelCls}>Access</p>
          <p className="text-xs font-bold">{job.accessInfo}</p>
        </div>
      )}
      {job.notes && (
        <div className="mb-3">
          <p className={labelCls}>Notes</p>
          <p className="text-xs text-gray-600">{job.notes}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {job.action.kind === "upload" && (
          <button type="button" data-testid={`upload-${job.id}`} className={primaryBtn} onClick={() => onUpload(job.id)}>
            <Upload className="h-3.5 w-3.5" /> {job.action.label}
          </button>
        )}
        {job.action.kind === "review" && (
          <Link to={job.studioHref} className={primaryBtn}>
            <Camera className="h-3.5 w-3.5" /> {job.action.label}
          </Link>
        )}
        {job.action.kind === "shoot" && job.mapsHref && (
          <a href={job.mapsHref} target="_blank" rel="noopener noreferrer" className={primaryBtn}>
            <MapPin className="h-3.5 w-3.5" /> {job.action.label}
          </a>
        )}
        {job.action.kind !== "upload" && job.action.kind !== "closed" && (
          <button type="button" className={quietBtn} onClick={() => onUpload(job.id)}>
            <Upload className="h-3.5 w-3.5" /> {job.imageCount > 0 ? "Add photos" : "Upload the shoot"}
          </button>
        )}
        {job.mapsHref && job.action.kind !== "shoot" && (
          <a href={job.mapsHref} target="_blank" rel="noopener noreferrer" className={quietBtn}>
            <MapPin className="h-3.5 w-3.5" /> Directions
          </a>
        )}
        {job.action.kind !== "review" && (
          <Link to={job.studioHref} className={studioBtn}>
            <Camera className="h-3.5 w-3.5" /> Studio
          </Link>
        )}
        <Link to={uploadHref} className={quietBtn}>
          Full uploader
        </Link>
        {shareSlot?.(job)}
      </div>
    </article>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className={labelCls}>{label}</p>
      <p className="text-xs font-bold capitalize">{value}</p>
    </div>
  );
}
