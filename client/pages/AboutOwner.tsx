import { Link } from "react-router-dom";
import Layout from "@/components/Layout";
import { CADI_PHOTO, OWNER_STORY } from "@/content/aboutTeam";

export default function AboutOwner() {
  return (
    <Layout>
      <article className="bg-white text-black">
        <div className="container mx-auto max-w-3xl px-4 pb-20 pt-36 md:pb-28 md:pt-40">
          <Link
            to="/about"
            className="text-xs font-bold uppercase tracking-[0.22em] text-[#0d9488] underline-offset-4 hover:underline"
          >
            Meet the team
          </Link>
          <div className="mt-8 flex flex-col items-center text-center">
            <img
              src={CADI_PHOTO}
              alt="Cadi Torres"
              width={288}
              height={288}
              className="h-56 w-56 rounded-full object-cover object-top shadow-[0_16px_40px_rgba(0,0,0,0.16)] ring-4 ring-[#f6f7f7] md:h-72 md:w-72"
            />
            <p className="mt-8 text-xs font-bold uppercase tracking-[0.28em] text-[#0d9488]">
              Owner
            </p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight md:text-6xl">
              Cadi Torres
            </h1>
            <p className="mt-4 text-lg text-gray-600">
              Founded Iconic in 2016.
            </p>
          </div>
          <div className="mx-auto mt-10 max-w-2xl space-y-5 text-lg leading-relaxed text-gray-600">
            {OWNER_STORY.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </div>
      </article>
    </Layout>
  );
}
