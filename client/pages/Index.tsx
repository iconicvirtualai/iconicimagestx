import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import ValueProposition from "@/components/ValueProposition";
import FeaturedServices from "@/components/FeaturedServices";
import PartnershipCTA from "@/components/PartnershipCTA";
import Footer from "@/components/Footer";

export default function Index() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />

      <main className="flex-1">
        <HeroSection />
        <ValueProposition />
        <FeaturedServices />
        <PartnershipCTA />
      </main>

      <Footer />
    </div>
  );
}
