import AdminRevenue from "@/pages/AdminRevenue";
import AdminBilling from "@/pages/AdminBilling";
import AdminClientBilling from "@/pages/AdminClientBilling";
import AdminAicon from "@/pages/AdminAicon";
import AdminAutomation from "@/pages/AdminAutomation";
import AdminSchedule from "@/pages/AdminSchedule";
import AdminOrders from "@/pages/AdminOrders";

import "./global.css";

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Routes, Route, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";

// Public pages
import Index from "./pages/Index";
import About from "./pages/About";
import Portfolio from "./pages/Portfolio";
import Studio105 from "./pages/Studio105";
import Contact from "./pages/Contact";
import Book from "./pages/Book";
import Pricing from "./pages/Pricing";
import PricingV1 from "./pages/PricingV1";
import AIPricingAssistant from "./pages/AIPricingAssistant";
import Socials from "./pages/Socials";
import AgentLandingPage from "./pages/AgentLandingPage";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import ClientStudio from "./pages/ClientStudio";
import ClientInvoice from "./pages/ClientInvoice";
import PublicGallery from "./pages/PublicGallery";
import ListingPresentation from "./pages/ListingPresentation";
import VirtualStaging from "./pages/VirtualStaging";
import StockFootage from "./pages/StockFootage";
import VirtualStagingSelection from "./pages/VirtualStagingSelection";
import VirtualStagingAITool from "./pages/VirtualStagingAITool";
import VirtualStagingProOrder from "./pages/VirtualStagingProOrder";
import VirtualStagingCheckout from "./pages/VirtualStagingCheckout";
import Go from "./pages/Go";
import ListingCardPreview from "./pages/ListingCardPreview";
import NotFound from "./pages/NotFound";

// Admin / ops pages
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import AdminListingFile from "./pages/AdminListingFile";
import AdminCustomerCenter from "./pages/AdminCustomerCenter";
import AdminClientAccount from "./pages/AdminClientAccount";
import AdminSiteCustomizer from "./pages/AdminSiteCustomizer";
import AdminEmailTemplates from "./pages/AdminEmailTemplates";
import AdminCurrentPricing from "./pages/AdminCurrentPricing";
import AdminOrderDetail from "./pages/AdminOrderDetail";
import AdminOrderRequest from "./pages/AdminOrderRequest";
import AdminInvoiceEditor from "./pages/AdminInvoiceEditor";
import AdminListings from "./pages/AdminListings";
import AdminMessages from "./pages/AdminMessages";
import AdminPhotographer from "./pages/AdminPhotographer";
import AdminUpload from "./pages/AdminUpload";
import AdminEditor from "./pages/AdminEditor";
import AdminTeam from "./pages/AdminTeam";
import AdminStudio from "./pages/AdminStudio";
import AdminIconicStudio from "./pages/AdminIconicStudio";
import Login from "./pages/Login";
import ClientPortal from "./pages/ClientPortal";
import PortalListingDetail from "./pages/PortalListingDetail";

const queryClient = new QueryClient();

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ScrollToTop />
        <AuthProvider>
          <Routes>
            {/* ─── Public Routes ─────────────────────────────────────────── */}
            <Route path="/" element={<Index />} />
            <Route path="/about" element={<About />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/studio-105" element={<Studio105 />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/book" element={<Book />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/pricing/ai-assistant" element={<AIPricingAssistant />} />
            <Route path="/pricing-v1" element={<PricingV1 />} />
            <Route path="/socials" element={<Socials />} />
            <Route path="/agents" element={<AgentLandingPage />} />
            {/* Resources stays off the public site. Stock Footage library is public again. */}
            <Route path="/insights" element={<Navigate to="/" replace />} />
            <Route path="/insights/prep" element={<Navigate to="/" replace />} />
            <Route path="/stock-footage" element={<StockFootage />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            {/* Shirt QR destination. /go/ matches here too (trailing slash is ignored). */}
            <Route path="/go" element={<Go />} />
            <Route path="/listing-cards" element={<ListingCardPreview />} />
            {/* Bare paths have no project id. Studio 105 is the public studio page. */}
            <Route path="/studio" element={<Navigate to="/studio-105" replace />} />
            <Route path="/gallery" element={<Navigate to="/studio-105" replace />} />
            <Route path="/studio/:listingId" element={<ClientStudio />} />
            <Route path="/gallery/:galleryId" element={<PublicGallery />} />
            <Route path="/present/:token" element={<ListingPresentation />} />
            <Route path="/invoice/:invoiceId" element={<ClientInvoice />} />
            <Route path="/services/virtual-staging" element={<VirtualStaging />} />
            <Route path="/services/virtual-staging/select" element={<VirtualStagingSelection />} />
            <Route path="/services/virtual-staging/ai-tool" element={<VirtualStagingAITool />} />
            <Route path="/services/virtual-staging/pro-order" element={<VirtualStagingProOrder />} />
            <Route path="/services/virtual-staging/checkout" element={<VirtualStagingCheckout />} />

            {/* ─── Login Routes ─────────────────────────────────────────── */}
            <Route path="/login" element={<Login />} />
            <Route path="/portal" element={<Login />} />
            <Route path="/portal/home" element={<ClientPortal />} />
            <Route path="/portal/listings/:listingId" element={<PortalListingDetail />} />
            <Route path="/admin/login" element={<AdminLogin />} />

            {/* ─── Admin / Staff ────────────────────────────────────────── */}
            <Route path="/admin/dashboard" element={<ProtectedRoute requiredRole="coordinator"><AdminDashboard /></ProtectedRoute>} />
            <Route path="/admin/studio" element={<ProtectedRoute requiredRole="staff"><AdminStudio /></ProtectedRoute>} />
            <Route path="/admin/iconic-studio" element={<ProtectedRoute requiredRole="staff"><AdminIconicStudio /></ProtectedRoute>} />
            <Route path="/admin/iconic-studio/:listingId" element={<ProtectedRoute requiredRole="staff"><AdminIconicStudio /></ProtectedRoute>} />
            <Route path="/admin/listings" element={<ProtectedRoute requiredRole="coordinator"><AdminListings /></ProtectedRoute>} />
            <Route path="/admin/listing/:id" element={<ProtectedRoute requiredRole="staff"><AdminListingFile /></ProtectedRoute>} />
            <Route path="/admin/customers" element={<ProtectedRoute requiredRole="coordinator"><AdminCustomerCenter /></ProtectedRoute>} />
            <Route path="/admin/customers/:id" element={<ProtectedRoute requiredRole="coordinator"><AdminClientAccount /></ProtectedRoute>} />
            <Route path="/admin/order/:id" element={<ProtectedRoute requiredRole="coordinator"><AdminOrderDetail /></ProtectedRoute>} />
            <Route path="/admin/orders/:id" element={<ProtectedRoute requiredRole="coordinator"><AdminOrderDetail /></ProtectedRoute>} />
            <Route path="/admin/order-request/:id" element={<ProtectedRoute requiredRole="coordinator"><AdminOrderRequest /></ProtectedRoute>} />
            <Route path="/admin/invoice/:invoiceId" element={<ProtectedRoute requiredRole="coordinator"><AdminInvoiceEditor /></ProtectedRoute>} />
            <Route path="/admin/messages" element={<ProtectedRoute requiredRole="coordinator"><AdminMessages /></ProtectedRoute>} />
            <Route path="/admin/communications" element={<ProtectedRoute requiredRole="coordinator"><AdminMessages /></ProtectedRoute>} />
            <Route path="/admin/photographer" element={<ProtectedRoute requiredRole="photographer"><AdminPhotographer /></ProtectedRoute>} />
            <Route path="/admin/upload" element={<ProtectedRoute requiredRole="photographer"><AdminUpload /></ProtectedRoute>} />
            <Route path="/admin/editor" element={<ProtectedRoute requiredRole="editor"><AdminEditor /></ProtectedRoute>} />
            <Route path="/admin/team" element={<ProtectedRoute requiredRole="admin"><AdminTeam /></ProtectedRoute>} />
            <Route path="/admin/edit-site" element={<ProtectedRoute requiredRole="admin"><AdminSiteCustomizer /></ProtectedRoute>} />
            <Route path="/admin/email-templates" element={<ProtectedRoute requiredRole="admin"><AdminEmailTemplates /></ProtectedRoute>} />
            <Route path="/admin/current-pricing" element={<ProtectedRoute requiredRole="admin"><AdminCurrentPricing /></ProtectedRoute>} />
            
            <Route path="/admin/revenue" element={<ProtectedRoute requiredRole="admin"><AdminRevenue /></ProtectedRoute>} />
            <Route path="/admin/billing" element={<ProtectedRoute requiredRole="admin"><AdminBilling /></ProtectedRoute>} />
            <Route path="/admin/client-billing" element={<ProtectedRoute requiredRole="admin"><AdminClientBilling /></ProtectedRoute>} />
            <Route path="/admin/aicon" element={<ProtectedRoute requiredRole="coordinator"><AdminAicon /></ProtectedRoute>} />
            <Route path="/admin/automation" element={<ProtectedRoute requiredRole="admin"><AdminAutomation /></ProtectedRoute>} />
            <Route path="/admin/schedule" element={<ProtectedRoute requiredRole="coordinator"><AdminSchedule /></ProtectedRoute>} />
            <Route path="/admin/orders" element={<ProtectedRoute requiredRole="coordinator"><AdminOrders /></ProtectedRoute>} />

            {/* ─── Catch-all ──────────────────────────────────────────────── */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
