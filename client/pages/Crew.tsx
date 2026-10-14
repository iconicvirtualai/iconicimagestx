import { useState } from "react";
import { Link } from "react-router-dom";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { CREW, CREW_JOIN_HREF, type CrewMember } from "@/content/crew";
import { useSiteHref, useSiteText } from "@/content/siteContent";
import { cn } from "@/lib/utils";

const BIO_PREVIEW = 180;

function preview(bio: string) {
  const cut = bio.slice(0, BIO_PREVIEW);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 120 ? cut.slice(0, lastSpace) : cut).trimEnd();
}

function CrewCard({ person }: { person: CrewMember }) {
  const [open, setOpen] = useState(false);
  const long = person.bio.length > BIO_PREVIEW;
  const bio = long && !open ? `${preview(person.bio)}…` : person.bio;

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-sm" data-testid={`crew-${person.id}`}>
      <img
        src={person.photo}
        alt={`${person.name}, ${person.roles[0]}`}
        width={800}
        height={800}
        className="aspect-square w-full object-cover"
      />
      <div className="flex flex-1 flex-col px-5 py-6">
        <h2 className="text-2xl font-bold tracking-tight text-black">{person.name}</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-[#0d9488]">{person.roles.join(" · ")}</p>
        {person.bio ? (
          <div className="mt-4">
            <p className="text-sm leading-relaxed text-neutral-600">{bio}</p>
            {long ? (
              <button
                type="button"
                className="mt-3 text-[11px] font-bold uppercase tracking-widest text-black underline underline-offset-4 hover:text-[#0d9488]"
                aria-expanded={open}
                onClick={() => setOpen((value) => !value)}
              >
                {open ? "Show less" : "Read more"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export default function Crew() {
  const kicker = useSiteText("crew", "hero", "kicker", "Our Crew");
  const title = useSiteText("crew", "hero", "title", "Iconic Crew");
  const body = useSiteText(
    "crew",
    "hero",
    "body",
    "We Pride Ourselves In The Talent & Training Of Our People",
  );
  const joinLabel = useSiteText("crew", "join", "label", "Join our crew");
  const joinHref = useSiteHref("crew", "join", "label", CREW_JOIN_HREF);

  return (
    <Layout>
      <div className="bg-[#fafafa] text-black">
        <section className="bg-black text-white">
          <div className="container mx-auto px-4 pb-16 pt-36 text-center md:pb-20 md:pt-44">
            <p
              data-site-page="crew"
              data-site-block="hero"
              data-site-field="kicker"
              data-site-kind="text"
              className="mb-4 text-xs font-bold uppercase tracking-[0.3em] text-[#0d9488]"
            >
              {kicker}
            </p>
            <h1
              data-site-page="crew"
              data-site-block="hero"
              data-site-field="title"
              data-site-kind="text"
              className="text-4xl font-bold tracking-tight md:text-6xl"
            >
              {title}
            </h1>
            <p
              data-site-page="crew"
              data-site-block="hero"
              data-site-field="body"
              data-site-kind="text"
              className="mx-auto mt-5 max-w-2xl text-lg font-medium leading-relaxed text-neutral-300 md:text-xl"
            >
              {body}
            </p>
          </div>
        </section>

        <section className="container mx-auto px-4 py-14 md:py-20">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
            {CREW.map((person) => (
              <CrewCard key={person.id} person={person} />
            ))}
          </div>
        </section>

        <section className="border-t border-neutral-200 bg-white">
          <div className="container mx-auto flex flex-col items-center gap-6 px-4 py-16 text-center md:py-20">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Join our crew</h2>
            <p className="max-w-xl text-base leading-relaxed text-neutral-600">
              Train with Iconic Images through the apprenticeship program.
            </p>
            <Link to={joinHref}>
              <Button
                data-site-page="crew"
                data-site-block="join"
                data-site-field="label"
                data-site-kind="text"
                data-testid="join-crew"
                className={cn("h-11 rounded-xl bg-black px-8 text-[11px] font-black uppercase tracking-widest text-white hover:bg-neutral-800")}
              >
                {joinLabel}
              </Button>
            </Link>
          </div>
        </section>
      </div>
    </Layout>
  );
}
