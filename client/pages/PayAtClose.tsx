import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { packagesForStaffEditor, type StaffCatalogPackage } from "@shared/bookingCatalog";
import { openTitusEstimateModal } from "@/lib/titusSdk";
import {
  PAY_AT_CLOSE_ADDON_SLOTS,
  PAY_AT_CLOSE_CARD_SLOTS,
  PAY_AT_CLOSE_ESTATES,
  bookPayAtCloseHref,
  catalogPackage,
  formatCatalogDollars,
  payAtCloseEstateGallery,
  payAtCloseFeatureRow,
  type PayAtCloseEstateReel,
} from "@shared/payAtClosePage";
import {
  PAY_AT_CLOSE_PACKAGES_FOOTNOTE,
  TITUS_PAY_AT_CLOSE_PILL_SRC,
} from "@shared/titusEstimate";
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

function TitusPayAtClosePill({ amount, testId }: { amount?: number | null; testId: string }) {
  return (
    <TitusEstimateButton className="titus-pill" amount={amount} testId={testId} label="Pay at close with Titus">
      <img src={TITUS_PAY_AT_CLOSE_PILL_SRC} alt="" />
    </TitusEstimateButton>
  );
}

function TitusEstimateButton({
  amount,
  className,
  children,
  label,
  testId,
}: {
  amount?: number | null;
  className: string;
  children: ReactNode;
  label: string;
  testId?: string;
}) {
  const [error, setError] = useState("");
  return (
    <>
      <button
        type="button"
        className={className}
        data-testid={testId}
        aria-label={label}
        onClick={() => {
          setError("");
          void openTitusEstimateModal(amount).catch(() => {
            setError("Titus’s estimate did not open. Try again.");
          });
        }}
      >
        {children}
      </button>
      {error ? <p className="estimate-error" role="alert">{error}</p> : null}
    </>
  );
}

export default function PayAtClose() {
  const [catalog, setCatalog] = useState<StaffCatalogPackage[]>(() => packagesForStaffEditor([]));
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

  const priceOf = (id: string) => {
    const item = catalogPackage(catalog, id);
    if (!item || !Number.isFinite(item.price)) return null;
    return item.price;
  };
  const nameOf = (id: string, fallback: string) => catalogPackage(catalog, id)?.name || fallback;

  const cards = PAY_AT_CLOSE_CARD_SLOTS.filter((slot) => slot.onGrid);
  const calcPackages = PAY_AT_CLOSE_CARD_SLOTS.filter((slot) => slot.inCalculator);
  const estateFeatures = payAtCloseFeatureRow(PAY_AT_CLOSE_ESTATES);
  const estateGallery = payAtCloseEstateGallery(PAY_AT_CLOSE_ESTATES);

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
  }, [selected, addons, credits, catalog]);

  const togglePackage = (id: string) => {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const addAndScroll = (id: string) => {
    setSelected((current) => (current.includes(id) ? current : [...current, id]));
    document.getElementById("calculator")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="pac-page" data-testid="pay-at-close-landing">
      <div className="urgency">Pay at Close · <span>financing by Titus</span></div>

      <header className="nav">
        <div className="wrap nav-inner">
          <Link className="logo" to="/" aria-label="Iconic Images home">
            <img src="/media/logos/logo-black-large.png" alt="Iconic Images" />
          </Link>
          <nav className="nav-links" aria-label="Page">
            <a href="#packages">Packages</a>
            <a href="#calculator">Estimate</a>
            <a href="#how">How it works</a>
            <a href="#faq">FAQ</a>
          </nav>
          <Link className="btn btn-teal btn-sm" to={bookPayAtCloseHref()}>Order now</Link>
        </div>
      </header>

      <section className="hero" style={{ ["--hero" as string]: `url(${LUXURY}/marias/01-front-day.jpg)` }}>
        <div className="hero-bg" aria-hidden="true" />
        <div className="wrap hero-content">
          <div className="pill">Pay at Close · financing by Titus</div>
          <h1>Spoil your listing.<br /><em>Pay at closing.</em></h1>
          <p className="hero-lead">
            Premium listing media with financing arranged by Titus. Market Leader, Legacy cinema, Showcase aerials and more. Titus pays Iconic now, and it’s settled from proceeds when your listing closes.
          </p>
          <div className="hero-actions">
            <Link className="btn btn-teal" to={bookPayAtCloseHref()}>Order for my listing →</Link>
            <TitusEstimateButton className="btn btn-ghost" amount={media} label="See your rate with Titus">
              See your rate with Titus
            </TitusEstimateButton>
          </div>
          <div className="hero-stats">
            <div className="hero-stat"><strong>Titus</strong><span>Live rates</span></div>
            <div className="hero-stat"><strong>Catalog</strong><span>No added fee</span></div>
            <div className="hero-stat"><strong>Same speed</strong><span>Iconic delivery</span></div>
          </div>
        </div>
      </section>

      <div className="value-strip">
        <div className="wrap value-grid">
          <div className="value-item"><strong>Spoil the listing</strong><span>Full package, no cash crunch at launch</span></div>
          <div className="value-item"><strong>Win the listing</strong><span>Present like the market leader</span></div>
          <div className="value-item"><strong>Same Iconic speed</strong><span>Same-day / next‑day delivery</span></div>
          <div className="value-item"><strong>Paid from proceeds</strong><span>Title handles the payoff at closing</span></div>
        </div>
      </div>

      <section id="packages">
        <div className="wrap">
          <p className="section-kicker">Highest-ticket Iconic packages</p>
          <h2 className="section-title">Stop under-ordering.<br />Close with cinema.</h2>
          <p className="section-sub">These are the same Iconic prices as the booking catalog. Titus shows the live rate when you open the estimate.</p>
          <div className="pkg-grid">
            {cards.map((slot) => {
              const price = priceOf(slot.id);
              const packageName = nameOf(slot.id, slot.calcId);
              return (
                <article key={slot.id} className={slot.featured ? "pkg featured" : "pkg"}>
                  {slot.badge ? <span className={slot.badgeGold ? "pkg-badge gold" : "pkg-badge"}>{slot.badge}</span> : null}
                  <div className="pkg-media"><img src={slot.image} alt={slot.imageAlt} /></div>
                  <div className="pkg-body">
                    <h3 className="pkg-name">{packageName}</h3>
                    <div className="pkg-price" data-testid={`pay-at-close-price-${slot.id}`}>
                      {priceLabel(price)} <small>{slot.priceNote}</small>
                    </div>
                    <TitusPayAtClosePill amount={price} testId={`titus-pill-${slot.id}`} />
                    <p className="pkg-desc">{slot.blurb}</p>
                    {slot.confirmWithPartner ? <p><span className="confirm-tag">Confirm with Titus</span></p> : null}
                    <ul className="pkg-features">
                      {slot.features.map((feature) => <li key={feature}>{feature}</li>)}
                    </ul>
                    <div className="pkg-actions">
                      <Link
                        className={slot.button === "teal" ? "btn btn-teal btn-block" : "btn btn-primary btn-block"}
                        to={bookPayAtCloseHref(slot.id)}
                        aria-label={`Order ${packageName} for my listing`}
                      >
                        Order for my listing
                      </Link>
                      <button type="button" className="btn btn-outline btn-block btn-sm" onClick={() => addAndScroll(slot.id)}>Add to estimate</button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          <p className="pkg-footnote" data-testid="pay-at-close-footnote">{PAY_AT_CLOSE_PACKAGES_FOOTNOTE}</p>
          <div className="center-actions">
            <Link className="btn btn-teal" to={bookPayAtCloseHref()}>Order now</Link>
            <a className="btn btn-outline" href="#calculator">Build my total</a>
          </div>
        </div>
      </section>

      <section className="calc-section" id="calculator">
        <div className="wrap">
          <p className="section-kicker">Titus estimate</p>
          <h2 className="section-title">See your rate<br />with Titus.</h2>
          <p className="section-sub">
            Pick Iconic packages at the catalog price. Titus opens the live estimate for that total. Iconic does not calculate the fee.
          </p>
          <div className="calc-shell">
            <div className="calc-left">
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
                <div className="field-label" style={{ color: "rgba(255,255,255,.55)" }}>Package total</div>
                <div className="result-big" data-testid="pac-media">{formatCatalogDollars(media)}</div>
              </div>
              <p className="result-note ok">This is the Iconic package price. Titus shows the rate and terms in the estimate.</p>
              <TitusEstimateButton className="btn btn-teal btn-block" amount={media} testId="titus-estimate-open" label="See your rate with Titus">
                See your rate with Titus
              </TitusEstimateButton>
              <Link className="btn btn-ghost btn-block" to={bookPayAtCloseHref()}>Order this media now</Link>
            </div>
          </div>
        </div>
      </section>

      <section id="how">
        <div className="wrap">
          <p className="section-kicker">Three steps</p>
          <h2 className="section-title">How Pay at<br />Close works</h2>
          <p className="section-sub">Financing arranged by Titus. The estimate shows the current terms.</p>
          <div className="steps">
            <div className="step">
              <div className="step-num">1</div>
              <h3>See your rate with Titus</h3>
              <p>Open the estimate on a package. Titus shows whether you qualify and the current rate. Iconic does not publish that rate here.</p>
            </div>
            <div className="step">
              <div className="step-num">2</div>
              <h3>Order for your listing.<br />Titus pays Iconic.</h3>
              <p>Once approved, book your shoot. Titus pays Iconic for the listing media.</p>
            </div>
            <div className="step">
              <div className="step-num">3</div>
              <h3>Settled at closing</h3>
              <p>The payoff is settled from the sale. Titus shows the term in the estimate before you accept.</p>
            </div>
          </div>
          <div className="center-actions">
            <Link className="btn btn-teal" to={bookPayAtCloseHref()}>Start my order</Link>
          </div>
        </div>
      </section>

      <section className="work">
        <div className="wrap">
          <p className="section-kicker">Listings that sell</p>
          <h2 className="section-title">Show every listing<br />at its best.</h2>
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
              <summary>Who arranges Pay at Close?</summary>
              <p>Titus arranges the financing. Open the estimate on any package for the live rate and terms. The price on this page is the Iconic package price.</p>
            </details>
            <details>
              <summary>Will checking my rate affect my credit?</summary>
              <p>Titus explains the credit check inside the estimate. Open it from a package before you apply.</p>
            </details>
            <details>
              <summary>Who can use Pay at Close?</summary>
              <p>Agents and homeowners with a listing. Titus confirms eligibility. This page is built for Texas listings.</p>
            </details>
            <details>
              <summary>Is Content Partner eligible?</summary>
              <p>Pay at Close is built for <strong>listing prep</strong> tied to a subject property. Listing packages are the natural fit. Monthly retainers and brand campaigns may need a confirmed listing. <span className="confirm-tag">Confirm with Titus</span></p>
            </details>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="final-cta" style={{ ["--cta" as string]: `url(${LUXURY}/pool-rd/07-front-day.jpg)` }}>
            <div className="final-cta-bg" aria-hidden="true" />
            <h2>Spoil your sellers.<br />Pay at close.</h2>
            <p>Give your sellers the full package. Titus arranges the financing, and the listing looks Iconic while the competition is still waiting on budget.</p>
            <div className="final-actions">
              <Link className="btn btn-teal" to={bookPayAtCloseHref()}>Order now — pay at close</Link>
            </div>
          </div>
        </div>
      </section>

      <footer>
        <div className="wrap footer-inner">
          <img src="/media/logos/logo-black-large.png" alt="Iconic Images" style={{ height: 28, width: "auto" }} />
          <div className="footer-links">
            <Link to={bookPayAtCloseHref()} style={{ fontWeight: 800, color: "var(--teal)" }}>Book</Link>
            {" · "}
            <Link to="/" style={{ fontWeight: 700 }}>Iconic Images</Link>
          </div>
        </div>
        <div className="wrap footnote">Rates and terms come from Titus.</div>
      </footer>

      <div className="sticky-order">
        <div className="so-copy"><strong>Financing by Titus</strong> Pay at Close · Order now</div>
        <Link className="btn btn-teal btn-sm" to={bookPayAtCloseHref()}>Order</Link>
      </div>
    </div>
  );
}
