# Invoice id migration

`pnpm migrate:invoice-ids` prints a dry-run plan. It does not write Firestore, send email, or call Square.

The lead runs this. Do not run it against production from an unreviewed change.

```bash
pnpm migrate:invoice-ids
pnpm migrate:invoice-ids -- --fixture
pnpm migrate:invoice-ids -- --live
```

- Default and `--fixture` use a built-in fixture. They do not contact Firebase.
- `--live` is a read-only pass over the connected project. It needs `FIREBASE_SERVICE_ACCOUNT` or `GOOGLE_APPLICATION_CREDENTIALS`. The lead runs this after deploy, reviews the plan, and only then considers a write.
- `--write` is refused. `--write --i-understand` is also refused. This build does not mutate invoices. A later change, run by the lead, would perform the write.

The plan renames `listing_`, `ordreq_`, and `playtest-invoice-` ids to Firestore auto-ids, adds a `payToken` where one is missing, repoints `invoiceId` on listings, orders, order requests, and galleries, copies Square ids onto the new document, and keeps the old document as a tombstone with `redirectInvoiceId`. It does not delete the old document and it does not call the Square API.

Adding a `payToken` to a legacy 20-character auto-id makes the public pay link require `?t=`. Resend those pay links with the write. Do not write until that resend is ready.
