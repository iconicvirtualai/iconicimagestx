import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { clientListingPath, type ClientListingCard } from "@shared/clientHome";
import { packageSkin, type PackageChip, type PackageSkin } from "@shared/packageSkins";
import { cn } from "@/lib/utils";
import { skinTheme, type SkinTheme } from "./skinTheme";

const TIGHT = "[overflow-wrap:normal] [word-break:normal]";
const FONT = "Inter, system-ui, sans-serif";

/**
 * Client project tile. One Local Legend blend shell, sixteen skins.
 * Listing address is a street + city block. No overlapping address pills.
 */
export function ListingPackageCard({ listing }: { listing: ClientListingCard }) {
  const look = listing.look;
  if (!look) return null;
  const skin = packageSkin(look);
  const theme = skinTheme(look);
  const street = listing.street || listing.address;
  const city = listing.locality;
  const note = footNote(skin, listing.shootDateLabel);

  return (
    <Link
      to={clientListingPath(listing.id)}
      data-look={look}
      data-category={skin.category}
      aria-label={`${skin.title} project, ${listing.address || skin.title}`}
      className={cn(
        "block min-w-0 w-full rounded-[18px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0d9488]",
        TIGHT,
      )}
      style={{ fontFamily: FONT }}
    >
      <article
        className={cn("flex min-h-[440px] w-full flex-col overflow-hidden", theme.radiusClass)}
        style={{ background: theme.background, border: theme.border, boxShadow: theme.shadow }}
      >
        <Hero listing={listing} theme={theme} badge={skin.badge} />
        <div className={cn("flex flex-1 flex-col px-[18px] pb-4 pt-4", theme.panelClass)}>
          <PackageTitle skin={skin} theme={theme} />
          <p className={cn("mt-2 text-[12px] leading-[1.4]", theme.featuresClass)}>{skin.features}</p>
          {skin.category === "listing" && (street || city) ? (
            <div data-part="address" className="mt-2.5">
              {street ? <p data-part="street" className={theme.streetClass}>{street}</p> : null}
              {city ? <p data-part="city" className={theme.cityClass}>{city}</p> : null}
            </div>
          ) : null}
          {skin.amenities ? (
            <div data-part="amenities" className={cn("mt-2.5 flex items-center gap-3.5", theme.amenityClass)}>
              <Amenity icon={<BedIcon />} count={listing.beds} label="Beds" />
              <Amenity icon={<BathIcon />} count={listing.baths} label="Baths" />
              <Amenity icon={<GarageIcon />} count={listing.garage} label="Garage" />
              <Amenity icon={<PoolIcon />} count={listing.pool} label="Pool" />
            </div>
          ) : null}
          {skin.chips.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {skin.chips.map((chip) => (
                <span key={chip.label} className={cn("rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-[0.08em]", chipClass(theme, chip))}>
                  {chip.label}
                </span>
              ))}
            </div>
          ) : null}
          <div className="mt-auto flex items-end justify-between gap-2.5 pt-3">
            <p data-part="price" className={cn("leading-none tracking-[-0.02em]", theme.priceClass)}>
              {skin.price}
              {skin.priceNote ? (
                <small className="mt-[3px] block text-[11px] font-semibold opacity-70">{skin.priceNote}</small>
              ) : null}
            </p>
            {note ? <p data-part="shoot-date" className={cn("whitespace-nowrap", theme.shootClass)}>{note}</p> : null}
          </div>
        </div>
      </article>
    </Link>
  );
}

function Hero({
  listing,
  theme,
  badge,
}: {
  listing: ClientListingCard;
  theme: SkinTheme;
  badge: string;
}) {
  return (
    <div data-part="photo" className={cn("relative shrink-0 overflow-hidden bg-[#1e293b]", theme.heroClass)}>
      {listing.coverUrl ? (
        <img src={listing.coverUrl} alt="" className={cn("absolute inset-0 h-full w-full object-cover", theme.photoClass)} />
      ) : (
        <div className={cn("absolute inset-0", theme.placeholderClass, theme.photoClass)} />
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[72px]" style={{ background: theme.fade }} />
      <span className={cn("absolute left-3 top-3 z-[1] rounded-[4px] px-[9px] py-[5px] text-[9px] uppercase", theme.badgeClass)}>
        {badge}
      </span>
    </div>
  );
}

function PackageTitle({ skin, theme }: { skin: PackageSkin; theme: SkinTheme }) {
  const shared = cn("uppercase leading-[1.15] tracking-[-0.02em]", theme.titleClass);
  if (!skin.accent || !skin.title.includes(skin.accent)) {
    return <p className={shared}>{skin.title}</p>;
  }
  const index = skin.title.indexOf(skin.accent);
  const before = skin.title.slice(0, index);
  const after = skin.title.slice(index + skin.accent.length);
  return (
    <p className={shared}>
      {before}
      <span className={theme.accentClass}>{skin.accent}</span>
      {after}
    </p>
  );
}

function chipClass(theme: SkinTheme, chip: PackageChip): string {
  if (chip.tone === "gold") return theme.chipGoldClass;
  if (chip.tone === "teal") return theme.chipTealClass;
  return theme.chipClass;
}

function footNote(skin: PackageSkin, shootDateLabel: string): string {
  if (skin.foot === "ongoing") return "Ongoing";
  if (skin.foot === "campaign") return "Campaign";
  if (skin.foot === "shoot" && shootDateLabel) return `Shoot Date: ${shootDateLabel}`;
  return "";
}

function Amenity({ icon, count, label }: { icon: ReactNode; count: string; label: string }) {
  return (
    <span aria-label={count ? `${count} ${label}` : label} className="inline-flex items-center gap-[5px]">
      <span aria-hidden className="inline-flex h-4 w-4 shrink-0">{icon}</span>
      {count ? <span className="text-[12px] font-bold leading-none">{count}</span> : null}
    </span>
  );
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
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
    </Icon>
  );
}
