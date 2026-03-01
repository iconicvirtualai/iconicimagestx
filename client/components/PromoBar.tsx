import { ArrowRight } from "lucide-react";
import { useSiteSettings } from "@/hooks/useSiteSettings";

export default function PromoBar() {
  const settings = useSiteSettings();

  if (!settings.global.showPromoBar) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[60] py-1.5 px-4 text-center text-sm font-bold border-b flex items-center justify-center gap-2 transition-all uppercase tracking-widest"
      style={{
        backgroundColor: `${settings.global.secondaryColor}10`,
        color: settings.global.secondaryColor,
        borderColor: `${settings.global.secondaryColor}20`
      }}
    >
      <span>{settings.global.promoBarText}</span>
      <ArrowRight className="w-4 h-4" />
    </div>
  );
}
