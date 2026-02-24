import { ArrowRight } from "lucide-react";

export default function PromoBar() {
  return (
    <div className="bg-[#f0f9ff] text-[#0ea5e9] py-2 px-4 text-center text-sm font-medium border-b border-[#e0f2fe] flex items-center justify-center gap-2">
      <span>Book your free media strategy session for 2024!</span>
      <ArrowRight className="w-4 h-4" />
    </div>
  );
}
