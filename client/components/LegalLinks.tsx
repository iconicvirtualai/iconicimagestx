import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export function LegalLinks({
  className,
  linkClassName,
}: {
  className?: string;
  linkClassName?: string;
}) {
  return (
    <nav aria-label="Legal" className={cn("flex flex-wrap items-center gap-x-6 gap-y-2", className)}>
      <Link to="/privacy" className={linkClassName}>
        Privacy Policy
      </Link>
      <Link to="/terms" className={linkClassName}>
        Terms and Conditions
      </Link>
    </nav>
  );
}
