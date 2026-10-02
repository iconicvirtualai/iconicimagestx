/**
 * Homepage blaze reel — muted autoplay, hard-cut, loops forever.
 *
 * Sam green-lit these finals (2026-10-02). Order:
 *   1) BUILT. v2          public/media/blaze/01_BUILT_v2.mp4
 *   2) US. v3             public/media/blaze/02_US_v3.mp4
 *   3) Ten years. v2      public/media/blaze/03_TEN_YEARS_v2.mp4
 *
 * Picture: 1080×1920, instrumental bed, almost wordless, brand-safe.
 * Burn-ins are in the files, so the player does not paint a second line.
 * The closer file already holds black for ~1.4s (about 7.2s–8.6s) with the
 * Iconic mark, #BEICONIC, and "Ten years. Still Iconic." The player does not
 * add another end card on top of that.
 *
 * `durationMs` is a stall watchdog above the authored length. The hard cut
 * follows each file's own end so the closer's black hold plays through.
 */

/** Watchdog above the ~10.7s finals so the authored ending is not clipped. */
export const BLAZE_SLOT_DURATION_MS = 12_000;

/**
 * Black hold already inside 03_TEN_YEARS_v2.mp4, about 7.2s–8.6s.
 * Player `endCardHoldMs` stays 0 so that hold is not doubled.
 */
export const BLAZE_CLOSER_FILE_HOLD_MS = 1_370;

export const BLAZE_FRAME = { width: 1080, height: 1920 } as const;

export const BLAZE_TEMPO_BPM = 155;

export const BLAZE_MARK_SRC = "/media/logos/logo-white-large.png";

export const BLAZE_MARK_ALT = "Iconic";

export const BLAZE_HASHTAG = "#BEICONIC";

export type BlazeSlotId = "BUILT" | "US" | "TEN_YEARS";

export type BlazePhase = "clip" | "endcard";

/** Hold keeps the slot off the homepage. "final" is the only playable state. */
export type BlazeSlotApproval = "hold-not-final" | "final";

export interface HomepageBlazeSlot {
  id: BlazeSlotId;
  /** Playback order. Lower plays first. */
  order: 1 | 2 | 3;
  /** On-screen line. Brand-safe: no agent names, no street or address. */
  burnIn: string;
  /** Accessible name for the clip. Same brand-safe rule as `burnIn`. */
  alt: string;
  durationMs: number;
  /**
   * "final" plays on the homepage. "hold-not-final" skips the slot.
   */
  approval: BlazeSlotApproval;
  /** Public MP4 path or HTTPS URL. Drive hosts are refused. */
  src: string;
  /** Ms of black after the clip. 0 skips the end card and hard-cuts. */
  endCardHoldMs: number;
  /** Iconic mark and #BEICONIC. Closer beat only, once in the loop. */
  showMark: boolean;
  /**
   * Paint `burnIn` over the picture. Turn off when the MP4 already includes it.
   * The closer end card still draws the line so the hold can be read.
   */
  overlayBurnIn: boolean;
}

export const HOMEPAGE_BLAZE_LOOP: readonly HomepageBlazeSlot[] = [
  {
    id: "BUILT",
    order: 1,
    burnIn: "BUILT.",
    alt: "BUILT.",
    durationMs: BLAZE_SLOT_DURATION_MS,
    approval: "final",
    src: "/media/blaze/01_BUILT_v2.mp4",
    endCardHoldMs: 0,
    showMark: false,
    overlayBurnIn: false,
  },
  {
    id: "US",
    order: 2,
    burnIn: "US.",
    alt: "US.",
    durationMs: BLAZE_SLOT_DURATION_MS,
    approval: "final",
    src: "/media/blaze/02_US_v3.mp4",
    endCardHoldMs: 0,
    showMark: false,
    overlayBurnIn: false,
  },
  {
    id: "TEN_YEARS",
    order: 3,
    burnIn: "Ten years. Still Iconic.",
    alt: "Ten years. Still Iconic.",
    durationMs: BLAZE_SLOT_DURATION_MS,
    approval: "final",
    src: "/media/blaze/03_TEN_YEARS_v2.mp4",
    endCardHoldMs: 0,
    showMark: true,
    overlayBurnIn: false,
  },
];

const UNSAFE_BLAZE_COPY =
  /\b(agents?|street|avenue|ave\.?|boulevard|blvd\.?|lane|road|rd\.?)\b/i;

const DRAFT_MEDIA_HOST = /drive\.google\.com|docs\.google\.com|googleusercontent\.com/i;

export function blazeSlotSrc(src: string): string {
  return src.trim();
}

/** Drive drafts and held slots never count as a homepage source. */
export function blazeSlotIsPlayable(slot: HomepageBlazeSlot): boolean {
  if (slot.approval !== "final") return false;
  const src = blazeSlotSrc(slot.src);
  if (!src) return false;
  if (DRAFT_MEDIA_HOST.test(src)) return false;
  return true;
}

export function playableBlazeSlots(
  slots: readonly HomepageBlazeSlot[] = HOMEPAGE_BLAZE_LOOP,
): HomepageBlazeSlot[] {
  return slots
    .filter(blazeSlotIsPlayable)
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((slot) => ({ ...slot, src: blazeSlotSrc(slot.src) }));
}

export function blazeLoopShouldRender(
  slots: readonly HomepageBlazeSlot[] = HOMEPAGE_BLAZE_LOOP,
): boolean {
  return playableBlazeSlots(slots).length > 0;
}

export function endCardHoldMs(slot: HomepageBlazeSlot): number {
  return slot.endCardHoldMs > 0 ? slot.endCardHoldMs : 0;
}

/** Next clip in locked order. Wraps forever. Hard cut — no crossfade. */
export function nextBlazeIndex(current: number, count: number): number {
  if (count <= 0) return 0;
  const i = ((current % count) + count) % count;
  return (i + 1) % count;
}

export function blazeAdvance(
  slots: readonly HomepageBlazeSlot[],
  index: number,
  phase: BlazePhase,
): { index: number; phase: BlazePhase } {
  if (slots.length === 0) return { index: 0, phase: "clip" };
  const i = ((index % slots.length) + slots.length) % slots.length;
  const slot = slots[i];
  if (phase === "clip" && endCardHoldMs(slot) > 0) {
    return { index: i, phase: "endcard" };
  }
  return { index: nextBlazeIndex(i, slots.length), phase: "clip" };
}

/** Strings the homepage is allowed to show for this loop. */
export function blazePublicCopy(
  slots: readonly HomepageBlazeSlot[] = HOMEPAGE_BLAZE_LOOP,
): string[] {
  const lines = [BLAZE_MARK_ALT];
  for (const slot of slots) {
    lines.push(slot.burnIn, slot.alt);
    if (slot.showMark) lines.push(BLAZE_HASHTAG);
  }
  return lines;
}

export function blazeCopyIsBrandSafe(text: string): boolean {
  if (UNSAFE_BLAZE_COPY.test(text)) return false;
  if (/\d{1,5}\s+[A-Za-z]/.test(text)) return false;
  return true;
}
