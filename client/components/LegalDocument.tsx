import { useEffect, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

/**
 * Top clearance under the fixed header.
 * Desktop matches /contact (`md:pt-32 md:pb-24`).
 * Small screens use pt-28 (7rem) instead of contact's pt-24: at 412px the mobile
 * bar is taller (hamburger), and pt-24 still tucks the H1 under that bar.
 */
export const legalPageContainerClassName =
  "container mx-auto px-4 pt-28 pb-16 md:pt-32 md:pb-24 max-w-4xl";

/**
 * scroll-margin-top so hash targets sit below the fixed nav.
 * Same offsets as the page padding: 7rem below md, 8rem from the desktop breakpoint.
 */
export const legalScrollMarginClassName = "scroll-mt-28 md:scroll-mt-32";

function scrollLegalHash(hash: string) {
  const id = decodeURIComponent(hash.replace(/^#/, ""));
  if (!id) return;
  document.getElementById(id)?.scrollIntoView({ block: "start" });
}

export default function LegalDocument({ children }: { children: ReactNode }) {
  const { hash, pathname } = useLocation();

  useEffect(() => {
    if (!hash) return;
    scrollLegalHash(hash);
    // Route changes also run the app scroll-to-top effect after this one.
    const timer = window.setTimeout(() => scrollLegalHash(hash), 0);
    return () => window.clearTimeout(timer);
  }, [hash, pathname]);

  return (
    <div className="flex flex-col min-h-screen bg-white">
      <Header />
      <main className="flex-1">
        <div className={legalPageContainerClassName}>{children}</div>
      </main>
      <Footer />
    </div>
  );
}
