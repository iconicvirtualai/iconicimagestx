import React from "react";
import Header from "./Header";
import Footer from "./Footer";
import PromoBar from "./PromoBar";
import { useSiteSettings } from "@/hooks/useSiteSettings";

interface LayoutProps {
  children: React.ReactNode;
  showFooter?: boolean;
}

export default function Layout({ children, showFooter = true }: LayoutProps) {
  const settings = useSiteSettings();
  const showPromo = settings.global.showPromoBar;

  return (
    <div className="flex flex-col min-h-screen relative bg-black text-white">
      {/* Overall Background Dimension - Very Subtle Glow */}
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-[20%] right-[-10%] w-[40vw] h-[40vw] bg-[#0d9488]/10 rounded-full blur-[150px] opacity-20"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[35vw] h-[35vw] bg-[#0d9488]/15 rounded-full blur-[120px] opacity-20"></div>
      </div>

      <PromoBar />
      <Header />

      {/* Spacer to push content below fixed header */}
      <div className={showPromo ? "h-[120px]" : "h-[80px]"} />

      <main className="flex-1">
        {children}
      </main>
      {showFooter && <Footer />}
    </div>
  );
}
