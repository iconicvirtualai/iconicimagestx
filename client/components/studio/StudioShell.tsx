import { Link } from "react-router-dom";
import { STUDIO_PROJECT_PATHWAYS } from "@shared/studioSections";

/** Delivery and client projects, kept inside Studio after the card landing was retired. */
export function StudioDeskLinks({ tone = "light" }: { tone?: "light" | "dark" }) {
  const dark = tone === "dark";
  return (
    <nav data-testid="studio-desk-links" aria-label="Studio links" className="flex flex-wrap gap-2">
      {STUDIO_PROJECT_PATHWAYS.map((pathway) => (
        <Link
          key={pathway.id}
          to={pathway.href}
          data-testid={`studio-pathway-${pathway.id}`}
          className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-widest ${dark ? "border border-white/15 text-gray-200 hover:text-white" : "border border-gray-200 bg-white text-gray-600 hover:text-black"}`}
        >
          {pathway.label}
        </Link>
      ))}
    </nav>
  );
}
