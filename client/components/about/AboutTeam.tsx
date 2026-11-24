import { ABOUT_OWNER, ABOUT_TEAM } from "@/content/aboutTeam";

const portraitClass =
  "rounded-full object-cover object-center shadow-[0_16px_40px_rgba(0,0,0,0.14)] ring-4 ring-white";

export default function AboutTeam() {
  return (
    <>
      <section
        className="bg-[#f6f7f7] py-16 md:py-24"
        aria-labelledby="about-owner-heading"
      >
        <div className="container mx-auto max-w-5xl px-4">
          <div className="flex flex-col items-center gap-8 text-center md:flex-row md:items-center md:gap-14 md:text-left">
            <img
              src={ABOUT_OWNER.photo}
              alt=""
              width={256}
              height={256}
              className={`h-48 w-48 shrink-0 md:h-60 md:w-60 ${portraitClass}`}
            />
            <div className="max-w-xl">
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#0d9488]">
                {ABOUT_OWNER.kicker}
              </p>
              <h2
                id="about-owner-heading"
                className="mt-3 text-4xl font-bold tracking-tight text-black md:text-5xl"
              >
                {ABOUT_OWNER.name}
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-gray-600">
                {ABOUT_OWNER.blurb}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section
        className="bg-white py-16 md:py-24"
        aria-labelledby="about-team-heading"
      >
        <div className="container mx-auto max-w-6xl px-4">
          <div className="mx-auto mb-10 max-w-2xl text-center md:mb-14">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#0d9488]">
              The crew
            </p>
            <h2
              id="about-team-heading"
              className="mt-3 text-4xl font-bold tracking-tight text-black md:text-5xl"
            >
              Meet the team
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              The people behind the lens.
            </p>
          </div>
          <ul className="flex flex-wrap items-stretch justify-center gap-4 sm:gap-6">
            {ABOUT_TEAM.map((person) => (
              <li
                key={person.id}
                data-testid="about-team-card"
                className="flex w-full items-center gap-4 rounded-[1.75rem] bg-[#f6f7f7] px-4 py-4 text-left sm:w-[calc(50%-0.75rem)] sm:flex-col sm:items-center sm:px-6 sm:py-8 sm:text-center lg:w-[calc(33.333%-1rem)] xl:w-[calc(25%-1.125rem)]"
              >
                <img
                  src={person.photo}
                  alt=""
                  width={160}
                  height={160}
                  className={`h-24 w-24 shrink-0 sm:h-36 sm:w-36 ${portraitClass}`}
                />
                <div className="min-w-0">
                  <h3 className="text-xl font-bold tracking-tight text-black">
                    {person.name}
                  </h3>
                  <p
                    data-role={
                      person.roleIsPlaceholder ? "placeholder" : "published"
                    }
                    className="mt-1 text-sm font-semibold leading-snug text-[#0d9488]"
                  >
                    {person.role}
                  </p>
                  <p
                    data-bio={
                      person.bioIsPlaceholder ? "placeholder" : "published"
                    }
                    className="mt-2 text-balance text-sm leading-relaxed text-gray-600"
                  >
                    {person.blurb}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
