import { ArrowRight } from "lucide-react";
import { useSiteSettings } from "@/hooks/useSiteSettings";

export default function PromoBar() {
  const settings = useSiteSettings();

  if (!settings.global.showPromoBar) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[60] py-1.5 px-4 text-center text-[10px] md:text-xs font-black border-b flex items-center justify-center gap-2 transition-all uppercase tracking-[0.3em] bg-teal-500 text-white border-teal-400 shadow-lg shadow-teal-900/20"
    >
      <Zap className="w-3 h-3 fill-white" />
      <span>{settings.global.promoBarText}</span>
      <ArrowRight className="w-3.5 h-3.5" />
    </div>
  );
}

import { Zap } from "lucide-react";
