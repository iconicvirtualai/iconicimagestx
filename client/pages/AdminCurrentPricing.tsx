import { Navigate } from "react-router-dom";

/** Old Settings → Pricing route. The price list lives on Prices. */
export default function AdminCurrentPricing() {
  return <Navigate to="/admin/pricing" replace />;
}
