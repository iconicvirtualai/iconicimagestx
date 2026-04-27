import { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  LayoutDashboard,
  Home,
  CalendarDays,
  ShoppingBag,
  Users,
  UserCircle,
  Palette,
  DollarSign,
  Mail,
  MessageSquare,
  LogOut,
  Camera,
  ImagePlay,
  Bot,
  Settings,
  CreditCard,
  Upload,
} from "lucide-reacth";

interface AdminLayoutProps {
  children: ReactNode;
  title?: string;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  roles: string[]; // which roles see this item
}

const ALL_STAFF = ["admin", "coordinator", "photographer", "editor"];
const ADMIN_ONLY = ["admin"];
const COORD_UP = ["admin", "coordinator"];
const PHOTO_UP = ["admin", "coordinator", "photographer"];
const EDITOR_UP = ["admin", "coordinator", "editor"];

const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "Operations",
    items: [
      { label: "Dashboard",       href: "/admin/dashboard",        icon: LayoutDashboard, roles: COORD_UP },
      { label: "Orders",          href: "/admin/orders",        icon: ShoppingBag,     roles: COORD_UP },
      { label: "Schedule",        href: "/admin/schedule",        icon: CalendarDays,    roles: COORD_UP },
      { label: "Projects",        href: "/admin/listings",         icon: Home,            roles: COORD_UP },
      { label: "Clients",         href: "/admin/customers",        icon: Users,           roles: COORD_UP },
      { label: "Messages",        href: "/admin/messages",         icon: MessageSquare,   roles: COORD_UP },
    ],
  },
  {
    label: "Photography",
    items: [
      { label: "My Jobs",         href: "/admin/photographer",     icon: Camera,          roles: PHOTO_UP },
      { label: "Upload Photos",   href: "/admin/upload",           icon: Upload,          roles: PHOTO_UP },
      { label: "Photo Queue",     href: "/admin/editor",           icon: ImagePlay,       roles: EDITOR_UP },
    ],
  },
  {
    label: "Settings",
    items: [
      { label: "Team",            href: "/admin/team",             icon: UserCircle,      roles: ADMIN_ONLY },
      { label: "Pricing",         href: "/admin/current-pricing",  icon: DollarSign,      roles: ADMIN_ONLY },
      { label: "Email Templates", href: "/admin/email-templates",  icon: Mail,            roles: ADMIN_ONLY },
      { label: "Site Editor",     href: "/admin/edit-site",        icon: Palette,         roles: ADMIN_ONLY },
      { label: "Revenue", href: "/admin/revenue", icon: DollarSign, roles: ADMIN_ONLY },

      { label: "Billing", href: "/admin/billing", icon: CreditCard, roles: ADMIN_ONLY },
      { label: "Client Billing", href: "/admin/client-billing", icon: CreditCard, roles: ADMIN_ONLY },
    ],
  },
  {
    label: "AICON",
    items: [
      { label: "AI Agents",       href: "/admin/aicon",            icon: Bot,             roles: COORD_UP },
      { label: "Automation",      href: "/admin/automation",       icon: Settings,        roles: ADMIN_ONLY },
    ],
  },
];

const ROLE_BADGE: Record<string, { label: string; color: string }> = {
  admin:        { label: "Owner",        color: "bg-teal-500/20 text-teal-400" },
  coordinator:  { label: "Coordinator",  color: "bg-blue-500/20 text-blue-400" },
  photographer: { label: "Photographer", color: "bg-purple-500/20 text-purple-400" },
  editor:       { label: "Editor",       color: "bg-orange-500/20 text-orange-400" },
};

export default function AdminLayout({ children, title }: AdminLayoutProps) {
  const { user, staffProfile, loading, isStaff, signOutUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#f8fafc]">
        <div className="text-center">
          <div className="w-12 h-12 rounded-lg bg-[#0d9488] mx-auto mb-4 animate-pulse" />
          <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isStaff) {
    navigate("/admin/login");
    return null;
  }

  const role = staffProfile?.role || "";
  const badge = ROLE_BADGE[role] ?? { label: role, color: "bg-gray-500/20 text-gray-400" };

  const handleLogout = async () => {
    await signOutUser();
    navigate("/admin/login");
  };

  const isActive = (href: string) =>
    location.pathname === href || location.pathname.startsWith(href + "/");

  // Filter nav items by current user's role
  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.roles.includes(role)),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="flex h-screen bg-[#f8fafc]">
      {/* Sidebar */}
      <aside className="w-60 bg-[#0a0a0a] border-r border-gray-800 flex flex-col fixed left-0 top-0 h-screen overflow-y-auto">

        {/* Logo */}
        <div className="p-5 border-b border-gray-800">
          <Link to="/admin/dashboard" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#0d9488] flex items-center justify-center flex-shrink-0">
              <span className="font-black text-white text-base">I</span>
            </div>
            <div>
              <span className="font-black text-white text-xs uppercase tracking-widest block">Iconic</span>
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Ops Portal</span>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-5 space-y-5 overflow-y-auto">
          {visibleGroups.map((group) => (
            <div key={group.label}>
              <p className="text-[9px] font-black text-gray-600 uppercase tracking-[0.15em] px-3 mb-2">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.label}
                      to={item.href}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${
                        active
                          ? "bg-[#0d9488]/10 text-[#0d9488] border-l-2 border-[#0d9488] pl-[10px]"
                          : "text-gray-400 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User section */}
        <div className="border-t border-gray-800 p-4 space-y-3">
          <div className="px-3 py-3 bg-[#111] rounded-lg">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest">
                {staffProfile?.firstName
                  ? `${staffProfile.firstName} ${staffProfile.lastName}`
                  : user?.email}
              </p>
              <span className={`text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full ${badge.color}`}>
                {badge.label}
              </span>
            </div>
            <p className="text-[10px] text-gray-500 break-all">{user?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 rounded-lg font-bold text-[10px] uppercase tracking-widest transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-60 flex-1 overflow-y-auto">
        <div className="min-h-full">
          {title && (
            <div className="border-b border-slate-200 bg-white sticky top-0 z-10">
              <div className="container mx-auto px-8 py-5 max-w-7xl flex items-center justify-between">
                <h1 className="text-xl font-black text-black uppercase tracking-tight">
                  {title}
                </h1>
                <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${badge.color}`}>
                  {badge.label}
                </span>
              </div>
            </div>
          )}
          <div className="container mx-auto px-8 py-8 max-w-7xl">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
