import { Link } from "react-router-dom";
import { personHref, type PersonKind } from "@shared/peopleProfiles";

/**
 * A person's name as a chip that opens their profile.
 * Names with no record stay text so the page still reads cleanly.
 */
export function PersonChip({
  name,
  kind,
  sourceId,
  audience = "admin",
  tone = "light",
  testId,
  className = "",
}: {
  name: string;
  kind?: PersonKind | null;
  sourceId?: string | null;
  audience?: "admin" | "portal";
  tone?: "light" | "dark";
  testId?: string;
  className?: string;
}) {
  const label = name.trim() || "Unassigned";
  const linked = Boolean(kind && sourceId && label !== "Unassigned");
  const toneClass = tone === "dark"
    ? "bg-white/10 text-white hover:bg-white/20"
    : "bg-slate-100 text-slate-700 hover:bg-teal-50 hover:text-[#0d9488]";
  const classes = `inline-flex max-w-full items-center truncate rounded-full px-2 py-0.5 align-middle font-semibold ${linked ? toneClass : tone === "dark" ? "bg-white/10 text-white" : "bg-slate-100 text-slate-600"} ${className}`;
  if (!linked || !kind || !sourceId) {
    return <span data-testid={testId} className={classes}>{label}</span>;
  }
  return (
    <Link
      to={personHref(kind, sourceId, audience)}
      data-testid={testId}
      className={classes}
      onClick={(event) => event.stopPropagation()}
    >
      {label}
    </Link>
  );
}
