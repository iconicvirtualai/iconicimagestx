import { useEffect, useRef, useState } from "react";
import type { ListingSiteModel, ListingSiteSectionId } from "@shared/listingSite";
import {
  FilmPoster,
  FloorplanBoard,
  Headshot,
  LazyPhoto,
  LeadForm,
  LegalLine,
  MatterportPoster,
  PLAN_LIST,
  SampleNote,
  useReducedMotion,
} from "./pieces";
import { licenseLabel } from "@shared/listingSite";

const LABELS: Record<ListingSiteSectionId, string> = {
  hero: "Cover",
  collage: "The Fan",
  video: "Film",
  matterport: "3D",
  floorplan: "Plan",
  lead: "Let's talk",
  agent: "Postcard",
};

export function StoriesDeck({ model }: { model: ListingSiteModel }) {
  const reduced = useReducedMotion();
  const sections = model.sections;
  const [index, setIndex] = useState(0);
  const [fan, setFan] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [planRoom, setPlanRoom] = useState("great");
  const [zoom, setZoom] = useState(1);
  const deckRef = useRef<HTMLDivElement | null>(null);
  const startX = useRef(0);
  const storageKey = `iconic-stories:${model.address}`;

  useEffect(() => {
    const saved = Number(window.sessionStorage.getItem(storageKey));
    if (Number.isFinite(saved) && saved >= 0 && saved < sections.length) setIndex(saved);
  }, [storageKey, sections.length]);

  useEffect(() => {
    window.sessionStorage.setItem(storageKey, String(index));
  }, [index, storageKey]);

  function go(next: number) {
    const clamped = Math.max(0, Math.min(sections.length - 1, next));
    setIndex(clamped);
    const deck = deckRef.current;
    const card = deck?.querySelectorAll<HTMLElement>("[data-card]")[clamped];
    if (!deck || !card) return;
    const reduceNow = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (window.innerWidth < 960) {
      deck.scrollTo({ left: card.offsetLeft, behavior: reduceNow ? "auto" : "smooth" });
    }
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (event.key === "ArrowRight") go(index + 1);
      if (event.key === "ArrowLeft") go(index - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, sections.length]);

  const active = sections[index] || sections[0];

  return (
    <article className="ls ls-stories" data-testid="listing-site" data-template="stories-deck">
      <div className="ls-stories-desktop">
        <div className="ls-stories-intro">
          <p className="ls-kicker">Stories deck</p>
          <h1 className="ls-display">Swipe the house.</h1>
          <p>Seven cards, start to finish. Built for buyers arriving from Instagram and TikTok.</p>
          <ol>
            {sections.map((id, cardIndex) => (
              <li key={id} className={cardIndex === index ? "on" : ""}>
                <button type="button" onClick={() => go(cardIndex)}>
                  <span>{String(cardIndex + 1).padStart(2, "0")}</span>
                  {LABELS[id]}
                  {cardIndex === index ? <em>Now</em> : null}
                </button>
              </li>
            ))}
          </ol>
          <p className="ls-keyhint"><button type="button" onClick={() => go(index - 1)} aria-label="Previous card">←</button><button type="button" onClick={() => go(index + 1)} aria-label="Next card">→</button> Arrow keys or swipe</p>
        </div>
      </div>

      <div
        className="ls-deck"
        ref={deckRef}
        onTouchStart={(event) => { startX.current = event.changedTouches[0].clientX; }}
        onTouchEnd={(event) => {
          const dx = event.changedTouches[0].clientX - startX.current;
          if (dx < -48) go(index + 1);
          if (dx > 48) go(index - 1);
        }}
      >
        {sections.map((id, cardIndex) => (
          <div key={id} className={`ls-card-slot ${cardIndex === index ? "on" : ""}`} data-card={id}>
            <StoryCard
              model={model}
              id={id}
              index={cardIndex}
              total={sections.length}
              fan={fan}
              onFan={setFan}
              flipped={flipped}
              onFlip={() => setFlipped((value) => !value)}
              planRoom={planRoom}
              onPlan={setPlanRoom}
              zoom={zoom}
              onZoom={setZoom}
              reduced={reduced}
            />
          </div>
        ))}
      </div>

      <section className="ls-glance">
        <p className="ls-kicker">See all</p>
        <h2 className="ls-display">Every card, at a glance.</h2>
        <div className="ls-glance-grid">
          {sections.map((id, cardIndex) => (
            <button key={id} type="button" onClick={() => go(cardIndex)}>
              <span>{String(cardIndex + 1).padStart(2, "0")}</span>
              {LABELS[id]}
            </button>
          ))}
        </div>
      </section>

      {sections.includes("agent") ? (
        <section className="ls-postcard-show" id="section-agent-desktop">
          <p className="ls-kicker">Card {String(sections.length).padStart(2, "0")} · postcard flip</p>
          <h2 className="ls-display">Your agent, on the back.</h2>
          <div className={`ls-flip ${flipped ? "is-flipped" : ""}`}>
            <div className="ls-flip-inner">
              <div className="ls-face ls-post-front" aria-hidden={flipped}>
                {model.closingPhoto ? <LazyPhoto src={model.closingPhoto.url} alt="" /> : null}
                <div>
                  <p className="ls-kicker">Greetings from</p>
                  <p className="ls-display">{model.address}</p>
                </div>
              </div>
              <div className="ls-face ls-post-back" aria-hidden={!flipped}>
                <PostcardBack model={model} />
              </div>
            </div>
          </div>
          <button type="button" className="ls-flip-btn" onClick={() => setFlipped((value) => !value)}>
            {flipped ? "Flip to the front" : "Flip the card"}
          </button>
        </section>
      ) : null}
      <SampleNote show={model.sample} />
    </article>
  );
}

function StoryCard({
  model,
  id,
  index,
  total,
  fan,
  onFan,
  flipped,
  onFlip,
  planRoom,
  onPlan,
  zoom,
  onZoom,
  reduced,
}: {
  model: ListingSiteModel;
  id: ListingSiteSectionId;
  index: number;
  total: number;
  fan: number;
  onFan: (index: number) => void;
  flipped: boolean;
  onFlip: () => void;
  planRoom: string;
  onPlan: (id: string) => void;
  zoom: number;
  onZoom: (zoom: number) => void;
  reduced: boolean;
}) {
  return (
    <div className={`ls-card ls-card-${id}`} data-section={id} id={`section-${id}`}>
      <div className="ls-prog" aria-hidden="true">
        {Array.from({ length: total }, (_, bar) => (
          <i key={bar}><b style={{ width: bar < index ? "100%" : bar === index ? "55%" : "0%" }} /></i>
        ))}
      </div>
      <div className="ls-card-head">
        <span className="ls-mark">{model.address.slice(0, 2)}</span>
        <span>{model.address}</span>
        <span className="ls-card-count">· {index + 1}/{total} {LABELS[id]}</span>
      </div>
      {id === "hero" ? <CoverCard model={model} /> : null}
      {id === "collage" ? <FanCard model={model} fan={fan} onFan={onFan} /> : null}
      {id === "video" && model.videoUrl ? (
        <div className="ls-card-media">
          <FilmPoster poster={model.videoPoster} src={model.videoUrl} label="The film" runtime={model.runtime} />
          <div className="ls-card-copy">
            <p className="ls-kicker">The film</p>
            <h2 className="ls-display">Two minutes inside.</h2>
          </div>
        </div>
      ) : null}
      {id === "matterport" && model.tour ? (
        <div className="ls-card-media">
          <MatterportPoster poster={model.tour.poster} embedUrl={model.tour.embedUrl} label="Explore in 3D" accent="#1F6F6B" />
          <div className="ls-card-copy">
            <p className="ls-kicker">3D tour</p>
            <h2 className="ls-display">Walk it yourself.</h2>
            <p>Rotate your phone for the best view.</p>
          </div>
        </div>
      ) : null}
      {id === "floorplan" ? (
        <div className="ls-card-plan">
          <p className="ls-kicker">Floorplan</p>
          <h2 className="ls-display">The layout.</h2>
          <div className="ls-zoom">
            <button type="button" onClick={() => onZoom(Math.max(1, zoom - 0.25))} aria-label="Zoom out">−</button>
            <button type="button" onClick={() => onZoom(Math.min(2.4, zoom + 0.25))} aria-label="Zoom in">+</button>
          </div>
          <div className="ls-plan-zoom" style={{ transform: `scale(${zoom})` }}>
            <FloorplanBoard active={planRoom} onActive={onPlan} accent="#1F6F6B" imageUrl={model.sample ? "" : model.floorplans[0]?.url} />
          </div>
          <div className="ls-plan-pills">
            {(model.sample ? PLAN_LIST.slice(0, 4) : model.floorplans.map((plan) => ({ id: plan.id, name: plan.name, size: "" }))).map((item) => (
              <button key={item.id} type="button" className={planRoom === item.id ? "on" : ""} onClick={() => onPlan(item.id)}>{item.name}</button>
            ))}
          </div>
        </div>
      ) : null}
      {id === "lead" ? (
        <div className="ls-card-lead">
          <LeadForm variant="card" heading="Let's talk." lede="Name, phone, and email. This page does not email anyone." submitLabel="Send to the agent" />
        </div>
      ) : null}
      {id === "agent" ? (
        <div className={`ls-card-agent ${flipped ? "is-flipped" : ""} ${reduced ? "is-reduced" : ""}`}>
          <div className="ls-flip-inner">
            <div className="ls-face" aria-hidden={flipped}>
              {model.closingPhoto ? <LazyPhoto src={model.closingPhoto.url} alt="" /> : null}
              <p className="ls-display">{model.address}</p>
            </div>
            <div className="ls-face ls-face-back" aria-hidden={!flipped}>
              <PostcardBack model={model} />
            </div>
          </div>
          <button type="button" className="ls-flip-btn" onClick={onFlip}>{flipped ? "Flip to the photo" : "Flip the card"}</button>
        </div>
      ) : null}
    </div>
  );
}

function CoverCard({ model }: { model: ListingSiteModel }) {
  const beds = model.facts.find((fact) => fact.id === "beds");
  const baths = model.facts.find((fact) => fact.id === "baths");
  const sqft = model.facts.find((fact) => fact.id === "sqft");
  const lot = model.facts.find((fact) => fact.id === "lotSize");
  return (
    <>
      {model.heroPhoto ? <LazyPhoto src={model.heroPhoto.url} alt={model.address} eager /> : null}
      <div className="ls-sheet">
        <p className="ls-kicker">For sale{model.cityLine ? ` · ${model.cityLine}` : ""}</p>
        <h2 className="ls-display">{model.headline}</h2>
        {model.price ? <p className="ls-price">{model.price}</p> : null}
        <div className="ls-pills">
          {beds ? <span>{beds.value} bd</span> : null}
          {baths ? <span>{baths.value} ba</span> : null}
          {sqft ? <span>{sqft.value} sf</span> : null}
          {lot ? <span>{lot.value}</span> : null}
        </div>
        <p className="ls-swipe">Swipe to tour →</p>
      </div>
    </>
  );
}

function FanCard({ model, fan, onFan }: { model: ListingSiteModel; fan: number; onFan: (index: number) => void }) {
  const photos = model.collage.slice(0, 5);
  return (
    <div className="ls-fan-card">
      <p className="ls-kicker">The delivery</p>
      <h2 className="ls-display">Pick a card.</h2>
      <div className="ls-fan">
        {photos.map((photo, index) => {
          const delta = index - fan;
          return (
            <button
              key={photo.id}
              type="button"
              className={index === fan ? "on" : ""}
              style={{ transform: `rotate(${delta * 7}deg) translateY(${Math.abs(delta) * 8}px)`, zIndex: index === fan ? 5 : 1 }}
              onClick={() => onFan(index)}
            >
              <img src={photo.url} alt={photo.name} loading="lazy" decoding="async" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PostcardBack({ model }: { model: ListingSiteModel }) {
  const agent = model.agent;
  return (
    <div className="ls-post-copy">
      <Headshot agent={agent} />
      <h2 className="ls-display">Thanks for touring.</h2>
      <p>{model.address}{model.cityLine ? <><br />{model.cityLine}</> : null}</p>
      <p className="ls-display ls-agent-name">{agent.name || "Listing agent"}</p>
      <p>{[agent.brokerage, licenseLabel(agent.license)].filter(Boolean).join(" · ")}</p>
      <p>{[agent.phone, agent.email].filter(Boolean).join(" · ")}</p>
      <ShareRow phone={agent.phone} />
      <LegalLine />
    </div>
  );
}

function ShareRow({ phone }: { phone: string }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ url });
        return;
      } catch {
        /* dismissed */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      /* clipboard unavailable */
    }
  }
  const digits = phone.replace(/[^\d+]/g, "");
  return (
    <div className="ls-share">
      <button type="button" onClick={share}>{copied ? "Link copied" : "Share listing"}</button>
      {digits ? <a href={`tel:${digits}`}>Call</a> : null}
      {digits ? <a href={`sms:${digits}`}>Text</a> : null}
    </div>
  );
}
