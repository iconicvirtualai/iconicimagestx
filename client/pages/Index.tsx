import { Fragment, type ReactNode } from "react";
import Layout from "@/components/Layout";
import { useSitePage } from "@/content/siteContent";
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
import TestimonialsSection from "@/components/TestimonialsSection";
import FAQSection from "@/components/FAQSection";
import PartnershipCTA from "@/components/PartnershipCTA";
import { useSiteSettings } from "@/hooks/useSiteSettings";

export default function Index() {
  const settings = useSiteSettings();
  const home = useSitePage("home");

  const sections: Record<string, ReactNode> = {
    hero: <HeroSection />,
    beforeAfter: <MediaCarousel />,
    raising: <RaisingTheStandard />,
    market: <ThisIsOurMarket />,
    solution: <SolutionSection />,
    stats: <StatsBar />,
    steps: <StepsSection />,
    network: <TheNetwork />,
    audience: <AudienceSection />,
    audienceDetails: <AudienceDetails />,
    snapReels: <SnapReelsStrip />,
    features: <FeaturesSection />,
    reviews: <TestimonialsSection />,
    faq: <FAQSection />,
    partnership: <PartnershipCTA />,
  };

  if (home) {
    return (
      <Layout>
        {home.blocks.filter((block) => !block.hidden && sections[block.id]).map((block) => (
          <Fragment key={block.id}>{sections[block.id]}</Fragment>
        ))}
      </Layout>
    );
  }

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
      <TestimonialsSection />
      <FAQSection />
      <PartnershipCTA />
    </Layout>
  );
}
