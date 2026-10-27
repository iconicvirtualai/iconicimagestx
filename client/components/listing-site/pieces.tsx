import { useState, type FormEvent } from "react";
import type { ListingSiteDesign, PublicListingSite } from "@shared/listingSite";

export function TourPoster({ site }: { site: PublicListingSite }) {
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

export function Plan({ site }: { site: PublicListingSite }) {
  if (site.floorplan) return <img src={site.floorplan.url} alt={site.floorplan.name} />;
  if (site.photos.length === 0) return <p className="ls-empty">No floorplan on this listing yet.</p>;
  return (
    <ul className="ls-plan-list">
      {site.photos.map((photo) => <li key={photo.url}>{photo.name}</li>)}
    </ul>
  );
}

export function LeadForm({
  site,
  variant,
  heading,
}: {
  site: PublicListingSite;
  variant: ListingSiteDesign;
  heading?: string;
}) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [when, setWhen] = useState("Saturday");
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState("");
  const title = heading ?? (variant === "premiere" ? "Book a screening" : variant === "two-up" ? "Request a showing" : "Visit");

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
      <h2>{title}</h2>
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

export function AgentBand({ site }: { site: PublicListingSite }) {
  const agent = site.agent;
  return (
    <section className="ls-agent">
      <h2>{agent.name || "Listing agent"}</h2>
      <p>
        {[agent.brokerage, agent.license ? `TX Lic. #${agent.license}` : "", agent.phone, agent.email].filter(Boolean).join(" · ")}
      </p>
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
