import type { ComponentType } from "react";
import {
  LISTING_SITE_TEMPLATES,
  type ListingSiteModel,
  type ListingSiteTemplate,
} from "@shared/listingSite";
import { GoldenHour } from "./GoldenHour";
import { StoriesDeck } from "./StoriesDeck";
import { TwoUp } from "./TwoUp";
import "./listing-site.css";

const FONT_HREF = "https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,700&family=DM+Serif+Display:ital@0;1&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Manrope:wght@400;500;600;700&family=Playfair+Display:ital,wght@1,500;1,600&family=Space+Grotesk:wght@500;600;700&display=swap";

/** Every built template has a renderer. Later skins register here without a new page. */
export const LISTING_SITE_RENDERERS: Record<ListingSiteTemplate["renderer"], ComponentType<{ model: ListingSiteModel }>> = {
  TwoUp,
  GoldenHour,
  StoriesDeck,
};

export function listingSiteRendererIds(): string[] {
  return LISTING_SITE_TEMPLATES.map((template) => template.renderer);
}

export function ListingSite({ model }: { model: ListingSiteModel }) {
  const Renderer = LISTING_SITE_RENDERERS[model.template.renderer];
  return (
    <>
      <link rel="stylesheet" href={FONT_HREF} />
      <Renderer model={model} />
    </>
  );
}
