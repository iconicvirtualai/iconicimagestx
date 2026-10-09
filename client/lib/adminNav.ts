import type { ElementType } from "react";
import {
  Bot,
  CalendarDays,
  Camera,
  CreditCard,
  DollarSign,
  Home,
  Images,
  LayoutDashboard,
  Mail,
  MessageSquare,
  Package,
  Palette,
  Settings,
  ShoppingBag,
  Upload,
  UserCircle,
  Users,
} from "lucide-react";

/** Longest matching nav href wins, so a nested page highlights its own item when one exists. */
export function mostSpecificNavHref(pathname: string, hrefs: readonly string[]): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    if (pathname === href || pathname.startsWith(`${href}/`)) {
      if (!best || href.length > best.length) best = href;
    }
  }
  return best;
}

export interface AdminNavItem {
  label: string;
  href: string;
  icon: ElementType;
  roles: string[];
}

const ALL_STAFF = ["admin", "coordinator", "photographer", "editor"];
const ADMIN_ONLY = ["admin"];
const COORD_UP = ["admin", "coordinator"];
const PHOTO_UP = ["admin", "coordinator", "photographer"];

/**
 * One Studio entry. Iconic Studio and Scratch Pad are subsections of that home,
 * not separate top-level links. Delivery, photographer, booking, and invoices stay.
 */
export const navGroups: { label: string; items: AdminNavItem[] }[] = [
  {
    label: "Operations",
    items: [
      { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard, roles: COORD_UP },
      { label: "Studio", href: "/admin/studio", icon: Camera, roles: ALL_STAFF },
      { label: "Orders", href: "/admin/orders", icon: ShoppingBag, roles: COORD_UP },
      { label: "Booking catalog", href: "/admin/booking-catalog", icon: Package, roles: COORD_UP },
      { label: "Schedule", href: "/admin/schedule", icon: CalendarDays, roles: COORD_UP },
      { label: "Projects", href: "/admin/listings", icon: Home, roles: COORD_UP },
      { label: "Clients", href: "/admin/customers", icon: Users, roles: COORD_UP },
      { label: "Communications", href: "/admin/communications", icon: MessageSquare, roles: COORD_UP },
      { label: "Email", href: "/admin/communications/email", icon: Mail, roles: ADMIN_ONLY },
    ],
  },
  {
    label: "Photography",
    items: [
      { label: "Delivery", href: "/admin/delivery", icon: Images, roles: ALL_STAFF },
      { label: "Photographer", href: "/admin/photographer", icon: Camera, roles: PHOTO_UP },
      { label: "Upload", href: "/admin/upload", icon: Upload, roles: PHOTO_UP },
    ],
  },
  {
    label: "Settings",
    items: [
      { label: "Team", href: "/admin/team", icon: UserCircle, roles: ADMIN_ONLY },
      { label: "Pricing", href: "/admin/current-pricing", icon: DollarSign, roles: ADMIN_ONLY },
      { label: "Email Templates", href: "/admin/email-templates", icon: Mail, roles: ADMIN_ONLY },
      { label: "Site Editor", href: "/admin/edit-site", icon: Palette, roles: ADMIN_ONLY },
      { label: "Revenue", href: "/admin/revenue", icon: DollarSign, roles: ADMIN_ONLY },
      { label: "Billing", href: "/admin/billing", icon: CreditCard, roles: ADMIN_ONLY },
      { label: "Client Billing", href: "/admin/client-billing", icon: CreditCard, roles: ADMIN_ONLY },
      { label: "Invoice Presets", href: "/admin/invoice-presets", icon: DollarSign, roles: COORD_UP },
    ],
  },
  {
    label: "AICON",
    items: [
      { label: "AI Agents", href: "/admin/aicon", icon: Bot, roles: COORD_UP },
      { label: "Automation", href: "/admin/automation", icon: Settings, roles: ADMIN_ONLY },
    ],
  },
];
