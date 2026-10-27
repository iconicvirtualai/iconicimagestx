import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  isListingSiteDesign,
  type ListingSiteDesign,
  type PublicListingSite,
} from "@shared/listingSite";
import NotFound from "@/pages/NotFound";

const FONT_HREF = "https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@75,400;75,700;75,800&family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Space+Grotesk:wght@500;700&display=swap";

export default function ListingSite() {
  const { slug = "" } = useParams();
  const [params] = useSearchParams();
  const preview = params.get("preview");
  const [site, setSite] = useState<PublicListingSite | null | undefined>(undefined);

  useEffect(() => {
    if (import.meta.env.DEV && isListingSiteDesign(preview)) {
      setSite(previewListing(preview));
      return;
    }
    let cancelled = false;
    void fetch(`/api/listing-sites/${encodeURIComponent(slug)}`, { cache: "no-store" })
      .then(async (response) => {
        if (cancelled) return;
        if (!response.ok) {
          setSite(null);
          return;
        }
        setSite(await response.json() as PublicListingSite);
      })
      .catch(() => {
        if (!cancelled) setSite(null);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, preview]);

  if (site === undefined) {
    return <div className="iframe-safe-page grid place-items-center bg-[#f7f7f5] text-sm">Opening this listing…</div>;
  }
  if (!site) return <NotFound />;
  return <ListingSiteView site={site} />;
}

export function ListingSiteView({ site }: { site: PublicListingSite }) {
  const theme = themeVars(site);
  return (
    <div data-listing-design={site.design} style={theme}>
      <link rel="stylesheet" href={FONT_HREF} />
      <style>{LISTING_CSS}</style>
      {site.design === "two-up" ? <TwoUp site={site} /> : null}
      {site.design === "premiere" ? <Premiere site={site} /> : null}
      {site.design === "index" ? <IndexDesign site={site} /> : null}
      <PoweredBy />
    </div>
  );
}

function themeVars(site: PublicListingSite): CSSProperties {
  const display = site.font === "serif"
    ? '"Libre Baskerville", Georgia, serif'
    : site.font === "modern"
      ? '"Space Grotesk", Inter, sans-serif'
      : '"Archivo", Inter, sans-serif';
  const accent = site.color === "teal" ? "#0E7C7B" : site.color === "warm" ? "#9A3412" : "var(--design-accent)";
  const tracking = site.style === "editorial" ? "0.08em" : site.style === "minimal" ? "0" : "0.02em";
  return {
    ["--display" as string]: display,
    ["--accent" as string]: accent,
    ["--track" as string]: tracking,
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
  };
}

function IndexDesign({ site }: { site: PublicListingSite }) {
  const [open, setOpen] = useState<"film" | "tour" | "plan" | "">("film");
  const [active, setActive] = useState(0);
  return (
    <article className="ls-index">
      <header className="ls-index-bar">
        <span>{site.street || site.address}</span>
        <a href="#visit">Visit</a>
      </header>
      <section className="ls-index-hero">
        <p className="ls-kicker">00</p>
        <h1>{site.street || site.address}</h1>
        {site.filmPosterUrl ? <img src={site.filmPosterUrl} alt="" /> : null}
        <dl>
          {site.price ? <Fact label="Price" value={site.price} /> : null}
          {site.facts.map((fact) => <Fact key={fact.label} label={fact.label} value={fact.value} />)}
          {site.city ? <Fact label="Location" value={site.city} /> : null}
        </dl>
      </section>
      <section>
        <div className="ls-index-rowhead">
          <p className="ls-kicker">01 · Rooms</p>
        </div>
        {site.photos.length === 0 ? <p className="ls-empty">No photos on this listing yet.</p> : site.photos.map((photo, index) => (
          <button key={photo.url} type="button" className={index === active ? "ls-room is-on" : "ls-room"} onClick={() => setActive(index)}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{photo.name}</strong>
            {index === active ? <img src={photo.url} alt="" /> : null}
          </button>
        ))}
      </section>
      <Accordion title="02 · Film" open={open === "film"} onToggle={() => setOpen(open === "film" ? "" : "film")}>
        {site.filmPosterUrl ? <img src={site.filmPosterUrl} alt="Listing film" /> : <p className="ls-empty">No film on this listing yet.</p>}
      </Accordion>
      <Accordion title="03 · 3D" open={open === "tour"} onToggle={() => setOpen(open === "tour" ? "" : "tour")}>
        <TourPoster site={site} />
      </Accordion>
      <Accordion title="04 · Floorplan" open={open === "plan"} onToggle={() => setOpen(open === "plan" ? "" : "plan")}>
        <Plan site={site} />
      </Accordion>
      <LeadForm site={site} variant="index" />
      <AgentBand site={site} />
    </article>
  );
}

function TwoUp({ site }: { site: PublicListingSite }) {
  const [active, setActive] = useState(0);
  const photo = site.photos[active] || site.photos[0];
  return (
    <article className="ls-two">
      <div className="ls-stage">
        {photo ? <img src={photo.url} alt={photo.name} /> : <p>No photos on this listing yet.</p>}
      </div>
      <div className="ls-story">
        <p className="ls-kicker">Opening</p>
        <h1>{site.street || site.address}</h1>
        {site.price ? <p className="ls-price">{site.price}</p> : null}
        <ul className="ls-facts">
          {site.facts.map((fact) => <li key={fact.label}>{fact.value} {fact.label}</li>)}
        </ul>
        {site.photos.map((item, index) => (
          <button key={item.url} type="button" className={index === active ? "ls-caption is-on" : "ls-caption"} onClick={() => setActive(index)}>
            <strong>{item.name}</strong>
          </button>
        ))}
        <section className="ls-block">
          <h2>Film</h2>
          {site.filmPosterUrl ? <img src={site.filmPosterUrl} alt="Listing film" /> : <p className="ls-empty">No film on this listing yet.</p>}
        </section>
        <section className="ls-block">
          <h2>3D tour</h2>
          <TourPoster site={site} />
        </section>
        <section className="ls-block">
          <h2>Floorplan</h2>
          <Plan site={site} />
        </section>
        <LeadForm site={site} variant="two-up" />
      </div>
      <AgentBand site={site} />
    </article>
  );
}

function Premiere({ site }: { site: PublicListingSite }) {
  const [scene, setScene] = useState(0);
  const photo = site.photos[scene];
  return (
    <article className="ls-premiere">
      <header className="ls-letterbox">
        {site.filmPosterUrl || photo ? <img src={site.filmPosterUrl || photo.url} alt="" /> : null}
        <h1>{site.street || site.address}</h1>
      </header>
      <section className="ls-strip" aria-label="Contact sheet">
        {site.photos.map((item, index) => (
          <button key={item.url} type="button" onClick={() => setScene(index)} aria-current={index === scene}>
            <img src={item.url} alt={item.name} />
          </button>
        ))}
      </section>
      <section className="ls-feature" id="film">
        <p className="ls-kicker">Feature presentation</p>
        {site.filmPosterUrl ? <img src={site.filmPosterUrl} alt="Listing film" /> : <p className="ls-empty">No film on this listing yet.</p>}
        <div className="ls-chapters">
          {site.photos.map((item, index) => (
            <button key={item.url} type="button" onClick={() => { setScene(index); document.getElementById("film")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
              {item.name}
            </button>
          ))}
        </div>
      </section>
      <section className="ls-set">
        <h2>Set map</h2>
        <Plan site={site} />
      </section>
      <section className="ls-walk">
        <p className="ls-kicker">Walk the set</p>
        <TourPoster site={site} />
      </section>
      <LeadForm site={site} variant="premiere" />
      <AgentBand site={site} />
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Accordion({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <section className="ls-acc">
      <button type="button" onClick={onToggle} aria-expanded={open}>
        <span>{title}</span>
        <span>{open ? "−" : "+"}</span>
      </button>
      {open ? <div className="ls-acc-body">{children}</div> : null}
    </section>
  );
}

function TourPoster({ site }: { site: PublicListingSite }) {
  const [loaded, setLoaded] = useState(false);
  if (!site.tourEmbedUrl) return <p className="ls-empty">No 3D tour on this listing yet.</p>;
  if (!loaded) {
    return (
      <button type="button" className="ls-tour" onClick={() => setLoaded(true)}>
        Open 3D tour
      </button>
    );
  }
  return <iframe title="3D tour" src={site.tourEmbedUrl} loading="lazy" allowFullScreen />;
}

function Plan({ site }: { site: PublicListingSite }) {
  if (site.floorplan) return <img src={site.floorplan.url} alt={site.floorplan.name} />;
  if (site.photos.length === 0) return <p className="ls-empty">No floorplan on this listing yet.</p>;
  return (
    <ul className="ls-plan-list">
      {site.photos.map((photo) => <li key={photo.url}>{photo.name}</li>)}
    </ul>
  );
}

function LeadForm({ site, variant }: { site: PublicListingSite; variant: ListingSiteDesign }) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [when, setWhen] = useState("Saturday");
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!consent) {
      setMessage("Consent is required.");
      return;
    }
    const response = await fetch(`/api/listing-sites/${encodeURIComponent(site.slug)}/inquiry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, contact, when, consent: true }),
    });
    const body = await response.json().catch(() => null) as { error?: string } | null;
    setMessage(response.ok ? "Sent to the listing agent." : body?.error || "The request could not be saved.");
  }

  return (
    <form id="visit" className={`ls-lead ls-lead-${variant}`} onSubmit={(event) => void submit(event)}>
      <h2>{variant === "premiere" ? "Book a screening" : variant === "two-up" ? "Request a showing" : "Visit"}</h2>
      {variant === "index" ? (
        <p className="ls-madlib">I would like to see this home on {when}. My name is {name || "…"}. Reach me at {contact || "…"}.</p>
      ) : null}
      <label>Name<input value={name} onChange={(event) => setName(event.target.value)} required autoComplete="name" /></label>
      <label>Email or phone<input value={contact} onChange={(event) => setContact(event.target.value)} required autoComplete="email" /></label>
      <label>Preferred time
        <select value={when} onChange={(event) => setWhen(event.target.value)}>
          {["Saturday", "Sunday", "Morning", "Afternoon", "Evening"].map((slot) => <option key={slot}>{slot}</option>)}
        </select>
      </label>
      <label className="ls-consent">
        <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
        <span>I agree to be contacted by the listing agent by call or text about this property. Consent is not a condition of purchase.</span>
      </label>
      <button type="submit">Send</button>
      {message ? <p role="status">{message}</p> : null}
    </form>
  );
}

function AgentBand({ site }: { site: PublicListingSite }) {
  const agent = site.agent;
  return (
    <section className="ls-agent">
      <div className="ls-agent-brand">
        {agent.headshotUrl ? <img src={agent.headshotUrl} alt="" width={72} height={72} /> : null}
        {agent.companyLogoUrl ? <img src={agent.companyLogoUrl} alt="" width={36} height={36} /> : null}
        {agent.brokerageLogoUrl ? <img src={agent.brokerageLogoUrl} alt="" width={36} height={36} /> : null}
      </div>
      <h2>{agent.name || "Listing agent"}</h2>
      <p>
        {[agent.brokerage, agent.license ? `TX Lic. #${agent.license}` : "", agent.phone, agent.email].filter(Boolean).join(" · ")}
      </p>
      {agent.website ? <p><a href={agent.website}>{agent.website.replace(/^https?:\/\//, "")}</a></p> : null}
      {agent.socials && agent.socials.length > 0 ? (
        <p>
          {agent.socials.map((item) => (
            <a key={`${item.label}-${item.url}`} href={item.url}>{item.label}</a>
          ))}
        </p>
      ) : null}
      <p className="ls-legal">
        <a href="https://www.trec.texas.gov/forms/information-about-brokerage-services">TREC Information About Brokerage Services</a>
        {" · "}
        <a href="https://www.trec.texas.gov/forms/consumer-protection-notice">TREC Consumer Protection Notice</a>
        {" · Equal Housing Opportunity"}
      </p>
      <p>Photography & film: Iconic Images</p>
    </section>
  );
}

function PoweredBy() {
  return (
    <footer className="ls-powered">
      <a href="https://iconicimagestx.com">
        <img src="/media/brand/iconic-camera-logo.png" alt="" width={28} height={28} />
        Powered by Iconic Images
      </a>
    </footer>
  );
}

function previewListing(design: ListingSiteDesign): PublicListingSite {
  return {
    slug: "18-lantern-oak-pl-the-woodlands",
    design,
    font: design === "premiere" ? "serif" : design === "two-up" ? "modern" : "sans",
    color: design === "two-up" ? "teal" : "ink",
    style: design === "premiere" ? "editorial" : "classic",
    address: "18 Lantern Oak Pl, The Woodlands, TX",
    street: "18 Lantern Oak Pl",
    city: "The Woodlands",
    price: "$1,185,000",
    facts: [
      { label: "Beds", value: "4" },
      { label: "Baths", value: "3.5" },
      { label: "Sq ft", value: "3,412" },
      { label: "Lot", value: "0.31 ac" },
      { label: "Built", value: "2019" },
    ],
    photos: [
      { name: "Kitchen", url: "/media/photos/luxury-interior.jpg" },
      { name: "Great Room", url: "/media/photos/listing-living-01.jpg" },
      { name: "Primary Suite", url: "/media/photos/listing-living-02.jpg" },
      { name: "Exterior", url: "/media/photos/luxury-exterior.jpg" },
      { name: "Back Yard", url: "/media/photos/drone-hero.jpg" },
    ],
    filmPosterUrl: "/media/photos/luxury-exterior.jpg",
    tourEmbedUrl: "https://my.matterport.com/show/?m=preview",
    floorplan: { name: "Level 1", url: "/media/photos/listing-living-03.jpg" },
    agent: {
      name: "Agent Name",
      brokerage: "Brokerage Name",
      license: "000000",
      phone: "(281) 555-0100",
      email: "agent@example.com",
    },
  };
}

const LISTING_CSS = `
.ls-index,.ls-two,.ls-premiere{min-height:var(--iframe-hero)}
.ls-index{background:#F7F7F5;color:#0E0E0E}
.ls-two{background:#F2EFEA;color:#1E2124}
.ls-premiere{background:#0B0B0C;color:#E8DCC4}
.ls-kicker{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:12px;letter-spacing:var(--track);text-transform:uppercase}
.ls-index h1,.ls-two h1,.ls-premiere h1,.ls-index-hero h1,.ls-agent h2,.ls-lead h2,.ls-madlib{
  font-family:var(--display);font-weight:700;letter-spacing:var(--track)
}
.ls-index-bar{display:flex;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid #0E0E0E;font-family:"JetBrains Mono",ui-monospace,monospace;font-size:12px}
.ls-index-bar a{color:inherit}
.ls-index-hero{padding:20px 16px 8px}
.ls-index-hero h1{font-size:clamp(3rem,14vw,7.5rem);line-height:.82;text-transform:uppercase;margin:8px 0 16px}
.ls-index-hero img,.ls-acc img,.ls-block img,.ls-feature img,.ls-set img,.ls-walk iframe,.ls-lead img{width:100%;height:auto;display:block}
.ls-index-hero dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:16px 0}
.ls-index-hero dt{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:11px;color:#8A8A8A}
.ls-index-hero dd{font-family:var(--display);font-size:1.4rem;font-weight:700}
.ls-room,.ls-caption,.ls-acc>button,.ls-lead button,.ls-tour,.ls-chapters button,.ls-strip button{
  min-height:48px;width:100%;text-align:left;background:transparent;color:inherit;border:0;border-top:1px solid currentColor
}
.ls-room{display:grid;grid-template-columns:3rem 1fr;gap:8px;align-items:center;padding:8px 16px;font-size:1.35rem}
.ls-room strong,.ls-caption strong{font-family:var(--display);font-weight:700;text-transform:uppercase}
.ls-room img{grid-column:1 / -1;width:100%;max-height:220px;object-fit:cover}
.ls-room.is-on strong{color:var(--accent)}
.ls-acc>button{display:flex;justify-content:space-between;padding:16px;font-family:var(--display);font-size:1.6rem;text-transform:uppercase}
.ls-acc-body{padding:0 16px 16px}
.ls-empty{padding:8px 0 16px;color:#8A8A8A}
.ls-lead{display:grid;gap:12px;padding:20px 16px}
.ls-lead input,.ls-lead select{min-height:48px;width:100%;margin-top:6px;padding:0 12px;border:0;border-bottom:2px solid currentColor;background:transparent;color:inherit;font:inherit}
.ls-lead button{background:var(--accent);color:#fff;border:0;border-radius:999px;font-weight:700}
.ls-index .ls-lead button{background:#0E7C7B}
.ls-consent{display:flex;gap:10px;align-items:flex-start;font-size:13px;line-height:1.4}
.ls-madlib{font-size:clamp(1.6rem,6vw,2.4rem);line-height:1.15;text-transform:uppercase}
.ls-agent{padding:20px 16px 28px;border-top:1px solid currentColor}
.ls-agent h2{font-size:clamp(2rem,8vw,3.5rem);text-transform:uppercase;line-height:.9}
.ls-legal a{color:inherit}
.ls-powered{display:flex;justify-content:center;padding:18px 16px 28px}
.ls-powered a{display:inline-flex;align-items:center;gap:8px;color:inherit;text-decoration:none;font-size:13px}
.ls-powered img{width:28px;height:28px;object-fit:contain}
.ls-two{display:block}
.ls-stage{position:sticky;top:0;height:clamp(220px,86vw,420px);max-height:420px;background:#1E2124;color:#F2EFEA;overflow:hidden}
.ls-stage img{width:100%;height:100%;object-fit:cover}
.ls-story{padding:20px 16px}
.ls-story h1{font-size:clamp(2.4rem,10vw,4.5rem);line-height:.9;text-transform:uppercase}
.ls-price{margin-top:8px;font-size:1.4rem}
.ls-facts{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 20px;padding:0;list-style:none}
.ls-caption{padding:14px 0}
.ls-caption.is-on{box-shadow:inset 3px 0 0 var(--accent,#1F6F6B)}
.ls-block{margin-top:24px}
.ls-block h2,.ls-set h2{font-family:var(--display);font-size:1.6rem;margin-bottom:8px}
.ls-premiere .ls-letterbox{position:relative;min-height:clamp(280px,112vw,460px);max-height:460px;display:grid;place-items:end start;overflow:hidden}
.ls-premiere .ls-letterbox img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.72}
.ls-premiere .ls-letterbox h1{position:relative;padding:24px 16px;font-size:clamp(1.4rem,6vw,3rem);letter-spacing:.28em;text-transform:uppercase}
.ls-strip{display:flex;gap:8px;overflow-x:auto;padding:12px 16px}
.ls-strip button{flex:0 0 42vw;width:42vw;border:0;padding:0;min-height:0}
.ls-strip img{width:100%;height:96px;object-fit:cover}
.ls-strip button[aria-current="true"]{outline:2px solid #C9A45C}
.ls-feature,.ls-set,.ls-walk{padding:8px 16px 20px}
.ls-chapters{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.ls-chapters button{width:auto;border:1px solid #C9A45C;border-radius:999px;padding:10px 14px;color:#E8DCC4}
.ls-tour{border:1px solid currentColor;padding:16px}
.ls-premiere .ls-lead button{background:#C9A45C;color:#0B0B0C}
.ls-walk iframe{min-height:240px;border:0}
@media (min-width:900px){
  .ls-two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:start}
  .ls-stage{height:var(--iframe-hero);max-height:var(--iframe-hero-max)}
  .ls-premiere .ls-letterbox{min-height:clamp(320px,32vw,480px);max-height:480px}
  .ls-agent{grid-column:1 / -1}
  .ls-index-hero dl{grid-template-columns:repeat(4,minmax(0,1fr))}
  .ls-room{grid-template-columns:4rem 1fr 180px}
  .ls-room img{grid-column:auto;height:72px}
  .ls-strip button{flex-basis:160px;width:160px}
}
@media (prefers-reduced-motion: reduce){
  *{scroll-behavior:auto !important}
}
`;
