import Layout from "@/components/Layout";
import HeroSection from "@/components/HeroSection";
import MediaCarousel from "@/components/MediaCarousel";
import SolutionSection from "@/components/SolutionSection";
import StatsBar from "@/components/StatsBar";
import StepsSection from "@/components/StepsSection";
import AudienceSection from "@/components/AudienceSection";
import AudienceDetails from "@/components/AudienceDetails";
import FeaturesSection from "@/components/FeaturesSection";
import SnapReelsStrip from "@/components/SnapReelsStrip";
import RaisingTheStandard from "@/components/RaisingTheStandard";
import ThisIsOurMarket from "@/components/ThisIsOurMarket";
import TheNetwork from "@/components/TheNetwork";
import FAQSection from "@/components/FAQSection";
import PartnershipCTA from "@/components/PartnershipCTA";
import { useSiteSettings } from "@/hooks/useSiteSettings";

export default function Index() {
  const settings = useSiteSettings();

  return (
    <Layout>
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
      <SnapReelsStrip />
      <FeaturesSection />
      <FAQSection />
      <PartnershipCTA />
    </Layout>
  );
}
