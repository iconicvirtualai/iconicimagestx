import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { MoneyAmount } from "@/components/MoneyAmount";
import { PublicContactLine } from "@/components/PublicContactLine";
import {
  publishedSeniorLivingPhotos,
  seniorLivingPhotoSrc,
  SENIOR_LIVING_MATTERPORT_ALLOW,
  SENIOR_LIVING_MATTERPORT_SRC,
  SENIOR_LIVING_MATTERPORT_TITLE,
  type SeniorLivingPhoto,
} from "@/content/seniorLiving";
import { BUSINESS_CONTACT, LEGAL_BUSINESS_NAME } from "@shared/businessContact";
import {
  formatSeniorFacilityRate,
  formatUsd,
  parseSeniorLivingRequest,
  SENIOR_FACILITY_RATE_PER_SQFT,
  SENIOR_FACILITY_SQFT_CAP,
  SENIOR_LIVING_SERVICE_IDS,
  SENIOR_LIVING_SERVICE_LABELS,
  SENIOR_ROOM_RATES,
  SENIOR_TOUR_PRICE,
  SENIOR_TOUR_SQFT_CAP,
  type SeniorLivingServiceId,
} from "@shared/seniorLiving";
import { TRAVEL_ZONES } from "@shared/travelZones";

/**
 * /book preselects a catalog package with ?service= or ?package=.
 * The catalog has no Senior Living package (Matterport there is a $200 add-on,
 * not this offer), so the request stays on this page.
 */
export const SENIOR_LIVING_CTA = "Schedule when you're ready for us to come!";

const pageType =
  "min-h-screen overflow-x-clip bg-black font-[Inter,ui-sans-serif,system-ui,sans-serif] text-white [overflow-wrap:normal] [word-break:normal] [hyphens:manual] [&_*]:[overflow-wrap:normal] [&_*]:[word-break:normal] [&_*]:[hyphens:manual]";

const fieldClass =
  "mt-1 w-full min-w-0 max-w-full rounded-xl border border-black/10 bg-white px-3 py-3 text-base text-neutral-950 outline-none placeholder:text-neutral-500 focus:border-[#FFE14A] focus:ring-2 focus:ring-[#FFE14A]";

function Photo({
  photo,
  sizes,
  eager = false,
  decorative = false,
}: {
  photo: SeniorLivingPhoto;
  sizes: string;
  eager?: boolean;
  decorative?: boolean;
}) {
  const src = seniorLivingPhotoSrc(photo);
  return (
    <picture>
      <source type="image/webp" srcSet={src.webpSrcSet} sizes={sizes} />
      <img
        src={src.jpg}
        alt={decorative ? "" : photo.alt}
        width={1600}
        height={1067}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        className="h-full w-full max-w-full object-cover"
      />
    </picture>
  );
}

function TravelNote() {
  const freeZone = TRAVEL_ZONES.find((zone) => zone.feeCents === 0);
  const paid = TRAVEL_ZONES.filter((zone) => zone.feeCents > 0);
  const last = TRAVEL_ZONES[TRAVEL_ZONES.length - 1];
  return (
    <p
      data-testid="travel-zones"
      className="text-base leading-relaxed text-white/80"
    >
      {freeZone
        ? `Travel is free within ${freeZone.outerMiles} miles. Then `
        : "Then "}
      {paid.map((zone, index) => {
        const separator =
          index === 0 ? "" : index === paid.length - 1 ? ", or " : ", ";
        return (
          <span key={zone.zone}>
            {separator}
            <MoneyAmount
              data-zone={zone.zone}
              className="min-w-0 text-left text-white"
            >
              {formatUsd(zone.feeCents / 100)}
            </MoneyAmount>
          </span>
        );
      })}
      {` by zone. Quoted beyond ${last?.outerMiles ?? 0} miles.`}
    </p>
  );
}

const STEPS = [
  {
    title: "Schedule",
    body: "Tell us the community and a date that works.",
  },
  {
    title: "Shoot",
    body: "We come out and capture the tour and the rooms.",
  },
  {
    title: "Content Ready",
    body: "The tour and photos are ready to publish.",
  },
];

export default function SeniorLiving() {
  const photos = publishedSeniorLivingPhotos();
  const heroPhoto = photos[0];
  const [name, setName] = useState("");
  const [community, setCommunity] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [services, setServices] = useState<SeniorLivingServiceId[]>([]);
  const [preferredDates, setPreferredDates] = useState("");
  const [notes, setNotes] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  function toggleService(id: SeniorLivingServiceId) {
    setServices((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = {
      name,
      community,
      email,
      phone,
      address,
      services,
      preferredDates,
      notes,
      companyWebsite,
    };
    const parsed = parseSeniorLivingRequest(payload);
    if (parsed.ok === false) {
      if (parsed.honeypot === true) {
        setDone(true);
        return;
      }
      setError(parsed.error);
      return;
    }
    setError("");
    setPending(true);
    try {
      const response = await fetch("/api/senior-living", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
      } | null;
      if (!response.ok || !data?.success) {
        setError(
          data?.error ||
            `We could not send that. Please call ${BUSINESS_CONTACT.phoneDisplay}.`,
        );
        return;
      }
      setDone(true);
    } catch {
      setError(
        `We could not send that. Please call ${BUSINESS_CONTACT.phoneDisplay}.`,
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={pageType}>
      <header className="bg-black">
        <div className="mx-auto flex w-full max-w-6xl items-center px-4 py-4">
          <Link to="/" className="flex min-w-0 items-center gap-2 text-white">
            <img
              src="/media/logos/camera-logo-white-on-black.png"
              alt=""
              className="h-9 w-9 shrink-0 rounded-lg"
            />
            <span className="truncate text-sm font-extrabold tracking-tight">
              ICONIC IMAGES
            </span>
          </Link>
        </div>
      </header>

      <main>
        <section data-testid="senior-hero" className="bg-black">
          <div className="mx-auto w-full max-w-6xl px-4 pb-12 pt-6 sm:pb-16 sm:pt-10">
            {heroPhoto ? (
              <div className="mb-6 overflow-hidden rounded-3xl border-2 border-[#FFE14A]">
                <div className="aspect-[16/9] w-full">
                  <Photo photo={heroPhoto} sizes="100vw" eager decorative />
                </div>
              </div>
            ) : null}
            <div className="max-w-3xl border-2 border-[#FFE14A] p-5 sm:p-8">
              <p className="text-sm font-bold uppercase tracking-wide text-[#FFE14A]">
                Senior living
              </p>
              <h1 className="mt-3 text-[2.35rem] font-extrabold leading-[1.05] text-white sm:text-6xl">
                Virtual tours and photography
              </h1>
              <p className="mt-4 max-w-xl text-lg leading-relaxed text-white/85">
                For communities in Spring, The Woodlands, and Houston.
              </p>
              <p className="mt-3 max-w-xl text-base leading-relaxed text-white/70">
                The sample tour is from a Woodlands-area senior living community.
              </p>
              <a
                href="#schedule"
                data-testid="senior-cta"
                className="mt-8 inline-flex w-full max-w-full items-center justify-center rounded-full bg-[#FFE14A] px-5 py-4 text-center text-base font-bold leading-snug text-black hover:bg-[#ffe866] sm:w-auto"
              >
                {SENIOR_LIVING_CTA}
              </a>
            </div>
          </div>
        </section>

        {photos.length > 0 ? (
          <section
            data-testid="senior-gallery"
            aria-label="Photos of a Woodlands-area senior living community"
            className="bg-black"
          >
            <div className="mx-auto w-full max-w-6xl px-4 pb-14">
              <h2 className="text-2xl font-extrabold text-white">
                A Woodlands-area senior living community
              </h2>
              <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {photos.map((photo) => (
                  <li
                    key={photo.stem}
                    className="min-w-0 overflow-hidden rounded-2xl"
                  >
                    <div className="aspect-[3/2] w-full bg-neutral-900">
                      <Photo
                        photo={photo}
                        sizes="(min-width: 1024px) 33vw, 100vw"
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        <section
          className="bg-white text-black"
          aria-labelledby="sample-tour-heading"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:py-16">
            <h2
              id="sample-tour-heading"
              className="text-3xl font-extrabold leading-tight"
            >
              Sample tour
            </h2>
            <p className="mt-2 text-lg text-neutral-700">
              A Woodlands-area senior living community
            </p>
            <div
              data-testid="matterport-tour"
              className="mt-6 aspect-video w-full max-w-full overflow-hidden rounded-2xl border-2 border-black bg-black"
            >
              <iframe
                src={SENIOR_LIVING_MATTERPORT_SRC}
                title={SENIOR_LIVING_MATTERPORT_TITLE}
                allow={SENIOR_LIVING_MATTERPORT_ALLOW}
                allowFullScreen
                loading="lazy"
                className="h-full w-full border-0"
              />
            </div>
          </div>
        </section>

        <section
          className="bg-[#FFE14A] text-black"
          aria-labelledby="steps-heading"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:py-16">
            <h2
              id="steps-heading"
              className="text-3xl font-extrabold leading-tight"
            >
              How it works
            </h2>
            <ol
              data-testid="senior-steps"
              className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3"
            >
              {STEPS.map((step, index) => (
                <li
                  key={step.title}
                  className="min-w-0 rounded-2xl bg-black p-5 text-white"
                >
                  <p className="text-sm font-bold text-[#FFE14A]">
                    {index + 1}
                  </p>
                  <h3 className="mt-2 text-2xl font-extrabold">{step.title}</h3>
                  <p className="mt-2 text-base leading-relaxed text-white/85">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="schedule" className="scroll-mt-6 bg-white text-black">
          <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:py-16">
            <h2 className="text-3xl font-extrabold leading-tight">
              Request a visit
            </h2>
            <p className="mt-2 text-base leading-relaxed text-neutral-700">
              Tell us about the community. We will follow up with you.
            </p>
            {done ? (
              <div
                role="status"
                data-testid="senior-success"
                className="mt-8 rounded-2xl bg-black p-6 text-white"
              >
                <h3 className="text-2xl font-extrabold">Request received.</h3>
                <p className="mt-2 text-base leading-relaxed text-white/85">
                  We have your request and will follow up with you.
                </p>
              </div>
            ) : (
              <form
                data-testid="senior-request"
                className="relative mt-8 space-y-4"
                onSubmit={onSubmit}
                noValidate
              >
                <div
                  className="absolute h-px w-px overflow-hidden"
                  aria-hidden="true"
                >
                  <label>
                    Company website
                    <input
                      name="companyWebsite"
                      tabIndex={-1}
                      autoComplete="off"
                      value={companyWebsite}
                      onChange={(event) =>
                        setCompanyWebsite(event.target.value)
                      }
                    />
                  </label>
                </div>
                <label
                  className="block text-sm font-semibold"
                  htmlFor="senior-name"
                >
                  Name
                  <input
                    id="senior-name"
                    name="name"
                    autoComplete="name"
                    maxLength={80}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className={fieldClass}
                  />
                </label>
                <label
                  className="block text-sm font-semibold"
                  htmlFor="senior-community"
                >
                  Community
                  <input
                    id="senior-community"
                    name="community"
                    autoComplete="organization"
                    maxLength={120}
                    value={community}
                    onChange={(event) => setCommunity(event.target.value)}
                    className={fieldClass}
                  />
                </label>
                <label
                  className="block text-sm font-semibold"
                  htmlFor="senior-email"
                >
                  Email
                  <input
                    id="senior-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    maxLength={120}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className={fieldClass}
                  />
                </label>
                <label
                  className="block text-sm font-semibold"
                  htmlFor="senior-phone"
                >
                  Phone
                  <input
                    id="senior-phone"
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    maxLength={30}
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    className={fieldClass}
                  />
                </label>
                <label
                  className="block text-sm font-semibold"
                  htmlFor="senior-address"
                >
                  Address
                  <input
                    id="senior-address"
                    name="address"
                    autoComplete="street-address"
                    maxLength={200}
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    className={fieldClass}
                  />
                </label>
                <fieldset>
                  <legend className="text-sm font-semibold">Services</legend>
                  <div className="mt-2 grid grid-cols-1 gap-2">
                    {SENIOR_LIVING_SERVICE_IDS.map((id) => (
                      <label
                        key={id}
                        className="flex min-h-11 min-w-0 items-center gap-3 rounded-xl border border-black/10 px-3 py-2"
                      >
                        <input
                          type="checkbox"
                          name="services"
                          value={id}
                          checked={services.includes(id)}
                          onChange={() => toggleService(id)}
                          className="h-5 w-5 shrink-0 accent-black"
                        />
                        <span className="text-base">
                          {SENIOR_LIVING_SERVICE_LABELS[id]}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label
                  className="block text-sm font-semibold"
                  htmlFor="senior-dates"
                >
                  Preferred dates
                  <input
                    id="senior-dates"
                    name="preferredDates"
                    maxLength={160}
                    value={preferredDates}
                    onChange={(event) => setPreferredDates(event.target.value)}
                    className={fieldClass}
                  />
                </label>
                <label
                  className="block text-sm font-semibold"
                  htmlFor="senior-notes"
                >
                  Notes
                  <textarea
                    id="senior-notes"
                    name="notes"
                    rows={4}
                    maxLength={2000}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    className={fieldClass}
                  />
                </label>
                {error ? (
                  <p
                    role="alert"
                    className="text-sm font-semibold text-red-700"
                  >
                    {error}
                  </p>
                ) : null}
                <button
                  type="submit"
                  data-testid="senior-submit"
                  disabled={pending}
                  className="inline-flex w-full max-w-full items-center justify-center rounded-full bg-black px-5 py-4 text-center text-base font-bold leading-snug text-[#FFE14A] disabled:opacity-60"
                >
                  {pending ? "Sending" : SENIOR_LIVING_CTA}
                </button>
              </form>
            )}
          </div>
        </section>

        <section
          data-testid="senior-pricing"
          className="bg-black text-white"
          aria-labelledby="pricing-heading"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:py-16">
            <h2
              id="pricing-heading"
              className="text-3xl font-extrabold leading-tight"
            >
              Pricing
            </h2>
            <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <article
                data-testid="price-tour"
                className="min-w-0 rounded-2xl bg-white p-5 text-black"
              >
                <h3 className="text-xl font-extrabold">3D Tour</h3>
                <p className="mt-3 text-4xl font-extrabold leading-none">
                  <MoneyAmount className="min-w-0 text-left">
                    {formatUsd(SENIOR_TOUR_PRICE)}
                  </MoneyAmount>
                </p>
                <p className="mt-3 text-base leading-relaxed text-neutral-700">
                  Up to {SENIOR_TOUR_SQFT_CAP.toLocaleString("en-US")} sq ft.
                </p>
              </article>
              <article
                data-testid="price-rooms"
                className="min-w-0 rounded-2xl bg-white p-5 text-black"
              >
                <h3 className="text-xl font-extrabold">
                  Rooms, spaces or units
                </h3>
                <ul className="mt-3 space-y-3">
                  {SENIOR_ROOM_RATES.map((tier) => (
                    <li key={tier.maxCount}>
                      <p className="text-3xl font-extrabold leading-none">
                        <MoneyAmount className="min-w-0 text-left">
                          {formatUsd(tier.each)}
                        </MoneyAmount>
                        <span className="ml-2 text-base font-semibold text-neutral-700">
                          each
                        </span>
                      </p>
                      <p className="mt-1 text-base text-neutral-700">
                        {tier.minCount === 1
                          ? `Up to ${tier.maxCount}`
                          : `${tier.minCount} to ${tier.maxCount}`}
                      </p>
                    </li>
                  ))}
                </ul>
              </article>
              <article
                data-testid="price-facility"
                className="min-w-0 rounded-2xl bg-[#FFE14A] p-5 text-black"
              >
                <h3 className="text-xl font-extrabold">
                  Whole-building facilities
                </h3>
                <p className="mt-3 text-base leading-relaxed">
                  Up to {SENIOR_FACILITY_SQFT_CAP.toLocaleString("en-US")} sq
                  ft.
                </p>
                <p className="mt-3 flex flex-wrap items-baseline gap-x-2 text-base leading-relaxed">
                  <span>from</span>
                  <MoneyAmount
                    data-testid="facility-rate"
                    className="min-w-0 text-left text-3xl font-extrabold"
                  >
                    {formatSeniorFacilityRate(SENIOR_FACILITY_RATE_PER_SQFT)}
                  </MoneyAmount>
                  <span>/ sq ft</span>
                </p>
                <p className="mt-3 text-base leading-relaxed">
                  Monthly hosting, or a transfer of ownership.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="bg-black" aria-labelledby="travel-heading">
          <div className="mx-auto w-full max-w-6xl px-4 pb-14 pt-2">
            <h2 id="travel-heading" className="text-lg font-bold text-white">
              Travel
            </h2>
            <div className="mt-2 max-w-3xl">
              <TravelNote />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/15 bg-black">
        <div className="mx-auto w-full max-w-6xl px-4 py-8">
          <p className="text-sm font-bold text-white">{LEGAL_BUSINESS_NAME}</p>
          <PublicContactLine
            className="mt-2 max-w-full text-sm leading-relaxed text-white/80"
            linkClassName="underline underline-offset-4"
          />
        </div>
      </footer>
    </div>
  );
}
