import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { clientListingPath, type ClientListingCard } from "@shared/clientHome";
import type { ListingCardLook } from "@shared/listingCard";

const SERIF = '"Cormorant Garamond", "Iowan Old Style", Palatino, Georgia, serif';

const SHOWCASE_BORDER = "linear-gradient(100deg, #F8C7B4 0%, #F3A3B8 24%, #D85C8C 48%, #6D4C98 74%, #2A2866 100%)";
const SHOWCASE_PILL = "linear-gradient(90deg, #F6B89A 0%, #EE6A84 34%, #6A3C8C 68%, #17163F 100%)";
const LEGACY_PILL = "linear-gradient(90deg, #071433 0%, #0C2C84 46%, #1A58DC 100%)";

const TIGHT = "[overflow-wrap:normal] [word-break:normal]";

/**
 * Client listing tile for one of the four package looks.
 * Just Photos, Essentials, Showcase, and Legacy. Market Leader uses Legacy.
 */
export function ListingPackageCard({ listing }: { listing: ClientListingCard }) {
  const look = listing.look;
  if (!look) return null;
  const street = listing.street || listing.address;
  const locality = listing.locality;
  const displayStreet = look === "showcase" || look === "legacy" ? street.toUpperCase() : street;
  const justPhotosLine = listing.street && listing.locality
    ? `${listing.street} | ${listing.locality}`
    : street;

  return (
    <Link
      to={clientListingPath(listing.id)}
      data-look={look}
      aria-label={`${lookLabel(look)} listing, ${listing.address}`}
      className={`block h-full rounded-[22px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 ${TIGHT} ${
        look === "legacy" ? "focus-visible:outline-[#7aa2ff]" : "focus-visible:outline-black"
      }`}
    >
      {look === "just-photos" ? (
        <JustPhotos listing={listing} line={justPhotosLine} />
      ) : null}
      {look === "essentials" ? (
        <Essentials listing={listing} street={displayStreet} locality={locality} />
      ) : null}
      {look === "showcase" ? (
        <Showcase listing={listing} street={displayStreet} locality={locality} />
      ) : null}
      {look === "legacy" ? (
        <Legacy listing={listing} street={displayStreet} locality={locality} />
      ) : null}
    </Link>
  );
}

function JustPhotos({ listing, line }: { listing: ClientListingCard; line: string }) {
  return (
    <article className={`flex h-full flex-col rounded-[20px] border border-black bg-white ${TIGHT}`}>
      <div className="p-3 pb-0">
        <Photo listing={listing} label="JUST PHOTOS" rounded="rounded-[14px]" />
      </div>
      <div className="flex flex-1 flex-col px-4 pb-4 pt-4">
        <p className={`text-center text-[13px] font-medium leading-snug text-neutral-950 ${TIGHT}`}>{line}</p>
        <div className="mt-auto flex justify-end pt-8">
          <ShootDate label={listing.shootDateLabel} />
        </div>
      </div>
    </article>
  );
}

function Essentials({ listing, street, locality }: { listing: ClientListingCard; street: string; locality: string }) {
  return (
    <article className={`flex h-full flex-col overflow-hidden rounded-[22px] border-[3px] border-black bg-white shadow-[0_16px_30px_rgba(0,0,0,0.2)] ${TIGHT}`}>
      <div className="relative">
        <Photo listing={listing} label="ESSENTIALS" rounded="rounded-none" />
        <div
          data-part="pill"
          className="absolute bottom-0 left-3 right-3 flex translate-y-1/2 items-center justify-center rounded-full bg-black px-5 py-3"
        >
          <p className={`truncate text-center text-[15px] font-semibold tracking-[0.14em] text-white ${TIGHT}`}>{street}</p>
        </div>
      </div>
      <div className="flex flex-1 flex-col px-4 pb-4 pt-9">
        {locality ? <p data-part="locality" className={`text-center text-[13px] font-medium text-neutral-800 ${TIGHT}`}>{locality}</p> : null}
        <div className="mt-auto flex justify-end pt-8">
          <ShootDate label={listing.shootDateLabel} />
        </div>
      </div>
    </article>
  );
}

function Showcase({ listing, street, locality }: { listing: ClientListingCard; street: string; locality: string }) {
  return (
    <article
      className={`h-full rounded-[22px] p-[3px] shadow-[0_14px_28px_rgba(40,20,70,0.16)] ${TIGHT}`}
      style={{ background: SHOWCASE_BORDER }}
    >
      <div className="flex h-full flex-col overflow-hidden rounded-[19px] bg-white">
        <div className="relative p-2.5 pb-0">
          <Photo listing={listing} label="THE SHOWCASE" rounded="rounded-[14px]" />
          <div
            data-part="pill"
            className="absolute bottom-0 left-4 right-4 flex translate-y-1/2 items-center justify-center rounded-full px-4 py-3"
            style={{ background: SHOWCASE_PILL }}
          >
            <p className={`truncate text-center text-[14px] font-medium tracking-[0.22em] text-white ${TIGHT}`}>{street}</p>
          </div>
        </div>
        <div className="flex flex-1 flex-col px-4 pb-4 pt-8">
          {locality ? (
            <p data-part="locality" className={`text-right text-[13px] font-medium text-neutral-900 ${TIGHT}`}>{locality}</p>
          ) : null}
          <div data-part="amenities" className="mt-3 flex items-center justify-between gap-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <Amenity icon={<BedIcon />} count={listing.beds} label="Beds" />
              <Amenity icon={<GarageIcon />} count={listing.garage} label="Garage" />
              <Amenity icon={<BathIcon />} count={listing.baths} label="Baths" />
              <Amenity icon={<PoolIcon />} count={listing.pool} label="Pool" />
            </div>
            <div className="flex items-center gap-3 pt-0.5 text-neutral-800">
              <span aria-label="Drone" className="inline-flex h-5 w-5"><DroneIcon /></span>
              <span aria-label="Video" className="inline-flex h-5 w-5"><VideoIcon /></span>
            </div>
          </div>
          <div className="mt-auto flex justify-end pt-4">
            <ShootDate label={listing.shootDateLabel} />
          </div>
        </div>
      </div>
    </article>
  );
}

function Legacy({ listing, street, locality }: { listing: ClientListingCard; street: string; locality: string }) {
  return (
    <article
      className={`flex h-full flex-col overflow-hidden rounded-[22px] bg-[#07080d] ${TIGHT}`}
      style={{ boxShadow: "0 18px 40px rgba(28, 72, 190, 0.42), 0 0 0 1px rgba(92, 142, 255, 0.72)" }}
    >
      <div className="relative">
        <Photo listing={listing} label="" rounded="rounded-none" dark />
        <div
          data-part="pill"
          className="absolute bottom-0 left-3 right-3 grid min-h-[54px] translate-y-1/2 grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-full px-4 py-2.5"
          style={{ background: LEGACY_PILL }}
        >
          <span />
          <p
            className={`max-w-[15rem] truncate text-center text-[26px] font-semibold leading-none tracking-[0.04em] text-[#e3c36e] ${TIGHT}`}
            style={{ fontFamily: SERIF }}
          >
            {street}
          </p>
          {locality ? (
            <p data-part="locality" className={`justify-self-end text-right text-[10px] font-medium leading-tight text-white whitespace-nowrap ${TIGHT}`}>
              {locality}
            </p>
          ) : <span />}
        </div>
      </div>
      <div className="flex flex-1 flex-col px-4 pb-4 pt-10 text-white">
        <div data-part="amenities" className="flex items-center justify-between gap-2">
          <Amenity icon={<BedIcon />} count={listing.beds} label="Beds" light />
          <Amenity icon={<BathIcon />} count={listing.baths} label="Baths" light />
          <Amenity icon={<GarageIcon />} count={listing.garage} label="Garage" light />
          <Amenity icon={<PoolIcon />} count={listing.pool} label="Pool" light />
        </div>
        <div className="mt-auto flex items-end justify-between gap-3 pt-6">
          <p data-part="mark" className={`text-[13px] font-medium tracking-[0.32em] ${TIGHT}`} style={{ fontFamily: SERIF }}>
            <span className="text-[#e3c36e]">THE</span>
            <span className="mx-1.5 text-white/80">|</span>
            <span className="text-white">LEGACY</span>
          </p>
          <ShootDate label={listing.shootDateLabel} light />
        </div>
      </div>
    </article>
  );
}

function Photo({
  listing,
  label,
  rounded,
  dark = false,
}: {
  listing: ClientListingCard;
  label: string;
  rounded: string;
  dark?: boolean;
}) {
  return (
    <div data-part="photo" className={`relative aspect-[16/10] overflow-hidden ${rounded} ${dark ? "bg-[#1a1c24]" : "bg-gradient-to-b from-sky-500 via-sky-300 to-emerald-700"}`}>
      {listing.coverUrl ? (
        <img src={listing.coverUrl} alt="" className="h-full w-full object-cover" />
      ) : null}
      {label ? (
        <p className={`absolute left-3 top-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.75)] ${TIGHT}`}>
          {label}
        </p>
      ) : null}
    </div>
  );
}

function ShootDate({ label, light = false }: { label: string; light?: boolean }) {
  if (!label) return null;
  return (
    <p data-part="shoot-date" className={`text-[11px] font-bold ${light ? "text-white" : "text-neutral-950"} ${TIGHT}`}>
      {`Shoot Date: ${label}`}
    </p>
  );
}

function Amenity({
  icon,
  count,
  label,
  light = false,
}: {
  icon: ReactNode;
  count: string;
  label: string;
  light?: boolean;
}) {
  return (
    <span aria-label={count ? `${count} ${label}` : label} className={`inline-flex items-center gap-1.5 ${light ? "text-white" : "text-neutral-800"}`}>
      <span aria-hidden className="inline-flex h-5 w-5 shrink-0">{icon}</span>
      {count ? <span className={`text-[13px] font-semibold leading-none ${TIGHT}`}>{count}</span> : null}
    </span>
  );
}

function lookLabel(look: ListingCardLook): string {
  if (look === "just-photos") return "Just Photos";
  if (look === "essentials") return "Essentials";
  if (look === "showcase") return "The Showcase";
  return "The Legacy";
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

function BedIcon() {
  return (
    <Icon>
      <path d="M3 18V12" />
      <path d="M21 18V11" />
      <path d="M3 14h18" />
      <path d="M3 18h18" />
      <path d="M6 14V10.5A1.5 1.5 0 0 1 7.5 9h3A1.5 1.5 0 0 1 12 10.5V14" />
    </Icon>
  );
}

function BathIcon() {
  return (
    <Icon>
      <path d="M5 12h14v2.5A4.5 4.5 0 0 1 14.5 19h-5A4.5 4.5 0 0 1 5 14.5V12Z" />
      <path d="M7 12V8.5A2.5 2.5 0 0 1 9.5 6H11" />
      <path d="M9.5 6V4" />
    </Icon>
  );
}

function GarageIcon() {
  return (
    <Icon>
      <path d="M4 20V10.5L12 4l8 6.5V20" />
      <path d="M8 20v-7h8v7" />
      <path d="M8 16.5h8" />
    </Icon>
  );
}

function PoolIcon() {
  return (
    <Icon>
      <circle cx="8" cy="8" r="2" />
      <path d="M3.5 15c1.8-2.4 3.4-2.6 5.2-.2 1.6 2.1 3.2 2.2 5-.2" />
      <path d="M12 13.5c1.6 1.2 3.2 1.3 5.2-.4 1.2-1 2.2-1.3 3.3-.8" />
    </Icon>
  );
}

function DroneIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="2.2" />
      <path d="M12 9.8 8.2 6.2" />
      <path d="M12 9.8 15.8 6.2" />
      <path d="M12 14.2 8.2 17.8" />
      <path d="M12 14.2 15.8 17.8" />
      <circle cx="7" cy="5.2" r="1.5" />
      <circle cx="17" cy="5.2" r="1.5" />
      <circle cx="7" cy="18.8" r="1.5" />
      <circle cx="17" cy="18.8" r="1.5" />
    </Icon>
  );
}

function VideoIcon() {
  return (
    <Icon>
      <rect x="3" y="7" width="12" height="10" rx="2" />
      <path d="M15 11.5 21 8v8l-6-3.5" />
    </Icon>
  );
}
