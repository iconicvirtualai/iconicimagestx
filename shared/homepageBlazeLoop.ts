/**
 * Homepage blaze reel — autoplay loop slots.
 *
 * Locked order (Sasha, series still pending a green light):
 *   1) BUILT.
 *   2) US.
 *   3) Ten years. Still Iconic.
 *
 * Picture: about 10s each, 1080×1920, hard cuts at ~155 BPM, almost wordless.
 * Brand-safe only: no agent names, no street or address end cards.
 * Final bed is instrumental. Do not hard-wire a draft.
 *
 * Swap path once finals are approved:
 *   1. Set `src` to an HTTPS URL of the 1080×1920 MP4, or to a path under
 *      `public/media/video/blaze/` if the file is hosted with the site.
 *   2. Keep this array in BUILT → US → TEN_YEARS order.
 *   3. If the file already has the line burned in, set `overlayBurnIn` to false.
 *   4. Leave Google Drive preview links out. Drafts are not finals and will
 *      not play in a video element. Do not commit those binaries.
 *
 * Draft folder (not production) — comments only, never `src`:
 *   BUILT.       Drive file 1CNneXdlqNm0d2SlrjomAVhtMMsO9O4C-
 *                still needs the short bathroom-mirror beat.
 *   US.          Drive file 1UTpe1GIaAXmWp5VEaGnf612gyDwiDQll
 *                still needs the non-Iconic camera mark cropped or blurred.
 *   TEN_YEARS    Drive file 1AT6XCrBJgmRC6ly3-MN_YsAK5RLOR1E7
 */

export const BLAZE_SLOT_DURATION_MS = 10_000;

/** Black hold on the closer so the line can be read on homepage autoplay. */
export const BLAZE_END_CARD_HOLD_MS = 1_350;

export const BLAZE_FRAME = { width: 1080, height: 1920 } as const;

export const BLAZE_TEMPO_BPM = 155;

export const BLAZE_MARK_SRC = "/media/logos/logo-white-large.png";

export const BLAZE_MARK_ALT = "Iconic";

export const BLAZE_HASHTAG = "#BEICONIC";

export type BlazeSlotId = "BUILT" | "US" | "TEN_YEARS";

export type BlazePhase = "clip" | "endcard";

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
   * Final MP4 URL. Empty until a final is approved.
   * Draft Drive files stay commented above and must not be pasted here.
   */
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
    src: "",
    endCardHoldMs: 0,
    showMark: false,
    overlayBurnIn: true,
  },
  {
    id: "US",
    order: 2,
    burnIn: "US.",
    alt: "US.",
    durationMs: BLAZE_SLOT_DURATION_MS,
    src: "",
    endCardHoldMs: 0,
    showMark: false,
    overlayBurnIn: true,
  },
  {
    id: "TEN_YEARS",
    order: 3,
    burnIn: "Ten years. Still Iconic.",
    alt: "Ten years. Still Iconic.",
    durationMs: BLAZE_SLOT_DURATION_MS,
    src: "",
    endCardHoldMs: BLAZE_END_CARD_HOLD_MS,
    showMark: true,
    overlayBurnIn: true,
  },
];

const UNSAFE_BLAZE_COPY =
  /\b(agents?|street|avenue|ave\.?|boulevard|blvd\.?|lane|road|rd\.?)\b/i;

export function blazeSlotSrc(src: string): string {
  return src.trim();
}

export function playableBlazeSlots(
  slots: readonly HomepageBlazeSlot[] = HOMEPAGE_BLAZE_LOOP,
): HomepageBlazeSlot[] {
  return slots
    .filter((slot) => blazeSlotSrc(slot.src).length > 0)
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
