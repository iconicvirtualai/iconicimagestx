import { useEffect, useState } from "react";
import type { ListingSiteModel, ListingSiteSectionId } from "@shared/listingSite";
import {
  AgentBrand,
  DeliveryCollage,
  FactRow,
  FilmPoster,
  FloorplanBoard,
  HeroMedia,
  LeadForm,
  MatterportPoster,
  PLAN_LIST,
  SampleNote,
  SectionWrap,
} from "./pieces";

const NAV: Array<{ id: ListingSiteSectionId; label: string }> = [
  { id: "collage", label: "Rooms" },
  { id: "video", label: "Film" },
  { id: "matterport", label: "3D" },
  { id: "floorplan", label: "Plan" },
  { id: "lead", label: "Request a showing" },
];

export function TwoUp({ model }: { model: ListingSiteModel }) {
  const [room, setRoom] = useState(0);
  const [planRoom, setPlanRoom] = useState("kitchen");
  const active = model.rooms[room] || model.rooms[0];
  const collagePhotos = active?.photos.length ? active.photos : model.collage;

  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-room-index]"));
    if (!nodes.length || typeof IntersectionObserver === "undefined") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const observer = new IntersectionObserver((entries) => {
      const hit = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!hit) return;
      const index = Number((hit.target as HTMLElement).dataset.roomIndex);
      if (Number.isFinite(index)) setRoom(index);
    }, { rootMargin: "-35% 0px -45% 0px", threshold: [0.25, 0.6] });
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [model.rooms.length]);

  function jump(id: string) {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }

  const shown = new Set(model.sections);
  let pair = 0;

  return (
    <article className="ls ls-two" data-testid="listing-site" data-template="two-up">
      <header className="ls-nav">
        <div className="ls-brand"><span className="ls-mark">{model.address.slice(0, 2)}</span>{model.address}</div>
        <nav className="ls-nav-links" aria-label="Listing sections">
          {NAV.filter((item) => shown.has(item.id)).map((item) => (
            item.id === "lead"
              ? <button key={item.id} type="button" className="ls-nav-cta" onClick={() => jump(item.id)}>{item.label}</button>
              : <button key={item.id} type="button" onClick={() => jump(item.id)}>{item.label}</button>
          ))}
        </nav>
      </header>

      {model.sections.map((id) => {
        if (id === "agent") return <AgentBrand key={id} model={model} variant="band" />;
        pair += 1;
        const index = String(pair).padStart(2, "0");
        if (id === "hero") {
          return (
            <SectionWrap key={id} id={id} className="ls-pair">
              <div className="ls-stage">
                <HeroMedia
                  photo={model.heroPhoto?.url || ""}
                  videoUrl={model.heroVideoUrl}
                  label={model.address}
                  chrome
                  duration={model.sample ? "0:11 / 0:30" : ""}
                />
              </div>
              <div className="ls-story">
                <p className="ls-index">{index} / {String(model.sections.length).padStart(2, "0")} · Opening</p>
                <p className="ls-kicker">For sale{model.cityLine ? ` · ${model.cityLine}` : ""}</p>
                <h1 className="ls-display ls-title">{model.headline}</h1>
                {model.price ? <p className="ls-price">{model.price}</p> : null}
                <FactRow model={model} />
                {model.tagline ? <p className="ls-body">{model.tagline}</p> : null}
                <p className="ls-scroll-cue"><i /> Scroll — the stage follows the story</p>
              </div>
            </SectionWrap>
          );
        }
        if (id === "collage") {
          return (
            <SectionWrap key={id} id={id} className="ls-pair ls-walk">
              <div className="ls-stage">
                <div className="ls-fade" key={active?.id || "collage"}>
                  <DeliveryCollage photos={collagePhotos} label={active ? `${active.name} · ${active.photos.length || collagePhotos.length} photos` : "Delivery"} />
                </div>
              </div>
              <div className="ls-story">
                <p className="ls-index">{index} · Walkthrough</p>
                <p className="ls-kicker">The walkthrough</p>
                <h2 className="ls-display">Room by room.</h2>
                <div className="ls-rooms">
                  {model.rooms.map((item, roomIndex) => (
                    <button
                      key={item.id}
                      type="button"
                      data-room-index={roomIndex}
                      className={roomIndex === room ? "on" : ""}
                      onMouseEnter={() => setRoom(roomIndex)}
                      onFocus={() => setRoom(roomIndex)}
                      onClick={() => setRoom(roomIndex)}
                    >
                      <span>{String(roomIndex + 1).padStart(2, "0")}</span>
                      <span><strong>{item.name}</strong>{item.caption ? <em>{item.caption}</em> : null}</span>
                      {item.size ? <span className="ls-size">{item.size}</span> : null}
                    </button>
                  ))}
                </div>
                <div className="ls-thumbs">
                  {model.collage.slice(0, 5).map((photo) => (
                    <LazyThumb key={photo.id} src={photo.url} alt={photo.name} />
                  ))}
                  {model.collage.length > 5 ? <span className="ls-more">+{model.collage.length - 5}</span> : null}
                </div>
              </div>
            </SectionWrap>
          );
        }
        if (id === "video" && model.videoUrl) {
          return (
            <SectionWrap key={id} id={id} className="ls-pair">
              <div className="ls-stage">
                <FilmPoster poster={model.videoPoster} src={model.videoUrl} label="The film · Iconic Images" runtime={model.runtime} />
              </div>
              <div className="ls-story">
                <p className="ls-index">{index} · Film</p>
                <p className="ls-kicker">The film</p>
                <h2 className="ls-display">{model.runtime ? `The film · ${model.runtime}` : "The film."}</h2>
                <p className="ls-body">Play it on the stage. Chapters are the ones on this listing.</p>
                <div className="ls-chapters">
                  {model.chapters.map((chapter) => (
                    <p key={chapter.time}><span>{chapter.time}</span>{chapter.label}</p>
                  ))}
                </div>
              </div>
            </SectionWrap>
          );
        }
        if (id === "matterport" && model.tour) {
          return (
            <SectionWrap key={id} id={id} className="ls-pair">
              <div className="ls-stage">
                <MatterportPoster poster={model.tour.poster} embedUrl={model.tour.embedUrl} label="Explore the 3D tour" accent="#1F6F6B" />
              </div>
              <div className="ls-story">
                <p className="ls-index">{index} · 3D</p>
                <p className="ls-kicker">3D tour</p>
                <h2 className="ls-display">Walk it yourself.</h2>
                <ol className="ls-tips">
                  <li><b>01</b>Drag to look around. Click a circle on the floor to move.</li>
                  <li><b>02</b>Switch to Dollhouse to see the whole home at once.</li>
                  <li><b>03</b>Use the ruler to measure any wall or window.</li>
                </ol>
              </div>
            </SectionWrap>
          );
        }
        if (id === "floorplan") {
          return (
            <SectionWrap key={id} id={id} className="ls-pair">
              <div className="ls-stage ls-stage-paper">
                <FloorplanBoard active={planRoom} onActive={setPlanRoom} accent="#1F6F6B" imageUrl={model.sample ? "" : model.floorplans[0]?.url} />
              </div>
              <div className="ls-story">
                <p className="ls-index">{index} · Plan</p>
                <p className="ls-kicker">Floorplan</p>
                <h2 className="ls-display">{model.sample ? "Hover a room, find it on the plan." : "The plan."}</h2>
                <div className="ls-plan-list">
                  {(model.sample ? PLAN_LIST : model.floorplans.map((plan) => ({ id: plan.id, name: plan.name, size: "" }))).map((item) => (
                    <button key={item.id} type="button" className={planRoom === item.id ? "on" : ""} onMouseEnter={() => setPlanRoom(item.id)} onFocus={() => setPlanRoom(item.id)}>
                      <b>{item.name}</b>{item.size ? <span>{item.size}</span> : null}
                    </button>
                  ))}
                </div>
              </div>
            </SectionWrap>
          );
        }
        if (id === "lead") {
          return (
            <SectionWrap key={id} id={id} className="ls-pair">
              <div className="ls-stage">
                {model.closingPhoto ? <img className="ls-fill" src={model.closingPhoto.url} alt={model.closingPhoto.name} loading="lazy" decoding="async" /> : <div className="ls-fill ls-stage-fallback" />}
                <span className="ls-stage-cap">Closing image</span>
              </div>
              <div className="ls-story">
                <LeadForm variant="bone" heading="See it in person." lede="Goes straight to the listing agent once delivery is connected. This page does not email anyone." submitLabel="Request a showing" />
              </div>
            </SectionWrap>
          );
        }
        return null;
      })}
      <SampleNote show={model.sample} />
    </article>
  );
}

function LazyThumb({ src, alt }: { src: string; alt: string }) {
  return <img src={src} alt={alt} loading="lazy" decoding="async" />;
}
