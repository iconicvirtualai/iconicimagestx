import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";

const LINKS = [
  { href: "/admin/communications/email", label: "Overview" },
  { href: "/admin/communications/email/contacts", label: "Contacts" },
  { href: "/admin/communications/email/import", label: "Import" },
  { href: "/admin/communications/email/segments", label: "Segments" },
  { href: "/admin/communications/email/campaigns", label: "Campaigns" },
  { href: "/admin/communications/email/suppression", label: "Do not email" },
  { href: "/admin/communications/email/account", label: "GMass" },
];

export default function MarketingFrame({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const { pathname } = useLocation();
  return (
    <AdminLayout title={title}>
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#0d9488]">Communications · Email</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-gray-900">{title}</h1>
            {subtitle ? <p className="mt-1 max-w-2xl text-sm text-gray-500">{subtitle}</p> : null}
          </div>
          {action}
        </div>
        <nav className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-gray-200 bg-white p-1 shadow-sm">
          {LINKS.map((link) => {
            const active = link.href === "/admin/communications/email"
              ? pathname === link.href
              : pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                to={link.href}
                className={`whitespace-nowrap rounded-xl px-3 py-2 text-[11px] font-black uppercase tracking-widest ${
                  active ? "bg-[#0d9488] text-white" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        {children}
      </div>
    </AdminLayout>
  );
}

export const cardCls = "rounded-2xl border border-gray-100 bg-white shadow-sm";
export const labelCls = "mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-400";
export const inputCls = "w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-[#0d9488]/30";
export const buttonCls = "inline-flex items-center justify-center gap-2 rounded-xl bg-[#0d9488] px-4 py-2.5 text-[11px] font-black uppercase tracking-widest text-white hover:bg-[#0f766e] disabled:opacity-50";
export const ghostCls = "inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-[11px] font-black uppercase tracking-widest text-gray-600 hover:bg-gray-50";
