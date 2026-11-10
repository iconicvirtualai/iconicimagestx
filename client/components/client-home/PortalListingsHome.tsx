import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { portalHref } from "@/components/client-hub/PortalShell";
import { sampleCardFace } from "@/lib/exampleHub";
import { chicagoInstant, countdownParts, dayPart } from "@/lib/portalTime";
import { BUSINESS_CONTACT } from "@shared/businessContact";
import {
  clientListingPath,
  humanStatus,
  type ClientAppointment,
  type ClientListingCard,
} from "@shared/clientHome";
import { ListingPackageCard } from "@/components/listing-card/ListingPackageCard";

const MEDIA = "/media/portal-v2";

const LISTING_BADGE: Record<string, string> = {
  unscheduled: "Unscheduled",
  scheduled: "Scheduled",
  consult_scheduled: "Consult scheduled",
  appt_scheduled: "Scheduled",
  in_progress: "Editing",
  delivered: "Delivered",
  paid: "Paid",
  delivered_paid: "Delivered",
  archived: "Archived",
  cancelled: "Cancelled",
  canceled: "Cancelled",
};

export function PortalListingsHome({
  firstName,
  listings,
  appointments,
  example,
  today,
  onSection,
}: {
  firstName: string;
  listings: ClientListingCard[];
  appointments: ClientAppointment[];
  example: boolean;
  today: string;
  onSection?: (section: "schedule" | "messages") => void;
}) {
  const greeting = dayPart();
  const next = example
    ? {
      date: "2026-11-12",
      time: "5:30 PM",
      whenLabel: "Thursday, November 12 at 5:30 in the evening",
      where: "Hunter Creek, The Woodlands",
      hero: `${MEDIA}/hero-twilight.jpg`,
      note: "Please have every light on by 5:15. Cars off the drive, bins out of sight. The gate can stay unlocked — Mike already has the code.",
    }
    : nextShoot(appointments, today);

  return (
    <div>
      <section className="greet-block">
        <h1 className="greet-h">{greeting}, {firstName}.</h1>
        <p className="lede">
          {example
            ? <>Your twilight at Hunter Creek is Thursday. Mike’s already watching the sky. <span className="sample">Sample</span></>
            : next
              ? <>Your next shoot is on the books. The desk note below is the same prep we send every twilight.</>
              : <>When a shoot is on your account, it shows up here with the prep note from the desk.</>}
        </p>
      </section>

      {next ? (
        <ShootHero next={next} example={example} onSection={onSection} />
      ) : (
        <section className="hero">
          <div className="hero-card" style={{ gridColumn: "1 / -1" }}>
            <div className="kicker">Next shoot</div>
            <h2>No shoot on the books yet</h2>
            <p className="note">Place an order and the date lands on your schedule. We don’t show a sample property on a live account.</p>
            <div className="actions-inline">
              <Link className="btn btn-teal btn-md" to={portalHref("/portal/order", example)}>Place Order</Link>
            </div>
          </div>
        </section>
      )}

      <nav className="quick" aria-label="Quick actions">
        <Link to={portalHref("/portal/order", example)}><span className="ql"><em>01</em> Place Order</span><small>Photography, video, aerial</small></Link>
        <a href="#studios"><span className="ql"><em>02</em> Book the studio</span><small>Noir, Blanc, and the Podcast Studio</small></a>
        <a href="#studio-tools"><span className="ql"><em>03</em> Request an edit</span><small>Staging, twilight, revisions</small></a>
        <Link to="/pay-at-close"><span className="ql"><em>04</em> Pay at Close</span><small>Arranged by Titus</small></Link>
      </nav>

      <div className="split">
        <section>
          <div className="sec-h">
            <h2>Listings</h2>
            {listings[0] ? <Link to={listingHref(listings[0], example)}>Open galleries</Link> : null}
          </div>
          {listings.length === 0 ? (
            <div className="card">
              <h3>No listings yet</h3>
              <p>No listings are tied to this account yet. A project saved for this login shows up here.</p>
            </div>
          ) : (
            <div className="listings">
              {listings.map((listing) => (
                <ListingRow key={listing.id} listing={listing} example={example} />
              ))}
            </div>
          )}
        </section>
        <aside className="side">
          <Rewards example={example} />
          <TeamBlock example={example} onSection={onSection} />
        </aside>
      </div>

      <FreshFromIconic example={example} />
      <Studios example={example} />
      <section className="suite" id="suite">
        <div>
          <div className="kicker gold">The Iconic Suite · coming to your portal</div>
          <h3>From Leads to Listings.</h3>
          <p>
            A quieter way to carry a name from the first inquiry to the sold sign — leads, your team, and the work already living in this portal, together. We’ll save you a seat. Your Clients list under Settings is already here.
            {example ? <span className="sample">Teaser</span> : null}
          </p>
        </div>
        <div style={{ justifySelf: "end" }}>
          <Link className="btn btn-outline btn-md" to={portalHref("/portal/settings/clients", example)}>Open Clients</Link>
        </div>
      </section>
    </div>
  );
}

function ShootHero({
  next,
  example,
  onSection,
}: {
  next: { date: string; time: string; whenLabel: string; where: string; hero: string; note: string };
  example: boolean;
  onSection?: (section: "schedule" | "messages") => void;
}) {
  const target = chicagoInstant(next.date, next.time);
  const count = useCountdown(target);
  return (
    <section className="hero">
      <div className="hero-photo">
        <img src={next.hero} alt="" />
      </div>
      <aside className="hero-card">
        <div className="kicker">Next shoot</div>
        <h2>{next.whenLabel}</h2>
        <div className="where">{next.where} {example ? <span className="sample">Sample</span> : null}</div>
        <div className="photog">
          <img src={`${MEDIA}/mike.jpg`} alt="Mike Luna, Iconic Images photographer" />
          <div>
            <div className="pn">Mike Luna</div>
            <div className="pr">{example ? "Your photographer · he’ll catch the last light" : "Iconic photographer"}</div>
          </div>
        </div>
        {count ? (
          <div className="count">
            <div><b>{count.days}</b><span>days</span></div>
            <div><b>{count.hours}</b><span>hours</span></div>
          </div>
        ) : null}
        <p className="note"><strong>A note from the desk.</strong> {next.note}</p>
        <div className="actions-inline">
          <button type="button" className="btn btn-teal btn-md" onClick={() => onSection?.("schedule")}>See the shot list</button>
          <button type="button" className="btn btn-ghost btn-md" onClick={() => onSection?.("messages")}>Message Mike</button>
        </div>
      </aside>
    </section>
  );
}

function Rewards({ example }: { example: boolean }) {
  return (
    <>
      <div className="widget loyalty">
        <div className="kicker gold">Loyalty program</div>
        <h3>Iconic Rewards</h3>
        {example ? (
          <>
            <div className="pts">1,840<span> pts</span></div>
            <div className="prog">
              <div className="lab"><span>Toward a complimentary twilight</span><span>1,840 / 2,000</span></div>
              <div className="track"><i style={{ width: "92%" }} /></div>
            </div>
            <p>You’re 160 points from a complimentary twilight — nicely timed with the week you have ahead. <span className="sample">Sample</span></p>
          </>
        ) : (
          <p>Points show here when they’re stored on your account. We don’t estimate a balance that isn’t on file.</p>
        )}
      </div>
      <div className="widget">
        <div className="kicker">Broker Bundle</div>
        <h3>Photo credits</h3>
        {example ? (
          <>
            <div className="credits-n">3<span> credits</span></div>
            <p>Each credit is 25 photos, and every credit shoot includes a complimentary 2D floorplan. <span className="sample">Sample</span></p>
          </>
        ) : (
          <p>Credits on your account are listed in Billing. This card stays quiet until a balance is stored.</p>
        )}
      </div>
      <div className="widget">
        <div className="kicker">Done for you</div>
        <h3>Social Media Management</h3>
        <p>We plan, write, and post the week. You approve the calendar — and the Listing Kit already has this week’s Just Listed and Coming Soon in it.</p>
      </div>
    </>
  );
}

function TeamBlock({ example, onSection }: { example: boolean; onSection?: (section: "schedule" | "messages") => void }) {
  return (
    <div className="widget" id="team">
      <div className="kicker">Your team at Iconic</div>
      <h3>Right here with you</h3>
      <div className="team-people">
        <div className="t-row">
          <img src={`${MEDIA}/mike.jpg`} alt="Mike Luna, Iconic Images photographer" />
          <div>
            <div className="tn">Mike Luna</div>
            <div className="tr">{example ? "Your photographer for Hunter Creek" : "Photographer"}</div>
          </div>
        </div>
        <div className="t-row">
          <img src={`${MEDIA}/cadi.jpg`} alt="Cadi Torres, Iconic Images" />
          <div>
            <div className="tn">Cadi Torres</div>
            <div className="tr">Your producer at the desk</div>
          </div>
        </div>
      </div>
      <div className="team-meta">
        Studio 105 · {BUSINESS_CONTACT.address}<br />
        <a href={BUSINESS_CONTACT.phoneHref}>{BUSINESS_CONTACT.phoneDisplay}</a>
        {" · "}
        <a href={BUSINESS_CONTACT.emailHref}>{BUSINESS_CONTACT.email}</a>
      </div>
      <div className="actions-inline">
        <button type="button" className="btn btn-teal btn-sm" onClick={() => onSection?.("messages")}>Message the desk</button>
      </div>
    </div>
  );
}

function FreshFromIconic({ example }: { example: boolean }) {
  const href = example ? "/portal/listings/example-listing?example=1" : "/portal/order";
  const tiles = [
    { title: "Snap Reel", copy: "It closes on your branding.", src: `${MEDIA}/snap-reel.jpg`, className: "tile snap" },
    { title: "Just Listed kit", copy: "Ready to post. Auto-built on payment.", src: `${MEDIA}/kit-just-listed.jpg`, className: "tile" },
    { title: "Coming Soon kit", copy: "Social templates, already in your voice.", src: `${MEDIA}/kit-coming-soon.jpg`, className: "tile" },
    { title: "Doors Open Tour", copy: "Open homes, already styled.", src: `${MEDIA}/doors-open.jpg`, className: "tile" },
    { title: "Iconic Studio", copy: "Edits, staging, twilight, AI tools, listing sites — or request a revision.", src: `${MEDIA}/luxury-living.jpg`, className: "tile" },
  ];
  return (
    <section className="fresh" id="studio-tools">
      <div className="sec-h"><h2>Fresh from Iconic</h2></div>
      <div className="fresh-row">
        {tiles.map((tile) => (
          <Link key={tile.title} className={tile.className} to={href}>
            <img src={tile.src} alt="" />
            <div className="veil" />
            <div className="cap"><h4>{tile.title}</h4><p>{tile.copy}</p></div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Studios({ example }: { example: boolean }) {
  const href = portalHref("/portal/order", example);
  return (
    <section id="studios" style={{ marginBottom: 36 }}>
      <div className="sec-h"><h2>Book the studio</h2></div>
      <div className="fresh-row three">
        <Link className="tile noir" to={href}>
          <img src={`${MEDIA}/studio-noir.jpg`} alt="" />
          <div className="veil" />
          <div className="cap"><h4>Studio Noir</h4><p>The dark room. Portraits, moody work, evening sets.</p></div>
        </Link>
        <Link className="tile" to={href}>
          <img src={`${MEDIA}/studio-blanc.jpg`} alt="" />
          <div className="veil" />
          <div className="cap"><h4>Studio Blanc</h4><p>Open white sweep. Headshots, product, clean light.</p></div>
        </Link>
        <Link className="tile" to={href}>
          <img src={`${MEDIA}/studio-podcast.jpg`} alt="" />
          <div className="veil" />
          <div className="cap"><h4>Podcast Studio</h4><p>Cameras, mics, and a set that’s already lit.</p></div>
        </Link>
      </div>
    </section>
  );
}

export function ListingRow({ listing, example }: { listing: ClientListingCard; example: boolean }) {
  if (listing.look) return <ListingPackageCard listing={listing} example={example} />;
  const face = example ? sampleCardFace(listing.id) : null;
  const badge = face?.badge || LISTING_BADGE[listing.status] || humanStatus(listing.status) || "Status not stored";
  const kind = listing.projectType === "business" ? "Business" : listing.projectType === "real_estate" ? "Real estate" : "";
  const dateLabel = listing.appointmentDate
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(utcDate(listing.appointmentDate))
    : "";
  const photos = listing.imageCount === 0 ? "No photos yet" : `${listing.imageCount} photo${listing.imageCount === 1 ? "" : "s"}`;
  return (
    <Link to={listingHref(listing, example)} className="lcard">
      <div className="ph">
        {listing.coverUrl ? <img src={listing.coverUrl} alt="" /> : null}
      </div>
      <div className="body">
        <div className="tags">
          {kind ? <span className="tag">{kind}</span> : null}
          <span className={face?.soft ? "tag soft" : "tag ok"}>{badge}</span>
        </div>
        <h4>{listing.address}</h4>
        <div className="meta">
          {face ? face.meta : [photos, dateLabel].filter(Boolean).join(" · ")}
          {example ? <span className="sample">Sample</span> : null}
        </div>
        <div className="prog">
          <div className="lab">
            <span>{face?.stage || "Delivery"}</span>
            <span>{face?.stageValue || (listing.status === "delivered" ? "Ready" : humanStatus(listing.status) || "On file")}</span>
          </div>
          <div className="track"><i style={{ width: face?.width || (listing.status === "delivered" ? "100%" : "40%") }} /></div>
        </div>
        {face ? (
          <div className="bits">{face.bits.map((bit) => <span key={bit}>{bit}</span>)}</div>
        ) : null}
      </div>
    </Link>
  );
}

function listingHref(listing: ClientListingCard, example: boolean): string {
  if (example) return "/portal/listings/example-listing?example=1";
  return clientListingPath(listing.id);
}

function nextShoot(appointments: ClientAppointment[], today: string) {
  const upcoming = appointments
    .filter((item) => item.date && item.date >= today)
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const next = upcoming[0];
  if (!next?.date) return null;
  const when = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(utcDate(next.date));
  return {
    date: next.date,
    time: next.time || "9:00 AM",
    whenLabel: next.time ? `${when} at ${next.time}` : when,
    where: next.address,
    hero: `${MEDIA}/hero-twilight.jpg`,
    note: "Please have every light on by 5:15. Cars off the drive, bins out of sight.",
  };
}

function useCountdown(target: Date | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  if (!target) return null;
  return countdownParts(target, new Date(now));
}

function utcDate(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}
