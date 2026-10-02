/**
 * Homepage blaze reel — autoplay loop slots. Structure only.
 *
 * Locked order when a cut is eventually green:
 *   1) BUILT.
 *   2) US.
 *   3) Ten years. Still Iconic.
 *
 * Picture: about 10s each, 1080×1920, hard cuts at ~155 BPM, almost wordless.
 * Brand-safe only: no agent names, no street or address end cards.
 * Final bed is instrumental.
 *
 * HARD HOLD (Sam, 2026-10-02): do not hard-wire or swap any Drive draft or v2
 * MP4 into the homepage. The draft folder is not finals:
 * https://drive.google.com/drive/folders/1RgcroDWX5-oogMQzRCFhaRC2Kf3Upi-V
 *
 * US. is blocked on a brand-safe cut. A camera UI flashes on the Santa/elf
 * couch beat; Edith is cutting that beat. An earlier pass also still needs the
 * non-Iconic camera mark cropped or blurred. BUILT. still needs the short
 * bathroom-mirror beat.
 *
 * Every slot stays `approval: "hold-not-final"` and `src: ""`.
 * The player ignores a slot until approval is "final" and `src` is a non-Drive
 * URL. Drive hosts are refused even if someone flips approval.
 *
 * Swap path once a final is green:
 *   1. Set that slot's `approval` to "final".
 *   2. Set `src` to an HTTPS URL of the 1080×1920 MP4, or to a path under
 *      `public/media/video/blaze/` if the file is hosted with the site.
 *   3. Keep this array in BUILT → US → TEN_YEARS order.
 *   4. If the file already has the line burned in, set `overlayBurnIn` to false.
 *   5. Do not paste Google Drive preview links or commit those binaries.
 *
 * Draft file ids (comments only, never `src`):
 *   BUILT.       1CNneXdlqNm0d2SlrjomAVhtMMsO9O4C-
 *   US.          1UTpe1GIaAXmWp5VEaGnf612gyDwiDQll
 *   TEN_YEARS    1AT6XCrBJgmRC6ly3-MN_YsAK5RLOR1E7
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
   * "hold-not-final" until a cut is green. The homepage will not play the slot
   * while this is a hold, even if `src` is filled in.
   */
  approval: BlazeSlotApproval;
  /**
   * Final MP4 URL. Stay empty on a hold.
   * Draft Drive files stay in the file comment and must not be pasted here.
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
    approval: "hold-not-final",
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
    approval: "hold-not-final",
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
    approval: "hold-not-final",
    src: "",
    endCardHoldMs: BLAZE_END_CARD_HOLD_MS,
    showMark: true,
    overlayBurnIn: true,
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
