import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import {
  ICONIC_MEDIA_CREDIT,
  TREC_CPN_URL,
  TREC_IABS_URL,
  licenseLabel,
  type ListingSiteModel,
  type PortalAgentBranding,
  type ResolvedPhoto,
} from "@shared/listingSite";

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(media.matches);
    apply();
    media.addEventListener?.("change", apply);
    return () => media.removeEventListener?.("change", apply);
  }, []);
  return reduced;
}

export function LazyPhoto({
  src,
  alt,
  eager = false,
  className = "",
}: {
  src: string;
  alt: string;
  eager?: boolean;
  className?: string;
}) {
  if (!src) return null;
  return (
    <img
      src={src}
      alt={alt}
      className={`ls-fill ${className}`.trim()}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
    />
  );
}

export function HeroMedia({
  photo,
  videoUrl,
  label,
  chrome = false,
  duration = "",
}: {
  photo: string;
  videoUrl: string;
  label: string;
  chrome?: boolean;
  duration?: string;
}) {
  const reduced = useReducedMotion();
  const playVideo = Boolean(videoUrl) && !reduced;
  return (
    <div className="ls-hero-media">
      {photo ? <LazyPhoto src={photo} alt={label} eager /> : null}
      {playVideo ? (
        <video
          className="ls-fill"
          src={videoUrl}
          poster={photo || undefined}
          muted
          autoPlay
          loop
          playsInline
          preload="metadata"
          aria-label={label}
        />
      ) : null}
      {chrome ? (
        <div className="ls-film-chrome">
          <span className="ls-chip ls-chip-dark">{playVideo ? "Hero film · muted loop" : "Hero"}</span>
          <div className="ls-scrub">
            <span className="ls-pause" aria-hidden="true">{playVideo ? "❚❚" : "▶"}</span>
            <span className="ls-scrub-track"><span style={{ width: playVideo ? "38%" : "0%" }} /></span>
            <span>{duration}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function DeliveryCollage({ photos, label }: { photos: ResolvedPhoto[]; label?: string }) {
  const shown = photos.slice(0, 3);
  return (
    <div className="ls-collage" data-testid="delivery-collage">
      {shown.map((photo, index) => (
        <LazyPhoto key={photo.id} src={photo.url} alt={photo.name} className={index === 0 ? "ls-collage-lead" : ""} />
      ))}
      {label ? <span className="ls-stage-cap">{label}</span> : null}
    </div>
  );
}

export function FilmPoster({
  poster,
  src,
  label,
  runtime,
}: {
  poster: string;
  src: string;
  label: string;
  runtime?: string;
}) {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();
  if (!src) return null;
  if (!open) {
    return (
      <button type="button" className="ls-film" onClick={() => setOpen(true)} aria-label={`Play ${label}`}>
        {poster ? <LazyPhoto src={poster} alt="" /> : null}
        <span className="ls-shade" />
        <span className="ls-film-label">{label}</span>
        <span className="ls-play" aria-hidden="true"><PlayIcon /></span>
        <span className="ls-film-meta">{runtime ? `0:00 / ${runtime}` : "Play the film"}</span>
      </button>
    );
  }
  return (
    <video
      className="ls-fill"
      src={src}
      poster={poster || undefined}
      controls
      autoPlay={!reduced}
      playsInline
      preload="none"
      aria-label={label}
    />
  );
}

export function MatterportPoster({
  poster,
  embedUrl,
  label,
  accent,
}: {
  poster: string;
  embedUrl: string;
  label: string;
  accent: string;
}) {
  const [open, setOpen] = useState(false);
  if (!embedUrl) return null;
  if (!open) {
    return (
      <button type="button" className="ls-tour" onClick={() => setOpen(true)} style={{ "--acc": accent } as CSSProperties}>
        {poster ? <LazyPhoto src={poster} alt="" /> : null}
        <span className="ls-shade" />
        <span className="ls-film-label">3D tour · Matterport · loads on click</span>
        <span className="ls-tour-btn"><span className="ls-cube" aria-hidden="true" />{label}</span>
      </button>
    );
  }
  return (
    <iframe
      title="Matterport 3D tour"
      src={embedUrl}
      className="ls-fill"
      loading="lazy"
      allow="fullscreen; vr"
      allowFullScreen
    />
  );
}

const PLAN_ROOMS = [
  { id: "garage", name: "Garage", size: "22×21", x: 0, y: 0, w: 160, h: 180 },
  { id: "study", name: "Study", size: "12×13", x: 160, y: 0, w: 120, h: 180 },
  { id: "great", name: "Great Room", size: "20×22", x: 280, y: 0, w: 180, h: 230, light: "mid" },
  { id: "kitchen", name: "Kitchen", size: "18×16", x: 460, y: 0, w: 140, h: 150, light: "am" },
  { id: "foyer", name: "Foyer", size: "", x: 160, y: 180, w: 120, h: 80 },
  { id: "dining", name: "Dining", size: "14×12", x: 460, y: 150, w: 140, h: 110, light: "am" },
  { id: "primary", name: "Primary Suite", size: "16×18", x: 0, y: 180, w: 160, h: 200, light: "pm" },
  { id: "pbath", name: "Primary Bath", size: "", x: 160, y: 260, w: 120, h: 120 },
  { id: "bed2", name: "Bed 2", size: "12×12", x: 280, y: 230, w: 100, h: 150 },
  { id: "bed3", name: "Bed 3", size: "12×11", x: 380, y: 230, w: 100, h: 150 },
  { id: "bath2", name: "Bath 2", size: "", x: 480, y: 260, w: 120, h: 120 },
] as const;

export function FloorplanBoard({
  active,
  onActive,
  accent,
  sun = false,
  imageUrl = "",
}: {
  active: string;
  onActive: (id: string) => void;
  accent: string;
  sun?: boolean;
  imageUrl?: string;
}) {
  if (imageUrl && !sun) {
    return (
      <div className="ls-plan-photo">
        <LazyPhoto src={imageUrl} alt="Floorplan" />
      </div>
    );
  }
  return (
    <svg className="ls-plan-svg" viewBox={sun ? "-80 -40 820 640" : "-10 -10 640 460"} role="img" aria-label="Floorplan">
      {sun ? (
        <>
          <circle cx="620" cy="150" r="150" fill={accent} opacity="0.18" />
          <circle cx="40" cy="280" r="130" fill="#E07A3F" opacity="0.16" />
          <path d="M700 250 Q300 620 -80 250" fill="none" stroke={accent} strokeWidth="2" strokeDasharray="2 7" />
        </>
      ) : null}
      {PLAN_ROOMS.map((room) => {
        const on = active === room.id;
        const wash = sun && "light" in room
          ? room.light === "am" ? accent : room.light === "pm" ? "#E07A3F" : "#E8BE78"
          : accent;
        return (
          <g key={room.id} onMouseEnter={() => onActive(room.id)} onClick={() => onActive(room.id)} style={{ cursor: "pointer" }}>
            <rect
              x={room.x}
              y={room.y}
              width={room.w}
              height={room.h}
              fill={on || (sun && "light" in room) ? wash : "none"}
              fillOpacity={on ? 0.28 : 0.16}
              stroke="#1E2124"
              strokeWidth={on ? 3 : 2}
            />
            <text x={room.x + room.w / 2} y={room.y + room.h / 2 - 4} textAnchor="middle" fontSize="11" fontWeight="600" fill={on ? accent : "#1E2124"}>
              {room.name.toUpperCase()}
            </text>
            {room.size ? (
              <text x={room.x + room.w / 2} y={room.y + room.h / 2 + 12} textAnchor="middle" fontSize="10" fill="#7a7e82">{room.size}</text>
            ) : null}
          </g>
        );
      })}
      <rect x="0" y="0" width="600" height="380" fill="none" stroke="#1E2124" strokeWidth="6" />
    </svg>
  );
}

export const PLAN_LIST = [
  { id: "great", name: "Great Room", size: "20 × 22" },
  { id: "kitchen", name: "Kitchen", size: "18 × 16" },
  { id: "dining", name: "Dining", size: "14 × 12" },
  { id: "primary", name: "Primary Suite", size: "16 × 18" },
  { id: "study", name: "Study", size: "12 × 13" },
  { id: "garage", name: "Garage", size: "22 × 21" },
];

const SLOTS = {
  bone: ["Weekday AM", "Weekday PM", "Saturday", "Sunday"],
  dusk: ["Morning", "Afternoon", "Golden hour", "After dark"],
  card: ["Weekday", "Evening", "Weekend"],
} as const;

export function LeadForm({
  variant,
  heading,
  lede,
  submitLabel,
}: {
  variant: keyof typeof SLOTS;
  heading: string;
  lede: string;
  submitLabel: string;
}) {
  const slots = SLOTS[variant];
  const [slot, setSlot] = useState(variant === "bone" ? "Weekday PM" : slots[2]);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !email.trim() || !phone.trim()) {
      setError("Add a name, email, and phone.");
      return;
    }
    if (!consent) {
      setError("Check the consent box to continue.");
      return;
    }
    setError("");
    setSent(true);
  }

  if (sent) {
    return (
      <div className={`ls-form ls-form-${variant}`} data-testid="showing-form">
        <h2 className="ls-display">{heading}</h2>
        <p>This request stays on the page. Nothing was emailed.</p>
      </div>
    );
  }

  return (
    <form className={`ls-form ls-form-${variant}`} data-testid="showing-form" onSubmit={submit} noValidate>
      <p className="ls-kicker">Private showing</p>
      <h2 className="ls-display">{heading}</h2>
      <p className="ls-lede">{lede}</p>
      <div className="ls-form-row">
        <label>Name<input name="name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Full name" /></label>
        <label>Phone<input name="phone" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="(000) 000-0000" /></label>
      </div>
      <label>Email<input name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@email.com" /></label>
      <p className="ls-field-label">Preferred time</p>
      <div className="ls-slots" role="group" aria-label="Preferred time">
        {slots.map((item) => (
          <button key={item} type="button" aria-pressed={slot === item} className={slot === item ? "on" : ""} onClick={() => setSlot(item)}>{item}</button>
        ))}
      </div>
      <label className="ls-consent">
        <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
        <span>I agree to be contacted by the listing agent by call or text about this property. Consent is not a condition of purchase.</span>
      </label>
      {error ? <p className="ls-form-error" role="alert">{error}</p> : null}
      <button type="submit" className="ls-submit">{submitLabel} <span aria-hidden="true">→</span></button>
    </form>
  );
}

export function AgentBrand({
  model,
  variant,
}: {
  model: ListingSiteModel;
  variant: "band" | "night" | "postcard";
}) {
  const agent = model.agent;
  return (
    <footer className={`ls-agent ls-agent-${variant}`} data-section="agent" id="section-agent">
      <div className="ls-agent-main">
        <Headshot agent={agent} />
        <div>
          <p className="ls-kicker">{variant === "night" ? "After dark · presented by" : "Listed by"}</p>
          <h2 className="ls-display">{agent.name || "Listing agent"}</h2>
          <p>{[agent.brokerage, licenseLabel(agent.license)].filter(Boolean).join(" · ")}</p>
          <p>{[agent.phone, agent.email].filter(Boolean).join(" · ")}</p>
          {agent.office ? <p>{agent.office}</p> : null}
        </div>
        {variant !== "postcard" ? (
          <div className="ls-broker">{agent.brokerage || "Brokerage"}</div>
        ) : null}
      </div>
      <LegalLine />
    </footer>
  );
}

export function LegalLine() {
  return (
    <div className="ls-legal">
      <div className="ls-legal-links">
        <a href={TREC_IABS_URL} target="_blank" rel="noreferrer">TREC Information About Brokerage Services</a>
        <a href={TREC_CPN_URL} target="_blank" rel="noreferrer">TREC Consumer Protection Notice</a>
        <span className="ls-eho"><EqualHousing /> Equal Housing Opportunity</span>
      </div>
      <p className="ls-credit">{ICONIC_MEDIA_CREDIT}</p>
    </div>
  );
}

export function Headshot({ agent }: { agent: PortalAgentBranding }) {
  if (agent.headshotUrl) {
    return <img className="ls-avatar" src={agent.headshotUrl} alt="" loading="lazy" decoding="async" />;
  }
  return (
    <span className="ls-avatar" aria-hidden="true">
      <svg viewBox="0 0 80 80" width="100%" height="100%">
        <rect width="80" height="80" fill="#C9C4BB" />
        <circle cx="40" cy="31" r="14" fill="#8E897F" />
        <path d="M12 80c2-17 14-26 28-26s26 9 28 26z" fill="#8E897F" />
      </svg>
    </span>
  );
}

export function EqualHousing() {
  return (
    <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true">
      <path d="M16 3 2 13h4v15h20V13h4z" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <rect x="10" y="15" width="12" height="2.6" fill="currentColor" />
      <rect x="10" y="20" width="12" height="2.6" fill="currentColor" />
    </svg>
  );
}

export function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
      <path d="M8 5v14l11-7z" fill="currentColor" />
    </svg>
  );
}

export function SampleNote({ show }: { show: boolean }) {
  if (!show) return null;
  return <p className="ls-sample">Sample mock-up · placeholder address, price, agent and stock imagery · not a live listing</p>;
}

export function FactRow({ model }: { model: ListingSiteModel }) {
  const beds = model.facts.find((fact) => fact.id === "beds");
  const baths = model.facts.find((fact) => fact.id === "baths");
  const sqft = model.facts.find((fact) => fact.id === "sqft");
  const lot = model.facts.find((fact) => fact.id === "lotSize");
  return (
    <div className="ls-facts">
      {beds ? <div><b>{beds.value}</b><span>Bedrooms</span></div> : null}
      {baths ? <div><b>{baths.value}</b><span>Baths</span></div> : null}
      {sqft || lot ? <div><b>{sqft?.value || "—"}</b><span>{lot ? `Sq ft · ${lot.value}` : "Sq ft"}</span></div> : null}
    </div>
  );
}

export function SectionWrap({ id, children, className = "" }: { id: string; children: ReactNode; className?: string }) {
  return (
    <section id={`section-${id}`} data-section={id} className={className}>
      {children}
    </section>
  );
}
