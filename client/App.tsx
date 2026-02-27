import "./global.css";

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Services from "./pages/Services";
import About from "./pages/About";
import Portfolio from "./pages/Portfolio";
import Contact from "./pages/Contact";
import Book from "./pages/Book";
import Pricing from "./pages/Pricing";
import PricingV1 from "./pages/PricingV1";
import AIPricingAssistant from "./pages/AIPricingAssistant";
import Insights from "./pages/Insights";
import Socials from "./pages/Socials";
import VirtualStaging from "./pages/VirtualStaging";
import VirtualStagingSelection from "./pages/VirtualStagingSelection";
import VirtualStagingAITool from "./pages/VirtualStagingAITool";
import VirtualStagingProOrder from "./pages/VirtualStagingProOrder";
import VirtualStagingCheckout from "./pages/VirtualStagingCheckout";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/services" element={<Services />} />
          <Route path="/about" element={<About />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/book" element={<Book />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/pricing/ai-assistant" element={<AIPricingAssistant />} />
          <Route path="/pricing-v1" element={<PricingV1 />} />
          <Route path="/socials" element={<Socials />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/services/virtual-staging" element={<VirtualStaging />} />
          <Route path="/services/virtual-staging/select" element={<VirtualStagingSelection />} />
          <Route path="/services/virtual-staging/ai-tool" element={<VirtualStagingAITool />} />
          <Route path="/services/virtual-staging/pro-order" element={<VirtualStagingProOrder />} />
          <Route path="/services/virtual-staging/checkout" element={<VirtualStagingCheckout />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
