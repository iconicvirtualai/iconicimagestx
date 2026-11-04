import { useState, type FormEvent } from "react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { useSiteText } from "@/content/siteContent";

const DEFAULT_BODY = "Photographers and real estate media companies can sign up to work on Iconic's platform. Tell us about your studio. We will be in touch. This note stays with our team, and we do not email you a copy.";

export default function Partners() {
  const kicker = useSiteText("partners", "hero", "kicker", "Coming soon");
  const title = useSiteText("partners", "hero", "title", "Work with Iconic");
  const body = useSiteText("partners", "hero", "body", DEFAULT_BODY);
  const success = useSiteText("partners", "hero", "success", "You're on the list. We'll be in touch.");
  const submitLabel = useSiteText("partners", "hero", "submit", "Send my interest");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!name.trim() || !email.trim()) {
      setError("Add your name and email so we know who to call.");
      return;
    }
    setBusy(true);
    try {
      const message = [
        "Partner interest",
        company.trim() ? `Studio: ${company.trim()}` : "",
        note.trim(),
      ].filter(Boolean).join("\n");
      const response = await fetch("/api/contact/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          ...(phone.trim() ? { phone: phone.trim() } : {}),
          message,
        }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setError(data.error || "We couldn't save that. Please try again.");
        return;
      }
      setDone(true);
    } catch {
      setError("We couldn't save that. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout>
      <main className="bg-white">
        <section className="mx-auto max-w-3xl px-4 pb-20 pt-28 md:pt-36">
          <p data-site-page="partners" data-site-block="hero" data-site-field="kicker" data-site-kind="text" className="text-[12px] font-black uppercase tracking-[0.28em] text-[#0f766e]">
            {kicker}
          </p>
          <h1 data-site-page="partners" data-site-block="hero" data-site-field="title" data-site-kind="text" className="mt-4 text-balance text-4xl font-black tracking-tight text-black md:text-6xl">
            {title}
          </h1>
          <p data-site-page="partners" data-site-block="hero" data-site-field="body" data-site-kind="text" className="mt-6 max-w-2xl text-balance text-base leading-relaxed text-gray-600 md:text-lg">
            {body}
          </p>

          {done ? (
            <p data-site-page="partners" data-site-block="hero" data-site-field="success" data-site-kind="text" className="mt-10 rounded-2xl border border-[#99f6e4] bg-[#f0fdfa] px-5 py-6 text-lg font-semibold text-[#115e59]" role="status">
              {success}
            </p>
          ) : (
            <form onSubmit={(event) => void onSubmit(event)} className="mt-10 space-y-4 rounded-[1.5rem] border border-gray-100 bg-[#f8fdff] p-5 shadow-sm md:p-8">
              <label className="block text-sm font-bold text-black">
                Name
                <input required value={name} onChange={(event) => setName(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-base font-normal" autoComplete="name" />
              </label>
              <label className="block text-sm font-bold text-black">
                Email
                <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-base font-normal" autoComplete="email" />
              </label>
              <label className="block text-sm font-bold text-black">
                Phone
                <input value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-base font-normal" autoComplete="tel" />
              </label>
              <label className="block text-sm font-bold text-black">
                Studio or company
                <input value={company} onChange={(event) => setCompany(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-base font-normal" />
              </label>
              <label className="block text-sm font-bold text-black">
                What you shoot
                <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-base font-normal" />
              </label>
              {error ? <p className="text-sm font-semibold text-red-700" role="alert">{error}</p> : null}
              <Button type="submit" disabled={busy} className="min-h-12 w-full rounded-xl bg-[#0f766e] text-base font-bold text-white hover:bg-[#14b8a6]">
                <span data-site-page="partners" data-site-block="hero" data-site-field="submit" data-site-kind="text">{busy ? "Sending…" : submitLabel}</span>
              </Button>
            </form>
          )}
        </section>
      </main>
    </Layout>
  );
}
