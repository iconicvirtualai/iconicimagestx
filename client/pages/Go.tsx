import { useEffect } from "react";
import { Link } from "react-router-dom";
import { LegalLinks } from "@/components/LegalLinks";
import { goPromo, hasGoPromoCta } from "@/lib/goPromo";

const ctaClassName =
  "inline-flex min-h-12 w-full items-center justify-center rounded-full bg-white px-8 py-4 text-base font-bold tracking-tight text-black shadow-lg transition-colors hover:bg-neutral-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white sm:w-auto";

function isExternalHref(href: string): boolean {
  return /^(https?:|mailto:|tel:)/i.test(href.trim());
}

function PromoCta({ href, label }: { href: string; label: string }) {
  const trimmed = href.trim();
  if (isExternalHref(trimmed)) {
    return (
      <a href={trimmed} className={ctaClassName}>
        {label}
      </a>
    );
  }

  return (
    <Link to={trimmed} className={ctaClassName}>
      {label}
    </Link>
  );
}

export default function Go() {
  useEffect(() => {
    const previous = document.title;
    document.title = `${goPromo.title} · Iconic Studio`;
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="flex min-h-dvh flex-col bg-black text-white">
      <header className="px-6 pt-6">
        <Link
          to="/"
          className="inline-flex items-baseline gap-2 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
        >
          <span className="text-sm font-black uppercase tracking-[0.22em]">
            Iconic
          </span>
          <span className="text-sm font-black uppercase tracking-[0.22em] text-teal-300">
            Studio
          </span>
        </Link>
      </header>

      <main className="flex flex-1 items-center px-6 py-12">
        <div className="mx-auto w-full max-w-lg text-center">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-teal-300">
            {goPromo.eyebrow}
          </p>
          <h1 className="mt-4 text-4xl font-black leading-[1.05] tracking-tight text-white sm:text-5xl">
            {goPromo.title}
          </h1>
          <p className="mx-auto mt-5 max-w-md text-lg leading-relaxed text-white">
            {goPromo.description}
          </p>
          {hasGoPromoCta() ? (
            <div className="mt-8">
              <PromoCta href={goPromo.ctaHref} label={goPromo.ctaLabel} />
            </div>
          ) : null}
        </div>
      </main>

      <footer className="px-6 pb-8 text-center">
        <LegalLinks
          className="mb-4 justify-center"
          linkClassName="text-sm font-semibold text-white underline decoration-white/40 underline-offset-4 hover:decoration-white"
        />
        <a
          href="https://iconicimagestx.com"
          className="text-sm font-semibold text-white underline decoration-white/40 underline-offset-4 hover:decoration-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
        >
          iconicimagestx.com
        </a>
      </footer>
    </div>
  );
}
