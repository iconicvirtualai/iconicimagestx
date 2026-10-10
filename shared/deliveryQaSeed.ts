/**
 * Idempotent Firestore plan for one client delivery QA case.
 * Building the plan does not contact Firebase, send email, or upload media.
 * scripts/seed-delivery-qa.ts prints it on a dry run and writes it only with --write.
 */

import { PLAYTEST_ADDRESS } from "./listingAccess.ts";
import {
  ICONIC_DOWNLOAD_LOCK,
  clientGalleryDownloadsUnlocked,
  invoiceAllowsDownload,
  publicMediaItem,
  type GalleryDownloadGate,
} from "./paymentAccess.ts";

export const DELIVERY_QA_DEFAULT_ORIGIN = "https://iconicimagestx.com";
export const DELIVERY_QA_CLIENT_NAME = "TEST - Delivery QA";
export const DELIVERY_QA_CLIENT_EMAIL = "ops+deliveryqa@iconicimagestx.com";
/** Fixed marker so a second run does not churn media timestamps. */
export const DELIVERY_QA_MARKED_AT = "2026-10-10T00:00:00.000Z";
/** Matterport's public Showcase sample. Not an Iconic client space. */
export const DELIVERY_QA_MATTERPORT_URL = "https://my.matterport.com/show/?m=SxQL3iGyoDo";

export const DELIVERY_QA_IDS = {
  client: "playtest-delivery-qa-client",
  order: "playtest-delivery-qa-order",
  listing: "playtest-delivery-qa-listing",
  gallery: "playtest-delivery-qa-gallery",
  invoice: "playtest-delivery-qa-invoice",
} as const;

export const DELIVERY_QA_ROLES = [
  "mls-photo",
  "full-res-photo",
  "branded-mp4",
  "unbranded-mp4",
  "vertical-reel",
  "matterport",
  "floorplan-png",
  "floorplan-pdf",
  "aerial",
  "other",
] as const;

export type DeliveryQaRole = (typeof DELIVERY_QA_ROLES)[number];
export type DeliveryQaCoverage = "sample" | "stand-in" | "placeholder" | "public-demo";

export interface DeliveryQaMedia {
  id: string;
  role: DeliveryQaRole;
  type: string;
  title: string;
  fileName: string;
  name: string;
  url: string;
  shareUrl: string;
  embedUrl: string | null;
  contentType: string;
  width: number | null;
  height: number | null;
  downloadable: boolean;
  coverage: DeliveryQaCoverage;
  /** True when the repo has no file of this deliverable and the bytes below are a generated stand-in. */
  placeholder: boolean;
  sourcePath: string | null;
  note: string;
  playtest: true;
  uploadedBy: "playtest-delivery-qa-seed";
  uploadedAt: string;
}

export interface DeliveryQaDocument {
  collection: "clients" | "orders" | "listings" | "galleries" | "invoices";
  id: string;
  path: string;
  data: Record<string, unknown>;
}

export interface DeliveryQaPlan {
  origin: string;
  clientName: string;
  clientEmail: string;
  address: string;
  media: DeliveryQaMedia[];
  documents: DeliveryQaDocument[];
  gate: GalleryDownloadGate;
  emailsSent: 0;
}

const LINE = {
  name: "TEST - Delivery QA",
  price: 1,
  qty: 1,
  category: "service" as const,
};

export function parseDeliveryQaArgs(argv: string[]): { write: boolean; unknown: string[] } {
  const args = argv.filter((arg) => arg !== "--");
  return {
    write: args.includes("--write"),
    unknown: args.filter((arg) => arg.startsWith("-") && arg !== "--write"),
  };
}

export function deliveryQaClientPath(): string {
  return `clients/${DELIVERY_QA_IDS.client}`;
}

/**
 * Refuse the write when a stable id already belongs to a real record,
 * or when another client document already owns the QA email.
 */
export function deliveryQaRefusals(input: {
  documents: Array<{ path: string; exists: boolean; playtest: unknown }>;
  emailMatches: Array<{ path: string; playtest: unknown }>;
}): string[] {
  const reasons: string[] = [];
  const clientPath = deliveryQaClientPath();
  for (const doc of input.documents) {
    if (doc.exists && doc.playtest !== true) {
      reasons.push(`${doc.path} already exists and is not marked playtest.`);
    }
  }
  for (const match of input.emailMatches) {
    if (match.path === clientPath) continue;
    reasons.push(`${match.path} already uses ${DELIVERY_QA_CLIENT_EMAIL}.`);
  }
  return reasons;
}

export function buildDeliveryQaSeed(options?: { origin?: string }): DeliveryQaPlan {
  const origin = cleanOrigin(options?.origin);
  const media = deliveryQaMedia(origin);
  const ids = DELIVERY_QA_IDS;
  const byRole = new Map(media.map((item) => [item.role, item]));
  const listingFiles = (...roles: DeliveryQaRole[]) => roles.map((role) => listingFile(byRole.get(role)!));

  const invoiceData = {
    playtest: true,
    invoiceNumber: "TEST-DELIVERY-QA",
    clientId: ids.client,
    clientName: DELIVERY_QA_CLIENT_NAME,
    clientEmail: DELIVERY_QA_CLIENT_EMAIL,
    orderId: ids.order,
    galleryId: ids.gallery,
    listingId: ids.listing,
    address: PLAYTEST_ADDRESS,
    lineItems: [LINE],
    subtotal: 1,
    tax: 0,
    total: 1,
    amountPaid: 0,
    amountDue: 1,
    status: "sent",
    paymentUrl: `${origin}/invoice/${ids.invoice}`,
    notes: "TEST ORDER. Unpaid $1.00 playtest invoice. The delivery QA seed does not email this.",
  };

  const gate: GalleryDownloadGate = {
    invoice: invoiceData,
    downloadEnabled: false,
    downloadsReleased: false,
    lockDownloads: true,
    requirePayment: true,
  };

  const documents: DeliveryQaDocument[] = [
    {
      collection: "clients",
      id: ids.client,
      path: `clients/${ids.client}`,
      data: {
        playtest: true,
        clientName: DELIVERY_QA_CLIENT_NAME,
        firstName: DELIVERY_QA_CLIENT_NAME,
        lastName: "",
        email: DELIVERY_QA_CLIENT_EMAIL,
        phone: "",
        company: DELIVERY_QA_CLIENT_NAME,
        status: "active",
        portalAccess: true,
        totalOrders: 1,
        totalSpend: 0,
        tags: ["playtest", "test", "delivery-qa"],
        group: "playtest",
        notes: "TEST ORDER. Playtest client for delivery QA. Not a real client and not revenue.",
      },
    },
    {
      collection: "orders",
      id: ids.order,
      path: `orders/${ids.order}`,
      data: {
        playtest: true,
        clientId: ids.client,
        clientName: DELIVERY_QA_CLIENT_NAME,
        clientEmail: DELIVERY_QA_CLIENT_EMAIL,
        clientPhone: "",
        address: PLAYTEST_ADDRESS,
        addressLabel: PLAYTEST_ADDRESS,
        listingId: ids.listing,
        galleryId: ids.gallery,
        invoiceId: ids.invoice,
        services: [LINE],
        lineItems: [LINE],
        addOns: [],
        pricing: { subtotal: 1, promoDiscount: 0, travelFee: 0, tax: 0, total: 1 },
        subtotal: 1,
        tax: 0,
        total: 1,
        depositPaid: 0,
        balanceDue: 1,
        status: "delivered",
        notes: "TEST ORDER. Delivery QA seed. Do not bill.",
        internalNotes: "TEST ORDER. Playtest. Gallery downloads stay locked until the $1.00 invoice is paid. The seed does not send email.",
      },
    },
    {
      collection: "listings",
      id: ids.listing,
      path: `listings/${ids.listing}`,
      data: {
        playtest: true,
        propertyAddress: PLAYTEST_ADDRESS,
        address: PLAYTEST_ADDRESS,
        shootLocation: PLAYTEST_ADDRESS,
        clientId: ids.client,
        clientName: DELIVERY_QA_CLIENT_NAME,
        clientEmail: DELIVERY_QA_CLIENT_EMAIL,
        orderId: ids.order,
        galleryId: ids.gallery,
        playtestGalleryId: ids.gallery,
        invoiceId: ids.invoice,
        status: "delivered",
        services: ["TEST - Delivery QA"],
        notes: "TEST ORDER. Playtest delivery QA project. Safe to ignore in scheduling and revenue.",
        lockDownloads: true,
        downloadsReleased: false,
        requirePayment: true,
        downloadEnabled: false,
        images: listingFiles("mls-photo", "full-res-photo", "aerial"),
        videos: listingFiles("branded-mp4", "unbranded-mp4", "vertical-reel"),
        tours: listingFiles("matterport"),
        floorplans: listingFiles("floorplan-png", "floorplan-pdf"),
        files: listingFiles("other"),
      },
    },
    {
      collection: "galleries",
      id: ids.gallery,
      path: `galleries/${ids.gallery}`,
      data: {
        playtest: true,
        listingId: ids.listing,
        orderId: ids.order,
        invoiceId: ids.invoice,
        title: DELIVERY_QA_CLIENT_NAME,
        address: PLAYTEST_ADDRESS,
        clientId: ids.client,
        clientName: DELIVERY_QA_CLIENT_NAME,
        clientEmail: DELIVERY_QA_CLIENT_EMAIL,
        status: "delivered",
        downloadEnabled: false,
        downloadsReleased: false,
        lockDownloads: true,
        mediaItems: media,
        videoLinks: [],
        tourLinks: [],
        deliveryUrl: `${origin}/gallery/${ids.gallery}`,
      },
    },
    {
      collection: "invoices",
      id: ids.invoice,
      path: `invoices/${ids.invoice}`,
      data: invoiceData,
    },
  ];

  return {
    origin,
    clientName: DELIVERY_QA_CLIENT_NAME,
    clientEmail: DELIVERY_QA_CLIENT_EMAIL,
    address: PLAYTEST_ADDRESS,
    media,
    documents,
    gate,
    emailsSent: 0,
  };
}

export function deliveryQaPublicPreview(plan: DeliveryQaPlan) {
  const unlocked = clientGalleryDownloadsUnlocked(plan.gate);
  return {
    downloadEnabled: unlocked,
    paymentRequired: !unlocked,
    invoiceAllowsDownload: invoiceAllowsDownload(plan.gate.invoice),
    lockTitle: unlocked ? null : ICONIC_DOWNLOAD_LOCK.title,
    lockMessage: unlocked ? null : ICONIC_DOWNLOAD_LOCK.message,
    mediaItems: plan.media.map((item) => publicMediaItem(item as unknown as Record<string, unknown>, unlocked)),
  };
}

export function formatDeliveryQaDryRun(plan: DeliveryQaPlan): string {
  const preview = deliveryQaPublicPreview(plan);
  const lines: string[] = [
    "DELIVERY QA SEED — DRY RUN",
    "No Firestore writes. No Storage uploads. No Firebase Auth user.",
    "No email, SMS, Square invoice, or Stripe charge.",
    `emailsSent: ${plan.emailsSent}`,
    "",
    "Client email is ops+deliveryqa@iconicimagestx.com.",
    "An earlier quinn.siteqa+ address was not used because those messages bounce.",
    "",
    `Origin for stored links: ${plan.origin}`,
    `Address: ${plan.address}`,
    "",
    "Documents this would create or update (stable ids, merge, arrays replaced):",
  ];

  for (const doc of plan.documents) {
    lines.push(`- ${doc.path}`);
  }

  lines.push(
    "",
    "On write, createdAt is kept when the document already exists.",
    "updatedAt is set to the server time.",
    "Running --write again restores the unpaid $1.00 invoice and re-locks downloads.",
    "It does not append a second copy of any media item.",
    "",
    "Client",
    `  name: ${plan.clientName}`,
    `  email: ${plan.clientEmail}`,
    "  playtest: true",
    "  totalSpend: 0",
    "",
    "Order",
    `  orders/${DELIVERY_QA_IDS.order}`,
    "  status: delivered",
    "  total: $1.00",
    "  balanceDue: $1.00",
    "  notes include TEST ORDER",
    "",
    "Project (listing) and gallery",
    `  listings/${DELIVERY_QA_IDS.listing}`,
    `  galleries/${DELIVERY_QA_IDS.gallery}`,
    "  gallery status: delivered",
    "  downloadEnabled: false",
    "  downloadsReleased: false",
    "  lockDownloads: true",
    "  requirePayment: true",
    "",
    "Invoice",
    `  invoices/${DELIVERY_QA_IDS.invoice}`,
    "  invoiceNumber: TEST-DELIVERY-QA",
    "  status: sent",
    "  total: $1.00",
    "  amountPaid: $0.00",
    "  amountDue: $1.00",
    "  square/stripe ids: none",
    "  sentAt: omitted (no email was sent)",
    "",
    "Download lock (same gate as the public gallery after PR #60):",
    `  invoiceAllowsDownload: ${preview.invoiceAllowsDownload}`,
    `  downloadEnabled: ${preview.downloadEnabled}`,
    `  paymentRequired: ${preview.paymentRequired}`,
    `  lockTitle: ${preview.lockTitle}`,
    `  lockMessage: ${preview.lockMessage}`,
    "",
    "Media (one stable item per deliverable):",
  );

  plan.media.forEach((item, index) => {
    const locked = preview.mediaItems[index] as { url?: unknown; shareUrl?: unknown; embedUrl?: unknown };
    lines.push(
      `${index + 1}. ${item.role}`,
      `   id: ${item.id}`,
      `   type: ${item.type}`,
      `   title: ${item.title}`,
      `   coverage: ${item.coverage}`,
      `   placeholder: ${item.placeholder}`,
      `   contentType: ${item.contentType}`,
      `   size: ${item.width && item.height ? `${item.width}x${item.height}` : "n/a"}`,
      `   source: ${item.sourcePath || item.url}`,
      `   url: ${item.url}`,
      `   locked public url: ${String(locked.url)}`,
      `   locked public shareUrl: ${String(locked.shareUrl)}`,
      `   locked public embedUrl: ${String(locked.embedUrl)}`,
      `   note: ${item.note}`,
    );
  });

  lines.push(
    "",
    "Not created:",
    "- Firebase Auth user (creating one can send Firebase mail)",
    "- appointment, order request, calendar event",
    "- Square invoice, payment, or webhook",
    "- email or SMS of any kind",
    "",
    "Revenue, AR, and Owners Suite:",
    "- Every document is named TEST - Delivery QA, notes include TEST ORDER, and playtest is true.",
    "- playtest is the existing flag (staff playtest bootstrap and playtest galleries).",
    "- Admin Revenue and the operations paidRevenue total do not skip playtest or TEST invoices.",
    "- There is no Owners Suite filter in this repo. The admin role is labeled Owner; that screen does not exclude playtest.",
    "- If this is written to production, the unpaid $1.00 still counts on projected, earned, and invoiced revenue, and on the operations revenue tile. Collected stays unchanged because amountPaid is 0. No due date is set, so it is not overdue.",
    "",
    "Needed before --write against production:",
    "- FIREBASE_SERVICE_ACCOUNT (service account JSON) or GOOGLE_APPLICATION_CREDENTIALS.",
    "- Same credential the booking catalog seed uses. This repo's upload errors name Firebase project iconic-images-aicon.",
    "- The script prints that credential's project id and then writes. It does not take a separate project id flag.",
    "- APP_URL is optional. It only changes the absolute links stored for the gallery, the invoice, and sample media. Default: https://iconicimagestx.com.",
    "- Square, SMTP, Stripe, and Twilio are not read.",
    "- The three placeholder files under public/media/playtest/ have to be deployed with the site before those URLs resolve. The other samples are already in public/.",
    "- Command: pnpm seed:delivery-qa -- --write",
    "",
    "Document bodies (createdAt and updatedAt are added only on write):",
    JSON.stringify(plan.documents, null, 2),
  );

  return `${lines.join("\n")}\n`;
}

function cleanOrigin(value: string | undefined): string {
  const trimmed = String(value || "").trim().replace(/\/$/, "");
  return trimmed || DELIVERY_QA_DEFAULT_ORIGIN;
}

function abs(origin: string, publicPath: string): string {
  return `${origin}${publicPath}`;
}

function deliveryQaMedia(origin: string): DeliveryQaMedia[] {
  const specs: Array<Omit<DeliveryQaMedia, "id" | "playtest" | "uploadedBy" | "uploadedAt" | "shareUrl" | "embedUrl"> & { embed?: boolean }> = [
    {
      role: "mls-photo",
      type: "photo",
      title: "TEST - Delivery QA MLS-size photo",
      fileName: "TEST-delivery-qa-mls-photo.jpg",
      name: "TEST-delivery-qa-mls-photo.jpg",
      url: abs(origin, "/media/photos/listing-living-01.jpg"),
      contentType: "image/jpeg",
      width: 1600,
      height: 1066,
      downloadable: true,
      coverage: "stand-in",
      placeholder: false,
      sourcePath: "public/media/photos/listing-living-01.jpg",
      note: "No MLS export is stored in the repo. This is an existing 1600x1066 sample still, labeled as the MLS-size role.",
    },
    {
      role: "full-res-photo",
      type: "photo",
      title: "TEST - Delivery QA full-res photo",
      fileName: "TEST-delivery-qa-full-res-photo.jpg",
      name: "TEST-delivery-qa-full-res-photo.jpg",
      url: abs(origin, "/media/photos/luxury-exterior.jpg"),
      contentType: "image/jpeg",
      width: 1920,
      height: 1280,
      downloadable: true,
      coverage: "stand-in",
      placeholder: false,
      sourcePath: "public/media/photos/luxury-exterior.jpg",
      note: "No camera-original full-res file is in the repo. This is the existing 1920x1280 sample used by the seeded presentation, labeled as the full-res role.",
    },
    {
      role: "branded-mp4",
      type: "video",
      title: "TEST - Delivery QA branded MP4",
      fileName: "TEST-delivery-qa-branded.mp4",
      name: "TEST-delivery-qa-branded.mp4",
      url: abs(origin, "/media/blaze/01_BUILT_v2.mp4"),
      contentType: "video/mp4",
      width: null,
      height: null,
      downloadable: false,
      coverage: "stand-in",
      placeholder: false,
      sourcePath: "public/media/blaze/01_BUILT_v2.mp4",
      note: "No branded listing master is in the repo. This existing Iconic brand film is labeled as the branded MP4 role. It is not client property video.",
    },
    {
      role: "unbranded-mp4",
      type: "video",
      title: "TEST - Delivery QA unbranded MP4",
      fileName: "TEST-delivery-qa-unbranded.mp4",
      name: "TEST-delivery-qa-unbranded.mp4",
      url: abs(origin, "/media/video/product-photography.mp4"),
      contentType: "video/mp4",
      width: null,
      height: null,
      downloadable: false,
      coverage: "stand-in",
      placeholder: false,
      sourcePath: "public/media/video/product-photography.mp4",
      note: "No unbranded listing master is in the repo. This existing product clip is labeled as the unbranded MP4 role. It is not client property video.",
    },
    {
      role: "vertical-reel",
      type: "reel",
      title: "TEST - Delivery QA vertical snap reel",
      fileName: "TEST-delivery-qa-snap-reel.mp4",
      name: "TEST-delivery-qa-snap-reel.mp4",
      url: abs(origin, "/media/videos/snap-reels/snap-reel-01.mp4"),
      contentType: "video/mp4",
      width: null,
      height: null,
      downloadable: false,
      coverage: "sample",
      placeholder: false,
      sourcePath: "public/media/videos/snap-reels/snap-reel-01.mp4",
      note: "Existing snap reel sample. The site already describes Essential Snap Reels as 9:16 vertical.",
    },
    {
      role: "matterport",
      type: "matterport",
      title: "TEST - Delivery QA Matterport public demo",
      fileName: "TEST-delivery-qa-matterport",
      name: "TEST-delivery-qa-matterport",
      url: DELIVERY_QA_MATTERPORT_URL,
      contentType: "text/html",
      width: null,
      height: null,
      downloadable: false,
      coverage: "public-demo",
      placeholder: false,
      sourcePath: null,
      embed: true,
      note: "Matterport's public Showcase sample model SxQL3iGyoDo. Not an Iconic client model and not a file in this repo.",
    },
    {
      role: "floorplan-png",
      type: "floorplan",
      title: "TEST - Delivery QA floor plan PNG",
      fileName: "TEST-delivery-qa-floorplan.png",
      name: "TEST-delivery-qa-floorplan.png",
      url: abs(origin, "/media/playtest/TEST-delivery-qa-floorplan.png"),
      contentType: "image/png",
      width: 1,
      height: 1,
      downloadable: true,
      coverage: "placeholder",
      placeholder: true,
      sourcePath: "public/media/playtest/TEST-delivery-qa-floorplan.png",
      note: "No PNG floor plan sample is in the repo. public/media/launch/floorplan_sample_cropped.jpg is a JPEG, so it was not used. This 1x1 PNG is a test placeholder.",
    },
    {
      role: "floorplan-pdf",
      type: "floorplan",
      title: "TEST - Delivery QA floor plan PDF",
      fileName: "TEST-delivery-qa-floorplan.pdf",
      name: "TEST-delivery-qa-floorplan.pdf",
      url: abs(origin, "/media/playtest/TEST-delivery-qa-floorplan.pdf"),
      contentType: "application/pdf",
      width: null,
      height: null,
      downloadable: true,
      coverage: "placeholder",
      placeholder: true,
      sourcePath: "public/media/playtest/TEST-delivery-qa-floorplan.pdf",
      note: "No PDF floor plan sample is in the repo. This one-page placeholder says TEST - Delivery QA. The portal floor plan tab only lists JPEG and PNG, so this PDF stays on the gallery and the listing record and does not appear as a portal floor plan.",
    },
    {
      role: "aerial",
      type: "aerial",
      title: "TEST - Delivery QA aerial",
      fileName: "TEST-delivery-qa-aerial.jpg",
      name: "TEST-delivery-qa-aerial.jpg",
      url: abs(origin, "/media/photos/drone-hero.jpg"),
      contentType: "image/jpeg",
      width: 1920,
      height: 1280,
      downloadable: true,
      coverage: "sample",
      placeholder: false,
      sourcePath: "public/media/photos/drone-hero.jpg",
      note: "Existing aerial sample already used by the seeded presentation (drone-hero.jpg).",
    },
    {
      role: "other",
      type: "file",
      title: "TEST - Delivery QA other zip",
      fileName: "TEST-delivery-qa-other.zip",
      name: "TEST-delivery-qa-other.zip",
      url: abs(origin, "/media/playtest/TEST-delivery-qa-other.zip"),
      contentType: "application/zip",
      width: null,
      height: null,
      downloadable: true,
      coverage: "placeholder",
      placeholder: true,
      sourcePath: "public/media/playtest/TEST-delivery-qa-other.zip",
      note: "No sample zip or extra PDF is in the repo. This stored zip contains TEST-delivery-qa.txt and is the other-file role.",
    },
  ];

  return specs.map((spec) => {
    const { embed, ...rest } = spec;
    return {
      ...rest,
      id: `playtest-delivery-qa-${spec.role}`,
      shareUrl: spec.url,
      embedUrl: embed ? spec.url : null,
      playtest: true,
      uploadedBy: "playtest-delivery-qa-seed",
      uploadedAt: DELIVERY_QA_MARKED_AT,
    };
  });
}

function listingFile(item: DeliveryQaMedia) {
  return {
    id: item.id,
    name: item.name,
    fileName: item.fileName,
    title: item.title,
    type: item.type,
    url: item.url,
    shareUrl: item.shareUrl,
    embedUrl: item.embedUrl,
    contentType: item.contentType,
    width: item.width,
    height: item.height,
    downloadable: item.downloadable,
    playtest: true,
    sourcePath: item.sourcePath,
  };
}
