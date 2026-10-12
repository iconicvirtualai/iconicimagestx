import { Link } from "react-router-dom";
import { MoneyAmount } from "@/components/MoneyAmount";
import { SeniorLivingOrder } from "@/components/SeniorLivingOrder";
import { PublicContactLine } from "@/components/PublicContactLine";
import {
  publishedSeniorLivingPhotos,
  SENIOR_LIVING_FAMILY_PHOTO,
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
  SENIOR_FACILITY_RATE_PER_SQFT,
  SENIOR_FACILITY_SQFT_CAP,
  SENIOR_LIVING_DEPOSIT_LINE,
  SENIOR_ROOM_RATES,
  SENIOR_TOUR_PRICE,
  SENIOR_TOUR_SQFT_CAP,
} from "@shared/seniorLiving";
import { TRAVEL_ZONES } from "@shared/travelZones";

/**
 * /book preselects a catalog package with ?service= or ?package=.
 * The catalog has no Senior Living package (Matterport there is a $200 add-on,
 * not this offer), so the request stays on this page.
 */
export const SENIOR_LIVING_CTA = "Schedule when you're ready for us to come!";

const pageType =
  "min-h-screen overflow-x-clip bg-[#F6F3EE] font-[Inter,ui-sans-serif,system-ui,sans-serif] text-neutral-950 [overflow-wrap:normal] [word-break:normal] [hyphens:manual] [&_*]:[overflow-wrap:normal] [&_*]:[word-break:normal] [&_*]:[hyphens:manual]";

const bodyText = "text-lg leading-relaxed text-neutral-900 sm:text-xl";

const ctaClass =
  "inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-[#FFE14A] px-6 py-3 text-center text-lg font-semibold leading-snug text-neutral-950 hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:w-auto";

function Photo({
  photo,
  sizes,
  eager = false,
  imgClassName = "object-center",
}: {
  photo: SeniorLivingPhoto;
  sizes: string;
  eager?: boolean;
  imgClassName?: string;
}) {
  const src = seniorLivingPhotoSrc(photo);
  return (
    <picture>
      <source type="image/webp" srcSet={src.webpSrcSet} sizes={sizes} />
      <img
        src={src.jpg}
        alt={photo.alt}
        width={1600}
        height={1067}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        className={`h-full w-full max-w-full object-cover ${imgClassName}`}
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
      className={bodyText}
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
              className="min-w-0 text-left text-neutral-950"
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
    body: `Tell us the community and a date that works. ${SENIOR_LIVING_DEPOSIT_LINE}`,
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
  const gallery = photos.slice(1);

  return (
    <div className={pageType}>
      <header className="border-b border-neutral-200 bg-[#F6F3EE]">
        <div className="mx-auto flex w-full max-w-6xl items-center px-4 py-3">
          <Link
            to="/"
            className="inline-flex min-h-12 min-w-0 items-center"
          >
            <img
              src="/media/logos/logo-black-large.png"
              alt="Iconic Images"
              className="h-12 w-auto max-w-full"
            />
          </Link>
        </div>
      </header>

      <main>
        <section data-testid="senior-hero" className="bg-[#F6F3EE]">
          <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:pb-20 sm:pt-10">
            {heroPhoto ? (
              <div className="overflow-hidden rounded-2xl">
                <div className="aspect-[16/9] w-full">
                  <Photo
                    photo={heroPhoto}
                    sizes="100vw"
                    eager
                    imgClassName="object-top sm:object-center"
                  />
                </div>
              </div>
            ) : null}
            <div className="relative z-10 -mt-20 max-w-3xl rounded-2xl bg-[#1A1A1A] p-6 text-white sm:-mt-32 sm:p-10">
              <h1 className="text-[2rem] font-bold leading-tight text-white sm:text-4xl">
                Virtual tours for{" "}
                <span className="text-[#FFE14A]">senior living</span>
              </h1>
              <p className="mt-4 max-w-xl text-lg leading-relaxed sm:text-xl">
                For communities in Spring, The Woodlands, and Houston.
              </p>
              <p className="mt-3 max-w-xl text-lg leading-relaxed sm:text-xl">
                The sample tour is from a Woodlands-area senior living community.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <a href="#schedule" data-testid="senior-cta" className={ctaClass}>
                  {SENIOR_LIVING_CTA}
                </a>
                <a
                  href={BUSINESS_CONTACT.phoneHref}
                  data-testid="senior-call"
                  className="inline-flex min-h-12 w-full items-center justify-center rounded-lg border-2 border-white px-6 py-3 text-center text-lg font-semibold leading-snug text-white sm:w-auto"
                >
                  Call {BUSINESS_CONTACT.phoneDisplay}
                </a>
              </div>
              <p
                data-testid="senior-deposit"
                className="mt-4 max-w-xl text-lg leading-relaxed text-white sm:text-xl"
              >
                {SENIOR_LIVING_DEPOSIT_LINE}
              </p>
            </div>
          </div>
        </section>

        {gallery.length > 0 ? (
          <section
            data-testid="senior-gallery"
            aria-label="Photos of a Woodlands-area senior living community"
            className="bg-[#F6F3EE]"
          >
            <div className="mx-auto w-full max-w-6xl px-4 pb-16 sm:pb-20">
              <h2 className="text-3xl font-semibold leading-tight text-neutral-950 sm:text-4xl">
                A Woodlands-area senior living community
              </h2>
              <ul className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {gallery.map((photo) => (
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
          className="bg-white text-neutral-950"
          aria-labelledby="sample-tour-heading"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:py-20">
            <h2
              id="sample-tour-heading"
              className="text-3xl font-semibold leading-tight sm:text-4xl"
            >
              Sample tour
            </h2>
            <p className={`mt-4 ${bodyText}`}>
              A Woodlands-area senior living community
            </p>
            <div
              data-testid="matterport-tour"
              className="mt-8 aspect-video w-full max-w-full overflow-hidden rounded-2xl border border-neutral-300 bg-neutral-950"
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
          data-testid="senior-family"
          aria-labelledby="family-heading"
          className="bg-[#F6F3EE] text-neutral-950"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:py-20">
            <h2
              id="family-heading"
              className="text-3xl font-bold leading-tight sm:text-4xl"
            >
              Life here
            </h2>
            <p className={`mt-4 max-w-2xl ${bodyText}`}>
              Families are welcome. This is a quiet visit, made for the people
              who live here and the people who love them.
            </p>
            <div className="mt-8 overflow-hidden rounded-2xl">
              <div className="aspect-[3/2] w-full max-w-3xl bg-neutral-200">
                <Photo
                  photo={SENIOR_LIVING_FAMILY_PHOTO}
                  sizes="(min-width: 768px) 768px, 100vw"
                />
              </div>
            </div>
          </div>
        </section>

        <section
          className="bg-[#FFE14A] text-[#1A1A1A]"
          aria-labelledby="steps-heading"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:py-20">
            <h2
              id="steps-heading"
              className="text-3xl font-bold leading-tight sm:text-4xl"
            >
              How it works
            </h2>
            <ol
              data-testid="senior-steps"
              className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-3"
            >
              {STEPS.map((step, index) => (
                <li key={step.title} className="min-w-0">
                  <h3 className="text-2xl font-bold leading-tight sm:text-3xl">
                    {index + 1} {step.title}.
                  </h3>
                  <p className="mt-3 text-lg leading-relaxed text-[#1A1A1A] sm:text-xl">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="schedule" className="scroll-mt-6 bg-white text-neutral-950">
          <div className="mx-auto w-full max-w-2xl px-4 py-16 sm:py-20">
            <h2 className="text-3xl font-semibold leading-tight sm:text-4xl">
              Order a visit
            </h2>
            <p className={`mt-4 ${bodyText}`}>
              Choose the services, the date, and pay the deposit to reserve it.
            </p>
            <SeniorLivingOrder />
          </div>
        </section>

        <section
          data-testid="senior-pricing"
          className="bg-[#F6F3EE] text-neutral-950"
          aria-labelledby="pricing-heading"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:py-20">
            <h2
              id="pricing-heading"
              className="text-3xl font-semibold leading-tight sm:text-4xl"
            >
              Pricing
            </h2>
            <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
              <article
                data-testid="price-tour"
                className="min-w-0 rounded-2xl border border-neutral-200 bg-white p-6 text-neutral-950"
              >
                <h3 className="text-2xl font-semibold leading-tight">3D Tour</h3>
                <p className="mt-4 text-4xl font-semibold leading-none">
                  <MoneyAmount className="min-w-0 text-left">
                    {formatUsd(SENIOR_TOUR_PRICE)}
                  </MoneyAmount>
                </p>
                <p className={`mt-4 ${bodyText}`}>
                  Up to {SENIOR_TOUR_SQFT_CAP.toLocaleString("en-US")} sq ft.
                </p>
              </article>
              <article
                data-testid="price-rooms"
                className="min-w-0 rounded-2xl border border-neutral-200 bg-white p-6 text-neutral-950"
              >
                <h3 className="text-2xl font-semibold leading-tight">
                  Rooms, spaces or units
                </h3>
                <ul className="mt-3 space-y-3">
                  {SENIOR_ROOM_RATES.map((tier) => (
                    <li key={tier.maxCount}>
                      <p className="text-3xl font-semibold leading-none">
                        <MoneyAmount className="min-w-0 text-left">
                          {formatUsd(tier.each)}
                        </MoneyAmount>
                        <span className="ml-2 text-lg font-semibold text-neutral-900">
                          each
                        </span>
                      </p>
                      <p className="mt-2 text-lg leading-relaxed text-neutral-900">
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
                className="min-w-0 rounded-2xl border border-neutral-200 bg-white p-6 text-neutral-950"
              >
                <h3 className="text-2xl font-semibold leading-tight">
                  Whole-building facilities
                </h3>
                <p className={`mt-4 ${bodyText}`}>
                  Up to {SENIOR_FACILITY_SQFT_CAP.toLocaleString("en-US")} sq
                  ft.
                </p>
                <p className={`mt-4 flex flex-wrap items-baseline gap-x-2 ${bodyText}`}>
                  <span>from</span>
                  <MoneyAmount
                    data-testid="facility-rate"
                    className="min-w-0 text-left text-3xl font-semibold"
                  >
                    {formatSeniorFacilityRate(SENIOR_FACILITY_RATE_PER_SQFT)}
                  </MoneyAmount>
                  <span>/ sq ft</span>
                </p>
                <p className={`mt-4 ${bodyText}`}>
                  Monthly hosting, or a transfer of ownership.
                </p>
              </article>
            </div>
            <p className={`mt-8 max-w-3xl ${bodyText}`}>
              {SENIOR_LIVING_DEPOSIT_LINE}
            </p>
          </div>
        </section>

        <section className="bg-[#F6F3EE]" aria-labelledby="travel-heading">
          <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-2 sm:pb-20">
            <h2
              id="travel-heading"
              className="text-3xl font-semibold leading-tight text-neutral-950 sm:text-4xl"
            >
              Travel
            </h2>
            <div className="mt-2 max-w-3xl">
              <TravelNote />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-neutral-200 bg-white">
        <div className="mx-auto w-full max-w-6xl px-4 py-10">
          <p className="text-lg font-semibold leading-snug text-neutral-950 sm:text-xl">
            {LEGAL_BUSINESS_NAME}
          </p>
          <PublicContactLine
            className={`mt-4 max-w-full ${bodyText}`}
            linkClassName="inline-flex min-h-12 items-center underline decoration-neutral-950 underline-offset-4"
          />
        </div>
      </footer>
    </div>
  );
}
