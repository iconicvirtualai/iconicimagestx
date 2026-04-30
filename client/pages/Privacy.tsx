import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function Privacy() {
  const lastUpdated = "April 20, 2025";

  return (
    <div className="flex flex-col min-h-screen bg-white">
      <Header />

      <main className="flex-1">
        <div className="container mx-auto px-4 py-16 max-w-4xl">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
          <p className="text-sm text-gray-500 mb-10">Last updated: {lastUpdated}</p>

          <div className="prose prose-gray max-w-none space-y-8 text-gray-700 leading-relaxed">

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">1. Introduction</h2>
              <p>
                Iconic Images Photography, LLC ("Iconic Images," "we," "us," or "our") is committed to
                protecting your personal information. This Privacy Policy explains how we collect, use,
                disclose, and safeguard your information when you visit our website or use our services.
                Please read this policy carefully. If you disagree with its terms, please discontinue use
                of our site and services.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">2. Information We Collect</h2>
              <p>We may collect the following categories of personal information:</p>
              <ul className="list-disc list-inside mt-3 space-y-2">
                <li><strong>Contact Information:</strong> Name, email address, phone number, and mailing address.</li>
                <li><strong>Booking Details:</strong> Property address, scheduled appointment date and time, service selections, access method, and special instructions.</li>
                <li><strong>Payment Information:</strong> Billing details processed securely through our payment processor. We do not store full credit card numbers.</li>
                <li><strong>Communications:</strong> Messages, emails, and SMS exchanges between you and our team.</li>
                <li><strong>Usage Data:</strong> Browser type, IP address, pages visited, and other analytics data collected automatically when you use our website.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">3. How We Use Your Information</h2>
              <p>We use the information we collect to:</p>
              <ul className="list-disc list-inside mt-3 space-y-2">
                <li>Process and confirm your booking requests.</li>
                <li>Send appointment reminders, confirmations, and status updates via email and SMS.</li>
                <li>Deliver completed photography galleries and related deliverables.</li>
                <li>Respond to your inquiries and provide customer support.</li>
                <li>Send promotional communications (with your consent, and you may opt out at any time).</li>
                <li>Improve our website, services, and overall user experience.</li>
                <li>Comply with applicable legal obligations.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">4. SMS Communications</h2>
              <p>
                By providing your phone number and submitting a booking request, you consent to receive
                transactional SMS messages from Iconic Images Photography, LLC. These messages may include
                booking confirmations, appointment reminders, photographer introductions, and photo delivery
                notifications.
              </p>
              <p className="mt-3">
                <strong>Message frequency varies</strong> based on your bookings. Standard message and data
                rates may apply. You may opt out of SMS communications at any time by replying <strong>STOP</strong> to
                any message we send. After opting out, you will receive a single confirmation message and no
                further SMS messages unless you re-subscribe.
              </p>
              <p className="mt-3">
                For help, reply <strong>HELP</strong> or contact us directly at{" "}
                <a href="mailto:cadi@iconicimagestx.com" className="text-teal-600 underline">
                  cadi@iconicimagestx.com
                </a>.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">5. Sharing Your Information</h2>
              <p>
                We do not sell, trade, or rent your personal information to third parties. We may share your
                information only in the following limited circumstances:
              </p>
              <ul className="list-disc list-inside mt-3 space-y-2">
                <li><strong>Service Providers:</strong> Trusted vendors who assist us in operating our business (e.g., email delivery, SMS messaging via Twilio, payment processing), subject to confidentiality agreements.</li>
                <li><strong>Photographers:</strong> Assigned photographers may receive your name, property address, and appointment details necessary to complete your booking.</li>
                <li><strong>Legal Requirements:</strong> When required by law, court order, or government regulation.</li>
                <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets, where your data may be transferred as part of the transaction.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">6. Data Retention</h2>
              <p>
                We retain your personal information for as long as necessary to fulfill the purposes described
                in this Privacy Policy, or as required by applicable law. Booking records and client files are
                generally retained for a minimum of three (3) years for business and tax purposes.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">7. Cookies and Tracking</h2>
              <p>
                Our website may use cookies and similar tracking technologies to enhance your browsing
                experience, analyze site traffic, and understand user behavior. You can control cookie
                preferences through your browser settings. Disabling cookies may affect certain features
                of our website.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">8. Security</h2>
              <p>
                We implement industry-standard security measures to protect your personal information from
                unauthorized access, disclosure, alteration, or destruction. However, no method of
                transmission over the internet or electronic storage is 100% secure, and we cannot guarantee
                absolute security.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">9. Your Rights</h2>
              <p>Depending on your location, you may have the right to:</p>
              <ul className="list-disc list-inside mt-3 space-y-2">
                <li>Access the personal information we hold about you.</li>
                <li>Request correction of inaccurate or incomplete information.</li>
                <li>Request deletion of your personal information, subject to legal retention requirements.</li>
                <li>Opt out of marketing and promotional communications at any time.</li>
              </ul>
              <p className="mt-3">
                To exercise any of these rights, please contact us using the information below.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">10. Children's Privacy</h2>
              <p>
                Our services are not directed to individuals under the age of 18. We do not knowingly collect
                personal information from children. If you believe we have inadvertently collected information
                from a minor, please contact us immediately and we will promptly delete it.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">11. Changes to This Policy</h2>
              <p>
                We may update this Privacy Policy from time to time. When we do, we will revise the "Last
                updated" date at the top of this page. We encourage you to review this policy periodically.
                Your continued use of our services after any changes constitutes your acceptance of the
                updated policy.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">12. Contact Us</h2>
              <p>
                If you have any questions, concerns, or requests regarding this Privacy Policy or our data
                practices, please contact us:
              </p>
              <div className="mt-4 p-5 bg-gray-50 rounded-lg border border-gray-200">
                <p className="font-semibold text-gray-900">Iconic Images Photography, LLC</p>
                <p>2219 Sawdust Rd. #1304</p>
                <p>Spring, TX 77380</p>
                <p className="mt-2">
                  Email:{" "}
                  <a href="mailto:cadi@iconicimagestx.com" className="text-teal-600 underline">
                    cadi@iconicimagestx.com
                  </a>
                </p>
              </div>
            </section>

          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
      }
