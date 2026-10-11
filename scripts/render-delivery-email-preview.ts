/**
 * Local preview of the delivery email.
 * Uses the existing gallery_delivery template and substitutes the listing-site
 * URL into galleryUrl. Does not edit server/services/email.ts and does not send mail.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { builtinEmailHtml } from "../server/services/email";
import { deliveryEmailPreviewVars } from "../shared/clientPresentation";

const env = { PUBLIC_SITE_URL: "https://iconicimagestx.vercel.app" };
const vars = deliveryEmailPreviewVars(env);
const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Delivery email preview — Jordan Sample</title>
</head>
<body style="margin:0;background:#eceae6;">
  <p style="font-family:Inter,Arial,sans-serif;font-size:13px;color:#555;text-align:center;padding:18px 16px 0;">
    Local preview only. Primary button uses the listing site. Bean will retitle it and add /gallery as “Your downloads &amp; invoice”.
  </p>
  ${builtinEmailHtml("gallery_delivery", vars)}
</body>
</html>
`;

const out = process.argv[2] || "artifacts/delivery-email-preview.html";
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(out);
