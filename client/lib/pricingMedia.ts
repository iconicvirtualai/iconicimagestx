/** Pricing hero background. Not the We Are the Bar phone clip. */
export const PRICING_HERO_VIDEO = "/media/about/about_were_here_v1.mp4";

export const WE_ARE_THE_BAR_VIDEO = "/media/video/content-web-clip.mp4";

/** Outdoor portrait already in the library. Distinct from the royal-blue corporate suit. */
export const LIFESTYLE_BRAND_PORTRAIT = "/media/photos/lifestyle-mtz04655.jpg";

export function pricingHeroVideo(src: string): string {
  if (!src || src.includes("content-web-clip")) return PRICING_HERO_VIDEO;
  return src;
}

export function lifestyleBrandSrc(id: string, src: string): string {
  if (id === "lifestyle" && src.includes("lifestyle-kennedy-mtz01127")) return LIFESTYLE_BRAND_PORTRAIT;
  return src;
}
