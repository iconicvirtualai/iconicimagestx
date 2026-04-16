import { ReactNode, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  Home,
  Calendar,
  ShoppingBag,
  Users,
  UserCircle,
  Palette,
  DollarSign,
  Mail,
  LogOut,
  ChevronDown,
} from "lucide-react";

interface AdminLayoutProps {
  children: ReactNode;
  title?: string;
}

export default function AdminLayout({ children, title }: AdminLayoutProps) {
  const { user, isStaff, loading, signOutUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Auth guard: redirect non-staff to login
  useEffect(() => {
    if (!loading && !isStaff) {
      navigate("/admin/login");
    }
  }, [isStaff, loading, navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#f8fafc]">
        <div className="text-center">
          <div className="w-12 h-12 rounded-lg bg-[#0d9488] mx-auto mb-4 animate-pulse"></div>
          <p className="text-sm font-bold text-gray-600 uppercase tracking-widest">Loading...</p>
        </div>
      </div>
    );
  }

  const handleLogout = async () => {
    await signOutUser();
    navigate("/admin/login");
  };

  const navItems = [
    {
      label: "Listings",
      href: "/admin/listings",
      icon: Home,
    },
    {
      label: "Schedule",
      href: "/admin/dashboard",
      icon: Calendar,
    },
    {
      label: "Orders",
      href: "/admin/dashboard",
      icon: ShoppingBag,
    },
    {
      label: "Clients",
      href: "/admin/customers",
      icon: Users,
    },
    {
      label: "Team",
      href: "/admin/dashboard",
      icon: UserCircle,
    },
    {
      label: "Site Editor",
      href: "/admin/edit-site",
      icon: Palette,
    },
    {
      label: "Pricing",
      href: "/admin/current-pricing",
      icon: DollarSign,
    },
    {
      label: "Email Templates",
      href: "/admin/email-templates",
      icon: Mail,
    },
  ];

  const isActive = (href: string) => {
    return location.pathname === href || location.pathname.startsWith(href + "/");
  };

  return (
    <div className="flex h-screen bg-[#f8fafc]">
      {/* Sidebar */}
      <aside className="w-60 bg-[#0a0a0a] border-r border-gray-800 flex flex-col fixed left-0 top-0 h-screen overflow-y-auto">
        {/* Logo */}
        <div className="p-6 border-b border-gray-800">
          <Link to="/admin/listings" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#0d9488] flex items-center justify-center flex-shrink-0">
              <span className="font-black text-white text-lg">I</span>
            </div>
            <span className="font-black text-white text-sm uppercase tracking-widest">Iconic</span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-8 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                to={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold uppercase tracking-widest transition-all border-l-4 ${
                  active
                    ? "border-[#0d9488] text-[#0d9488] bg-[#0d9488]/5"
                    : "border-transparent text-gray-400 hover:text-white"
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Bottom User Section */}
        <div className="border-t border-gray-800 p-4 space-y-4">
          <div className="px-4 py-3 bg-[#111] rounded-lg">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
              Logged in as
            </p>
            <p className="text-xs font-bold text-white break-all">{user?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 rounded-lg font-bold text-xs uppercase tracking-widest transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-60 flex-1 overflow-y-auto">
        <div className="min-h-full">
          {title && (
            <div className="border-b border-slate-200 bg-white">
              <div className="container mx-auto px-8 py-6 max-w-7xl">
                <h1 className="text-2xl font-black text-black uppercase tracking-tight">
                  {title}
                </h1>
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
