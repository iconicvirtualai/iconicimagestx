import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "@/components/Layout";
import { BUSINESS_CONTACT } from "@shared/businessContact";
import {
  MARKETING_SMS_NO_SHARE_TEXT,
  PRIVACY_POLICY_URL,
  TERMS_URL,
} from "@shared/a2p";

export default function SmsOptIn() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!consent) {
      setStatus("error");
      setMessage("Check the box if you want promotional texts. It is not required to book.");
      return;
    }
    setStatus("saving");
    setMessage("");
    try {
      const response = await fetch("/api/sms/marketing-opt-in", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ name, phone, consent: true, source: "/sms" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not save your opt-in.");
      setStatus("done");
      setMessage("You're signed up for promotional texts. Reply STOP to opt out at any time.");
      setConsent(false);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not save your opt-in.");
    }
  }

  return (
    <Layout>
      <div className="bg-[#f7f4ee] text-neutral-900">
        <section className="mx-auto max-w-xl px-4 pb-20 pt-28 md:pt-36">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0f766e]">Text updates</p>
          <h1 className="mt-2 text-4xl font-bold leading-tight tracking-tight text-neutral-950 md:text-5xl">
            Promotional texts from Iconic Images
          </h1>
          <p className="mt-4 text-base leading-relaxed text-neutral-600">
            Photography services, offers, and events. The checkbox starts unchecked. Checking it is how you opt in.
          </p>
          <form
            onSubmit={onSubmit}
            className="mt-8 rounded-[28px] bg-[#fffdf8] p-5 shadow-[0_18px_50px_rgba(28,25,23,0.08)] sm:p-8"
            data-testid="sms-opt-in-form"
          >
            <label className="block text-sm font-bold" htmlFor="sms-name">Name</label>
            <input
              id="sms-name"
              name="name"
              type="text"
              autoComplete="name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1.5 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-base text-neutral-900 outline-none ring-[#0f766e] focus:ring-2"
            />
            <label className="mt-4 block text-sm font-bold" htmlFor="sms-phone">Mobile number</label>
            <input
              id="sms-phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              required
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="mt-1.5 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-base text-neutral-900 outline-none ring-[#0f766e] focus:ring-2"
            />
            <label htmlFor="sms-marketing-consent" className="mt-5 flex items-start gap-3 text-sm leading-relaxed text-neutral-800">
              <input
                id="sms-marketing-consent"
                name="consent"
                type="checkbox"
                value="yes"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                className="mt-1 h-5 w-5 shrink-0 accent-[#0f766e]"
              />
              <span>
                I agree to receive promotional and marketing text messages from Iconic Images Photography, LLC about photography services, offers, and events. Message frequency varies. Message and data rates may apply. Reply STOP to opt out. Reply HELP for help, or contact{" "}
                <a href={BUSINESS_CONTACT.phoneHref} className="font-semibold text-[#0f766e] underline">{BUSINESS_CONTACT.phoneDisplay}</a>
                {" or "}
                <a href={BUSINESS_CONTACT.emailHref} className="font-semibold text-[#0f766e] underline">{BUSINESS_CONTACT.email}</a>
                . Consent is not a condition of purchase. View our{" "}
                <a href={PRIVACY_POLICY_URL} className="font-semibold text-[#0f766e] underline">Privacy Policy</a>
                {" and "}
                <a href={TERMS_URL} className="font-semibold text-[#0f766e] underline">Terms</a>.
              </span>
            </label>
            <p className="mt-4 text-sm leading-relaxed text-neutral-600">{MARKETING_SMS_NO_SHARE_TEXT}</p>
            <button
              type="submit"
              disabled={status === "saving"}
              className="mt-5 w-full rounded-full bg-[#0f766e] px-5 py-3.5 text-base font-bold text-white transition hover:bg-[#115e59] disabled:opacity-60"
            >
              {status === "saving" ? "Saving" : "Sign up for texts"}
            </button>
            {message ? (
              <p className={`mt-4 text-sm font-semibold ${status === "error" ? "text-red-700" : "text-[#0f766e]"}`} role="status">
                {message}
              </p>
            ) : null}
          </form>
          <p className="mt-6 text-center text-sm text-neutral-500">
            <Link to="/book" className="font-semibold text-[#0f766e] underline">Book a shoot</Link>
            {" without signing up for promotional texts."}
          </p>
        </section>
      </div>
    </Layout>
  );
}
