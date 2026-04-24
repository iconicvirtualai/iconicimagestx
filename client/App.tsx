import AdminBilling from "@/pages/AdminBilling";
import AdminAicon from "@/pages/AdminAicon";
import AdminAutomation from "@/pages/AdminAutomation";
import AdminSchedule from "@/pages/AdminSchedule";
import AdminOrders from "@/pages/AdminOrders";

import "./global.css";

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";

// Public pages
import Index from "./pages/Index";
import About from "./pages/About";
import Portfolio from "./pages/Portfolio";
import Contact from "./pages/Contact";
import Book from "./pages/Book";
import Pricing from "./pages/Pricing";
import PricingV1 from "./pages/PricingV1";
import AIPricingAssistant from "./pages/AIPricingAssistant";
import Insights from "./pages/Insights";
import Socials from "./pages/Socials";
import AgentLandingPage from "./pages/AgentLandingPage";
import Privacy from "./pages/Privacy";
import ClientStudio from "./pages/ClientStudio";
import VirtualStaging from "./pages/VirtualStaging";
import VirtualStagingSelection from "./pages/VirtualStagingSelection";
import VirtualStagingAITool from "./pages/VirtualStagingAITool";
import VirtualStagingProOrder from "./pages/VirtualStagingProOrder";
import VirtualStagingCheckout from "./pages/VirtualStagingCheckout";
import NotFound from "./pages/NotFound";

// Admin / ops pages
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import AdminListingFile from "./pages/AdminListingFile";
import AdminCustomerCenter from "./pages/AdminCustomerCenter";
import AdminSiteCustomizer from "./pages/AdminSiteCustomizer";
import AdminEmailTemplates from "./pages/AdminEmailTemplates";
import AdminCurrentPricing from "./pages/AdminCurrentPricing";
import AdminOrderRequest from "./pages/AdminOrderRequest";
import AdminListings from "./pages/AdminListings";
import AdminMessages from "./pages/AdminMessages";
import AdminPhotographer from "./pages/AdminPhotographer";
import AdminUpload from "./pages/AdminUpload";
import AdminEditor from "./pages/AdminEditor";
import AdminTeam from "./pages/AdminTeam";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* ─── Public Routes ─────────────────────────────────────────── */}
            <Route path="/" element={<Index />} />
            <Route path="/about" element={<About />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/book" element={<Book />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/pricing/ai-assistant" element={<AIPricingAssistant />} />
            <Route path="/pricing-v1" element={<PricingV1 />} />
            <Route path="/socials" element={<Socials />} />
            <Route path="/agents" element={<AgentLandingPage />} />
            <Route path="/insights" element={<Insights />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/studio/:listingId" element={<ClientStudio />} />
            <Route path="/services/virtual-staging" element={<VirtualStaging />} />
            <Route path="/services/virtual-staging/select" element={<VirtualStagingSelection />} />
            <Route path="/services/virtual-staging/ai-tool" element={<VirtualStagingAITool />} />
            <Route path="/services/virtual-staging/pro-order" element={<VirtualStagingProOrder />} />
            <Route path="/services/virtual-staging/checkout" element={<VirtualStagingCheckout />} />

            {/* ─── Admin Login (public) ───────────────────────────────────── */}
            <Route path="/admin/login" element={<AdminLogin />} />

            {/* ─── Admin / Coordinator only ──────────────────────────────── */}
            <Route path="/admin/dashboard" element={
              <ProtectedRoute requiredRole="coordinator">
                <AdminDashboard />
              </ProtectedRoute>
            } />
            <Route path="/admin/listings" element={
              <ProtectedRoute requiredRole="coordinator">
                <AdminListings />
              </ProtectedRoute>
            } />
            <Route path="/admin/listing/:id" element={
              <ProtectedRoute requiredRole="photographer">
                <AdminListingFile />
              </ProtectedRoute>
            } />
            <Route path="/admin/customers" element={
              <ProtectedRoute requiredRole="coordinator">
                <AdminCustomerCenter />
              </ProtectedRoute>
            } />
            <Route path="/admin/order-request/:id" element={
              <ProtectedRoute requiredRole="coordinator">
                <AdminOrderRequest />
              </ProtectedRoute>
            } />
            <Route path="/admin/messages" element={
              <ProtectedRoute requiredRole="coordinator">
                <AdminMessages />
              </ProtectedRoute>
            } />

            {/* ─── Photographer ───────────────────────────────────────────── */}
            <Route path="/admin/photographer" element={
              <ProtectedRoute requiredRole="photographer">
                <AdminPhotographer />
              </ProtectedRoute>
            } />
            <Route path="/admin/upload" element={
              <ProtectedRoute requiredRole="photographer">
                <AdminUpload />
              </ProtectedRoute>
            } />

            {/* ─── Editor ─────────────────────────────────────────────────── */}
            <Route path="/admin/editor" element={
              <ProtectedRoute requiredRole="editor">
                <AdminEditor />
              </ProtectedRoute>
            } />

            {/* ─── Team (admin only) ───────────────────────────────────────── */}
            <Route path="/admin/team" element={
              <ProtectedRoute requiredRole="admin">
                <AdminTeam />
              </ProtectedRoute>
            } />

            {/* ─── Admin only ─────────────────────────────────────────────── */}
            <Route path="/admin/edit-site" element={
              <ProtectedRoute requiredRole="admin">
                <AdminSiteCustomizer />
              </ProtectedRoute>
            } />
            <Route path="/admin/email-templates" element={
              <ProtectedRoute requiredRole="admin">
                <AdminEmailTemplates />
              </ProtectedRoute>
            } />
            <Route path="/admin/current-pricing" element={
              <ProtectedRoute requiredRole="admin">
                <AdminCurrentPricing />
              </ProtectedRoute>
            } />

            {/* ─── Catch-all ──────────────────────────────────────────────── */}
            <Route path="*" element={<NotFound />} />
          
      <Route path="/admin/billing" element={<ProtectedRoute><AdminBilling /></ProtectedRoute>} />
      <Route path="/admin/aicon" element={<ProtectedRoute><AdminAicon /></ProtectedRoute>} />
      <Route path="/admin/automation" element={<ProtectedRoute><AdminAutomation /></ProtectedRoute>} />
      <Route path="/admin/schedule" element={<ProtectedRoute><AdminSchedule /></ProtectedRoute>} />
      <Route path="/admin/orders" element={<ProtectedRoute><AdminOrders /></ProtectedRoute>} />
    </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
