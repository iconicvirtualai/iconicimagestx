import * as React from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "react-router-dom";
import { ChevronLeft, Tag } from "lucide-react";

interface PricingRow {
  id: string;
  name: string;
  price: string;
  priceMax: string;
  priceType: string;
  category: string;
  active: boolean;
  description: string;
  billingNote: string;
}

const pricingData: PricingRow[] = [
  // Listing Tiers
  { id: "listing-essentials", name: "The Essentials", price: "249", priceMax: "", priceType: "per-listing", category: "real-estate", active: true, description: "The Fast & Fresh.", billingNote: "Per Listing" },
  { id: "listing-showcase", name: "The Showcase", price: "549", priceMax: "", priceType: "per-listing", category: "real-estate", active: true, description: "The Full Story.", billingNote: "Per Listing" },
  { id: "listing-legacy", name: "The Legacy", price: "899", priceMax: "", priceType: "per-listing", category: "real-estate", active: true, description: "The Signature Production.", billingNote: "Per Listing" },
  { id: "listing-market-leader", name: "The Market Leader", price: "1,599", priceMax: "", priceType: "per-listing", category: "real-estate", active: true, description: "The Total Takeover", billingNote: "Per Listing" },

  // Branding Tiers
  { id: "branding-refresh", name: "The Refresh", price: "349", priceMax: "", priceType: "per-session", category: "branding", active: true, description: "The Modern Portrait.", billingNote: "Per Session" },
  { id: "branding-content-partner", name: "The Content Partner", price: "999", priceMax: "", priceType: "per-month", category: "branding", active: true, description: "30 days of content in 2 hours.", billingNote: "Per Month" },
  { id: "branding-local-legend", name: "The Local Legend", price: "2,499", priceMax: "", priceType: "per-session-campaign", category: "branding", active: true, description: "THE MARKET TAKEOVER CAMPAIGN", billingNote: "Per Session/Campaign" },

  // Social Monopoly (Business)
  { id: "business-baseline", name: "The Baseline", price: "500", priceMax: "", priceType: "per-month", category: "business", active: true, description: "The Professional Foundation.", billingNote: "Per Month" },
  { id: "business-growth-engine", name: "The Growth Engine", price: "850", priceMax: "", priceType: "per-month", category: "business", active: true, description: "Turning Views into Conversations.", billingNote: "Per Month" },
  { id: "business-professional-suite", name: "The Professional Suite", price: "1,500", priceMax: "", priceType: "per-month", category: "business", active: true, description: "Your Digital Storefront, Fully Managed.", billingNote: "Per Month" },
  { id: "business-signature-tier", name: "The Signature Tier", price: "2,800", priceMax: "", priceType: "per-month", category: "business", active: true, description: "The High-Volume Authority.", billingNote: "Per Month" },
  { id: "business-iconic-partnership", name: "The Iconic Partnership", price: "4,500", priceMax: "", priceType: "per-month", category: "business", active: true, description: "Your Personal Media Agency.", billingNote: "Per Month" },
  { id: "business-connected-core", name: "The Connected Core", price: "2,000", priceMax: "", priceType: "per-month", category: "business", active: true, description: "Social + Database Penetration.", billingNote: "Per Month" },
  { id: "business-authority-stack", name: "The Authority Stack", price: "3,200", priceMax: "", priceType: "per-month", category: "business", active: true, description: "Total Audience Ownership.", billingNote: "Per Month" },

  // The Basics (Add-ons/Photos)
  { id: "photos-20", name: "20 Photos", price: "99", priceMax: "", priceType: "per-listing", category: "real-estate", active: true, description: "Basic Photo Package", billingNote: "Per Listing" },
  { id: "photos-35", name: "35 Photos", price: "150", priceMax: "", priceType: "per-listing", category: "real-estate", active: true, description: "Standard Photo Package", billingNote: "Per Listing" },
  { id: "photos-50", name: "50 Photos", price: "200", priceMax: "", priceType: "per-listing", category: "real-estate", active: true, description: "High Volume Photo Package", billingNote: "Per Listing" },
  { id: "aerial-addon", name: "Aerial Add-On", price: "99", priceMax: "", priceType: "addon", category: "real-estate", active: true, description: "Drone imagery", billingNote: "Per Listing" },
  { id: "reel-addon", name: "Reel Add-On", price: "125", priceMax: "", priceType: "addon", category: "real-estate", active: true, description: "Social media reel", billingNote: "Per Listing" },
  { id: "video-addon", name: "Video Add-On", price: "350", priceMax: "500", priceType: "addon", category: "real-estate", active: true, description: "Full video production", billingNote: "Per Listing" },
  { id: "matterport", name: "3D Matterport", price: "200", priceMax: "", priceType: "addon", category: "real-estate", active: true, description: "3D Virtual Tour", billingNote: "Per Listing" },
  { id: "floorplan-addon", name: "2D Floorplan Add-On", price: "99", priceMax: "", priceType: "addon", category: "real-estate", active: true, description: "2D schematic", billingNote: "Per Listing" },
  { id: "amenity-addon", name: "Amenity Add-On", price: "50", priceMax: "", priceType: "addon", category: "real-estate", active: true, description: "Community features", billingNote: "Per Listing" },
  { id: "specialized-social", name: "Social Media Optimized", price: "85", priceMax: "", priceType: "addon", category: "real-estate", active: true, description: "Vertical, detailed, and lifestyle.", billingNote: "Per Listing" },
  { id: "specialized-both", name: "MLS + Social Media Optimized", price: "125", priceMax: "", priceType: "addon", category: "real-estate", active: true, description: "MLS + Social Media optimized photos", billingNote: "Per Listing" },

  // Brand Identity
  { id: "growth-foundation", name: "The Foundation", price: "TBD", priceMax: "", priceType: "fixed", category: "brand-identity", active: true, description: "Essential visual assets.", billingNote: "Per Project" },
  { id: "growth-evolution", name: "The Evolution", price: "TBD", priceMax: "", priceType: "fixed", category: "brand-identity", active: true, description: "Cutting-edge AI integration.", billingNote: "Per Project" },
  { id: "growth-bundle", name: "The Bundle", price: "TBD", priceMax: "", priceType: "fixed", category: "brand-identity", active: true, description: "Foundation + Evolution.", billingNote: "Per Project" },
];

export default function AdminCurrentPricing() {
  return (
    <div className="flex flex-col min-h-screen bg-[#f8fafc]">
      <Header />
      
      <main className="flex-1 pt-24 pb-12">
        {/* Sub-Header */}
        <div className="bg-white border-b border-slate-200 sticky top-[72px] z-30 px-6 py-3">
          <div className="max-w-[1200px] mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button asChild variant="ghost" size="sm" className="rounded-xl h-9 hover:bg-slate-100">
                <Link to="/admin/edit-site">
                  <ChevronLeft className="w-4 h-4 mr-1" /> Back to Customizer
                </Link>
              </Button>
              <div className="w-px h-6 bg-slate-200" />
              <div className="p-2 bg-slate-100 rounded-lg">
                <Tag className="w-4 h-4 text-[#0d9488]" />
              </div>
              <div>
                <h1 className="text-sm font-black text-slate-900 uppercase tracking-widest">Current Pricing</h1>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Live Pricing Manifest</p>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-[1200px] mx-auto px-6 mt-8">
          <Card className="rounded-[2.5rem] border-slate-200 shadow-sm overflow-hidden bg-white">
            <CardHeader className="p-8 border-b border-slate-50">
              <CardTitle className="text-lg font-black text-slate-900 uppercase tracking-tight">Pricing Data Table</CardTitle>
              <p className="text-xs font-medium text-slate-400">All services, descriptions, and active pricing reflected on the public site.</p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50/50">
                    <TableRow className="border-b border-slate-100">
                      <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-500 py-4 px-6">ID</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-500 py-4 px-6">Name</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-500 py-4 px-6">Price</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-500 py-4 px-6">PriceMax</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-500 py-4 px-6">PriceType</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-500 py-4 px-6">Category</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-500 py-4 px-6">Active</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-500 py-4 px-6">Description</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-500 py-4 px-6">BillingNote</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pricingData.map((row) => (
                      <TableRow key={row.id} className="border-b border-slate-50 hover:bg-slate-50/30 transition-colors">
                        <TableCell className="py-4 px-6 font-mono text-[11px] text-[#0d9488] font-bold">{row.id}</TableCell>
                        <TableCell className="py-4 px-6 text-xs font-black text-slate-900 uppercase tracking-tight">{row.name}</TableCell>
                        <TableCell className="py-4 px-6 text-xs font-bold text-slate-700">${row.price}</TableCell>
                        <TableCell className="py-4 px-6 text-xs font-bold text-slate-400">{row.priceMax ? `$${row.priceMax}` : "—"}</TableCell>
                        <TableCell className="py-4 px-6">
                          <span className="px-2 py-1 rounded-md bg-slate-100 text-slate-500 text-[10px] font-black uppercase tracking-widest">
                            {row.priceType}
                          </span>
                        </TableCell>
                        <TableCell className="py-4 px-6">
                          <span className="px-2 py-1 rounded-md bg-blue-50 text-blue-600 text-[10px] font-black uppercase tracking-widest">
                            {row.category}
                          </span>
                        </TableCell>
                        <TableCell className="py-4 px-6">
                          <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-widest ${row.active ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                            {row.active ? 'true' : 'false'}
                          </span>
                        </TableCell>
                        <TableCell className="py-4 px-6 text-xs text-slate-500 font-medium max-w-[200px] truncate" title={row.description}>
                          {row.description}
                        </TableCell>
                        <TableCell className="py-4 px-6 text-xs text-slate-500 font-bold uppercase tracking-tight">
                          {row.billingNote}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
}
