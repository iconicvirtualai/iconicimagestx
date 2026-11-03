import type { ImgHTMLAttributes } from "react";

/** JPG path → WebP sibling, for stills shipped as both. */
const WEBP_FOR: Record<string, string> = {
  "/media/photos/forest-heights-twilight-front.jpg": "/media/photos/forest-heights-twilight-front.webp",
  "/media/photos/rear-pool-twilight.jpg": "/media/photos/rear-pool-twilight.webp",
};

type Props = ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
  alt: string;
};

/** WebP with a JPG fallback, matching the picture pattern used for dual-format stills. */
export default function ResponsiveStill({ src, alt, ...rest }: Props) {
  const webp = WEBP_FOR[src];
  if (!webp) return <img src={src} alt={alt} {...rest} />;
  return (
    <picture className="block h-full w-full">
      <source type="image/webp" srcSet={webp} />
      <img src={src} alt={alt} {...rest} />
    </picture>
  );
}
