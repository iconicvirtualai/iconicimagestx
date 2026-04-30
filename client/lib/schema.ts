/**
 * Iconic Images — Firestore Schema
 * Complete TypeScript types for every collection.
 * Copy this file to: client/lib/schema.ts
 */

import { Timestamp } from "firebase/firestore";

// ─── Shared ──────────────────────────────────────────────────────────────────

export type UserRole = "admin" | "coordinator" | "photographer" | "editor";
export type PaymentMethod = "stripe" | "square" | "cash" | "check";

// ─── Staff ───────────────────────────────────────────────────────────────────

export interface StaffMember {
  id: string;
  firebaseUid: string;       // matches Firebase Auth UID
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: UserRole;
  isActive: boolean;
  assignedOrders: string[];  // order IDs
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Clients ─────────────────────────────────────────────────────────────────

export interface Client {
  id: string;
  firebaseUid?: string;       // set when client creates portal account
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address?: string;
  company?: string;
  totalOrders: number;
  totalSpend: number;
  lastOrderAt?: Timestamp;
  status: "active" | "inactive" | "vip";
  portalAccess: boolean;
  notes?: string;
  tags: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Order Requests (from public booking form) ────────────────────────────────

export interface OrderRequest {
  id: string;
  // Client info
  firstName: string;
  lastName: string;
  clientName: string;
  email: string;
  phone: string;
  address: string;
  // Order details
  lineItems: LineItem[];
  pricing: PricingBreakdown;
  total: number;
  vibeNote?: string;
  promoCode?: string;
  promoDiscount?: number;
  // Scheduling
  scheduledDate?: string;
  scheduledTime?: string;
  photographerPreference?: string;
  // Property details
  squareFootage?: string;
  accessMethod?: "Lockbox" | "Supra" | "Agent Meets";
  propertyStatus?: string;
  furnishingStatus?: string;
  // Status
  status: "new" | "reviewed" | "confirmed" | "declined";
  assignedTo?: string;         // staff ID who reviewed
  convertedToOrderId?: string; // set when converted
  // Meta
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export interface LineItem {
  name: string;
  price: number;
  qty: number;
  category: "service" | "addon" | "upgrade" | "vsai" | "travel" | "fee";
}

export interface PricingBreakdown {
  subtotal: number;
  promoDiscount: number;
  travelFee: number;
  tax: number;
  total: number;
}

// ─── Orders ──────────────────────────────────────────────────────────────────

export type OrderStatus =
  | "confirmed"
  | "scheduled"
  | "in_progress"
  | "shot_complete"
  | "editing"
  | "ready_for_delivery"
  | "delivered"
  | "completed"
  | "cancelled";

export interface Order {
  id: string;
  orderRequestId?: string;   // source request
  clientId: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  address: string;
  services: LineItem[];
  addOns: LineItem[];
  pricing: PricingBreakdown;
  total: number;
  depositPaid: number;
  balanceDue: number;
  status: OrderStatus;
  assignedPhotographerId?: string;
  assignedPhotographerName?: string;
  scheduledDate?: Timestamp;
  scheduledTime?: string;
  googleCalendarEventId?: string;
  squareFootage?: string;
  accessMethod?: string;
  propertyStatus?: string;
  furnishingStatus?: string;
  notes?: string;
  internalNotes?: string;
  confirmedAt?: Timestamp;
  completedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Appointments ────────────────────────────────────────────────────────────

export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show";

export interface Appointment {
  id: string;
  orderId: string;
  clientId: string;
  clientName: string;
  address: string;
  scheduledDate: Timestamp;
  scheduledTime: string;
  photographerId: string;
  photographerName: string;
  services: LineItem[];
  status: AppointmentStatus;
  googleCalendarEventId?: string;
  notes?: string;
  internalNotes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Galleries ───────────────────────────────────────────────────────────────

export type GalleryStatus =
  | "pending_upload"
  | "raw_uploaded"
  | "editing"
  | "ready_for_review"
  | "approved"
  | "delivered";

export type MediaType = "photo" | "video" | "floorplan" | "aerial" | "twilight" | "vsai";

export interface MediaItem {
  id: string;
  url: string;
  thumbnailUrl?: string;
  type: MediaType;
  fileName: string;
  storagePath: string;
  fileSize?: number;
  width?: number;
  height?: number;
  uploadedAt: Timestamp;
  uploadedBy: string;   // staffId or 'system'
  isRaw?: boolean;
  isEdited?: boolean;
}

export interface Gallery {
  id: string;
  orderId: string;
  clientId: string;
  clientName: string;
  address: string;
  title: string;
  status: GalleryStatus;
  mediaItems: MediaItem[];
  rawStoragePath?: string;     // Firebase Storage folder path for raws
  editedStoragePath?: string;  // Firebase Storage folder path for edited
  deliveryUrl?: string;
  passwordProtected?: boolean;
  galleryPassword?: string;
  downloadEnabled?: boolean;
  expiresAt?: Timestamp;
  deliveredAt?: Timestamp;
  viewCount?: number;
  downloadCount?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Invoices ────────────────────────────────────────────────────────────────

export type InvoiceStatus = "draft" | "sent" | "partial" | "paid" | "overdue" | "void";

export interface Invoice {
  id: string;
  orderId: string;
  galleryId?: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  invoiceNumber: string;      // e.g. "INV-2024-0042"
  lineItems: LineItem[];
  subtotal: number;
  tax: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  status: InvoiceStatus;
  paymentMethod?: PaymentMethod;
  stripePaymentIntentId?: string;
  stripeInvoiceId?: string;
  squarePaymentId?: string;
  paymentUrl?: string;        // link sent to client
  notes?: string;
  dueDate?: Timestamp;
  sentAt?: Timestamp;
  paidAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Transactions ────────────────────────────────────────────────────────────

export type TransactionType = "payment" | "refund" | "deposit" | "adjustment" | "fee";
export type TransactionStatus = "pending" | "completed" | "failed" | "refunded";

export interface Transaction {
  id: string;
  type: TransactionType;
  orderId?: string;
  invoiceId?: string;
  clientId: string;
  clientName: string;
  amount: number;
  paymentMethod: PaymentMethod;
  status: TransactionStatus;
  stripePaymentIntentId?: string;
  squarePaymentId?: string;
  processedAt?: Timestamp;
  processedBy?: string;        // staffId or 'system' for automated
  notes?: string;
  createdAt: Timestamp;
}

// ─── Messages ────────────────────────────────────────────────────────────────

export interface Message {
  id: string;
  orderId: string;
  senderId: string;
  senderType: "client" | "staff" | "system";
  senderName: string;
  content: string;
  attachments?: MessageAttachment[];
  isRead: boolean;
  readAt?: Timestamp;
  createdAt: Timestamp;
}

export interface MessageAttachment {
  fileName: string;
  url: string;
  fileType: string;
}

// ─── Edit Requests ───────────────────────────────────────────────────────────

export type EditRequestStatus =
  | "submitted"
  | "acknowledged"
  | "in_progress"
  | "completed"
  | "declined";

export interface EditRequest {
  id: string;
  orderId: string;
  galleryId: string;
  clientId: string;
  clientName: string;
  type: "edit" | "revision" | "correction" | "additional";
  description: string;
  affectedItems?: string[];   // mediaItem IDs
  attachments?: MessageAttachment[];
  status: EditRequestStatus;
  priority: "low" | "normal" | "high" | "urgent";
  assignedTo?: string;        // staffId
  response?: string;
  submittedAt: Timestamp;
  completedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Packages ────────────────────────────────────────────────────────────────

export interface Package {
  id: string;
  name: string;
  tier: "basic" | "standard" | "premium" | "campaign" | "addon";
  price: number;
  description: string;
  includedServices: string[];
  maxSqft?: number;
  minSqft?: number;
  turnaroundDays?: number;
  isActive: boolean;
  isFeatured?: boolean;
  sortOrder: number;
  category: "photography" | "video" | "virtual_staging" | "marketing" | "addon";
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Email Templates ─────────────────────────────────────────────────────────

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
  variables: string[];         // e.g. ['{{clientName}}', '{{galleryUrl}}']
  category:
    | "booking_confirmation"
    | "order_confirmed"
    | "gallery_delivery"
    | "invoice"
    | "edit_request"
    | "marketing"
    | "general";
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Campaigns ───────────────────────────────────────────────────────────────

export type CampaignType = "email" | "sms" | "both";
export type CampaignStatus = "draft" | "scheduled" | "sending" | "sent" | "cancelled";
export type AudienceType = "all" | "active_clients" | "past_clients" | "vip" | "custom";

export interface Campaign {
  id: string;
  name: string;
  type: CampaignType;
  status: CampaignStatus;
  subject?: string;           // email subject
  body: string;
  audience: AudienceType;
  audienceIds?: string[];      // clientIds if custom
  estimatedRecipients?: number;
  scheduledAt?: Timestamp;
  sentAt?: Timestamp;
  stats: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    unsubscribed: number;
  };
  createdBy: string;           // staffId
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── AI Agent Logs ───────────────────────────────────────────────────────────

export type AgentName = "nora" | "lena" | "remmi" | "grant" | "travis" | "brady";
export type AgentActionStatus = "completed" | "flagged" | "escalated" | "pending_review";

export interface AgentLog {
  id: string;
  agent: AgentName;
  action: string;
  summary: string;
  status: AgentActionStatus;
  details?: string;
  relatedId?: string;
  relatedType?: "order" | "client" | "invoice" | "gallery" | "campaign" | "system";
  priority: "low" | "normal" | "high" | "urgent";
  requiresHumanReview: boolean;
  reviewedAt?: Timestamp;
  reviewedBy?: string;
  resolvedNotes?: string;
  createdAt: Timestamp;
}

// ─── Virtual Staging Jobs ─────────────────────────────────────────────────────

export type VSAIJobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export interface VSAIJob {
  id: string;
  userId: string;
  orderId?: string;
  imageUrl: string;
  roomType: string;
  style: string;
  vsaiRenderId?: string;
  status: VSAIJobStatus;
  resultUrl?: string;
  resultUrls?: string[];
  error?: string;
  isPaid: boolean;
  stripePaymentIntentId?: string;
  credits?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Promo Codes ─────────────────────────────────────────────────────────────

export interface PromoCode {
  id: string;
  code: string;
  discountType: "fixed" | "percent";
  discountAmount: number;
  minOrderAmount?: number;
  maxUses?: number;
  currentUses: number;
  isActive: boolean;
  expiresAt?: Timestamp;
  createdAt: Timestamp;
}
