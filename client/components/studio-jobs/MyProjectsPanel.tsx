import { Link } from "react-router-dom";
import {
  canDownloadJob,
  canOpenJob,
  canRetryJob,
  formatJobTime,
  jobStatusLabel,
  MY_PROJECTS_PATH,
  studioProjectEditorHref,
  type StudioProjectJob,
  type StudioProjectRecord,
} from "@shared/studioProjects";

const font = { fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" } as const;

const statusTone: Record<StudioProjectJob["status"], string> = {
  queued: "bg-gray-100 text-gray-600",
  uploading: "bg-sky-50 text-sky-700",
  rendering: "bg-teal-50 text-teal-700",
  done: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
};

export function StudioJobIndicator({ count, tone = "light" }: { count: number; tone?: "light" | "dark" }) {
  const active = count > 0;
  const dark = tone === "dark";
  return (
    <Link
      to={MY_PROJECTS_PATH}
      data-testid="my-projects-indicator"
      aria-label={`${count} active studio ${count === 1 ? "job" : "jobs"}`}
      style={font}
      className={`inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-xs font-semibold ${
        dark
          ? "bg-white/10 text-white hover:bg-white/15"
          : active
            ? "bg-[#0d9488] text-white"
            : "bg-gray-100 text-gray-700"
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${active ? "animate-pulse bg-teal-200" : dark ? "bg-gray-500" : "bg-gray-400"}`} />
      <span>My Projects</span>
      <span className={`min-w-5 rounded-full px-1.5 text-center text-[11px] font-bold ${active && !dark ? "bg-white text-[#0d9488]" : "bg-black/10 text-current"}`}>
        {count}
      </span>
    </Link>
  );
}

export function MyProjectsPanel({
  jobs,
  projects,
  viewerUid,
  now,
  onRetry,
  onDownload,
}: {
  jobs: StudioProjectJob[];
  projects: StudioProjectRecord[];
  viewerUid: string;
  now: number;
  onRetry: (job: StudioProjectJob) => void;
  onDownload: (job: StudioProjectJob) => void;
}) {
  const mine = jobs
    .filter((job) => job.ownerUid === viewerUid)
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const groups = new Map<string, StudioProjectJob[]>();
  for (const job of mine) {
    const list = groups.get(job.projectId) || [];
    list.push(job);
    groups.set(job.projectId, list);
  }
  const titleFor = (projectId: string) => projects.find((project) => project.id === projectId)?.title || "Project";

  return (
    <section data-testid="my-projects-page" style={font} className="mx-auto w-full max-w-5xl font-sans">
      <p className="mb-6 max-w-xl text-sm leading-relaxed text-gray-500">
        Uploads and renders keep going after you leave the editor. Open a project to pick it back up.
      </p>
      {mine.length === 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white px-4 py-10 text-center">
          <p className="text-sm font-semibold text-gray-700">No projects yet</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
            Start an upload, edit, or virtual staging job in the studio. It will show up here with its progress.
          </p>
          <Link
            to="/admin/studio/scratch"
            className="mt-5 inline-flex min-h-11 items-center rounded-full bg-[#0d9488] px-4 text-sm font-semibold text-white"
          >
            Open the editor
          </Link>
        </div>
      )}
      <div className="space-y-8">
        {[...groups.entries()].map(([projectId, projectJobs]) => (
          <div key={projectId}>
            <h2 className="mb-3 text-sm font-semibold text-gray-900">{titleFor(projectId)}</h2>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {projectJobs.map((job) => {
                const open = canOpenJob(job, viewerUid);
                const retry = canRetryJob(job, viewerUid);
                const download = canDownloadJob(job, viewerUid);
                return (
                  <li key={job.id} data-testid={`project-job-${job.id}`} className="flex gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
                    {job.thumbnailDataUrl ? (
                      <img src={job.thumbnailDataUrl} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover sm:h-20 sm:w-20" />
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-[10px] font-semibold uppercase text-gray-400 sm:h-20 sm:w-20">Photo</div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-900">{job.fileName}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusTone[job.status]}`}>
                          {jobStatusLabel(job.status)}
                        </span>
                        <span className="text-xs text-gray-500">{formatJobTime(job.updatedAt, now)}</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
                        <div className="h-full rounded-full bg-[#0d9488]" style={{ width: `${job.progress}%` }} />
                      </div>
                      <p className="mt-1 text-xs text-gray-500">{job.progress}%</p>
                      {job.error && <p className="mt-1 text-xs text-red-600">{job.error}</p>}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {open && (
                          <Link
                            to={studioProjectEditorHref(job.projectId)}
                            className="inline-flex min-h-11 items-center rounded-full bg-black px-3 text-xs font-semibold text-white"
                          >
                            Open
                          </Link>
                        )}
                        {retry && (
                          <button
                            type="button"
                            data-testid={`retry-${job.id}`}
                            onClick={() => onRetry(job)}
                            className="inline-flex min-h-11 items-center rounded-full border border-gray-200 px-3 text-xs font-semibold text-gray-800"
                          >
                            Retry
                          </button>
                        )}
                        {download && (
                          <button
                            type="button"
                            data-testid={`download-${job.id}`}
                            onClick={() => onDownload(job)}
                            className="inline-flex min-h-11 items-center rounded-full border border-gray-200 px-3 text-xs font-semibold text-gray-800"
                          >
                            Download
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
