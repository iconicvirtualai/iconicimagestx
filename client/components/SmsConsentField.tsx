import type { MouseEvent } from "react";
import { Link } from "react-router-dom";

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
        I agree to receive transactional booking and appointment text messages from{" "}
        <strong>Iconic Images</strong>, including order-received notices, appointment reminders, and photo
        delivery updates. Message frequency varies. Message and data rates may apply. Reply STOP to opt out.
        Reply HELP for help. Consent is not a condition of purchase.{" "}
        <Link to="/privacy" className="font-semibold text-black underline" onClick={keepCheckbox} onMouseDown={(event) => event.preventDefault()}>
          Privacy Policy
        </Link>
        {" · "}
        <Link to="/terms" className="font-semibold text-black underline" onClick={keepCheckbox} onMouseDown={(event) => event.preventDefault()}>
          Terms and Conditions
        </Link>
        .
      </label>
    </div>
  );
}
