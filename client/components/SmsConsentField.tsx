import type { MouseEvent } from "react";
import { Link } from "react-router-dom";
import { BUSINESS_CONTACT } from "@shared/businessContact";
import { TRANSACTIONAL_SMS_CONSENT_TEXT } from "@shared/a2p";

function keepCheckbox(event: MouseEvent) {
  event.stopPropagation();
}

export function SmsConsentField({
  checked,
  onChange,
  id = "sms-consent",
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  id?: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border-2 border-gray-300 bg-white p-4 text-left">
      <input
        id={id}
        name="smsConsent"
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-5 w-5 shrink-0 accent-black"
      />
      <label htmlFor={id} className="text-sm leading-relaxed text-gray-800">
        <span className="sr-only">{TRANSACTIONAL_SMS_CONSENT_TEXT}</span>
        <span aria-hidden="true">
          I agree to receive text messages from{" "}
          <strong>Iconic Images</strong>, including transactional and notification texts (booking
          confirmations, appointment reminders, shoot updates, gallery delivery alerts, and
          account/order updates) and marketing and promotional texts (special offers, seasonal
          promotions, and marketing updates from Iconic Images). Message frequency varies. Message
          & data rates may apply. Reply STOP to opt out, HELP for help, or contact{" "}
          <a href={BUSINESS_CONTACT.phoneHref} className="font-semibold text-black underline">
            {BUSINESS_CONTACT.phoneDisplay}
          </a>
          {" or "}
          <a href={BUSINESS_CONTACT.emailHref} className="font-semibold text-black underline">
            {BUSINESS_CONTACT.email}
          </a>
          . Consent is not a condition of purchase.{" "}
          <Link to="/privacy" className="font-semibold text-black underline" onClick={keepCheckbox} onMouseDown={(event) => event.preventDefault()}>
            Privacy Policy
          </Link>
          {" · "}
          <Link to="/terms" className="font-semibold text-black underline" onClick={keepCheckbox} onMouseDown={(event) => event.preventDefault()}>
            Terms and Conditions
          </Link>
          .
        </span>
      </label>
    </div>
  );
}
