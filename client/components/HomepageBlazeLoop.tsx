import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BLAZE_HASHTAG,
  BLAZE_MARK_ALT,
  BLAZE_MARK_SRC,
  HOMEPAGE_BLAZE_LOOP,
  blazeAdvance,
  endCardHoldMs,
  playableBlazeSlots,
  type BlazePhase,
  type HomepageBlazeSlot,
} from "@shared/homepageBlazeLoop";

type Props = {
  slots?: readonly HomepageBlazeSlot[];
};

function BurnIn({ slot, onBlack }: { slot: HomepageBlazeSlot; onBlack: boolean }) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 flex flex-col items-center px-6 text-center text-white ${
        onBlack ? "justify-center bg-black" : "justify-end pb-14"
      }`}
    >
      {slot.showMark && (
        <img src={BLAZE_MARK_SRC} alt={BLAZE_MARK_ALT} className="mb-3 h-8 w-auto" />
      )}
      {slot.showMark && (
        <p className="mb-3 text-[11px] font-black tracking-[0.35em]">{BLAZE_HASHTAG}</p>
      )}
      <p className="max-w-[16rem] text-3xl font-black leading-tight tracking-tight drop-shadow-[0_2px_16px_rgba(0,0,0,0.9)]">
        {slot.burnIn}
      </p>
    </div>
  );
}

/**
 * Muted 9:16 hard-cut loop. Renders nothing while slots are on hold or src is
 * empty, so Drive drafts cannot land on the homepage as a broken or live frame.
 */
export default function HomepageBlazeLoop({ slots = HOMEPAGE_BLAZE_LOOP }: Props) {
  const playable = useMemo(() => playableBlazeSlots(slots), [slots]);
  const sequenceKey = playable.map((slot) => `${slot.id}:${slot.src}`).join("|");
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<BlazePhase>("clip");
  const [cut, setCut] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const advanced = useRef(false);
  const playableRef = useRef(playable);
  const indexRef = useRef(0);
  const phaseRef = useRef<BlazePhase>("clip");

  playableRef.current = playable;
  const safeIndex = playable.length === 0 ? 0 : index % playable.length;
  indexRef.current = safeIndex;
  phaseRef.current = phase;

  const advance = useCallback(() => {
    if (advanced.current) return;
    advanced.current = true;
    const current = playableRef.current;
    if (current.length === 0) return;
    const i = indexRef.current % current.length;
    const next = blazeAdvance(current, i, phaseRef.current);
    setIndex(next.index);
    setPhase(next.phase);
    setCut((value) => value + 1);
  }, []);

  useEffect(() => {
    advanced.current = false;
    const current = playableRef.current;
    if (current.length === 0) return;
    const i = indexRef.current % current.length;
    const slot = current[i];
    const phaseNow = phaseRef.current;

    if (phaseNow === "endcard") {
      const timer = window.setTimeout(() => advance(), endCardHoldMs(slot));
      return () => window.clearTimeout(timer);
    }

    const video = videoRef.current;
    const kick = () => {
      if (!video) return;
      try {
        video.currentTime = 0;
      } catch {
        /* The element can reject a seek before metadata arrives. */
      }
      void video.play().catch(() => {
        /* Autoplay can be blocked. The duration timer still hard-cuts forward. */
      });
    };
    if (video) {
      if (video.readyState >= 1) kick();
      else video.addEventListener("loadedmetadata", kick, { once: true });
    }

    const timer = window.setTimeout(() => advance(), slot.durationMs);
    return () => {
      window.clearTimeout(timer);
      if (video) video.removeEventListener("loadedmetadata", kick);
    };
  }, [advance, cut, sequenceKey]);

  if (playable.length === 0) return null;

  const slot = playable[safeIndex];
  const showClipBurnIn = phase === "clip" && slot.overlayBurnIn;

  return (
    <section className="bg-black px-4 pb-16" aria-label="Iconic reel" data-testid="homepage-blaze-loop">
      <div className="mx-auto w-full max-w-[320px]">
        <div
          className="relative aspect-[9/16] overflow-hidden rounded-[1.75rem] border border-white/10 bg-black shadow-2xl"
          data-phase={phase}
          data-slot={slot.id}
        >
          {phase === "clip" && (
            <video
              key={`${slot.id}-${cut}`}
              ref={videoRef}
              src={slot.src}
              className="h-full w-full object-cover"
              autoPlay
              muted
              playsInline
              preload="auto"
              aria-label={slot.alt}
              onEnded={advance}
              onError={advance}
            />
          )}
          {showClipBurnIn && <BurnIn slot={slot} onBlack={false} />}
          {phase === "endcard" && <BurnIn slot={slot} onBlack />}
        </div>
      </div>
    </section>
  );
}
