import { useState, type FormEvent } from "react";
import { formatApprovalWhen } from "@shared/orderApproval";
import {
  OWNER_EDITOR_NAME_MAX,
  OWNER_EDITOR_NOTE_MAX,
  ownerEditorModeLabel,
  ownerEditorStatusLabel,
  parseOwnerEditorStart,
  type OwnerEditorJob,
  type OwnerEditorMode,
  type OwnerEditorStart,
} from "@shared/ownerEditor";

const SANS = { fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif", fontStyle: "normal" as const };

export function AiconEditor({
  projects,
  error,
  submitting,
  showLatest = false,
  onStart,
}: {
  projects: OwnerEditorJob[];
  error: string | null;
  submitting: boolean;
  showLatest?: boolean;
  onStart?: (input: OwnerEditorStart) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<OwnerEditorMode>("render");
  const [localError, setLocalError] = useState<string | null>(null);
  const shownError = localError || error;
  const latest = showLatest ? projects[0] : undefined;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseOwnerEditorStart({ name, mode, note });
    if (!parsed.ok) {
      setLocalError(parsed.error);
      return;
    }
    setLocalError(null);
    const saved = await onStart?.(parsed.value);
    if (saved) {
      setName("");
      setNote("");
    }
  }

  return (
    <section data-aicon-editor className="rounded-[28px] border border-[#e8c872]/35 bg-[#102844] p-5" style={SANS}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#e8c872]">aICON</p>
      <h2 className="mt-1 text-2xl font-semibold leading-tight text-[#f7f1e4]" style={SANS}>
        Editor
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#d5deea]" style={SANS}>
        This keeps running if you leave the page. My Projects shows the status when you come back.
      </p>
      <form onSubmit={(event) => void submit(event)} className="mt-4">
        <label htmlFor="aicon-project-name" className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9fb0c7]">
          Project name
        </label>
        <input
          id="aicon-project-name"
          name="project"
          value={name}
          maxLength={OWNER_EDITOR_NAME_MAX}
          onChange={(event) => {
            setName(event.target.value);
            if (localError) setLocalError(null);
          }}
          placeholder="Lake house twilight"
          className="mt-2 w-full rounded-2xl border border-[#e8c872]/30 bg-[#071422] px-3 py-3 text-sm text-[#f7f1e4] outline-none"
          style={SANS}
        />
        <fieldset className="mt-4">
          <legend className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9fb0c7]">Job</legend>
          <div className="mt-2 flex gap-2">
            {(["render", "process"] as const).map((entry) => (
              <label
                key={entry}
                className={`inline-flex min-h-11 cursor-pointer items-center rounded-full px-4 text-sm font-semibold ${
                  mode === entry ? "bg-[#e8c872] text-[#071422]" : "border border-[#e8c872]/40 text-[#f7f1e4]"
                }`}
                style={SANS}
              >
                <input
                  type="radio"
                  name="aicon-mode"
                  value={entry}
                  checked={mode === entry}
                  onChange={() => setMode(entry)}
                  className="sr-only"
                />
                {ownerEditorModeLabel(entry)}
              </label>
            ))}
          </div>
        </fieldset>
        <label htmlFor="aicon-note" className="mt-4 block text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9fb0c7]">
          Note
        </label>
        <textarea
          id="aicon-note"
          name="note"
          value={note}
          maxLength={OWNER_EDITOR_NOTE_MAX}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Optional"
          className="mt-2 min-h-20 w-full resize-y rounded-2xl border border-[#e8c872]/30 bg-[#071422] px-3 py-3 text-sm text-[#f7f1e4] outline-none"
          style={SANS}
        />
        <div className="mt-3 flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-full bg-[#e8c872] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#071422] disabled:opacity-60"
            style={SANS}
          >
            {submitting ? "Starting" : "Start"}
          </button>
        </div>
      </form>
      {shownError ? (
        <p role="alert" className="mt-3 text-sm text-rose-200">
          {shownError}
        </p>
      ) : null}
      {latest ? <ProjectCard job={latest} compact /> : null}
    </section>
  );
}

export function OwnerProjectsPanel({
  projects,
  error,
  submitting,
  onStart,
}: {
  projects: OwnerEditorJob[];
  error: string | null;
  submitting: boolean;
  onStart?: (input: OwnerEditorStart) => Promise<boolean>;
}) {
  return (
    <main className="relative mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 md:px-8 md:py-8" style={SANS}>
      <MyProjectsTracker projects={projects} />
      <AiconEditor projects={projects} error={error} submitting={submitting} onStart={onStart} />
    </main>
  );
}

export function MyProjectsTracker({ projects }: { projects: OwnerEditorJob[] }) {
  return (
    <section data-my-projects className="rounded-[28px] border border-[#e8c872]/35 bg-[#102844] p-5" style={SANS}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#e8c872]">Tracker</p>
      <h2 className="mt-1 text-2xl font-semibold leading-tight text-[#f7f1e4]" style={SANS}>
        My Projects
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-[#d5deea]" style={SANS}>
        Status, progress, and results for editor jobs.
      </p>
      {projects.length === 0 ? (
        <p className="mt-4 text-sm text-[#9fb0c7]">No projects yet</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {projects.map((job) => (
            <li key={job.id}>
              <ProjectCard job={job} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ProjectCard({ job, compact = false }: { job: OwnerEditorJob; compact?: boolean }) {
  return (
    <article
      data-owner-project={job.id}
      data-project-status={job.status}
      className="mt-4 rounded-2xl bg-[#071422] p-4"
      style={SANS}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-[#f7f1e4]" style={SANS}>{job.name}</h3>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#9fb0c7]">
            {ownerEditorModeLabel(job.mode)} · {formatApprovalWhen(job.createdAt)}
          </p>
        </div>
        <p className="inline-flex min-h-8 w-fit items-center rounded-full border border-[#e8c872]/40 px-3 text-xs font-semibold text-[#f4e2b0]">
          {ownerEditorStatusLabel(job)} · {job.progress}%
        </p>
      </div>
      {job.note ? <p className="mt-2 text-sm text-[#d5deea]">{job.note}</p> : null}
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        aria-label={`${job.name} progress`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={job.progress}
      >
        <div className="h-full rounded-full bg-[#e8c872]" style={{ width: `${job.progress}%` }} />
      </div>
      <p className="mt-2 text-xs text-[#9fb0c7]">{job.stage}</p>
      {job.error ? (
        <p role="alert" className="mt-2 text-sm text-rose-200">
          {job.error}
        </p>
      ) : null}
      {!compact && job.result ? (
        <div className="mt-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#e8c872]">Result</p>
          <p className="mt-1 text-sm font-semibold text-[#f7f1e4]">{job.result.summary}</p>
          <p className="mt-1 text-sm text-[#d5deea]">{job.result.detail}</p>
          <img src={job.result.imageDataUrl} alt={`${job.name} result`} className="mt-3 w-full rounded-2xl" />
        </div>
      ) : null}
    </article>
  );
}
