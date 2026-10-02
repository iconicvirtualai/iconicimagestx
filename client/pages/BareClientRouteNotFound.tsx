import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import Layout from "@/components/Layout";
import {
  BARE_CLIENT_ROUTE_LINKS,
  BARE_CLIENT_ROUTE_TITLE,
  bareClientRouteKind,
  bareClientRouteMessage,
} from "@shared/bareClientRoute";

function linkClass(href: string): string {
  const base =
    "inline-flex items-center justify-center rounded-full px-6 py-3 text-[11px] font-black uppercase tracking-widest transition-colors";
  if (href === "/") return `${base} bg-white text-black hover:bg-gray-200`;
  if (href === "/login") return `${base} bg-teal-400 text-black hover:bg-teal-300`;
  return `${base} border border-white/25 text-white hover:bg-white/10`;
}

export default function BareClientRouteNotFound() {
  const { pathname } = useLocation();
  const kind = bareClientRouteKind(pathname) ?? "studio";

  useEffect(() => {
    document.title = `${BARE_CLIENT_ROUTE_TITLE} | Iconic Images`;
  }, []);

  return (
    <Layout>
      <section className="px-6 pb-24 pt-36">
        <div className="mx-auto max-w-[760px] text-center">
          <p className="mb-4 text-[11px] font-black uppercase tracking-[0.45em] text-teal-400">404</p>
          <h1 className="text-5xl font-black uppercase tracking-tighter text-white md:text-7xl">
            {BARE_CLIENT_ROUTE_TITLE}
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-gray-300">
            {bareClientRouteMessage(kind)}
          </p>
          <nav className="mt-10 flex flex-wrap items-center justify-center gap-3" aria-label="Helpful pages">
            {BARE_CLIENT_ROUTE_LINKS.map((link) => (
              <Link key={link.href} to={link.href} className={linkClass(link.href)}>
                {link.label}
              </Link>
            ))}
          </nav>
          {kind === "studio" && (
            <p className="mt-8 text-sm text-gray-400">
              Looking for the physical studio?{" "}
              <Link to="/studio-105" className="font-bold text-white underline underline-offset-4">
                Studio 105
              </Link>
            </p>
          )}
        </div>
      </section>
    </Layout>
  );
}
