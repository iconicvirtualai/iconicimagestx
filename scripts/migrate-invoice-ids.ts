/**
 * Invoice id and pay-token migration plan.
 *
 *   pnpm migrate:invoice-ids
 *   pnpm migrate:invoice-ids -- --fixture
 *   pnpm migrate:invoice-ids -- --live
 *
 * The default and --fixture print a plan for a built-in fixture.
 * They do not contact Firebase, send email, or call Square.
 *
 * --live is a read-only dry run of the connected Firestore project.
 * The lead runs that after deploy. This file does not write invoices.
 *
 * --write is refused. A future write needs --i-understand, and this
 * build still writes nothing even when that flag is present.
 */

import { pathToFileURL } from "node:url";
import { clientInvoiceUrl } from "../shared/invoicePayLink.ts";
import { createPayToken, isLegacyOpenAutoId } from "../shared/invoicePay.ts";

const RENAME_PREFIXES = ["listing_", "ordreq_", "playtest-invoice-"] as const;
const SQUARE_FIELDS = ["squareOrderId", "squarePaymentLinkId", "squareInvoiceId", "squarePaymentId"] as const;
const LINK_COLLECTIONS = ["listings", "orders", "orderRequests", "galleries"] as const;

export interface MigrationInvoice {
  id: string;
  data: Record<string, unknown>;
}

export interface MigrationLink {
  collection: (typeof LINK_COLLECTIONS)[number] | string;
  id: string;
  invoiceId: string;
}

export interface MigrationInput {
  invoices: MigrationInvoice[];
  links: MigrationLink[];
}

export interface IdAllocator {
  id: (oldId: string, index: number) => string;
  token: (oldId: string, index: number) => string;
}

export interface MigrationAction {
  action: "rename" | "add-token" | "unchanged";
  fromId: string;
  toId: string;
  payToken: string;
  paymentUrl: string;
  squareFields: string[];
  links: MigrationLink[];
  tombstone: boolean;
  note: string;
}

export function needsInvoiceRename(id: string): boolean {
  return RENAME_PREFIXES.some((prefix) => id.startsWith(prefix));
}

export function storedPayToken(data: Record<string, unknown>): string {
  return typeof data.payToken === "string" ? data.payToken.trim() : "";
}

export function planInvoiceIdMigration(input: MigrationInput, allocate: IdAllocator): MigrationAction[] {
  const actions: MigrationAction[] = [];
  let renameIndex = 0;
  let tokenIndex = 0;
  for (const invoice of input.invoices) {
    const rename = needsInvoiceRename(invoice.id);
    const existing = storedPayToken(invoice.data);
    if (!rename && existing) {
      actions.push({
        action: "unchanged",
        fromId: invoice.id,
        toId: invoice.id,
        payToken: existing,
        paymentUrl: payPath(invoice.id, existing, invoice.data.status),
        squareFields: presentSquareFields(invoice.data),
        links: linksFor(input.links, invoice.id),
        tombstone: false,
        note: "Already an unguessable id with a payToken. Leave it.",
      });
      continue;
    }
    const payToken = existing || allocate.token(invoice.id, tokenIndex);
    if (!existing) tokenIndex += 1;
    if (rename) {
      const toId = allocate.id(invoice.id, renameIndex);
      renameIndex += 1;
      actions.push({
        action: "rename",
        fromId: invoice.id,
        toId,
        payToken,
        paymentUrl: payPath(toId, payToken, invoice.data.status),
        squareFields: presentSquareFields(invoice.data),
        links: linksFor(input.links, invoice.id),
        tombstone: true,
        note: "Copy fields to a new auto-id, retarget paymentUrl, repoint invoiceId links, copy Square ids onto the new doc, and keep the old doc as a tombstone.",
      });
      continue;
    }
    const legacyOpen = isLegacyOpenAutoId(invoice.id);
    actions.push({
      action: "add-token",
      fromId: invoice.id,
      toId: invoice.id,
      payToken,
      paymentUrl: payPath(invoice.id, payToken, invoice.data.status),
      squareFields: presentSquareFields(invoice.data),
      links: linksFor(input.links, invoice.id),
      tombstone: false,
      note: legacyOpen
        ? "Add payToken in place. Do not rename. After a future write, public pay links need ?t=. Links already emailed without the token will 404. Resend those pay links before or with the write."
        : "Add payToken in place. Do not rename. This id is not a legacy open auto-id, so the public page already requires a token or a signed-in owner or staff.",
    });
  }
  return actions;
}

export function fixtureAllocator(): IdAllocator {
  return {
    id: (_oldId, index) => `Mig${String(index + 1).padStart(17, "0")}`,
    token: (_oldId, index) => Buffer.alloc(32, index + 1).toString("base64url"),
  };
}

export function fixtureMigrationInput(): MigrationInput {
  return {
    invoices: [
      {
        id: "listing_studio1",
        data: {
          clientName: "Ada Agent",
          clientEmail: "ada@example.com",
          clientPhone: "512-555-0100",
          clientId: "client-ada",
          orderId: "order-1",
          galleryId: "gal-1",
          listingId: "studio1",
          notes: "lockbox 1234",
          lineItems: [{ name: "Photos", price: 250 }],
          total: 250,
          amountDue: 250,
          status: "sent",
          squareOrderId: "sq-order-1",
          squarePaymentLinkId: "sq-link-1",
        },
      },
      {
        id: "ordreq_req1",
        data: {
          clientName: "Bea Client",
          clientEmail: "bea@example.com",
          orderRequestId: "req1",
          status: "sent",
          total: 100,
          amountDue: 100,
        },
      },
      {
        id: "playtest-invoice-client1",
        data: {
          clientName: "Playtest Client",
          clientEmail: "play@example.com",
          clientId: "client1",
          listingId: "playtest-job-1",
          status: "sent",
          total: 150,
        },
      },
      {
        id: "AbCdEfGhIjKlMnOpQrSt",
        data: {
          clientName: "Legacy Booking",
          clientEmail: "legacy@example.com",
          status: "sent",
          total: 400,
          amountDue: 400,
        },
      },
      {
        id: "ZzYyXxWwVvUuTtSsRrQq",
        data: {
          clientName: "Already Token",
          payToken: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE",
          status: "paid",
          total: 80,
        },
      },
      {
        id: "playtest-delivery-qa-invoice",
        data: {
          clientName: "TEST - Delivery QA",
          clientEmail: "ops+deliveryqa@iconicimagestx.com",
          status: "sent",
          total: 1,
          amountDue: 1,
        },
      },
    ],
    links: [
      { collection: "listings", id: "studio1", invoiceId: "listing_studio1" },
      { collection: "galleries", id: "gal-1", invoiceId: "listing_studio1" },
      { collection: "orders", id: "order-1", invoiceId: "listing_studio1" },
      { collection: "orderRequests", id: "req1", invoiceId: "ordreq_req1" },
      { collection: "listings", id: "playtest-job-1", invoiceId: "playtest-invoice-client1" },
      { collection: "galleries", id: "playtest-delivery-qa-gallery", invoiceId: "playtest-delivery-qa-invoice" },
    ],
  };
}

export function formatInvoiceMigrationPlan(actions: MigrationAction[], source: string): string {
  const lines = [
    "INVOICE ID MIGRATION — DRY RUN",
    "Nothing was written. No email was sent. Square was not called.",
    `Source: ${source}`,
    "",
    "Recommendation: keep each old derived id as a tombstone with redirectInvoiceId.",
    "Copy squareOrderId, squarePaymentLinkId, squareInvoiceId, and squarePaymentId onto the new doc.",
    "The webhook still matches invoiceId: notes, reference_id, the Square order id, and the payment link id, then follows the tombstone.",
    "Do not delete the old doc. Do not call the Square API to rewrite notes.",
    "",
  ];
  for (const action of actions) {
    lines.push(`${action.action} ${action.fromId}${action.toId === action.fromId ? "" : ` -> ${action.toId}`}`);
    lines.push(`  payToken: ${action.payToken}`);
    lines.push(`  paymentUrl: ${action.paymentUrl}`);
    lines.push(`  square fields to copy: ${action.squareFields.length ? action.squareFields.join(", ") : "(none)"}`);
    if (action.links.length === 0) lines.push("  invoiceId links: (none stored)");
    for (const link of action.links) lines.push(`  repoint ${link.collection}/${link.id}.invoiceId`);
    lines.push(`  tombstone: ${action.tombstone ? `keep ${action.fromId} with redirectInvoiceId ${action.toId}; strip email, phone, address, notes, and line items` : "no"}`);
    lines.push(`  ${action.note}`);
    lines.push("");
  }
  lines.push(`Planned ${actions.length} invoice${actions.length === 1 ? "" : "s"}.`);
  lines.push("Write mode is not implemented. The lead reviews this plan, then runs a later write.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function payPath(id: string, token: string, status: unknown): string {
  return clientInvoiceUrl({ id, payToken: token, status }) || "";
}

function presentSquareFields(data: Record<string, unknown>): string[] {
  return SQUARE_FIELDS.filter((field) => {
    const value = data[field];
    return typeof value === "string" && value.trim().length > 0;
  });
}

function linksFor(links: MigrationLink[], invoiceId: string): MigrationLink[] {
  return links.filter((link) => link.invoiceId === invoiceId);
}

function parseArgs(argv: string[]) {
  const args = argv.filter((arg) => arg !== "--");
  return {
    write: args.includes("--write"),
    understand: args.includes("--i-understand"),
    fixture: args.includes("--fixture"),
    live: args.includes("--live"),
    unknown: args.filter((arg) => arg.startsWith("-") && !["--write", "--i-understand", "--fixture", "--live"].includes(arg)),
  };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.unknown.length > 0) {
    console.error(`Unknown argument: ${parsed.unknown.join(" ")}. Flags: --fixture, --live, --write, --i-understand.`);
    process.exit(2);
  }
  if (parsed.write && !parsed.understand) {
    console.error("Refusing --write without --i-understand. Nothing was written.");
    process.exit(1);
  }
  if (parsed.write) {
    console.error("Refusing --write. Dry run is the only implemented mode. The lead runs any future write after review. Nothing was written.");
    process.exit(1);
  }
  if (parsed.live && parsed.fixture) {
    console.error("Pass either --live or --fixture, not both. Nothing was written.");
    process.exit(2);
  }
  if (parsed.live) {
    await liveDryRun();
    return;
  }
  const actions = planInvoiceIdMigration(fixtureMigrationInput(), fixtureAllocator());
  process.stdout.write(formatInvoiceMigrationPlan(actions, "built-in fixture. Firestore was not read."));
}

async function liveDryRun() {
  const admin = await loadAdmin();
  const projectId = await credentialProjectId();
  const resolved = projectId || admin.app().options.projectId || "(unknown project)";
  console.log(`LIVE DRY RUN. Firebase project: ${resolved}`);
  console.log("Reading invoices and invoiceId links. No document will be written.");
  const db = admin.firestore();
  const snap = await db.collection("invoices").get();
  const invoices: MigrationInvoice[] = snap.docs.map((doc) => ({
    id: doc.id,
    data: (doc.data() || {}) as Record<string, unknown>,
  }));
  const links: MigrationLink[] = [];
  const candidates = invoices.filter((invoice) => needsInvoiceRename(invoice.id) || !storedPayToken(invoice.data));
  for (const invoice of candidates) {
    for (const collection of LINK_COLLECTIONS) {
      const found = await db.collection(collection).where("invoiceId", "==", invoice.id).limit(20).get();
      for (const doc of found.docs) {
        links.push({ collection, id: doc.id, invoiceId: invoice.id });
      }
    }
  }
  const actions = planInvoiceIdMigration({ invoices, links }, {
    id: () => db.collection("invoices").doc().id,
    token: () => createPayToken(),
  });
  process.stdout.write(formatInvoiceMigrationPlan(actions, `read-only Firestore project ${resolved}`));
}

async function loadAdmin() {
  const admin = (await import("firebase-admin")).default;
  if (admin.apps.length) return admin;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
  } else {
    throw new Error("Set FIREBASE_SERVICE_ACCOUNT or GOOGLE_APPLICATION_CREDENTIALS before a live dry run. Nothing was written.");
  }
  return admin;
}

async function credentialProjectId(): Promise<string | null> {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) as { project_id?: unknown };
      return typeof parsed.project_id === "string" ? parsed.project_id : null;
    }
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const { readFile } = await import("node:fs/promises");
      const parsed = JSON.parse(await readFile(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8")) as { project_id?: unknown };
      return typeof parsed.project_id === "string" ? parsed.project_id : null;
    }
  } catch {
    return null;
  }
  return null;
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (entry === import.meta.url) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
