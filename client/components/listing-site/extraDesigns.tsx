import { useState } from "react";
import type { ListingSitePhoto, PublicListingSite } from "@shared/listingSite";
import { AgentBand, LeadForm, Plan, TourPoster } from "./pieces";

export function ExtraDesign({ site, inquiry }: { site: PublicListingSite; inquiry: boolean }) {
  if (site.design === "issue") return <Issue site={site} inquiry={inquiry} />;
  if (site.design === "product-drop") return <ProductDrop site={site} inquiry={inquiry} />;
  if (site.design === "gallery-wall") return <GalleryWall site={site} inquiry={inquiry} />;
  if (site.design === "field-guide") return <FieldGuide site={site} inquiry={inquiry} />;
  if (site.design === "golden-hour") return <GoldenHour site={site} inquiry={inquiry} />;
  if (site.design === "dossier") return <Dossier site={site} inquiry={inquiry} />;
  if (site.design === "stories") return <StoriesDeck site={site} inquiry={inquiry} />;
  return null;
}

function photoAt(photos: ListingSitePhoto[], index: number): ListingSitePhoto | undefined {
  return photos[index];
}

function Issue({ site, inquiry }: { site: PublicListingSite; inquiry: boolean }) {
  const cover = site.filmPosterUrl || site.photos[0]?.url || "";
  const spread = site.photos.slice(0, 4);
  const pull = site.facts[0];
  return (
    <article className="ls-issue">
      <header className="ls-issue-bar">
        <span>The Issue</span>
        <span>{site.city || "Listing"}</span>
      </header>
      <section className="ls-issue-cover">
        {cover ? <img src={cover} alt="" /> : null}
        <div>
          <p>Cover</p>
          <h1>{site.street || site.address}</h1>
          {site.price ? <p className="ls-issue-price">{site.price}</p> : null}
        </div>
      </section>
      <section className="ls-issue-spread">
        <p className="ls-issue-label">The spread</p>
        <div className="ls-issue-grid">
          {spread.length === 0 ? <p className="ls-empty">No photos on this listing yet.</p> : spread.map((photo, index) => (
            <figure key={photo.url} className={index === 0 ? "is-tall" : ""}>
              <img src={photo.url} alt={photo.name} />
              <figcaption>{photo.name}</figcaption>
            </figure>
          ))}
          {pull ? (
            <p className="ls-issue-pull"><strong>{pull.value}</strong><span>{pull.label}</span></p>
          ) : null}
        </div>
      </section>
      <section className="ls-issue-block">
        <h2>Cover story</h2>
        {site.filmPosterUrl ? <img src={site.filmPosterUrl} alt="Listing film" /> : <p className="ls-empty">No film on this listing yet.</p>}
      </section>
      <section className="ls-issue-block">
        <h2>Step inside</h2>
        <TourPoster site={site} />
      </section>
      <section className="ls-issue-block">
        <h2>Centerfold</h2>
        <Plan site={site} />
      </section>
      {inquiry ? <LeadForm site={site} variant="issue" heading="Request the private viewing" /> : null}
      <AgentBand site={site} />
    </article>
  );
}

function ProductDrop({ site, inquiry }: { site: PublicListingSite; inquiry: boolean }) {
  const hero = site.photos[0];
  return (
    <article className="ls-drop">
      <section className="ls-drop-hero">
        {hero ? <img src={hero.url} alt="" /> : null}
        <div>
          <p>The reveal</p>
          <h1>{site.street || site.address}</h1>
          {site.price ? <p className="ls-drop-price">{site.price}</p> : null}
        </div>
      </section>
      <ul className="ls-drop-specs">
        {site.facts.length === 0 ? <li><strong>—</strong><span>Specs</span></li> : site.facts.slice(0, 4).map((fact) => (
          <li key={fact.label}><strong>{fact.value}</strong><span>{fact.label}</span></li>
        ))}
      </ul>
      <section className="ls-drop-bento">
        {site.photos.length === 0 ? <p className="ls-empty">No photos on this listing yet.</p> : site.photos.slice(0, 6).map((photo) => (
          <figure key={photo.url}>
            <img src={photo.url} alt={photo.name} />
            <figcaption>{photo.name}</figcaption>
          </figure>
        ))}
      </section>
      <section className="ls-drop-block">
        <h2>Watch the film</h2>
        {site.filmPosterUrl ? <img src={site.filmPosterUrl} alt="Listing film" /> : <p className="ls-empty">No film on this listing yet.</p>}
      </section>
      <section className="ls-drop-block">
        <h2>Explore in 3D</h2>
        <TourPoster site={site} />
      </section>
      <section className="ls-drop-block">
        <h2>Tech specs</h2>
        <Plan site={site} />
      </section>
      {inquiry ? <LeadForm site={site} variant="product-drop" heading="Reserve a viewing" /> : null}
      <AgentBand site={site} />
    </article>
  );
}

function GalleryWall({ site, inquiry }: { site: PublicListingSite; inquiry: boolean }) {
  const piece = site.photos[0];
  const built = site.facts.find((fact) => fact.label === "Built");
  return (
    <article className="ls-gallery">
      <section className="ls-piece">
        {piece ? <img src={piece.url} alt={piece.name} /> : <p className="ls-empty">No photos on this listing yet.</p>}
        <aside>
          <p>{site.street || site.address}</p>
          <p>{[site.city, built?.value].filter(Boolean).join(" · ")}</p>
        </aside>
      </section>
      <section className="ls-salon">
        <h2>The exhibition</h2>
        <div>
          {site.photos.map((photo, index) => (
            <figure key={photo.url}>
              <img src={photo.url} alt={photo.name} />
              <figcaption>{String(index + 1).padStart(2, "0")} · {photo.name}</figcaption>
            </figure>
          ))}
        </div>
      </section>
      <section className="ls-screening">
        <h2>Screening room</h2>
        {site.filmPosterUrl ? <img src={site.filmPosterUrl} alt="Listing film" /> : <p>No film on this listing yet.</p>}
      </section>
      <section className="ls-gallery-block">
        <h2>Enter the exhibit</h2>
        <TourPoster site={site} />
      </section>
      <section className="ls-gallery-block">
        <h2>Floor map</h2>
        <Plan site={site} />
      </section>
      {inquiry ? <LeadForm site={site} variant="gallery-wall" heading="Sign the guestbook" /> : null}
      <AgentBand site={site} />
    </article>
  );
}

function FieldGuide({ site, inquiry }: { site: PublicListingSite; inquiry: boolean }) {
  return (
    <article className="ls-field">
      <header className="ls-trail">
        {photoAt(site.photos, 0) ? <img src={site.photos[0].url} alt="" /> : null}
        <div>
          <p>Trailhead</p>
          <h1>{site.street || site.address}</h1>
          <ul>
            {site.city ? <li>{site.city}</li> : null}
            {site.facts.map((fact) => <li key={fact.label}>{fact.value} {fact.label}</li>)}
          </ul>
        </div>
      </header>
      <section className="ls-specimens">
        {site.photos.length === 0 ? <p className="ls-empty">No photos on this listing yet.</p> : site.photos.map((photo, index) => (
          <figure key={photo.url}>
            <img src={photo.url} alt={photo.name} />
            <figcaption>
              <span>Specimen {String(index + 1).padStart(2, "0")}</span>
              {photo.name}
            </figcaption>
          </figure>
        ))}
      </section>
      <section className="ls-field-block">
        <h2>Trail walk</h2>
        {site.filmPosterUrl ? <img src={site.filmPosterUrl} alt="Listing film" /> : <p className="ls-empty">No film on this listing yet.</p>}
      </section>
      <section className="ls-field-block">
        <h2>Explore the grounds</h2>
        <TourPoster site={site} />
      </section>
      <section className="ls-field-block">
        <h2>Topo map</h2>
        <Plan site={site} />
      </section>
      {inquiry ? <LeadForm site={site} variant="field-guide" heading="Get the full guide" /> : null}
      <AgentBand site={site} />
    </article>
  );
}

function dayParts(photos: ListingSitePhoto[]) {
  if (photos.length <= 1) return [{ label: "Morning", time: "7:15 am", photos }];
  if (photos.length === 2) {
    return [
      { label: "Morning", time: "7:15 am", photos: photos.slice(0, 1) },
      { label: "Afternoon", time: "12:10 pm", photos: photos.slice(1) },
    ];
  }
  const size = Math.ceil(photos.length / 3);
  return [
    { label: "Morning", time: "7:15 am", photos: photos.slice(0, size) },
    { label: "Afternoon", time: "12:10 pm", photos: photos.slice(size, size * 2) },
    { label: "Evening", time: "6:30 pm", photos: photos.slice(size * 2) },
  ].filter((part) => part.photos.length > 0);
}

function GoldenHour({ site, inquiry }: { site: PublicListingSite; inquiry: boolean }) {
  const hero = site.photos[0];
  return (
    <article className="ls-gold">
      <section className="ls-dawn">
        <p className="ls-clock">6:42 am</p>
        {hero ? <img src={hero.url} alt={hero.name} /> : null}
        <div>
          <h1>{site.street || site.address}</h1>
          {site.city ? <p>{site.city}</p> : null}
          {site.price ? <p className="ls-gold-price">{site.price}</p> : null}
        </div>
      </section>
      <section className="ls-day">
        <h2>The day</h2>
        {site.photos.length === 0 ? <p className="ls-empty">No photos on this listing yet.</p> : dayParts(site.photos).map((part) => (
          <div key={part.label} className="ls-day-part">
            <p><span>{part.time}</span>{part.label}</p>
            <div>
              {part.photos.map((photo) => (
                <figure key={photo.url}>
                  <img src={photo.url} alt={photo.name} />
                  <figcaption>{photo.name}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        ))}
      </section>
      <section className="ls-noon">
        <p className="ls-clock">12:10 pm</p>
        <h2>Noon film</h2>
        {site.filmPosterUrl ? <img src={site.filmPosterUrl} alt="Listing film" /> : <p className="ls-empty">No film on this listing yet.</p>}
        <h2>Wander at noon</h2>
        <TourPoster site={site} />
      </section>
      <section className="ls-dusk">
        <p className="ls-clock">6:30 pm</p>
        <h2>Sun path</h2>
        <Plan site={site} />
        {inquiry ? <LeadForm site={site} variant="golden-hour" heading="See it at golden hour" /> : null}
      </section>
      <section className="ls-night">
        <p className="ls-clock">8:15 pm</p>
        <AgentBand site={site} />
      </section>
    </article>
  );
}

function exhibitLetter(index: number): string {
  return String.fromCharCode(65 + (index % 26));
}

function Dossier({ site, inquiry }: { site: PublicListingSite; inquiry: boolean }) {
  const cover = site.filmPosterUrl || site.photos[0]?.url || "";
  return (
    <article className="ls-dossier">
      <header className="ls-file">
        {cover ? <img src={cover} alt="" /> : null}
        <div>
          <p>Coming soon</p>
          <h1>{site.street || site.address}</h1>
          {site.city ? <p>{site.city}</p> : null}
          <ul>
            {site.price ? <li>Price {site.price}</li> : null}
            {site.facts.map((fact) => <li key={fact.label}>{fact.label} {fact.value}</li>)}
          </ul>
        </div>
      </header>
      <section className="ls-exhibits">
        <h2>Exhibits</h2>
        {site.photos.length === 0 ? <p className="ls-empty">No photos on this listing yet.</p> : site.photos.map((photo, index) => (
          <figure key={photo.url}>
            <img src={photo.url} alt={photo.name} />
            <figcaption>Exhibit {exhibitLetter(index)} · {photo.name}</figcaption>
          </figure>
        ))}
      </section>
      <section className="ls-dossier-block">
        <h2>The film</h2>
        {site.filmPosterUrl ? <img src={site.filmPosterUrl} alt="Listing film" /> : <p className="ls-empty">No film on this listing yet.</p>}
      </section>
      <section className="ls-dossier-block">
        <h2>Access granted</h2>
        <TourPoster site={site} />
      </section>
      <section className="ls-dossier-block">
        <h2>Blueprint sheet</h2>
        <Plan site={site} />
      </section>
      {inquiry ? <LeadForm site={site} variant="dossier" heading="Request the full dossier" /> : null}
      <AgentBand site={site} />
    </article>
  );
}

const STORY_CARDS = ["Cover", "The fan", "Film", "3D", "Plan", "Let's talk", "Postcard"] as const;

function StoriesDeck({ site, inquiry }: { site: PublicListingSite; inquiry: boolean }) {
  const [index, setIndex] = useState(0);
  const [fan, setFan] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const total = STORY_CARDS.length;

  function go(next: number) {
    setIndex(Math.max(0, Math.min(total - 1, next)));
  }

  return (
    <article
      className="ls-stories"
      tabIndex={0}
      aria-label="Stories deck"
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") go(index + 1);
        if (event.key === "ArrowLeft") go(index - 1);
      }}
    >
      <p className="ls-stories-kicker">Stories deck</p>
      <div className="ls-progress" aria-hidden="true">
        {STORY_CARDS.map((label, card) => <i key={label} className={card <= index ? "is-on" : ""} />)}
      </div>
      <div className="ls-deck">
        <section className={index === 0 ? "ls-card is-on" : "ls-card"} aria-label="Cover">
          {site.photos[0] ? <img src={site.photos[0].url} alt="" /> : null}
          <div>
            <p>01 · Cover</p>
            <h1>{site.street || site.address}</h1>
            {site.price ? <p>{site.price}</p> : null}
          </div>
        </section>
        <section className={index === 1 ? "ls-card is-on" : "ls-card"} aria-label="The fan">
          <p>02 · The fan</p>
          <div className="ls-fan">
            {site.photos.length === 0 ? <p>No photos on this listing yet.</p> : site.photos.map((photo, photoIndex) => (
              <button key={photo.url} type="button" className={photoIndex === fan ? "is-on" : ""} onClick={() => setFan(photoIndex)}>
                <img src={photo.url} alt={photo.name} />
                <span>{photo.name}</span>
              </button>
            ))}
          </div>
        </section>
        <section className={index === 2 ? "ls-card is-on" : "ls-card"} aria-label="Film">
          <p>03 · Film</p>
          {site.filmPosterUrl ? <img src={site.filmPosterUrl} alt="Listing film" /> : <p>No film on this listing yet.</p>}
        </section>
        <section className={index === 3 ? "ls-card is-on" : "ls-card"} aria-label="3D">
          <p>04 · 3D</p>
          <TourPoster site={site} />
        </section>
        <section className={index === 4 ? "ls-card is-on" : "ls-card"} aria-label="Plan">
          <p>05 · Plan</p>
          <Plan site={site} />
        </section>
        <section className={index === 5 ? "ls-card is-on" : "ls-card"} aria-label="Let's talk">
          <p>06 · Let&apos;s talk</p>
          {inquiry ? <LeadForm site={site} variant="stories" heading="Let's talk" /> : <p>Ask the listing agent for a time.</p>}
        </section>
        <section className={index === 6 ? "ls-card is-on" : "ls-card"} aria-label="Postcard">
          <p>07 · Postcard</p>
          <button type="button" className="ls-flip" aria-pressed={flipped} onClick={() => setFlipped((value) => !value)}>
            {flipped ? "Show the front" : "Flip the card"}
          </button>
          {flipped ? <AgentBand site={site} /> : (
            <div>
              <p>Greetings from</p>
              <h2>{site.street || site.address}</h2>
            </div>
          )}
        </section>
      </div>
      <div className="ls-story-nav">
        <button type="button" onClick={() => go(index - 1)} disabled={index === 0}>Previous card</button>
        <button type="button" onClick={() => go(index + 1)} disabled={index === total - 1}>Next card</button>
      </div>
    </article>
  );
}

export const LISTING_EXTRA_CSS = `
.ls-issue,.ls-drop,.ls-gallery,.ls-field,.ls-gold,.ls-dossier,.ls-stories{max-width:100%;min-height:0}
.ls-issue{background:#F4F0E8;color:#1C1C1C}
.ls-issue-bar{display:flex;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #1F5F5B;font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:12px;letter-spacing:.16em;text-transform:uppercase}
.ls-issue-cover{position:relative;min-height:460px;display:grid;align-items:end;overflow:hidden;background:#1C1C1C}
.ls-issue-cover img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.88}
.ls-issue-cover div{position:relative;padding:28px 18px;color:#F4F0E8}
.ls-issue-cover p,.ls-issue-label{font-family:"IBM Plex Mono",ui-monospace,monospace;letter-spacing:.18em;text-transform:uppercase;font-size:12px}
.ls-issue h1{font-family:"Instrument Serif",Georgia,serif;font-weight:400;font-size:clamp(3.2rem,9cqw,6.4rem);line-height:.88;font-style:italic;overflow-wrap:anywhere}
.ls-issue-price{margin-top:8px;color:#B08D57}
.ls-issue-spread,.ls-issue-block{padding:18px}
.ls-issue-grid{display:grid;gap:10px}
.ls-issue-grid figure img,.ls-drop-bento img,.ls-salon img,.ls-specimens img,.ls-day-part img,.ls-exhibits img,.ls-issue-block img,.ls-drop-block img,.ls-field-block img,.ls-noon img,.ls-dossier-block img,.ls-screening img{width:100%;height:180px;object-fit:cover;display:block}
.ls-issue-pull{display:grid;align-content:end;padding:12px;background:#1F5F5B;color:#F4F0E8}
.ls-issue-pull strong{font-family:"Instrument Serif",Georgia,serif;font-size:2.4rem;font-style:italic}
.ls-issue h2,.ls-drop h2,.ls-gallery h2,.ls-field h2,.ls-gold h2,.ls-dossier h2{font-size:1.5rem;margin:0 0 8px}
.ls-drop{background:#fff;color:#111315}
.ls-drop-hero{position:relative;min-height:360px;display:grid;align-items:end;background:#111315;color:#fff;overflow:hidden}
.ls-drop-hero img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.55}
.ls-drop-hero div{position:relative;padding:24px 18px}
.ls-drop h1{font-family:"Inter Tight",Inter,sans-serif;font-weight:800;font-size:clamp(2.6rem,7cqw,4.8rem);letter-spacing:-.04em;line-height:.9;text-transform:uppercase;overflow-wrap:anywhere}
.ls-drop-specs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));margin:0;padding:0;list-style:none;border-bottom:1px solid #EEF1F2}
.ls-drop-specs li{padding:16px 18px;border-top:1px solid #EEF1F2}
.ls-drop-specs strong{display:block;font-family:"Inter Tight",Inter,sans-serif;font-size:clamp(2rem,5cqw,3.4rem);font-weight:800;letter-spacing:-.04em;line-height:.9}
.ls-drop-specs span,.ls-drop-hero p{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#0F7C78}
.ls-drop-bento{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:12px}
.ls-drop-bento figure:first-child{grid-column:1 / -1}
.ls-drop-bento figcaption{font-size:13px;padding-top:4px}
.ls-drop-block{padding:8px 18px 16px}
.ls-gallery{background:#FAFAF7;color:#222}
.ls-piece{display:grid;justify-items:center;padding:36px 18px 12px}
.ls-piece img{width:min(100%,520px);height:380px;object-fit:cover}
.ls-piece aside{width:min(100%,520px);margin-top:10px;padding-top:8px;border-top:1px solid #A88B5A;font-family:"EB Garamond",Georgia,serif;font-style:italic}
.ls-salon,.ls-gallery-block{padding:12px 18px 18px}
.ls-salon h2,.ls-gallery h2{font-family:"EB Garamond",Georgia,serif;font-weight:500;font-style:italic}
.ls-salon div{display:grid;grid-template-columns:1.4fr .8fr;gap:14px}
.ls-salon figcaption{font-family:"Work Sans",Inter,sans-serif;font-size:12px;letter-spacing:.08em;text-transform:uppercase;padding-top:6px}
.ls-screening{margin:8px 0;padding:28px 18px;background:#222;color:#FAFAF7}
.ls-field{background:#EFE8D8;color:#3E4A3A}
.ls-trail{display:grid;gap:12px;padding:16px}
.ls-trail img{width:100%;height:280px;object-fit:cover}
.ls-trail p{font-family:"IBM Plex Mono",ui-monospace,monospace;letter-spacing:.16em;text-transform:uppercase;font-size:12px;color:#C8902E}
.ls-field h1{font-family:Fraunces,Georgia,serif;font-size:clamp(2.8rem,8cqw,5rem);font-weight:560;line-height:.92;overflow-wrap:anywhere}
.ls-trail ul{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 0;padding:0;list-style:none}
.ls-trail li{border:1px solid #6B5A45;border-radius:999px;padding:6px 10px;font-size:13px}
.ls-specimens{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:0 16px 16px}
.ls-specimens figure{background:#f7f1e4;border:1px solid #6B5A45;padding:8px}
.ls-specimens figcaption{display:grid;gap:2px;padding-top:6px;font-family:"Source Sans 3",Inter,sans-serif}
.ls-specimens span{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#24524E}
.ls-field-block{padding:8px 16px 16px}
.ls-gold{background:#F6EBDD;color:#2B2A33}
.ls-dawn{position:relative;min-height:460px;display:grid;align-items:end;overflow:hidden;background:#F6EBDD}
.ls-dawn img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.ls-dawn div{position:relative;padding:20px 18px;color:#15161A;background:linear-gradient(transparent,rgba(246,235,221,.92))}
.ls-clock{font-family:Manrope,Inter,sans-serif;font-variant-numeric:tabular-nums;letter-spacing:.08em}
.ls-dawn .ls-clock{position:absolute;top:16px;right:16px;z-index:1;background:#F6EBDD;padding:6px 8px}
.ls-gold h1{font-family:"Playfair Display",Georgia,serif;font-style:italic;font-weight:600;font-size:clamp(3rem,8cqw,5.5rem);line-height:.9;overflow-wrap:anywhere}
.ls-day,.ls-noon,.ls-dusk{padding:16px 18px}
.ls-day-part{display:grid;gap:8px;margin-top:12px}
.ls-day-part p span{display:block;font-family:"Playfair Display",Georgia,serif;font-style:italic}
.ls-day-part div{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.ls-noon{background:#fff}
.ls-dusk{background:#2B2A33;color:#F6EBDD}
.ls-night{background:#15161A;color:#D2A35A;padding:8px 4px 12px}
.ls-night .ls-clock{padding:12px 18px 0}
.ls-dossier{background:#1A1C1E;color:#ECE6DA}
.ls-file{position:relative;min-height:480px;display:grid;align-items:end;overflow:hidden}
.ls-file img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.38;filter:saturate(.7)}
.ls-file div{position:relative;padding:28px 18px}
.ls-file p:first-child{color:#B8975A;font-family:"IBM Plex Mono",ui-monospace,monospace;letter-spacing:.2em;text-transform:uppercase;font-size:12px}
.ls-dossier h1{font-family:"Libre Baskerville",Georgia,serif;font-weight:400;font-size:clamp(2.8rem,7cqw,5rem);line-height:.92;overflow-wrap:anywhere}
.ls-file ul{margin:12px 0 0;padding:0;list-style:none}
.ls-file li{border-top:1px solid #B8975A;padding:6px 0}
.ls-exhibits{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:16px;background:#ECE6DA;color:#1A1C1E}
.ls-exhibits h2{grid-column:1 / -1}
.ls-exhibits figure{background:#fff;padding:8px 8px 10px;box-shadow:0 8px 16px rgba(26,28,30,.12)}
.ls-exhibits figure:nth-child(odd){transform:rotate(-1.2deg)}
.ls-exhibits figure:nth-child(even){transform:rotate(1deg)}
.ls-dossier-block{padding:12px 18px}
.ls-stories{background:#F5F3EF;color:#22262A}
.ls-stories-kicker{margin:0;padding:14px 16px 0;font-family:"DM Sans",Inter,sans-serif;font-weight:700;letter-spacing:.16em;text-transform:uppercase;font-size:12px}
.ls-progress{display:flex;gap:4px;padding:10px 16px}
.ls-progress i{flex:1;height:3px;background:#d9d3c8;border-radius:99px}
.ls-progress i.is-on{background:#1F6F6B}
.ls-deck{display:flex;gap:12px;overflow-x:auto;padding:0 16px 12px;scroll-snap-type:x mandatory}
.ls-card{flex:0 0 210px;min-height:360px;scroll-snap-align:start;border-radius:18px;overflow:hidden;background:#22262A;color:#F5F3EF;padding:12px;display:flex;flex-direction:column;gap:8px}
.ls-card img{width:100%;height:180px;object-fit:cover;border-radius:12px}
.ls-stories h1,.ls-stories h2{font-family:"DM Serif Display",Georgia,serif;font-weight:400;line-height:.95;overflow-wrap:anywhere}
.ls-stories h1{font-size:1.8rem}
.ls-fan{display:grid;gap:6px}
.ls-fan button{display:grid;grid-template-columns:54px 1fr;gap:8px;align-items:center;min-height:48px;border:0;background:transparent;color:inherit;text-align:left}
.ls-fan img{width:54px;height:54px}
.ls-fan button.is-on{outline:2px solid #E0B04F}
.ls-flip,.ls-story-nav button{min-height:44px;border:0;border-radius:999px;background:#1F6F6B;color:#fff;padding:0 14px}
.ls-story-nav{display:flex;gap:8px;padding:0 16px 18px}
.ls-story-nav button:disabled{opacity:.4}
.ls-stories .ls-agent,.ls-stories .ls-lead{color:#F5F3EF}
.ls-issue .ls-agent,.ls-drop .ls-agent,.ls-gallery .ls-agent,.ls-field .ls-agent,.ls-dossier .ls-agent{padding-top:8px}
@container (min-width:900px){
  .ls-issue-grid{grid-template-columns:1.3fr .7fr .8fr;align-items:stretch}
  .ls-issue-grid .is-tall{grid-row:span 2}
  .ls-issue-grid .is-tall img{height:100%;min-height:280px}
  .ls-drop-specs{grid-template-columns:repeat(4,minmax(0,1fr))}
  .ls-drop-bento{grid-template-columns:1.4fr .8fr .8fr}
  .ls-salon div{grid-template-columns:1.2fr .7fr .9fr}
  .ls-specimens{grid-template-columns:repeat(4,minmax(0,1fr))}
  .ls-trail{grid-template-columns:1.1fr .9fr;align-items:end}
  .ls-day-part{grid-template-columns:160px 1fr}
  .ls-exhibits{grid-template-columns:repeat(3,minmax(0,1fr))}
  .ls-card{flex-basis:240px}
}
@container (max-width:700px){
  .ls-deck{display:block;padding:0}
  .ls-card{display:none;width:auto;min-height:640px;border-radius:0;flex-basis:auto}
  .ls-card.is-on{display:flex}
  .ls-stories h1{font-size:2.4rem}
  .ls-piece img{height:280px}
  .ls-issue-cover,.ls-dawn,.ls-file{min-height:420px}
}
@media (prefers-reduced-motion: reduce){
  .ls-exhibits figure{transform:none}
}
`;
