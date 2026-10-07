import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import {
  STUDIO_MARKETING_KITS,
  STUDIO_PROJECT_PATHWAYS,
  STUDIO_SECTIONS,
  type StudioSectionId,
} from "@shared/studioSections";

const tabCls = "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all";

export function StudioSectionNav({ active }: { active: StudioSectionId | null }) {
  return (
    <div className="mb-8 flex w-fit flex-wrap gap-2 rounded-2xl bg-gray-100 p-1" role="tablist" aria-label="Studio sections">
      {STUDIO_SECTIONS.map((section) => {
        const selected = section.id === active;
        return (
          <Link
            key={section.id}
            to={section.href}
            role="tab"
            aria-selected={selected}
            data-testid={`studio-tab-${section.id}`}
            className={`${tabCls} ${selected ? "bg-white text-black shadow-sm" : "text-gray-400 hover:text-gray-600"}`}
          >
            {section.label}
          </Link>
        );
      })}
    </div>
  );
}

export function StudioHomePanel() {
  return (
    <div data-testid="studio-home">
      <p className="mb-8 text-xs text-gray-400">Photo editing, client projects, and marketing kits.</p>
      <StudioSectionNav active={null} />
      <div className="grid gap-4 md:grid-cols-3">
        {STUDIO_SECTIONS.map((section) => (
          <Link
            key={section.id}
            to={section.href}
            data-testid={`studio-section-${section.id}`}
            className="group flex flex-col rounded-[2rem] border border-gray-100 bg-white p-6 shadow-sm transition-colors hover:border-[#0d9488]/40"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-sm font-black uppercase tracking-tight text-black">{section.label}</h2>
              <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 transition-colors group-hover:text-[#0d9488]" />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-gray-500">{section.detail}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function StudioProjectsPanel() {
  return (
    <div data-testid="studio-projects">
      <p className="mb-8 max-w-2xl text-xs text-gray-400">
        Jobs after approve and submit. Galleries and the download hold stay on the screens that already run them.
        A photographer upload still opens that job in Iconic Studio.
      </p>
      <StudioSectionNav active="projects" />
      <div className="grid gap-4 md:grid-cols-2">
        {STUDIO_PROJECT_PATHWAYS.map((pathway) => (
          <Link
            key={pathway.id}
            to={pathway.href}
            data-testid={`studio-pathway-${pathway.id}`}
            className="group flex items-start justify-between gap-4 rounded-[2rem] border border-gray-100 bg-white p-6 shadow-sm transition-colors hover:border-[#0d9488]/40"
          >
            <div>
              <h2 className="text-sm font-black uppercase tracking-tight text-black">{pathway.label}</h2>
              <p className="mt-3 text-xs leading-relaxed text-gray-500">{pathway.detail}</p>
            </div>
            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-gray-300 transition-colors group-hover:text-[#0d9488]" />
          </Link>
        ))}
      </div>
    </div>
  );
}

export function StudioMarketingPanel() {
  return (
    <div data-testid="studio-marketing">
      <p className="mb-8 max-w-2xl text-xs text-gray-400">
        Social graphics, listing-site packs, and extras.
      </p>
      <StudioSectionNav active="marketing" />
      <div className="mb-4 rounded-2xl border border-gray-100 bg-white px-6 py-10 text-center">
        <p className="text-sm font-bold uppercase tracking-widest text-gray-400">Marketing kits are not wired yet</p>
        <p className="mt-2 text-xs text-gray-400">These kits will live in this section. Nothing here edits a photo.</p>
      </div>
      <div className="grid gap-3">
        {STUDIO_MARKETING_KITS.map((kit) => (
          <article
            key={kit.id}
            data-testid={`studio-kit-${kit.id}`}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white px-5 py-4 shadow-sm"
          >
            <div>
              <h2 className="text-sm font-black text-black">{kit.label}</h2>
              <p className="mt-1 text-xs text-gray-500">{kit.detail}</p>
            </div>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-gray-500">
              Not wired
            </span>
          </article>
        ))}
      </div>
    </div>
  );
}
