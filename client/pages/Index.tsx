import PromoBar from "@/components/PromoBar";
import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import MediaCarousel from "@/components/MediaCarousel";
import ValueProposition from "@/components/ValueProposition";
import FeaturedServices from "@/components/FeaturedServices";
import PartnershipCTA from "@/components/PartnershipCTA";
import Footer from "@/components/Footer";

export default function Index() {
  return (
    <div className="flex flex-col min-h-screen">
      <PromoBar />
      <Header />

      <main className="flex-1">
        <HeroSection />
        <MediaCarousel />
        <ValueProposition />
        <FeaturedServices />
        <PartnershipCTA />
      </main>

      <Footer />
    </div>
  );
}
