import Layout from "@/components/Layout";
import HeroSection from "@/components/HeroSection";
import MediaCarousel from "@/components/MediaCarousel";
import SolutionSection from "@/components/SolutionSection";
import SnapReelsStrip from "@/components/SnapReelsStrip";
import RaisingTheStandard from "@/components/RaisingTheStandard";
import ThisIsOurMarket from "@/components/ThisIsOurMarket";
import SelectedWork from "@/components/SelectedWork";
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
      <SelectedWork />
      <SnapReelsStrip />
      <FAQSection />
      <PartnershipCTA />
    </Layout>
  );
}
