import { useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { BUSINESS_CONTACT } from "@shared/businessContact";
import { STUDIO105_PATHS } from "@shared/studio105";

const NAV = [
  { label: "Rooms", href: STUDIO105_PATHS.rooms },
  { label: "Rates", href: STUDIO105_PATHS.rates },
  { label: "FAQ", href: STUDIO105_PATHS.faq },
  { label: "Location", href: STUDIO105_PATHS.location },
];

function current(pathname: string, href: string): boolean {
  return pathname === href;
}

export default function Studio105Shell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <div data-testid="studio105-shell" className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-black/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1100px] items-center gap-4 px-4 py-3 sm:px-6">
          <div className="min-w-0 leading-none">
            <Link to={STUDIO105_PATHS.home}>
              <span className="block text-[11px] font-black uppercase tracking-[0.28em] text-[#2dd4bf]">The physical studio</span>
              <span className="mt-1 block text-xl font-black uppercase tracking-tight">Studio 105</span>
            </Link>
            <Link to="/" className="mt-1 inline-block text-[11px] font-semibold text-white/60">
              by <span className="text-[#2dd4bf] underline underline-offset-2">Iconic Images</span>
            </Link>
          </div>
          <nav className="ml-auto hidden items-center gap-5 lg:flex" aria-label="Studio 105">
            {NAV.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                aria-current={current(pathname, item.href) ? "page" : undefined}
                className={`text-[13px] font-semibold ${current(pathname, item.href) ? "text-white" : "text-white/65 hover:text-white"}`}
              >
                {item.label}
              </Link>
            ))}
            <Link
              to={STUDIO105_PATHS.book}
              className="rounded-full bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-black hover:bg-zinc-200"
            >
              Book a room
            </Link>
          </nav>
          <button
            type="button"
            className="ml-auto inline-flex p-2 text-white lg:hidden"
            aria-label="Studio menu"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
        {open ? (
          <nav className="flex flex-col gap-4 border-t border-white/10 px-6 py-5 lg:hidden" aria-label="Studio 105">
            {NAV.map((item) => (
              <Link key={item.href} to={item.href} className="text-lg font-bold text-white/80" onClick={() => setOpen(false)}>
                {item.label}
              </Link>
            ))}
            <Link
              to="/"
              className="text-sm font-semibold text-[#2dd4bf]"
              onClick={() => setOpen(false)}
            >
              by Iconic Images
            </Link>
            <Link
              to={STUDIO105_PATHS.book}
              className="rounded-full bg-white px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest text-black"
              onClick={() => setOpen(false)}
            >
              Book a room
            </Link>
          </nav>
        ) : null}
      </header>
      <main>{children}</main>
      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-[1100px] flex-col gap-4 px-6 py-10 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.2em]">Studio 105</p>
            <p className="mt-2 text-sm text-white/70">{BUSINESS_CONTACT.address}</p>
            <p className="mt-1 text-sm text-white/70">
              <a href={BUSINESS_CONTACT.phoneHref} className="underline underline-offset-2">{BUSINESS_CONTACT.phoneDisplay}</a>
              {" · "}
              <a href={BUSINESS_CONTACT.emailHref} className="underline underline-offset-2">{BUSINESS_CONTACT.email}</a>
            </p>
          </div>
          <Link to="/" className="text-sm font-semibold text-[#2dd4bf]">by Iconic Images</Link>
        </div>
      </footer>
    </div>
  );
}
