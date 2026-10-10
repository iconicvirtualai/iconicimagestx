import { Link } from "react-router-dom";
import LegalDocument, { legalScrollMarginClassName } from "@/components/LegalDocument";
import LegalContact from "@/components/LegalContact";
import { LEGAL } from "@/lib/legal";

export default function Terms() {
  return (
    <LegalDocument>
          <h1 id="terms-and-conditions" className={`${legalScrollMarginClassName} text-4xl font-bold text-gray-900 mb-2`}>Terms and Conditions</h1>
          <p className="text-sm text-gray-500 mb-4">Last updated: {LEGAL.lastUpdated}</p>
          <p className="text-sm text-gray-600 mb-10">
            These Terms and Conditions are the terms of service for {LEGAL.brand} / {LEGAL.brandSite}. They are a
            separate page from our{" "}
            <Link to="/privacy" className="text-teal-600 underline">
              Privacy Policy
            </Link>
            . This page is published at /terms. The Privacy Policy is published at /privacy.
          </p>

          <div className="prose prose-gray max-w-none space-y-8 text-gray-700 leading-relaxed">
            <section id="agreement" className={legalScrollMarginClassName}>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">1. Agreement</h2>
              <p>
                These Terms and Conditions (&quot;Terms&quot;) govern your use of the websites and services of{" "}
                {LEGAL.entity}, which does business as {LEGAL.brand} and {LEGAL.brandSite} (&quot;we,&quot; &quot;us,&quot;
                or &quot;our&quot;). By visiting our website, submitting a booking or order, or using our services, you
                agree to these Terms and to our{" "}
                <Link to="/privacy" className="text-teal-600 underline">
                  Privacy Policy
                </Link>
                . If you do not agree, do not use the site or submit an order.
              </p>
            </section>

            <section id="services" className={legalScrollMarginClassName}>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">2. Services</h2>
              <p>
                We provide real estate and property photography, video, aerial imagery, virtual staging, and related
                media production for real estate professionals, brokerages, and property owners, primarily in Texas.
                Service descriptions and prices on the website are invitations to request work. A specific shoot,
                deliverable, or turnaround applies only after we accept the booking and confirm the details with you.
              </p>
            </section>

            <section id="booking-requests" className={legalScrollMarginClassName}>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">3. Booking Requests</h2>
              <p>
                Submitting the booking form is a request, not a confirmed appointment. An order-received email or text
                means we have your request and will review it. The appointment is confirmed only when our team confirms
                the date, time, and scope. You agree to provide a correct property address, access instructions, and a
                phone number and email where we can reach you about that order.
              </p>
              <p className="mt-3">
                You represent that you have authority to grant access to the property and permission for us to
                photograph and film it for the services you order.
              </p>
            </section>

            <section id="fees-and-payment" className={legalScrollMarginClassName}>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">4. Fees and Payment</h2>
              <p>
                Fees are those quoted on the booking flow, an invoice, or a written proposal. Estimates shown before
                we confirm a booking may change if the property, services, or schedule change. Payment is due as stated
                on the invoice. We do not store full credit card numbers on our servers. Failure to pay amounts due
                may delay delivery or future bookings.
              </p>
            </section>

            <section id="changes-rescheduling-cancellation" className={legalScrollMarginClassName}>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">5. Changes, Rescheduling, and Cancellation</h2>
              <p>
                Contact us as soon as you need to reschedule or cancel a shoot so we can adjust the calendar. Monthly
                marketing plans that we describe on the pricing page as contract-free may be cancelled with 30 days&apos;
                notice, as stated there. Any deposit, cancellation window, or reschedule rule for a particular shoot
                will be confirmed with that booking. If weather, access, or safety prevents a shoot, we will work with
                you to reschedule.
              </p>
            </section>

            <section id="deliverables-and-license" className={legalScrollMarginClassName}>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">6. Deliverables and License</h2>
              <p>
                Unless a written agreement says otherwise, {LEGAL.entity} retains copyright in the photographs, video,
                and other media we create. When payment is complete, we grant you a non-exclusive license to use the
                delivered media to market the photographed property and your real estate business, including MLS
                listings, brochures, and your own social channels. You may not resell the files as stock, claim
                authorship, or use them in a way that implies we endorse a third party.
              </p>
              <p className="mt-3">
                If you turn on listing marketing permission during booking, you allow us to show that listing&apos;s
                media on our website, social channels, and portfolio. That permission is separate from consent to
                receive text messages.
              </p>
            </section>

            <section id="sms-and-email" className={legalScrollMarginClassName}>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">7. SMS and Email Program</h2>
              <p>
                Text messages are sent only if you check the consent box on the booking or order form. That box is how
                you agree to receive transactional booking and appointment SMS from {LEGAL.brand} about that order.
                Messages may include order-received notices, appointment reminders, photographer introductions, and
                photo-delivery notices. We also send related transactional email.
              </p>
              <ul className="list-disc list-inside mt-3 space-y-2">
                <li>
                  <strong>Message frequency varies</strong> with your bookings.
                </li>
                <li>
                  <strong>Message and data rates may apply.</strong>
                </li>
                <li>
                  Reply <strong>STOP</strong> to opt out of text messages. You will receive one confirmation, and then
                  no further SMS unless you opt in again.
                </li>
                <li>
                  Reply <strong>HELP</strong> for help, or contact{" "}
                  <a href={`mailto:${LEGAL.email}`} className="text-teal-600 underline">
                    {LEGAL.email}
                  </a>{" "}
                  or{" "}
                  <a href={LEGAL.phoneHref} className="text-teal-600 underline">
                    {LEGAL.phoneDisplay}
                  </a>
                  .
                </li>
              </ul>
              <p className="mt-3">
                Consent to texts is not required to purchase services. Promotional messages are sent only with
                separate consent. How we use phone numbers, email addresses, and opt-in data is described in our{" "}
                <Link to="/privacy" className="text-teal-600 underline">
                  Privacy Policy
                </Link>
                . Carriers are not liable for delayed or undelivered messages.
              </p>
            </section>

            <section id="acceptable-use" className={legalScrollMarginClassName}>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">8. Acceptable Use</h2>
              <p>You agree not to:</p>
              <ul className="list-disc list-inside mt-3 space-y-2">
                <li>Use the site for any unlawful purpose or to submit false booking information.</li>
                <li>Interfere with the site, attempt unauthorized access, or scrape it in a way that degrades service.</li>
                <li>Upload content you do not have the right to provide for virtual staging or other production.</li>
              </ul>
            </section>

            <section id="disclaimers" className={legalScrollMarginClassName}>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">9. Disclaimers</h2>
              <p>
                Our media is produced for marketing. It is not an appraisal, inspection, survey, or legal, tax, or
                brokerage advice. The website and services are provided &quot;as is.&quot; We do not guarantee that the
                site will be uninterrupted or error-free, or that a listing will sell because of the media we deliver.
              </p>
            </section>

            <section id="limitation-of-liability" className={legalScrollMarginClassName}>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">10. Limitation of Liability</h2>
              <p>
                To the fullest extent permitted by Texas law, {LEGAL.entity} and its owners, employees, and
                contractors are not liable for indirect, incidental, special, consequential, or lost-profit damages
                arising out of these Terms or the services. Our total liability for a booking is limited to the amount
                you paid us for that booking. Some jurisdictions do not allow certain limitations, so parts of this
                section may not apply to you.
              </p>
            </section>

            <section id="governing-law" className={legalScrollMarginClassName}>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">11. Governing Law</h2>
              <p>
                These Terms are governed by the laws of the State of Texas, without regard to conflict-of-law rules.
                Exclusive venue for disputes that are not required to be resolved elsewhere lies in the state or
                federal courts located in Texas.
              </p>
            </section>

            <section id="changes" className={legalScrollMarginClassName}>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">12. Changes</h2>
              <p>
                We may update these Terms from time to time. The &quot;Last updated&quot; date at the top of this page
                will change when we do. Continued use of the site or services after an update means you accept the
                revised Terms. The terms that apply to a confirmed booking are those in effect when we confirm it,
                plus any written change we both agree to for that job.
              </p>
            </section>

            <section id="contact" className={legalScrollMarginClassName}>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">13. Contact</h2>
              <p>Questions about these Terms, a booking, or the SMS program:</p>
              <LegalContact />
            </section>
          </div>
    </LegalDocument>
  );
}
