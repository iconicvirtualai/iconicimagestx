import { formatUnreadBadge, UNREAD_BADGE_CAP } from "@shared/adminUnread";
import { cn } from "@/lib/utils";

/** Red circle with a white count. Hidden at zero. Caps at 9+ so the circle stays small. */
export function UnreadBadge({
  count,
  cap = UNREAD_BADGE_CAP,
  testId,
  className,
}: {
  count: number;
  cap?: number;
  testId?: string;
  className?: string;
}) {
  const label = formatUnreadBadge(count, cap);
  if (!label) return null;
  return (
    <span
      data-testid={testId}
      aria-label={`${Math.floor(count)} unread`}
      className={cn(
        "inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-black leading-none text-white",
        className,
      )}
    >
      {label}
    </span>
  );
}
