import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { packagesForStaffEditor, type StaffCatalogPackage } from "@shared/bookingCatalog";
import { payAtCloseListedPrice, payAtClosePublicOffer, type PayAtClosePublicOffer } from "@shared/payAtClose";
import { mergePricingAdjustments } from "@shared/pricingSettings";
import { readPricingAdjustments } from "@/lib/pricingAdjustments";
import {
  PAY_AT_CLOSE_ADDON_SLOTS,
  PAY_AT_CLOSE_CARD_SLOTS,
  PAY_AT_CLOSE_ESTATES,
  TITUS_ESTIMATE_URL,
  bookPayAtCloseHref,
  catalogPackage,
  formatCatalogDollars,
  payAtCloseEstateGallery,
  payAtCloseFeatureRow,
  type PayAtCloseEstateReel,
} from "@shared/payAtClosePage";
import {
  TITUS_TEXAS_PAY_AT_CLOSE,
  estimateTitusPayAtClose,
  formatScheduleDollars,
  titusFeePercentLabel,
  titusTopDeferralCap,
  type TitusBorrowerRole,
  type TitusCreditTier,
  type TitusPropertyType,
} from "@shared/titusPayAtCloseSchedule";
import "./PayAtClose.css";

const LUXURY = "/media/pay-at-close/luxury";

function EstateReel({ reel }: { reel: PayAtCloseEstateReel }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [bright, setBright] = useState(false);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let seeking = false;
    const jump = () => {
      if (video.currentTime >= reel.startAt) {
        setBright(true);
        return;
      }
      if (seeking) return;
      seeking = true;
      video.currentTime = reel.startAt;
    };
    const replay = () => {
      seeking = true;
      video.currentTime = reel.startAt;
      void video.play();
    };
    video.addEventListener("loadeddata", jump);
    video.addEventListener("play", jump);
    video.addEventListener("timeupdate", jump);
    video.addEventListener("seeked", () => {
      seeking = false;
      if (video.currentTime >= reel.startAt) {
        setBright(true);
        void video.play();
      }
    });
    video.addEventListener("ended", replay);
    return () => {
      video.removeEventListener("loadeddata", jump);
      video.removeEventListener("play", jump);
      video.removeEventListener("timeupdate", jump);
      video.removeEventListener("ended", replay);
    };
  }, [reel.startAt]);
  return (
    <>
      {bright ? null : (
        <img className="estate-reel" src={reel.poster} alt="" />
      )}
      <video
        ref={videoRef}
        className="estate-reel"
        src={`${reel.src}#t=${reel.startAt}`}
        poster={reel.poster}
        muted
        autoPlay
        playsInline
        aria-label={reel.alt}
        style={bright ? undefined : { position: "absolute", width: 1, height: 1, opacity: 0 }}
      />
    </>
  );
}

function priceLabel(amount: number | null): string {
  return amount == null ? "—" : formatCatalogDollars(amount);
}

export default function PayAtClose() {
  const [catalog, setCatalog] = useState<StaffCatalogPackage[]>(() => packagesForStaffEditor([]));
  const [offer, setOffer] = useState<PayAtClosePublicOffer>(() => payAtClosePublicOffer(undefined, mergePricingAdjustments([])));
  const [role, setRole] = useState<TitusBorrowerRole>("agent");
  const [tier, setTier] = useState<TitusCreditTier>("prime");
  const [property, setProperty] = useState<TitusPropertyType>("single-family");
  const [selected, setSelected] = useState<string[]>(["listing-showcase"]);
  const [addons, setAddons] = useState<Record<string, boolean>>({});
  const [credits, setCredits] = useState(5);

  useEffect(() => {
    const id = "pac-inter";
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap";
      document.head.appendChild(link);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    getDocs(collection(db, "packages"))
      .then((snap) => {
        if (cancelled) return;
        setCatalog(packagesForStaffEditor(snap.docs.map((entry) => ({ id: entry.id, ...entry.data() }))));
      })
      .catch(() => {
        if (!cancelled) setCatalog(packagesForStaffEditor([]));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    readPricingAdjustments()
      .then((adjustments) => {
        if (!cancelled) setOffer(payAtClosePublicOffer(undefined, adjustments));
      })
      .catch(() => {
        if (!cancelled) setOffer(payAtClosePublicOffer(undefined, mergePricingAdjustments([])));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const priceOf = (id: string) => {
    const item = catalogPackage(catalog, id);
    if (!item || !Number.isFinite(item.price)) return null;
    return payAtCloseListedPrice(item.price, offer);
  };
  const nameOf = (id: string, fallback: string) => catalogPackage(catalog, id)?.name || fallback;

  const cards = PAY_AT_CLOSE_CARD_SLOTS.filter((slot) => slot.onGrid);
  const calcPackages = PAY_AT_CLOSE_CARD_SLOTS.filter((slot) => slot.inCalculator);
  const staging = priceOf("virtual-staging");

  const media = useMemo(() => {
    let total = 0;
    for (const id of selected) {
      const amount = priceOf(id);
      if (amount != null) total += amount;
    }
    for (const addon of PAY_AT_CLOSE_ADDON_SLOTS) {
      if (!addons[addon.id]) continue;
      const amount = priceOf(addon.id);
      if (amount == null) continue;
      total += addon.credits ? amount * Math.max(0, credits) : amount;
    }
    return total;
  }, [selected, addons, credits, catalog, offer]);

  const estimate = estimateTitusPayAtClose({ role, tier, property, media });
  const estateFeatures = payAtCloseFeatureRow(PAY_AT_CLOSE_ESTATES);
  const estateGallery = payAtCloseEstateGallery(PAY_AT_CLOSE_ESTATES);
  const showcasePrice = priceOf("listing-showcase");
  const showcaseAtClose = showcasePrice == null ? null : showcasePrice * 1.04;
  const dueToday = formatScheduleDollars(TITUS_TEXAS_PAY_AT_CLOSE.dueToday);
  const topCap = formatScheduleDollars(titusTopDeferralCap());

  const togglePackage = (id: string) => {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const addAndScroll = (id: string) => {
    setSelected((current) => (current.includes(id) ? current : [...current, id]));
    document.getElementById("calculator")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="pac-page" data-testid="pay-at-close-landing">
      <div className="urgency">New · Pay at Close · <span>{dueToday} due today</span> · Spoil yourself</div>

      <header className="nav">
        <div className="wrap nav-inner">
          <Link className="logo" to="/" aria-label="Iconic Images home">
            <img src="/media/logos/logo-black-large.png" alt="Iconic Images" />
          </Link>
          <nav className="nav-links" aria-label="Page">
            <a href="#packages">Packages</a>
            <a href="#calculator">Calculator</a>
            <a href="#how">How it works</a>
            <a href="#faq">FAQ</a>
          </nav>
          <Link className="btn btn-teal btn-sm" to={bookPayAtCloseHref()}>Order now</Link>
        </div>
      </header>

      <section className="hero" style={{ ["--hero" as string]: `url(${LUXURY}/marias/01-front-day.jpg)` }}>
        <div className="hero-bg" aria-hidden="true" />
        <div className="wrap hero-content">
          <div className="pill">Pay at Close · Our financing Partner</div>
          <h1>Spoil yourself.<br /><em>Pay at closing.</em></h1>
          <p className="hero-lead">
            Estate-scale media — Market Leader, Legacy cinema, Showcase aerials — for homes over 6,000 square feet.
            Take advantage of our discounts with Pay at Close. <strong>{dueToday} due today.</strong> Our financing Partner covers Iconic now. You settle when the home closes.
          </p>
          <div className="hero-actions">
            <Link className="btn btn-teal" to={bookPayAtCloseHref()}>Order your shoot →</Link>
            <a className="btn btn-ghost" href="#calculator">Estimate my payoff</a>
          </div>
          <div className="hero-stats">
            <div className="hero-stat"><strong>{dueToday}</strong><span>Due today</span></div>
            <div className="hero-stat"><strong>Up to {topCap}</strong><span>Defer till close</span></div>
            <div className="hero-stat"><strong>~2 min</strong><span>Partner application</span></div>
          </div>
        </div>
      </section>

      <div className="value-strip">
        <div className="wrap value-grid">
          <div className="value-item"><strong>Order bigger</strong><span>No cash crunch on launch day</span></div>
          <div className="value-item"><strong>Win the listing</strong><span>Present like the market leader</span></div>
          <div className="value-item"><strong>Same Iconic speed</strong><span>Same-day / next-day delivery</span></div>
          <div className="value-item"><strong>Paid from proceeds</strong><span>Title handles the payoff</span></div>
        </div>
      </div>

      <section id="packages">
        <div className="wrap">
          <p className="section-kicker">Highest-ticket Iconic packages</p>
          <h2 className="section-title">Stop under-ordering.<br />Close with cinema.</h2>
          <p className="section-sub">These are real Iconic prices from our booking catalog. Stack them in the calculator — then hit Order.</p>
          <div className="pkg-grid">
            {cards.map((slot) => {
              const price = priceOf(slot.id);
              return (
                <article key={slot.id} className={slot.featured ? "pkg featured" : "pkg"}>
                  {slot.badge ? <span className={slot.badgeGold ? "pkg-badge gold" : "pkg-badge"}>{slot.badge}</span> : null}
                  <div className="pkg-media"><img src={slot.image} alt={slot.imageAlt} /></div>
                  <div className="pkg-body">
                    <h3 className="pkg-name">{nameOf(slot.id, slot.calcId)}</h3>
                    <div className="pkg-price" data-testid={`pay-at-close-price-${slot.id}`}>
                      {priceLabel(price)} <small>{slot.priceNote}</small>
                    </div>
                    <p className="pkg-desc">{slot.blurb}</p>
                    {slot.confirmWithPartner ? <p><span className="confirm-tag">Confirm with our Partner</span></p> : null}
                    <ul className="pkg-features">
                      {slot.features.map((feature) => <li key={feature}>{feature}</li>)}
                    </ul>
                    <div className="pkg-actions">
                      <Link className={slot.button === "teal" ? "btn btn-teal btn-block" : "btn btn-primary btn-block"} to={bookPayAtCloseHref(slot.id)}>
                        Order {nameOf(slot.id, slot.calcId)}
                      </Link>
                      <button type="button" className="btn btn-outline btn-block btn-sm" onClick={() => addAndScroll(slot.id)}>Add to calculator</button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="center-actions">
            <Link className="btn btn-teal" to={bookPayAtCloseHref()}>Order now — {dueToday} due today</Link>
            <a className="btn btn-outline" href="#calculator">Build my total</a>
          </div>
        </div>
      </section>

      <section className="calc-section" id="calculator">
        <div className="wrap">
          <p className="section-kicker">Pay at Close calculator</p>
          <h2 className="section-title">See what you pay<br />when it closes.</h2>
          <p className="section-sub">
            Texas estimate for Iconic’s market. Pick packages, set your credit tier —
            see <strong>{dueToday} due now</strong> and the flat-fee payoff at close. Exact approval comes from your{" "}
            <a href={TITUS_ESTIMATE_URL}>Partner estimate</a>.
          </p>
          <div className="calc-shell">
            <div className="calc-left">
              <div className="field-row">
                <span className="field-label">I am a</span>
                <div className="seg" role="group" aria-label="Borrower role">
                  <button type="button" className={role === "agent" ? "active" : ""} onClick={() => setRole("agent")}>Agent</button>
                  <button type="button" className={role === "homeowner" ? "active" : ""} onClick={() => setRole("homeowner")}>Homeowner</button>
                </div>
              </div>
              <div className="field-row">
                <label className="field-label" htmlFor="pac-credit">Credit score</label>
                <select id="pac-credit" value={tier} onChange={(event) => setTier(event.target.value as TitusCreditTier)}>
                  {TITUS_TEXAS_PAY_AT_CLOSE.tiers.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="field-row">
                <label className="field-label" htmlFor="pac-state">State</label>
                <select id="pac-state" value="TX" aria-label="State" onChange={() => undefined}>
                  <option value="TX">Texas (TX)</option>
                </select>
                <p className="hint">
                  Texas rates are confirmed for this calculator. Other states:{" "}
                  <a href={TITUS_ESTIMATE_URL}>get your Partner estimate</a>.
                </p>
              </div>
              <div className="field-row">
                <label className="field-label" htmlFor="pac-property">Property type</label>
                <select id="pac-property" value={property} onChange={(event) => setProperty(event.target.value as TitusPropertyType)}>
                  <option value="single-family">Single family</option>
                  <option value="condo">Condo</option>
                  <option value="townhome">Townhome</option>
                  <option value="multi-unit">1–4 unit residential</option>
                  <option value="manufactured-home">Manufactured / mobile</option>
                </select>
              </div>
              <div className="field-row">
                <span className="field-label">Select Iconic packages</span>
                <div className="pkg-checks">
                  {calcPackages.map((slot) => {
                    const on = selected.includes(slot.id);
                    return (
                      <label key={slot.id} className={on ? "pkg-check on" : "pkg-check"}>
                        <input type="checkbox" checked={on} onChange={() => togglePackage(slot.id)} />
                        <span>
                          <span className="pc-name">{nameOf(slot.id, slot.calcId)}</span>
                          <span className="pc-meta">{slot.calcMeta}</span>
                        </span>
                        <span className="pc-price">{priceLabel(priceOf(slot.id))}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="field-row">
                <span className="field-label">Add-ons</span>
                <div className="pkg-checks">
                  {PAY_AT_CLOSE_ADDON_SLOTS.map((addon) => {
                    const on = Boolean(addons[addon.id]);
                    const amount = priceOf(addon.id);
                    const shown = addon.credits ? (amount == null ? null : amount * Math.max(0, credits)) : amount;
                    return (
                      <label key={addon.id} className={on ? `pkg-check on${addon.credits ? " vs-row" : ""}` : `pkg-check${addon.credits ? " vs-row" : ""}`}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => setAddons((current) => ({ ...current, [addon.id]: !current[addon.id] }))}
                        />
                        <span>
                          <span className="pc-name">{nameOf(addon.id, addon.id)}</span>
                          <span className="pc-meta">
                            {addon.credits && amount != null ? `${formatCatalogDollars(amount)} per credit` : addon.meta}
                          </span>
                        </span>
                        {addon.credits ? (
                          <input
                            type="number"
                            min={0}
                            max={40}
                            value={credits}
                            aria-label="Virtual staging credits"
                            onChange={(event) => setCredits(Number(event.target.value))}
                          />
                        ) : null}
                        <span className="pc-price">{priceLabel(shown)}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="calc-right">
              <div>
                <div className="field-label" style={{ color: "rgba(255,255,255,.55)" }}>Due today</div>
                <div className="result-big" data-testid="pac-due-now">{dueToday}</div>
              </div>
              <div className="result-row"><span>Media total</span><strong data-testid="pac-media">{formatScheduleDollars(estimate.media)}</strong></div>
              <div className="result-row">
                <span>Partner flat fee <span>{estimate.rate == null ? "(n/a)" : `(${titusFeePercentLabel(estimate.rate)} flat)`}</span></span>
                <strong>{estimate.fee == null ? "—" : formatScheduleDollars(estimate.fee)}</strong>
              </div>
              <div className="result-row">
                <span>Paid at close</span>
                <strong className="payoff" data-testid="pac-at-close">{estimate.payoff == null ? "—" : formatScheduleDollars(estimate.payoff)}</strong>
              </div>
              <div className="result-row"><span>Max you can defer</span><strong>{estimate.cap == null ? "—" : formatScheduleDollars(estimate.cap)}</strong></div>
              <div className={estimate.unavailable || estimate.overCap ? "result-note warn" : "result-note ok"}>{estimate.note}</div>
              <Link className="btn btn-teal btn-block" to={bookPayAtCloseHref()}>Order this media now</Link>
              <a className="btn btn-ghost btn-block" href={TITUS_ESTIMATE_URL}>Get your Partner estimate</a>
            </div>
          </div>
        </div>
      </section>

      <section id="how">
        <div className="wrap">
          <p className="section-kicker">Three steps</p>
          <h2 className="section-title">How Pay at Close works</h2>
          <p className="section-sub">The same three steps our financing Partner uses for Iconic.</p>
          <div className="steps">
            <div className="step">
              <div className="step-num">1</div>
              <h3>Apply in ~2 minutes</h3>
              <p>Agent or homeowner completes a short application with our financing Partner. Soft credit pull — does not ding your score for pre-qualification.</p>
            </div>
            <div className="step">
              <div className="step-num">2</div>
              <h3>Order Iconic. We get paid.</h3>
              <p>Once approved, book your shoot. Our Partner pays Iconic for the estate media. You pay <strong>{dueToday} out of pocket today</strong>.</p>
            </div>
            <div className="step">
              <div className="step-num">3</div>
              <h3>Settled at closing</h3>
              <p>At close of escrow, our Partner sends a payoff to title/escrow. Repaid from sale proceeds plus a low flat fee. Due at sale or 6 months, whichever comes first.</p>
            </div>
          </div>
          <div className="center-actions">
            <Link className="btn btn-teal" to={bookPayAtCloseHref()}>Start my order</Link>
          </div>
        </div>
      </section>

      <section className="work">
        <div className="wrap">
          <p className="section-kicker">Homes over 6,000 square feet</p>
          <h2 className="section-title">Estate scale. Daylight.</h2>
          {estateFeatures.length ? (
            <div className="estate-row">
              {estateFeatures.map((item) => item.kind === "still" ? (
                <figure className="estate-feature" key={item.key}>
                  <img src={item.still.src} alt={item.still.alt} />
                  <figcaption>{item.still.caption}</figcaption>
                </figure>
              ) : (
                <figure className="estate-reel-card" key={item.key}>
                  <EstateReel reel={item.reel} />
                  <figcaption>{item.reel.caption}</figcaption>
                </figure>
              ))}
            </div>
          ) : null}
          {estateGallery.length ? (
            <div className="gallery">
              {estateGallery.map((shot) => (
                <figure key={shot.key}>
                  <img src={shot.src} alt={shot.alt} />
                  <figcaption>{shot.caption}</figcaption>
                </figure>
              ))}
            </div>
          ) : null}
          <div className="center-actions">
            <Link className="btn btn-primary" to={bookPayAtCloseHref()}>Order the look →</Link>
          </div>
        </div>
      </section>

      <section id="faq">
        <div className="wrap">
          <p className="section-kicker">FAQ</p>
          <h2 className="section-title">Straight answers</h2>
          <div className="faq">
            <details open>
              <summary>What do I pay Iconic today?</summary>
              <p><strong>{dueToday}</strong> when you use Pay at Close on an approved order. Our financing Partner funds the media. You repay our Partner at closing (or within 6 months).</p>
            </details>
            <details>
              <summary>How does the Partner fee work?</summary>
              <p>When the home sells, our financing Partner is repaid for the media plus a flat fee based on credit tier and state (0%–8%).{showcasePrice != null && showcaseAtClose != null ? ` A Showcase at ${formatCatalogDollars(showcasePrice)} with a 4% Partner fee is ${formatScheduleDollars(showcaseAtClose)} at close.` : ""} Texas rates in this calculator follow our Partner’s published estimate.</p>
            </details>
            <details>
              <summary>What’s the most I can defer?</summary>
              <p>Up to <strong>{topCap}</strong> for prime / near-prime credit (670+), and up to <strong>{formatScheduleDollars(TITUS_TEXAS_PAY_AT_CLOSE.caps["upper-subprime"] || 0)}</strong> for average / fair tiers (640–669), subject to equity, LTV, and approval. Manufactured homes are capped lower (agents only, max {formatScheduleDollars(TITUS_TEXAS_PAY_AT_CLOSE.manufacturedAgentMax)}).</p>
            </details>
            <details>
              <summary>What if the home doesn’t sell?</summary>
              <p>Funds are due six months after first disbursement. Homeowners may repay or extend; extensions use a 16% annual interest rate with our Partner. Agents repay directly after the due date.</p>
            </details>
            <details>
              <summary>Will this hurt my credit?</summary>
              <p>Our financing Partner uses a <strong>soft pull</strong> for pre-qualification. Delinquency after funding may be reported and could affect credit.</p>
            </details>
            <details>
              <summary>Who qualifies?</summary>
              <p>Homeowners: own the listed property, signed listing agreement, within our Partner’s limits, minimum credit by state. Agents: active license, signed listing agreement, payment under half of expected commission, minimum credit. Texas is fully supported for agents and homeowners.</p>
            </details>
            <details>
              <summary>Is monthly social (Content Partner) eligible?</summary>
              <p>Pay at Close is built for <strong>listing prep</strong> tied to a subject property. Listing packages are the natural fit. Monthly retainers and brand campaigns may need a confirmed listing context — verify on your Partner estimate. <span className="confirm-tag">Confirm with our Partner</span></p>
            </details>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="final-cta" style={{ ["--cta" as string]: `url(${LUXURY}/pool-rd/07-front-day.jpg)` }}>
            <div className="final-cta-bg" aria-hidden="true" />
            <h2>Spoil yourself. Pay at close.</h2>
            <p>Take the estate package. Take advantage of our discounts with Pay at Close. The house looks Iconic while the other listing is still waiting on budget.</p>
            <div className="final-actions">
              <Link className="btn btn-teal" to={bookPayAtCloseHref()}>Order now — pay at close</Link>
              <a className="btn btn-ghost" href={TITUS_ESTIMATE_URL}>Get your Partner estimate</a>
            </div>
          </div>
        </div>
      </section>

      <footer>
        <div className="wrap footer-inner">
          <img src="/media/logos/logo-black-large.png" alt="Iconic Images" style={{ height: 28, width: "auto" }} />
          <div>
            <Link to={bookPayAtCloseHref()} style={{ fontWeight: 800, color: "var(--teal)" }}>Book</Link>
            {" · "}
            <Link to="/" style={{ fontWeight: 700 }}>Iconic Images</Link>
          </div>
        </div>
        <div className="wrap footnote">Estimates only. Final terms set by our Partner.</div>
      </footer>

      <div className="sticky-order">
        <div className="so-copy"><strong>{dueToday} due today</strong> Pay at Close · Order now</div>
        <Link className="btn btn-teal btn-sm" to={bookPayAtCloseHref()}>Order</Link>
      </div>
    </div>
  );
}
