import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";

const LINKS = [
  { href: "/admin/campaigns", label: "List" },
  { href: "/admin/campaigns/calendar", label: "Calendar" },
];

export default function CampaignFrame({
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
      <div className="min-h-full bg-[#f5f2ea]">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#0d9488]">Campaigns</p>
              <h1 className="mt-1 font-black tracking-tight text-gray-900 text-2xl">{title}</h1>
              {subtitle ? <p className="mt-1 max-w-2xl text-sm text-gray-600">{subtitle}</p> : null}
            </div>
            {action}
          </div>
          <nav className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-[#e8c872]/60 bg-white p-1 shadow-sm">
            {LINKS.map((link) => {
              const active = link.href === "/admin/campaigns" ? pathname === link.href : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  to={link.href}
                  className={`whitespace-nowrap rounded-xl px-3 py-2 text-[11px] font-extrabold uppercase tracking-widest ${
                    active ? "bg-[#0d9488] text-white" : "text-gray-500 hover:bg-[#f5f2ea]"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          {children}
        </div>
      </div>
    </AdminLayout>
  );
}

export const cardCls = "rounded-2xl border border-[#e8c872]/50 bg-white shadow-sm";
export const labelCls = "mb-1 block text-[10px] font-extrabold uppercase tracking-widest text-gray-400";
export const inputCls = "w-full rounded-xl border border-gray-200 bg-[#f5f2ea] px-3 py-2.5 text-sm font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-[#0d9488]/30";
export const buttonCls = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0d9488] px-4 py-2.5 text-[11px] font-extrabold uppercase tracking-widest text-white hover:bg-[#0f766e] disabled:opacity-50";
export const ghostCls = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-[11px] font-extrabold uppercase tracking-widest text-gray-600 hover:bg-[#f5f2ea]";
