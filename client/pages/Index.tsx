import PromoBar from "@/components/PromoBar";
import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import MediaCarousel from "@/components/MediaCarousel";
import SolutionSection from "@/components/SolutionSection";
import StatsBar from "@/components/StatsBar";
import StepsSection from "@/components/StepsSection";
import AudienceSection from "@/components/AudienceSection";
import AudienceDetails from "@/components/AudienceDetails";
import TestimonialVideoCarousel from "@/components/TestimonialVideoCarousel";
import FeaturesSection from "@/components/FeaturesSection";
import RaisingTheStandard from "@/components/RaisingTheStandard";
import ThisIsOurMarket from "@/components/ThisIsOurMarket";
import TheNetwork from "@/components/TheNetwork";
import TestimonialsSection from "@/components/TestimonialsSection";
import FAQSection from "@/components/FAQSection";
import PartnershipCTA from "@/components/PartnershipCTA";
import Footer from "@/components/Footer";
import { useSiteSettings } from "@/hooks/useSiteSettings";

export default function Index() {
  const settings = useSiteSettings();

  return (
    <div className="flex flex-col min-h-screen relative bg-[#fafafa]">
      {/* Overall Background Dimension - Very Subtle Glow */}
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-[20%] right-[-10%] w-[40vw] h-[40vw] bg-[#ecfeff] rounded-full blur-[150px] opacity-10" style={{ backgroundColor: `${settings.global.primaryColor}10` }}></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[35vw] h-[35vw] bg-[#f0fdfa] rounded-full blur-[120px] opacity-15" style={{ backgroundColor: `${settings.global.secondaryColor}15` }}></div>
      </div>

      <PromoBar />
      <Header />

      <main className="flex-1">
        <HeroSection />
        {settings.homepage.showBeforeAfter && (
          <>
            <MediaCarousel />
            <RaisingTheStandard />
            <ThisIsOurMarket />
          </>
        )}
        {settings.homepage.showAIToolsSection && <SolutionSection />}
        <StatsBar />
        <StepsSection />
        <TheNetwork />
        {settings.homepage.showAudienceSection && (
          <>
            <AudienceSection />
            <AudienceDetails />
          </>
        )}
        <TestimonialVideoCarousel />
        <FeaturesSection />
        <TestimonialsSection />
        <FAQSection />
        <PartnershipCTA />
      </main>

      <Footer />
    </div>
  );
}
