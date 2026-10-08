import { useEffect, useState } from "react";
import type { ListingSiteModel, ListingSiteSectionId } from "@shared/listingSite";
import {
  AgentBrand,
  FactRow,
  FilmPoster,
  FloorplanBoard,
  LazyPhoto,
  LeadForm,
  MatterportPoster,
  SampleNote,
  SectionWrap,
  useReducedMotion,
} from "./pieces";

const NAV: Array<{ id: ListingSiteSectionId; label: string }> = [
  { id: "collage", label: "The day" },
  { id: "video", label: "Film" },
  { id: "matterport", label: "3D" },
  { id: "floorplan", label: "Sun path" },
  { id: "lead", label: "Golden hour viewing" },
];

function clockLabel(progress: number): string {
  const start = 6 * 60 + 42;
  const end = 20 * 60 + 15;
  const minutes = Math.round(start + (end - start) * Math.min(1, Math.max(0, progress)));
  const hour24 = Math.floor(minutes / 60);
  const mins = String(minutes % 60).padStart(2, "0");
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour = hour24 % 12 || 12;
  return `${hour}:${mins} ${suffix}`;
}

export function GoldenHour({ model }: { model: ListingSiteModel }) {
  const reduced = useReducedMotion();
  const [progress, setProgress] = useState(0);
  const [planRoom, setPlanRoom] = useState("kitchen");
  const shown = new Set(model.sections);

  useEffect(() => {
    if (reduced) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        setProgress(max <= 0 ? 0 : window.scrollY / max);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, [reduced]);

  function jump(id: string) {
    document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }

  const sky = mixSky(progress);

  return (
    <article
      className="ls ls-gold"
      data-testid="listing-site"
      data-template="golden-hour"
      data-sky={reduced ? "stepped" : "live"}
      style={reduced ? undefined : { background: sky }}
    >
      <header className="ls-nav ls-nav-float">
        <div className="ls-brand">{model.address}</div>
        <nav className="ls-nav-links" aria-label="Listing sections">
          {NAV.filter((item) => shown.has(item.id)).map((item) => (
            <button key={item.id} type="button" onClick={() => jump(item.id)}>{item.label}</button>
          ))}
        </nav>
        <p className="ls-clock ls-clock-live">{reduced ? "6:42 AM" : clockLabel(progress)}</p>
      </header>

      {model.sections.map((id) => {
        if (id === "hero") {
          return (
            <SectionWrap key={id} id={id} className="ls-gh-hero">
              <HeroStill model={model} />
              <p className="ls-clock ls-section-clock">6:42 AM</p>
              <div className="ls-gh-hero-copy">
                <div>
                  <p className="ls-time-xl">6:42 <span>am</span></p>
                  <h1>{model.headline}</h1>
                  {model.cityLine ? <p className="ls-city">{model.cityLine}</p> : null}
                </div>
                <div className="ls-gh-hero-side">
                  {model.price ? <p className="ls-price">{model.price}</p> : null}
                  <FactLine model={model} />
                  <p className="ls-scroll-cue">Scroll through the day</p>
                </div>
              </div>
            </SectionWrap>
          );
        }
        if (id === "collage") {
          return (
            <SectionWrap key={id} id={id} className="ls-gh-day">
              <p className="ls-clock ls-section-clock">7:15 AM</p>
              <div className="ls-wrap">
                <p className="ls-kicker">The day</p>
                <h2 className="ls-display">One day in the house.</h2>
                {model.dayParts.map((part) => (
                  <div key={part.id} className="ls-day-row">
                    <div>
                      {part.time ? <p className="ls-time">{part.time}</p> : null}
                      <p className="ls-kicker">{part.label}</p>
                      {part.caption ? <p>{part.caption}</p> : null}
                    </div>
                    <div className={`ls-day-photos ls-day-${Math.min(part.photos.length, 3)}`}>
                      {part.photos.map((photo) => (
                        <figure key={photo.id}>
                          <LazyPhoto src={photo.url} alt={photo.name} />
                        </figure>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </SectionWrap>
          );
        }
        if (id === "video" && model.videoUrl) {
          return (
            <SectionWrap key={id} id={id} className="ls-gh-noon">
              <p className="ls-clock ls-section-clock">12:10 PM</p>
              <div className="ls-wrap">
                <div className="ls-gh-head">
                  <div>
                    <p className="ls-kicker">Noon film</p>
                    <h2 className="ls-display">The film, in full light.</h2>
                  </div>
                  {model.runtime ? <p>Running time {model.runtime}<br />Film by Iconic Images</p> : null}
                </div>
                <div className="ls-film-frame">
                  <FilmPoster poster={model.videoPoster} src={model.videoUrl} label="Noon film" runtime={model.runtime} />
                </div>
              </div>
            </SectionWrap>
          );
        }
        if (id === "matterport" && model.tour) {
          return (
            <SectionWrap key={id} id={id} className="ls-gh-noon">
              <div className="ls-wrap ls-gh-split">
                <div className="ls-tour-frame">
                  <MatterportPoster poster={model.tour.poster} embedUrl={model.tour.embedUrl} label="Wander through in 3D" accent="#1F6F6B" />
                </div>
                <div>
                  <p className="ls-kicker">Wander at noon</p>
                  <h2 className="ls-display">Walk every room.</h2>
                  <p>The tour loads when you ask for it, on the bright noon field.</p>
                </div>
              </div>
            </SectionWrap>
          );
        }
        if (id === "floorplan") {
          return (
            <SectionWrap key={id} id={id} className="ls-gh-sun">
              <p className="ls-clock ls-section-clock">4:30 PM</p>
              <div className="ls-wrap ls-gh-split">
                <FloorplanBoard
                  active={planRoom}
                  onActive={setPlanRoom}
                  accent="#D2A35A"
                  sun={model.sample}
                  imageUrl={model.sample ? "" : model.floorplans[0]?.url}
                />
                <div>
                  <p className="ls-kicker">Sun path</p>
                  <h2 className="ls-display">Where the light falls.</h2>
                  {model.sample ? (
                    <ul className="ls-sun-notes">
                      <li><i className="am" /> <span><b>Morning · east</b> Kitchen and dining get the first light.</span></li>
                      <li><i className="mid" /> <span><b>Midday · south</b> Great room glass wall faces the patio.</span></li>
                      <li><i className="pm" /> <span><b>Evening · west</b> Primary suite holds the last warm light.</span></li>
                    </ul>
                  ) : (
                    <p>Sun path uses the lot&apos;s orientation when that is on file.</p>
                  )}
                  {model.sample ? <p className="ls-note">Arc drawn from the lot&apos;s real orientation data at build time. Placeholder shown.</p> : null}
                </div>
              </div>
            </SectionWrap>
          );
        }
        if (id === "lead") {
          return (
            <SectionWrap key={id} id={id} className="ls-gh-dusk">
              <p className="ls-clock ls-section-clock">6:30 PM</p>
              <div className="ls-wrap ls-gh-split">
                <div className="ls-dusk-photo">
                  {model.closingPhoto ? <LazyPhoto src={model.closingPhoto.url} alt={model.closingPhoto.name} /> : null}
                  <span>Twilight · Iconic Images</span>
                </div>
                <LeadForm variant="dusk" heading={"See it at golden hour."} lede="Request an evening showing with the listing agent. This page does not email anyone." submitLabel="Request a golden hour viewing" />
              </div>
            </SectionWrap>
          );
        }
        if (id === "agent") {
          return (
            <div key={id} className="ls-gh-night">
              <p className="ls-clock ls-section-clock">8:15 PM</p>
              <AgentBrand model={model} variant="night" />
            </div>
          );
        }
        return null;
      })}
      <SampleNote show={model.sample} />
    </article>
  );
}

function HeroStill({ model }: { model: ListingSiteModel }) {
  const photo = model.heroPhoto?.url || "";
  return photo ? <img className="ls-fill" src={photo} alt={model.address} loading="eager" decoding="async" /> : null;
}

function FactLine({ model }: { model: ListingSiteModel }) {
  const bits = model.facts.map((fact) => fact.id === "sqft" ? `${fact.value} SQ FT` : fact.id === "lotSize" ? fact.value.toUpperCase() : `${fact.value} ${fact.label.replace(/s$/, "").toUpperCase()}`);
  if (!bits.length) return <FactRow model={model} />;
  return <p className="ls-fact-line">{bits.join(" · ")}</p>;
}

function mixSky(progress: number): string {
  const stops = [
    { at: 0, rgb: [246, 235, 221] },
    { at: 0.38, rgb: [255, 255, 255] },
    { at: 0.7, rgb: [43, 42, 51] },
    { at: 1, rgb: [21, 22, 26] },
  ];
  const p = Math.min(1, Math.max(0, progress));
  let index = 0;
  while (index < stops.length - 2 && p > stops[index + 1].at) index += 1;
  const a = stops[index];
  const b = stops[index + 1];
  const span = b.at - a.at || 1;
  const t = (p - a.at) / span;
  const rgb = a.rgb.map((channel, i) => Math.round(channel + (b.rgb[i] - channel) * t));
  return `rgb(${rgb.join(", ")})`;
}
