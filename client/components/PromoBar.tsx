import { ArrowRight } from "lucide-react";
import { useSiteSettings } from "@/hooks/useSiteSettings";

export default function PromoBar() {
  const settings = useSiteSettings();

  if (!settings.global.showPromoBar) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] bg-[#f0f9ff] text-[#0ea5e9] py-1.5 px-4 text-center text-sm font-medium border-b border-[#e0f2fe] flex items-center justify-center gap-2 transition-all">
      <span>{settings.global.promoBarText}</span>
      <ArrowRight className="w-4 h-4" />
    </div>
  );
}
