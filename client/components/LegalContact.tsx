import { LEGAL } from "@/lib/legal";
import { PublicContactLine } from "@/components/PublicContactLine";

export default function LegalContact() {
  return (
    <div className="mt-4 p-5 bg-gray-50 rounded-lg border border-gray-200" data-testid="legal-contact">
      <p className="font-semibold text-gray-900">{LEGAL.entity}</p>
      <p>
        {LEGAL.brand} / {LEGAL.brandSite}
      </p>
      <PublicContactLine className="mt-2 text-gray-800" linkClassName="text-teal-600 underline" />
    </div>
  );
}
