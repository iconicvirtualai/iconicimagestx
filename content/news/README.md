# News issues

One folder here is one public page. Nothing else has to be registered.

```
content/news/<slug>/
  meta.json
  email.html
```

`meta.json`:

```json
{
  "title": "HOLYYY SMOKES",
  "slug": "holysmokes",
  "category": "newsletter",
  "date": "2026-11-23",
  "summary": "Opening line from the email.",
  "heroImage": "/marketing/email/holy-smokes-2026/hero.jpg"
}
```

- `category` is `newsletter` or `promo`.
- `slug` matches the folder name: lowercase letters, numbers, and hyphens. `promos` is reserved.
- `date` is `YYYY-MM-DD`. The index sorts newest first.
- `heroImage` is a root path or an absolute URL. Open Graph uses it.
- `email.html` is the send-ready message (600px, inline CSS). Image URLs in that file stay absolute: `https://www.iconicimagestx.com/marketing/email/...`. Host the images under `public/marketing/email/<issue>/` before the send.

## Routes

| Category | URL |
|---|---|
| newsletter | `/news/<slug>` |
| promo | `/news/promos/<slug>` |

The first issue is `/news/holysmokes`. A future January promo would be a folder `content/news/jan2027/` with `"category": "promo"`, and the page would be `/news/promos/jan2027`.

The index is `/news`, with All / Newsletters / Promos filters. These folders are the source of truth. A page exists when the folder is on the deployed site.

The web page shows the email in an iframe so its CSS stays inside the message. Animated GIFs, including `05-podcast-vote.gif`, play in that frame. On a preview host, that render loads `/marketing/email/...` from the preview so new images are not requested from production before they ship. The file itself keeps absolute `https://www.iconicimagestx.com/marketing/email/...` image URLs.

## Admin Campaigns

Sending a campaign does not publish a page and this folder is not written by the send route. After a campaign has actually been sent, build the two files with `newsFilesFromCampaign` from `shared/news.ts` and commit them.

```ts
import fs from "node:fs";
import { newsFilesFromCampaign } from "../shared/news.ts";

const files = newsFilesFromCampaign({
  id: campaign.id,
  name: campaign.name,
  status: campaign.status, // must be "sent"
  subject: campaign.subject,
  preheader: campaign.preheader,
  html: campaign.html,
  sentAt: campaign.sentAt, // YYYY-MM-DD is taken from this
  newsSlug: "jan2027",
  newsCategory: "promo", // or "newsletter"
  newsSummary: campaign.preheader,
  newsHero: "/marketing/email/jan2027/hero.jpg",
});

if (files) {
  fs.mkdirSync(files.directory, { recursive: true });
  fs.writeFileSync(`${files.directory}/meta.json`, files.metaJson);
  fs.writeFileSync(`${files.directory}/email.html`, files.emailHtml);
}
```

`newsFilesFromCampaign` only returns file contents. It does not send email.

Campaign HTML also lives on the `marketingCampaigns` Firestore documents (`html`, `subject`, `preheader`, `sentAt`, `status`). The public index can add a sent campaign that is not already a folder when that document has:

- `status: "sent"`
- `newsSlug` (the public slug)
- `newsCategory`: `newsletter` or `promo`
- `newsHero`
- `newsSummary` (optional; `preheader` is used when it is empty)

If a folder with that slug exists, the folder wins and the Firestore copy is not listed. Leave `newsSlug` off a campaign that should stay in the admin tool only.
