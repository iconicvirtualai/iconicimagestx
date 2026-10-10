import { Link } from "react-router-dom";
import LegalDocument, { legalScrollMarginClassName } from "@/components/LegalDocument";
import LegalContact from "@/components/LegalContact";
import { LEGAL } from "@/lib/legal";

export default function Privacy() {
  return (
    <LegalDocument>
          <h1 id="privacy-policy" className={`${legalScrollMarginClassName} text-4xl font-bold text-gray-900 mb-2`}>Privacy Policy</h1>
          <p className="text-sm text-gray-500 mb-4">Last updated: {LEGAL.lastUpdated}</p>
          <p className="text-sm text-gray-600 mb-10">
            This policy works together with our{" "}
            <Link to="/terms" className="text-teal-600 underline">
              Terms and Conditions
            </Link>
            .
          </p>

          <div className="prose prose-gray max-w-none space-y-8 text-gray-700 leading-relaxed">
            <section id="introduction" className={legalScrollMarginClassName}>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">1. Introduction</h2>
              <p>
                {LEGAL.entity} (&quot;{LEGAL.brand},&quot; &quot;{LEGAL.brandSite},&quot; &quot;we,&quot; &quot;us,&quot; or
                &quot;our&quot;) provides real estate photography, video, and related media services in Texas. We are
                committed to protecting your personal information. This Privacy Policy explains how we collect, use,
                disclose, and safeguard your information when you visit our website, book a shoot, or use our services,
                including transactional SMS and email. Please read this policy carefully. If you disagree with its
                terms, please discontinue use of our site and services.
              </p>
            </section>

            <section id="information-we-collect" className={legalScrollMarginClassName}>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">2. Information We Collect</h2>
              <p>We may collect the following categories of personal information:</p>
              <ul className="list-disc list-inside mt-3 space-y-2">
                <li>
                  <strong>Contact Information:</strong> Name, email address, phone number, and mailing address.
                </li>
                <li>
                  <strong>Booking Details:</strong> Property address, scheduled appointment date and time, service
                  selections, access method, and special instructions.
                </li>
                <li>
                  <strong>Payment Information:</strong> Billing details processed securely through our payment
                  processor. We do not store full credit card numbers.
                </li>
                <li>
                  <strong>Communications:</strong> Messages, emails, and SMS exchanges between you and our team,
                  including your mobile number, message content, and opt-in or opt-out status.
                </li>
                <li>
                  <strong>Property Media:</strong> Photographs, video, and related files you request or that we create
                  for a booking.
                </li>
                <li>
                  <strong>Usage Data:</strong> Browser type, IP address, pages visited, and other analytics data
                  collected automatically when you use our website.
                </li>
              </ul>
            </section>

            <section id="how-we-use-your-information" className={legalScrollMarginClassName}>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">3. How We Use Your Information</h2>
              <p>We use the information we collect to:</p>
              <ul className="list-disc list-inside mt-3 space-y-2">
                <li>Process and confirm your booking requests.</li>
                <li>
                  Send transactional appointment notices, order-received confirmations, reminders, and status updates
                  by email and SMS.
                </li>
                <li>Deliver completed photography galleries and related deliverables.</li>
                <li>Respond to your inquiries and provide customer support.</li>
                <li>Send promotional communications only with your consent. You may opt out at any time.</li>
                <li>Improve our website, services, and overall user experience.</li>
                <li>Comply with applicable legal obligations.</li>
              </ul>
            </section>

            <section id="sms-and-email" className={legalScrollMarginClassName}>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">4. SMS and Email Communications</h2>
              <p>
                {LEGAL.brand} sends transactional text messages and email related to real estate photography bookings
                and orders. If you check the consent box beside your phone number and submit a booking or order
                request, you agree to receive transactional SMS from {LEGAL.entity}. These messages may include:
              </p>
              <ul className="list-disc list-inside mt-3 space-y-2">
                <li>
                  Order-received notices confirming that we received your booking request. An order-received text is
                  not a confirmed appointment until our team confirms the shoot.
                </li>
                <li>Appointment reminders and schedule updates.</li>
                <li>Photographer introductions.</li>
                <li>Photo, gallery, and delivery notices.</li>
                <li>Replies to messages you send us.</li>
              </ul>
              <p className="mt-3">
                <strong>Message frequency varies</strong> based on your bookings and order activity.{" "}
                <strong>Message and data rates may apply.</strong>
              </p>
              <p className="mt-3">
                Reply <strong>STOP</strong> to any message to opt out of SMS. After you opt out, you will receive a
                single confirmation and no further text messages unless you opt in again. For help, reply{" "}
                <strong>HELP</strong>, email{" "}
                <a href={`mailto:${LEGAL.email}`} className="text-teal-600 underline">
                  {LEGAL.email}
                </a>
                , or call{" "}
                <a href={LEGAL.phoneHref} className="text-teal-600 underline">
                  {LEGAL.phoneDisplay}
                </a>
                .
              </p>
              <p className="mt-3">
                If you check the text-message consent box on a booking or order form, you agree to those messages.
                Consent to receive text messages is not a condition of purchase. You may request services by phone or
                email without opting in to SMS. We also send transactional email about bookings, galleries, and
                invoices. Promotional email or text messages are sent only when you have given separate consent, and
                you may unsubscribe at any time.
              </p>
              <div className="mt-4 rounded-lg border border-gray-300 bg-gray-50 p-5">
                <p className="font-semibold text-gray-900">
                  Mobile numbers and messaging consent are not shared for marketing
                </p>
                <p className="mt-2">
                  {LEGAL.brand} does not share mobile phone numbers or messaging consent with third parties or
                  affiliates for marketing or promotional purposes. No mobile information will be shared with third
                  parties or affiliates for marketing or promotional purposes. All other categories of information
                  sharing on this page exclude text messaging originator opt-in data and consent; this information
                  will not be shared with any third parties or affiliates for marketing.
                </p>
              </div>
              <p className="mt-3">Carriers are not liable for delayed or undelivered messages.</p>
            </section>

            <section id="sharing-your-information" className={legalScrollMarginClassName}>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">5. Sharing Your Information</h2>
              <p>
                We do not sell, trade, or rent your personal information. Mobile numbers and messaging consent are not
                shared with third parties or affiliates for marketing or promotional purposes. We may share other
                information only in the following limited circumstances:
              </p>
              <ul className="list-disc list-inside mt-3 space-y-2">
                <li>
                  <strong>Service Providers:</strong> Vendors who help us deliver a service you asked for (for example,
                  transmitting a text you opted into, sending email, or processing a payment). Those vendors may not
                  use your mobile number or messaging consent for their own marketing.
                </li>
                <li>
                  <strong>Photographers:</strong> An assigned photographer may receive your name, property address, and
                  phone number solely to complete the booked appointment. That share is not marketing permission and
                  does not include your messaging opt-in for any other program.
                </li>
                <li>
                  <strong>Legal Requirements:</strong> When required by law, court order, or government regulation.
                </li>
                <li>
                  <strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets,
                  where your data may be transferred as part of the transaction. SMS opt-in data is not sold or
                  transferred for another party&apos;s marketing.
                </li>
              </ul>
            </section>

            <section id="data-retention" className={legalScrollMarginClassName}>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">6. Data Retention</h2>
              <p>
                We retain your personal information for as long as necessary to fulfill the purposes described in this
                Privacy Policy, or as required by applicable law. Booking records and client files are generally
                retained for a minimum of three (3) years for business and tax purposes. SMS opt-out records are kept
                so we can honor your request.
              </p>
            </section>

            <section id="cookies-and-tracking" className={legalScrollMarginClassName}>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">7. Cookies and Tracking</h2>
              <p>
                Our website may use cookies and similar tracking technologies to enhance your browsing experience,
                analyze site traffic, and understand user behavior. You can control cookie preferences through your
                browser settings. Disabling cookies may affect certain features of our website.
              </p>
            </section>

            <section id="security" className={legalScrollMarginClassName}>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">8. Security</h2>
              <p>
                We implement industry-standard security measures to protect your personal information from unauthorized
                access, disclosure, alteration, or destruction. However, no method of transmission over the internet or
                electronic storage is 100% secure, and we cannot guarantee absolute security.
              </p>
            </section>

            <section id="your-rights" className={legalScrollMarginClassName}>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">9. Your Rights</h2>
              <p>Depending on your location, you may have the right to:</p>
              <ul className="list-disc list-inside mt-3 space-y-2">
                <li>Access the personal information we hold about you.</li>
                <li>Request correction of inaccurate or incomplete information.</li>
                <li>Request deletion of your personal information, subject to legal retention requirements.</li>
                <li>Opt out of marketing and promotional communications at any time.</li>
                <li>Opt out of SMS at any time by replying STOP.</li>
              </ul>
              <p className="mt-3">To exercise any of these rights, please contact us using the information below.</p>
            </section>

            <section id="childrens-privacy" className={legalScrollMarginClassName}>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">10. Children&apos;s Privacy</h2>
              <p>
                Our services are not directed to individuals under the age of 18. We do not knowingly collect personal
                information from children. If you believe we have inadvertently collected information from a minor,
                please contact us immediately and we will promptly delete it.
              </p>
            </section>

            <section id="changes" className={legalScrollMarginClassName}>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">11. Changes to This Policy</h2>
              <p>
                We may update this Privacy Policy from time to time. When we do, we will revise the &quot;Last
                updated&quot; date at the top of this page. We encourage you to review this policy periodically. Your
                continued use of our services after any changes constitutes your acceptance of the updated policy.
              </p>
            </section>

            <section id="contact" className={legalScrollMarginClassName}>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">12. Contact Us</h2>
              <p>
                If you have any questions, concerns, or requests regarding this Privacy Policy, our SMS program, or our
                data practices, please contact us:
              </p>
              <LegalContact />
            </section>
          </div>
    </LegalDocument>
  );
}
