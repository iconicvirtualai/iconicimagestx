import { aboutMonogram, safeAboutPhoto } from "@shared/aboutTeam";

type AboutPortraitProps = {
  name: string;
  role?: string;
  photo: string;
  className?: string;
  page?: string;
  block?: string;
  item?: string;
  field?: string;
  eager?: boolean;
};

export default function AboutPortrait({
  name,
  role = "",
  photo,
  className = "",
  page = "about",
  block,
  item,
  field = "photo",
  eager = false,
}: AboutPortraitProps) {
  const src = safeAboutPhoto(photo);
  const shared = {
    "data-site-page": page,
    "data-site-block": block,
    "data-site-item": item,
    "data-site-field": field,
    className: `h-full w-full ${className}`,
  };

  if (!src) {
    return (
      <div
        {...shared}
        data-site-kind="image"
        data-about-monogram={aboutMonogram(name)}
        className={`flex h-full w-full items-center justify-center bg-black ${className}`}
        role="img"
        aria-label={name ? `${name} portrait coming soon` : "Portrait coming soon"}
      >
        <span className="font-bold tracking-tight text-[#0d9488] text-7xl">{aboutMonogram(name)}</span>
      </div>
    );
  }

  return (
    <img
      {...shared}
      data-site-kind="image"
      src={src}
      alt={role ? `${name}, ${role}` : name}
      className={`h-full w-full object-cover object-center ${className}`}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
    />
  );
}
