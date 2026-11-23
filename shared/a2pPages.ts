/**
 * Privacy, terms, /sms, and /book consent markup.
 * React pages and the no-JavaScript SEO shells both render these strings.
 */

import { BUSINESS_CONTACT, LEGAL_BUSINESS_NAME } from "./businessContact.ts";
import {
  LEGAL_LAST_UPDATED,
  MARKETING_SMS_CONSENT_TEXT,
  MARKETING_SMS_NO_SHARE_TEXT,
  PRIVACY_POLICY_URL,
  TERMS_URL,
  TRANSACTIONAL_SMS_CONSENT_TEXT,
  contactLineHtml,
} from "./a2p.ts";

const ENTITY = LEGAL_BUSINESS_NAME;
const EMAIL = BUSINESS_CONTACT.email;
const PHONE = BUSINESS_CONTACT.phoneDisplay;
const PHONE_HREF = BUSINESS_CONTACT.phoneHref;
const MAILTO = BUSINESS_CONTACT.emailHref;

export type ArticleBlock =
  | { type: "html"; html: string }
  | { type: "callout"; title: string; html: string }
  | { type: "contact" };

export type ArticleSection = {
  id: string;
  title: string;
  blocks: ArticleBlock[];
};

function a(href: string, label: string): string {
  return `<a href="${href}">${label}</a>`;
}

export function privacySections(): ArticleSection[] {
  return [
    {
      id: "introduction",
      title: "1. Introduction",
      blocks: [{
        type: "html",
        html: `<p>${ENTITY} (&quot;Iconic Images,&quot; &quot;Iconic Images TX,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) provides real estate photography, video, and related media services in Texas. We are committed to protecting your personal information. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website, book a shoot, or use our services, including transactional SMS and email. Please read this policy carefully. If you disagree with its terms, please discontinue use of our site and services.</p>`,
      }],
    },
    {
      id: "information-we-collect",
      title: "2. Information We Collect",
      blocks: [{
        type: "html",
        html: `<p>We may collect the following categories of personal information:</p>
<ul>
  <li><strong>Contact Information:</strong> Name, email address, phone number, and mailing address.</li>
  <li><strong>Booking Details:</strong> Property address, scheduled appointment date and time, service selections, access method, and special instructions.</li>
  <li><strong>Payment Information:</strong> Billing details processed securely through our payment processor. We do not store full credit card numbers.</li>
  <li><strong>Communications:</strong> Messages, emails, and SMS exchanges between you and our team, including your mobile number, message content, and opt-in or opt-out status.</li>
  <li><strong>Property Media:</strong> Photographs, video, and related files you request or that we create for a booking.</li>
  <li><strong>Usage Data:</strong> Browser type, IP address, pages visited, and other analytics data collected automatically when you use our website.</li>
</ul>`,
      }],
    },
    {
      id: "how-we-use-your-information",
      title: "3. How We Use Your Information",
      blocks: [{
        type: "html",
        html: `<p>We use the information we collect to:</p>
<ul>
  <li>Process and confirm your booking requests.</li>
  <li>Send transactional appointment notices, order-received confirmations, reminders, and status updates by email and SMS.</li>
  <li>Deliver completed photography galleries and related deliverables.</li>
  <li>Respond to your inquiries and provide customer support.</li>
  <li>Send promotional communications only with your consent. You may opt out at any time.</li>
  <li>Improve our website, services, and overall user experience.</li>
  <li>Comply with applicable legal obligations.</li>
</ul>`,
      }],
    },
    {
      id: "sms-and-email",
      title: "4. SMS and Email Communications",
      blocks: [
        {
          type: "html",
          html: `<p>Iconic Images sends transactional text messages and email related to real estate photography bookings and orders. If you check the consent box beside your phone number and submit a booking or order request, you agree to receive transactional SMS from ${ENTITY}. These messages may include:</p>
<ul>
  <li>Order-received notices confirming that we received your booking request. An order-received text is not a confirmed appointment until our team confirms the shoot.</li>
  <li>Appointment reminders and schedule updates.</li>
  <li>Photographer introductions.</li>
  <li>Photo, gallery, and delivery notices.</li>
  <li>Replies to messages you send us.</li>
</ul>
<p><strong>Message frequency varies</strong> based on your bookings and order activity. <strong>Message and data rates may apply.</strong></p>
<p>Reply <strong>STOP</strong> to any message to opt out of SMS. After you opt out, you will receive a single confirmation and no further text messages unless you opt in again. For help, reply <strong>HELP</strong>, email ${a(MAILTO, EMAIL)}, or call ${a(PHONE_HREF, PHONE)}.</p>
<p>If you check the text-message consent box on a booking or order form, you agree to those messages. Consent to receive text messages is not a condition of purchase. You may request services by phone or email without opting in to SMS. We also send transactional email about bookings, galleries, and invoices. Promotional email or text messages are sent only when you have given separate consent, and you may unsubscribe at any time.</p>
<p>Carriers are not liable for delayed or undelivered messages.</p>`,
        },
        {
          type: "callout",
          title: "Mobile numbers and messaging consent are not shared for marketing",
          html: `<p>Iconic Images does not share mobile phone numbers or messaging consent with third parties or affiliates for marketing or promotional purposes. No mobile information will be shared with third parties or affiliates for marketing or promotional purposes. All other categories of information sharing on this page exclude text messaging originator opt-in data and consent; this information will not be shared with any third parties or affiliates for marketing.</p>`,
        },
      ],
    },
    {
      id: "sharing-your-information",
      title: "5. Sharing Your Information",
      blocks: [{
        type: "html",
        html: `<p>We do not sell, trade, or rent your personal information. Mobile numbers and messaging consent are not shared with third parties or affiliates for marketing or promotional purposes. We may share other information only in the following limited circumstances:</p>
<ul>
  <li><strong>Service Providers:</strong> Vendors who help us deliver a service you asked for (for example, transmitting a text you opted into, sending email, or processing a payment). Those vendors may not use your mobile number or messaging consent for their own marketing.</li>
  <li><strong>Photographers:</strong> An assigned photographer may receive your name, property address, and phone number solely to complete the booked appointment. That share is not marketing permission and does not include your messaging opt-in for any other program.</li>
  <li><strong>Legal Requirements:</strong> When required by law, court order, or government regulation.</li>
  <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets, where your data may be transferred as part of the transaction. SMS opt-in data is not sold or transferred for another party&apos;s marketing.</li>
</ul>`,
      }],
    },
    {
      id: "data-retention",
      title: "6. Data Retention",
      blocks: [{
        type: "html",
        html: `<p>We retain your personal information for as long as necessary to fulfill the purposes described in this Privacy Policy, or as required by applicable law. Booking records and client files are generally retained for a minimum of three (3) years for business and tax purposes. SMS opt-out records are kept so we can honor your request.</p>`,
      }],
    },
    {
      id: "cookies-and-tracking",
      title: "7. Cookies and Tracking",
      blocks: [{
        type: "html",
        html: `<p>Our website may use cookies and similar tracking technologies to enhance your browsing experience, analyze site traffic, and understand user behavior. You can control cookie preferences through your browser settings. Disabling cookies may affect certain features of our website.</p>`,
      }],
    },
    {
      id: "security",
      title: "8. Security",
      blocks: [{
        type: "html",
        html: `<p>We implement industry-standard security measures to protect your personal information from unauthorized access, disclosure, alteration, or destruction. However, no method of transmission over the internet or electronic storage is 100% secure, and we cannot guarantee absolute security.</p>`,
      }],
    },
    {
      id: "your-rights",
      title: "9. Your Rights",
      blocks: [{
        type: "html",
        html: `<p>Depending on your location, you may have the right to:</p>
<ul>
  <li>Access the personal information we hold about you.</li>
  <li>Request correction of inaccurate or incomplete information.</li>
  <li>Request deletion of your personal information, subject to legal retention requirements.</li>
  <li>Opt out of marketing and promotional communications at any time.</li>
  <li>Opt out of SMS at any time by replying STOP.</li>
</ul>
<p>To exercise any of these rights, please contact us using the information below.</p>`,
      }],
    },
    {
      id: "childrens-privacy",
      title: "10. Children's Privacy",
      blocks: [{
        type: "html",
        html: `<p>Our services are not directed to individuals under the age of 18. We do not knowingly collect personal information from children. If you believe we have inadvertently collected information from a minor, please contact us immediately and we will promptly delete it.</p>`,
      }],
    },
    {
      id: "changes",
      title: "11. Changes to This Policy",
      blocks: [{
        type: "html",
        html: `<p>We may update this Privacy Policy from time to time. When we do, we will revise the &quot;Last updated&quot; date at the top of this page. We encourage you to review this policy periodically. Your continued use of our services after any changes constitutes your acceptance of the updated policy.</p>`,
      }],
    },
    {
      id: "contact",
      title: "12. Contact Us",
      blocks: [
        {
          type: "html",
          html: `<p>If you have any questions, concerns, or requests regarding this Privacy Policy, our SMS program, or our data practices, please contact us:</p>`,
        },
        { type: "contact" },
      ],
    },
  ];
}

export function termsSections(): ArticleSection[] {
  return [
    {
      id: "agreement",
      title: "1. Agreement",
      blocks: [{
        type: "html",
        html: `<p>These Terms and Conditions (&quot;Terms&quot;) govern your use of the websites and services of ${ENTITY}, which does business as Iconic Images and Iconic Images TX (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;). By visiting our website, submitting a booking or order, or using our services, you agree to these Terms and to our ${a("/privacy", "Privacy Policy")}. If you do not agree, do not use the site or submit an order.</p>`,
      }],
    },
    {
      id: "services",
      title: "2. Services",
      blocks: [{
        type: "html",
        html: `<p>We provide real estate and property photography, video, aerial imagery, virtual staging, and related media production for real estate professionals, brokerages, and property owners, primarily in Texas. Service descriptions and prices on the website are invitations to request work. A specific shoot, deliverable, or turnaround applies only after we accept the booking and confirm the details with you.</p>`,
      }],
    },
    {
      id: "booking-requests",
      title: "3. Booking Requests",
      blocks: [{
        type: "html",
        html: `<p>Submitting the booking form is a request, not a confirmed appointment. An order-received email or text means we have your request and will review it. The appointment is confirmed only when our team confirms the date, time, and scope. You agree to provide a correct property address, access instructions, and a phone number and email where we can reach you about that order.</p>
<p>You represent that you have authority to grant access to the property and permission for us to photograph and film it for the services you order.</p>`,
      }],
    },
    {
      id: "fees-and-payment",
      title: "4. Fees and Payment",
      blocks: [{
        type: "html",
        html: `<p>Fees are those quoted on the booking flow, an invoice, or a written proposal. Estimates shown before we confirm a booking may change if the property, services, or schedule change. Payment is due as stated on the invoice. We do not store full credit card numbers on our servers. Failure to pay amounts due may delay delivery or future bookings.</p>`,
      }],
    },
    {
      id: "changes-rescheduling-cancellation",
      title: "5. Changes, Rescheduling, and Cancellation",
      blocks: [{
        type: "html",
        html: `<p>Contact us as soon as you need to reschedule or cancel a shoot so we can adjust the calendar. Monthly marketing plans that we describe on the pricing page as contract-free may be cancelled with 30 days&apos; notice, as stated there. Any deposit, cancellation window, or reschedule rule for a particular shoot will be confirmed with that booking. If weather, access, or safety prevents a shoot, we will work with you to reschedule.</p>`,
      }],
    },
    {
      id: "deliverables-and-license",
      title: "6. Deliverables and License",
      blocks: [{
        type: "html",
        html: `<p>Unless a written agreement says otherwise, ${ENTITY} retains copyright in the photographs, video, and other media we create. When payment is complete, we grant you a non-exclusive license to use the delivered media to market the photographed property and your real estate business, including MLS listings, brochures, and your own social channels. You may not resell the files as stock, claim authorship, or use them in a way that implies we endorse a third party.</p>
<p>If you turn on listing marketing permission during booking, you allow us to show that listing&apos;s media on our website, social channels, and portfolio. That permission is separate from consent to receive text messages.</p>`,
      }],
    },
    {
      id: "sms-and-email",
      title: "7. SMS and Email Program",
      blocks: [{
        type: "html",
        html: `<p>Text messages are sent only if you check the consent box on the booking or order form. That box is how you agree to receive transactional booking and appointment SMS from Iconic Images about that order. Messages may include order-received notices, appointment reminders, photographer introductions, and photo-delivery notices. We also send related transactional email.</p>
<ul>
  <li><strong>Message frequency varies</strong> with your bookings.</li>
  <li><strong>Message and data rates may apply.</strong></li>
  <li>Reply <strong>STOP</strong> to opt out of text messages. You will receive one confirmation, and then no further SMS unless you opt in again.</li>
  <li>Reply <strong>HELP</strong> for help, or contact ${a(MAILTO, EMAIL)} or ${a(PHONE_HREF, PHONE)}.</li>
</ul>
<p>Consent to texts is not required to purchase services. Promotional messages are sent only with separate consent. How we use phone numbers, email addresses, and opt-in data is described in our ${a("/privacy", "Privacy Policy")}. Carriers are not liable for delayed or undelivered messages.</p>`,
      }],
    },
    {
      id: "acceptable-use",
      title: "8. Acceptable Use",
      blocks: [{
        type: "html",
        html: `<p>You agree not to:</p>
<ul>
  <li>Use the site for any unlawful purpose or to submit false booking information.</li>
  <li>Interfere with the site, attempt unauthorized access, or scrape it in a way that degrades service.</li>
  <li>Upload content you do not have the right to provide for virtual staging or other production.</li>
</ul>`,
      }],
    },
    {
      id: "disclaimers",
      title: "9. Disclaimers",
      blocks: [{
        type: "html",
        html: `<p>Our media is produced for marketing. It is not an appraisal, inspection, survey, or legal, tax, or brokerage advice. The website and services are provided &quot;as is.&quot; We do not guarantee that the site will be uninterrupted or error-free, or that a listing will sell because of the media we deliver.</p>`,
      }],
    },
    {
      id: "limitation-of-liability",
      title: "10. Limitation of Liability",
      blocks: [{
        type: "html",
        html: `<p>To the fullest extent permitted by Texas law, ${ENTITY} and its owners, employees, and contractors are not liable for indirect, incidental, special, consequential, or lost-profit damages arising out of these Terms or the services. Our total liability for a booking is limited to the amount you paid us for that booking. Some jurisdictions do not allow certain limitations, so parts of this section may not apply to you.</p>`,
      }],
    },
    {
      id: "governing-law",
      title: "11. Governing Law",
      blocks: [{
        type: "html",
        html: `<p>These Terms are governed by the laws of the State of Texas, without regard to conflict-of-law rules. Exclusive venue for disputes that are not required to be resolved elsewhere lies in the state or federal courts located in Texas.</p>`,
      }],
    },
    {
      id: "changes",
      title: "12. Changes",
      blocks: [{
        type: "html",
        html: `<p>We may update these Terms from time to time. The &quot;Last updated&quot; date at the top of this page will change when we do. Continued use of the site or services after an update means you accept the revised Terms. The terms that apply to a confirmed booking are those in effect when we confirm it, plus any written change we both agree to for that job.</p>`,
      }],
    },
    {
      id: "contact",
      title: "13. Contact",
      blocks: [
        { type: "html", html: `<p>Questions about these Terms, a booking, or the SMS program:</p>` },
        { type: "contact" },
      ],
    },
  ];
}

function crawlArticle(title: string, kicker: string, intro: string, sections: ArticleSection[]): string {
  const body = sections.map((section) => {
    const blocks = section.blocks.map((block) => {
      if (block.type === "contact") {
        return `<div style="margin-top:16px;padding:20px;border-radius:16px;background:#fff;border:1px solid #e7e5e4">${contactLineHtml()}</div>`;
      }
      if (block.type === "callout") {
        return `<aside style="margin-top:16px;padding:20px;border-radius:16px;background:#f0fdfa;border:1px solid #99f6e4"><p style="margin:0 0 8px;font-weight:700">${block.title}</p>${block.html}</aside>`;
      }
      return block.html;
    }).join("");
    return `<section id="${section.id}"><h2 style="font-size:22px;margin:28px 0 8px">${section.title}</h2>${blocks}</section>`;
  }).join("");
  return `<article data-crawlable="true" style="box-sizing:border-box;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#f7f4ee;color:#1c1917;margin:0;padding:28px 16px 72px;line-height:1.65">
  <div style="max-width:760px;margin:0 auto">
    <p style="margin:0;letter-spacing:.16em;text-transform:uppercase;font-size:12px;font-weight:700;color:#0f766e">${kicker}</p>
    <h1 style="font-size:36px;line-height:1.1;margin:8px 0 8px">${title}</h1>
    <p style="margin:0 0 8px;color:#57534e;font-size:14px">Last updated: ${LEGAL_LAST_UPDATED}</p>
    ${intro}
    ${body}
  </div>
</article>`;
}

export function privacyCrawlHtml(): string {
  return crawlArticle(
    "Privacy Policy",
    "Iconic Images",
    `<p style="color:#44403c">This policy works together with our ${a("/terms", "Terms and Conditions")}.</p>`,
    privacySections(),
  );
}

export function termsCrawlHtml(): string {
  return crawlArticle(
    "Terms and Conditions",
    "Iconic Images",
    `<p style="color:#44403c">These Terms and Conditions are the terms of service for Iconic Images / Iconic Images TX. They are a separate page from our ${a("/privacy", "Privacy Policy")}. This page is published at /terms. The Privacy Policy is published at /privacy.</p>`,
    termsSections(),
  );
}

const fieldStyle = "width:100%;box-sizing:border-box;border:1px solid #e7e5e4;background:#fff;border-radius:14px;padding:14px 16px;font:inherit;color:#1c1917";

export function smsOptInCrawlHtml(): string {
  return `<article data-crawlable="true" style="box-sizing:border-box;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#f7f4ee;color:#1c1917;margin:0;padding:28px 16px 72px;line-height:1.6">
  <div style="max-width:640px;margin:0 auto">
    <p style="margin:0;letter-spacing:.16em;text-transform:uppercase;font-size:12px;font-weight:700;color:#0f766e">Text updates</p>
    <h1 style="font-size:36px;line-height:1.1;margin:8px 0 12px">Promotional texts from Iconic Images</h1>
    <p style="margin:0 0 24px;color:#44403c">Photography services, offers, and events. The checkbox starts unchecked. Checking it is how you opt in.</p>
    <form method="post" action="/api/sms/marketing-opt-in" style="background:#fffdf8;border-radius:28px;padding:24px 20px;box-shadow:0 18px 50px rgba(28,25,23,.08)">
      <input type="hidden" name="source" value="/sms" />
      <label style="display:block;font-weight:700;margin:0 0 6px" for="sms-name">Name</label>
      <input id="sms-name" name="name" type="text" autocomplete="name" required style="${fieldStyle}" />
      <label style="display:block;font-weight:700;margin:16px 0 6px" for="sms-phone">Mobile number</label>
      <input id="sms-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" required style="${fieldStyle}" />
      <label style="display:flex;gap:12px;align-items:flex-start;margin:18px 0;font-size:15px" for="sms-marketing-consent">
        <input id="sms-marketing-consent" name="consent" type="checkbox" value="yes" style="width:22px;height:22px;margin-top:2px;accent-color:#0f766e" />
        <span>${MARKETING_SMS_CONSENT_TEXT.replace("Privacy Policy", a(PRIVACY_POLICY_URL, "Privacy Policy")).replace("Terms.", a(TERMS_URL, "Terms") + ".")}</span>
      </label>
      <p style="margin:0 0 18px;font-size:14px;color:#44403c">${MARKETING_SMS_NO_SHARE_TEXT}</p>
      <button type="submit" style="width:100%;border:0;border-radius:999px;background:#0f766e;color:#fff;font-weight:700;padding:14px 18px;font:inherit;cursor:pointer">Sign up for texts</button>
    </form>
  </div>
</article>`;
}

export function bookConsentCrawlHtml(): string {
  return `<article data-crawlable="true" style="box-sizing:border-box;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#f7f4ee;color:#1c1917;margin:0;padding:28px 16px 48px;line-height:1.6">
  <div style="max-width:720px;margin:0 auto">
    <p style="margin:0;letter-spacing:.16em;text-transform:uppercase;font-size:12px;font-weight:700;color:#0f766e">Book a shoot</p>
    <h1 style="font-size:32px;line-height:1.15;margin:8px 0 12px">Text message consent</h1>
    <p style="margin:0 0 16px;color:#44403c">This box is unchecked until you check it. Transactional booking texts are sent only if you do.</p>
    <form action="/book" method="get" style="background:#fffdf8;border-radius:28px;padding:20px;box-shadow:0 18px 50px rgba(28,25,23,.08)">
      <label style="display:flex;gap:12px;align-items:flex-start;font-size:15px" for="book-sms-consent">
        <input id="book-sms-consent" name="smsConsent" type="checkbox" value="yes" style="width:22px;height:22px;margin-top:2px;accent-color:#0f766e" />
        <span>${TRANSACTIONAL_SMS_CONSENT_TEXT.replace("Privacy Policy", a(PRIVACY_POLICY_URL, "Privacy Policy")).replace("Terms and Conditions.", a(TERMS_URL, "Terms and Conditions") + ".")}</span>
      </label>
    </form>
  </div>
</article>`;
}

export function crawlableBodyForPath(pathname: string): string {
  if (pathname === "/privacy") return privacyCrawlHtml();
  if (pathname === "/terms") return termsCrawlHtml();
  if (pathname === "/sms") return smsOptInCrawlHtml();
  if (pathname === "/book") return bookConsentCrawlHtml();
  return "";
}
