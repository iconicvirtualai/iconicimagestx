import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Zap } from "lucide-react";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { useSiteHref } from "@/content/siteContent";
import { FLASH_SALE_BAR_FULL, FLASH_SALE_BAR_HREF, FLASH_SALE_BAR_SHORT, flashSaleOpen } from "@shared/flashSale";

const barLayout =
  "fixed top-0 left-0 right-0 z-[60] flex items-center justify-center gap-2 px-3 py-1.5 text-center text-[10px] font-black uppercase leading-none text-white shadow-lg";

/**
 * The site editor still stores the AI staging line. While the Black Friday sale
 * is open that line is replaced in the bar only. After SALE_ENDS_MS it comes back
 * on its own. The bar is painted in the browser, not in the SEO shell.
 */
export default function PromoBar() {
  const settings = useSiteSettings();
  const fallbackHref = useSiteHref("chrome", "promo", "link", "/book");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, 30_000);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", tick);
    };
  }, []);

  if (!settings.global.showPromoBar) return null;

  if (flashSaleOpen(now)) {
    return (
      <Link
        to={FLASH_SALE_BAR_HREF}
        data-testid="promo-bar"
        data-promo="black-friday"
        className={`${barLayout} border-b-2 border-[#ffd23f] bg-[#141414] tracking-[0.02em] lg:text-xs lg:tracking-[0.08em]`}
      >
        <span className="lg:hidden">{FLASH_SALE_BAR_SHORT}</span>
        <span className="hidden lg:inline">{FLASH_SALE_BAR_FULL}</span>
        <ArrowRight className="h-3.5 w-3.5 shrink-0" />
      </Link>
    );
  }

  return (
    <Link
      to={fallbackHref}
      data-testid="promo-bar"
      data-promo="staging"
      className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-center gap-2 border-b border-teal-400 bg-teal-500 px-3 py-1.5 text-center text-[9px] font-black uppercase tracking-[0.12em] text-white shadow-lg shadow-teal-900/20 sm:text-[10px] sm:tracking-[0.2em] md:px-4 md:text-xs md:tracking-[0.28em]"
    >
      <Zap className="h-3 w-3 shrink-0 fill-white" />
      <span>{settings.global.promoBarText}</span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0" />
    </Link>
  );
}
