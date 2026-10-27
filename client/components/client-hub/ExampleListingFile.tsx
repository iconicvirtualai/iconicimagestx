import { Link } from "react-router-dom";
import { marketingMaterialFromProfile } from "@shared/clientHubSettings";
import { exampleListing, exampleProfile } from "@/lib/exampleHub";
import { PortalShell } from "@/components/client-hub/PortalShell";
import { MarketingAgentCard } from "@/components/client-hub/MarketingAgentCard";

/** Labeled sample listing so example hub links open a real page. */
export function ExampleListingFile() {
  const listing = exampleListing();
  const agent = marketingMaterialFromProfile(exampleProfile());
  return (
    <div className="iframe-safe-page bg-[#f6f7f8] flex flex-col">
      <PortalShell firstName="Example" example active="listings">
        <div className="space-y-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-800">Example listing</p>
            <h2 className="text-2xl font-black mt-2">{listing.address}</h2>
            <p className="text-sm text-gray-500 mt-1">Example data for a delivered shoot. A signed-in order uses the same listing page with that order's photos.</p>
          </div>
          <img src={listing.coverUrl} alt="" className="w-full max-w-xl rounded-2xl object-cover max-h-72 bg-gray-100" />
          {agent ? (
            <MarketingAgentCard
              agent={agent}
              title="Listing site branding"
              note="Empty agent fields on the listing site use the profile saved in Settings."
            />
          ) : null}
          <Link to="/portal/order?example=1" className="inline-flex min-h-12 items-center rounded-2xl bg-[#0d9488] px-5 text-xs font-black uppercase tracking-widest text-white">
            Place Order
          </Link>
        </div>
      </PortalShell>
    </div>
  );
}
