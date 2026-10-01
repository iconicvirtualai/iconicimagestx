import { LEGAL } from "@/lib/legal";

export default function LegalContact() {
  return (
    <div className="mt-4 p-5 bg-gray-50 rounded-lg border border-gray-200">
      <p className="font-semibold text-gray-900">{LEGAL.entity}</p>
      <p>
        {LEGAL.brand} / {LEGAL.brandSite}
      </p>
      <p className="mt-2">{LEGAL.addressLine1}</p>
      <p>{LEGAL.addressLine2}</p>
      <p className="mt-2">
        Email:{" "}
        <a href={`mailto:${LEGAL.email}`} className="text-teal-600 underline">
          {LEGAL.email}
        </a>
      </p>
      <p>
        Phone:{" "}
        <a href={LEGAL.phoneHref} className="text-teal-600 underline">
          {LEGAL.phoneDisplay}
        </a>
      </p>
      <p className="mt-2 text-sm text-gray-600">
        You may also email{" "}
        <a href={`mailto:${LEGAL.additionalEmail}`} className="text-teal-600 underline">
          {LEGAL.additionalEmail}
        </a>
        .
      </p>
    </div>
  );
}
