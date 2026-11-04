import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { useSiteHref } from "@/content/siteContent";

export default function PromoBar() {
  const settings = useSiteSettings();
  const href = useSiteHref("chrome", "promo", "link", "/book");

  if (!settings.global.showPromoBar) return null;

  return (
    <Link
      to={href}
      className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-center gap-2 border-b border-teal-400 bg-teal-500 px-3 py-1.5 text-center text-[9px] font-black uppercase tracking-[0.12em] text-white shadow-lg shadow-teal-900/20 transition-all sm:text-[10px] sm:tracking-[0.2em] md:px-4 md:text-xs md:tracking-[0.28em]"
    >
      <Zap className="h-3 w-3 fill-white" />
      <span>{settings.global.promoBarText}</span>
      <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  );
}

import { Zap } from "lucide-react";
