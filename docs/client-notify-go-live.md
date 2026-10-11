# Client notify go-live

What can reach a client today, and what has to be true before `CLIENT_NOTIFY_LIVE` is turned on.

`CLIENT_NOTIFY_LIVE` must be exactly `true`. Anything else, including unset, stays off. `CLIENT_COMMS_ZONE=RED` forces the gate off even when the flag is `true`. `NOTIFY_TEST_ALLOWLIST` is an exact mailbox list (trim and lowercase only). A plus-tag is its own address: `ops+deliveryqa@iconicimagestx.com` does not match `ops@iconicimagestx.com`. While the gate is off, a gated **email** may still go to an allowlisted address. SMS has no allowlist. With the flag unset, gated SMS is suppressed for everyone.

`APP_URL` is still the Wix domain. Client links that are ready use `publicSiteUrl()` (`PUBLIC_SITE_URL`, else `VITE_PUBLIC_SITE_URL`, else `https://iconicimagestx.vercel.app`).

Square invoice sync uses `delivery_method: SHARE_MANUALLY`, so Square does not email the buyer when that sync runs. The sync function is not called from a route today. Square can still email its own payment receipt from the seller dashboard. That setting is outside this flag.

## Client-facing email

| Template or id | Channel | Trigger | Recipient | Gate | With `CLIENT_NOTIFY_LIVE` unset | Link base |
| --- | --- | --- | --- | --- | --- | --- |
| `booking_received` | Email | `POST` booking in `server/routes/bookings.ts`. Client submits a booking request. | Client email on the request | Ungated. `emailAllowed` always allows this template. Not narrowed to the allowlist. | **SENDS** | Built-in HTML has no link. The send still passes `dashboardUrl` from `APP_URL` (`/admin/order-request/:id`). A stored Firestore template that prints `{{dashboardUrl}}` would use the Wix host. |
| `account_password_setup` | Email | Same booking handler, only when a new portal account was created. | Client email | `CLIENT_NOTIFY_LIVE` / `RED` / allowlist. Caller also skips the link when `passwordSetupAllowed` is false. | Allowlist-only. Otherwise suppressed and logged as gated. | `portalUrl` is `publicSiteUrl()/portal`. `setupUrl` is a Firebase password link whose continue URL is that same portal URL. |
| Firebase password email (`accounts:sendOobCode`, `PASSWORD_RESET`) | Email, Firebase Auth | Fallback in the booking handler when SMTP fails, or when the setup link could not be built, and only if `passwordSetupAllowed`. Also `sendPasswordResetEmail` in `client/contexts/AuthContext.tsx` when someone uses Forgot password. | Client email | Booking fallback: same gate as password setup. The login-screen reset is **ungated**. Firebase sends it. | Booking fallback: allowlist-only. Forgot password: **SENDS** | Booking fallback has no continue URL, so the link is Firebase's default handler. Forgot password is the same. The host must be a Firebase authorized domain. |
| `order_confirmed` | Email | Staff confirms the request in `server/routes/bookings.ts`. | Client email | Gated email. Allowlist can deliver it. | Allowlist-only. Otherwise suppressed. | `publicSiteUrl()/portal` |
| `gallery_delivery` | Email | Deliver Gallery. `deliverGalleryToClient` in `server/services/galleryDeliver.ts`. | Client email | Gated email. Allowlist can deliver it. History records sent, allowlist, or suppressed. | Allowlist-only. Otherwise suppressed, including playtest, and the order history says so. | `publicSiteUrl()/gallery/:id` and, when the invoice has a pay token and is unpaid, `publicSiteUrl()/invoice/:id?t=` |
| `invoice` | Email | Staff sends the pay link. `POST /api/payments/send-invoice`. | Client email | Gated email. | Allowlist-only. Otherwise suppressed. | `publicSiteUrl()/invoice/:id?t=` via `clientInvoiceUrl` |
| `payment_receipt` | Email | Square webhook after a captured payment (`receiveSquareWebhook`), staff `POST /api/payments/send-receipt`, and the Stripe success path. | Client email | Gated email. The webhook does not bypass it. History records suppressed, allowlist, or sent. | Allowlist-only. Otherwise suppressed. | `publicSiteUrl()` for the logo, `/gallery/:id`, and (after #134) the presentation link. No `APP_URL`. |
| `contact_confirmation` | Email | `POST /api/contact`. Visitor submits the contact form. | The address they typed | Gated email. The template is not marked staff. | Allowlist-only. A real visitor is suppressed. | No link. Phone and `photos@iconicimagestx.com` are the public contact block. |
| `manual_message` | Email | Staff `POST /api/messages/email`. | The address staff typed. This can be a client. | Gated email. | Allowlist-only. | No link in the built-in template. The body is staff-written. |
| `marketing` | Email | Staff sends a legacy campaign. `POST /api/campaigns/:id/send` in `server/routes/campaigns.ts`. | Active or VIP clients, or a custom id list | The route returns 503 unless `clientNotifyLive()`, and `sendEmail` gates the template too. No allowlist short-circuit on the route check. | **Suppressed** (route stops before send). | Whatever the campaign body contains. |
| GMass campaign and GMass test send | Email, GMass | Marketing portal `POST /api/marketing/campaigns/:id/send` and `.../test`. | Campaign audience, or the test address | **Ungated by `CLIENT_NOTIFY_LIVE` and by RED.** Needs `MARKETING_SEND_LIVE=true`, `GMASS_API_KEY`, and `GMASS_SEND_ENABLED=true`. | Does not send unless those three are set. Setting `CLIENT_NOTIFY_LIVE` does not turn GMass on. Setting `MARKETING_SEND_LIVE` does not turn the other client emails on. | Unsubscribe and public links use `marketingPublicUrl`: `MARKETING_PUBLIC_URL`, else **`APP_URL` (Wix)**, else the request host. |
| `clientConfirmation` (Gmail) | Email, Gmail API | `onOrderCreated` in `functions/src/index.ts` when an `orders/{id}` doc is created. | `order.clientEmail` | Direct check of `CLIENT_NOTIFY_LIVE === "true"` and not RED. No allowlist. | **Suppressed** | No URL in the seeded template. Live copy is the Firestore doc `emailTemplates/clientConfirmation`. |
| Stripe `receipt_email` | Email, Stripe | `POST /api/payments/create-intent` and Stripe Checkout in `server/routes/payments.ts`. | Invoice client email | Passed to Stripe only when `clientNotifyLive()` is true. No allowlist. | **Suppressed** (field omitted). | Stripe's own receipt page. |
| Square payment-link receipt | Email, Square | Checkout sets `pre_populated_data.buyer_email`. Square's own receipt email is a location setting, not this codebase. | Buyer email Square has | **Ungated.** Our flag does not turn it off. | **SENDS if the Square dashboard receipt setting is on.** | Square's receipt host. |

`new_booking_alert` and `photographerIntro` exist as copy and are not sent. Nothing calls them.

## Client-facing SMS

| Template or id | Channel | Trigger | Recipient | Gate | With `CLIENT_NOTIFY_LIVE` unset | Link base |
| --- | --- | --- | --- | --- | --- | --- |
| `booking_confirmation` (`SMS_TEMPLATES.bookingConfirmation`) | SMS | Booking request handler. | Client phone | Ungated. `smsAllowed` always allows this kind. | **SENDS** | No URL. The public contact line is in the body. |
| `photosDelivered` | SMS | `deliverGalleryToClient`, after the gallery email. | Client phone | Gated SMS. No allowlist. | **Suppressed** | `publicSiteUrl()/gallery/:id` |
| Appointment reminder, 24h and 1h | SMS | Staff `POST /api/sms/remind/:orderId`, and the reminder sweep `POST /api/agents/run-reminders`. | Client phone on the order | Gated SMS. No allowlist. | **Suppressed** | No URL. |
| Staff one-off SMS | SMS | `POST /api/sms/send`. | The number staff typed. This can be a client. | Gated SMS. No allowlist. | **Suppressed** | Whatever staff typed. |
| Legacy SMS campaign | SMS | `POST /api/campaigns/:id/send` when the campaign type is sms, and `POST /api/sms/campaign/:id/send`. | Clients with a phone and `smsOptIn` | Route checks `clientNotifyLive()`, and `sendSMSCampaign` checks it again. | **Suppressed** | Campaign body. |
| Masked photographer/client conversation | SMS | `POST /api/sms/conversation`, then `sendConversationMessage`. | Photographer and client phones | `createMaskedConversation` and `sendConversationMessage` throw unless `clientNotifyLive()`. | **Suppressed** | No URL. Twilio proxy number. |

## Staff sends (not the client blast, still listed because they are ungated or use `APP_URL`)

| Template or id | Channel | Trigger | Recipient | Gate | With `CLIENT_NOTIFY_LIVE` unset | Link base |
| --- | --- | --- | --- | --- | --- | --- |
| `office_new_order` | Email | New booking, `notifyOfficeOfOrder`. Audience `staff`. | `ADMIN_EMAIL` and `COORDINATOR_EMAIL`, never the client address | Ungated for this template when audience is `staff`. | **SENDS** | Admin link is **`APP_URL`/admin/order-request/:id** (Wix host until that env changes). |
| `live_chat` | Email | Visitor chat, `server/services/liveChat.ts`. Audience `staff`. | Office inbox | Ungated for this template when audience is `staff`. Refused if audience is not staff. | **SENDS** | No client link. |
| `staff_inbound` | SMS | Same live chat. | Office Google Voice `+12813560965` only | Ungated, and any other destination is refused. | **SENDS** to that number | No URL. |
| `contact_form` | Email | Contact form, to the office. | `CONTACT_FORM_EMAIL` or `photos@iconicimagestx.com` | Treated as client mail because audience is not `staff`. | Allowlist-only. The office address is suppressed unless it is on the allowlist. | No site link. |
| `newBookingAlert` | SMS | Booking handler, only if `ADMIN_PHONE` is set. | Admin phone | No SMS kind, so the client gate applies. | **Suppressed** | No URL. |
| `ownerNotification` | Email, Gmail | `onOrderCreated` | `orders@iconicimagestx.com` | Same direct flag as `clientConfirmation`. No allowlist. | **Suppressed** | Seeded template has no URL. |

## Ungated, or still on `APP_URL` / Wix

- **SENDS today with the flag unset:** `booking_received`, booking-confirmation SMS, Firebase Forgot password, `office_new_order`, live-chat staff email, live-chat staff SMS, and a Square seller receipt if that dashboard toggle is on.
- **`APP_URL` (Wix) is still in a client payload:** `booking_received`'s `dashboardUrl` variable. It is not in the built-in HTML. It is in the variables a stored template can print.
- **`APP_URL` is the link that is actually rendered:** `office_new_order` admin link, and GMass unsubscribe links whenever `MARKETING_PUBLIC_URL` is empty.
- **Separate switch that ignores this flag:** GMass (`MARKETING_SEND_LIVE` + `GMASS_SEND_ENABLED`). Do not treat go-live of client notify as go-live of marketing.

## Go-live order

1. Set `PUBLIC_SITE_URL` to the https client origin (`https://iconicimagestx.vercel.app` until the custom domain is cut over). Do not point client links at `APP_URL`.
2. Set `MARKETING_PUBLIC_URL` to that same origin before any GMass send, so unsubscribe links are not built from `APP_URL`.
3. Leave `CLIENT_COMMS_ZONE` unset, or anything other than `RED`.
4. Set `NOTIFY_TEST_ALLOWLIST` to the exact QA mailboxes, including `ops+deliveryqa@iconicimagestx.com`. Do not add a domain pattern.
5. Confirm SMTP (`SMTP_USER`, `SMTP_PASS`) and Twilio (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`) in the host that will send.
6. In Square, set the webhook notification URL to the public `https://…/api/payments/square-webhook` and put that exact string in `SQUARE_WEBHOOK_NOTIFICATION_URL`. Set `SQUARE_WEBHOOK_SIGNATURE_KEY` to Square's signature key. Missing key: the route returns 401, logs `webhook not configured`, and writes nothing. Turn off Square's own buyer receipt email, or accept that Square will email the buyer outside this gate.
7. Add the public site host to Firebase Authentication authorized domains, so password-reset links and the continue URL on `/portal` resolve there instead of a default Firebase host.
8. Publish `firestore.rules`. Gallery reads for the owning client require `downloadEnabled == true` on a delivered gallery. The webhook sets that with the Admin SDK; the rules are what let the signed-in client read it.
9. Allowlist test matrix, still with `CLIENT_NOTIFY_LIVE` unset:
   - `booking_received` and booking SMS already send. Read one and confirm it does not show a Wix admin URL.
   - Gallery delivery, invoice, payment receipt, order confirmed, and password setup to `ops+deliveryqa@iconicimagestx.com`: each arrives, and each link starts with `PUBLIC_SITE_URL`.
   - The same templates to any other client address: suppressed, and gallery delivery plus the Square receipt say so in order history.
   - `pnpm qa:square-webhook -- --fixture` against the mocked store: paid, unlocked, one allowlisted receipt, replay changes nothing.
   - A real playtest payment after the webhook key is in place: one history line, downloads open on `/gallery/:id` and the owner studio, no second receipt on a Square retry.
   - SMS reminders, gallery SMS, and campaigns: no message to a real phone.
10. Flip `CLIENT_NOTIFY_LIVE` to exactly `true` last. Do not flip `MARKETING_SEND_LIVE` in the same step.
