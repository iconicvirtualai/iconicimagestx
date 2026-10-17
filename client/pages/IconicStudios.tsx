import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "@/components/Layout";
import { ProcessingFeeNote } from "@/components/ProcessingFeeNote";
import { PublicContactLine } from "@/components/PublicContactLine";
import { MoneyAmount } from "@/components/MoneyAmount";
import { BUSINESS_CONTACT, LEGAL_BUSINESS_NAME } from "@shared/businessContact";
import {
  FOUNDING_PASSES,
  FOUNDING_PASS_DRAFT_LABEL,
  FOUNDING_PASS_NOT_FINAL,
  STUDIOS_CALENDAR_NOTE,
  STUDIOS_NAME,
  STUDIOS_PLACE,
  STUDIO_LENGTHS,
  STUDIO_ROOMS,
  formatDraftMonthly,
  parseStudiosRequest,
  type FoundingPassId,
  type StudioLengthId,
  type StudioRoomId,
} from "@shared/iconicStudiosPublic";

const fieldClass =
  "mt-2 w-full min-h-12 rounded-xl border border-black/10 bg-white px-4 text-base text-black outline-none focus:border-black";

const roomCards = STUDIO_ROOMS.filter((room) => room.id !== "both");

export default function IconicStudios() {
  const [kind, setKind] = useState<"session" | "pass">("session");
  const [roomId, setRoomId] = useState<StudioRoomId | "">("");
  const [passId, setPassId] = useState<FoundingPassId | "">("");
  const [lengthId, setLengthId] = useState<StudioLengthId | "">("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredTime, setPreferredTime] = useState("");
  const [notes, setNotes] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [received, setReceived] = useState(false);

  function openRequest(next: { kind: "session" | "pass"; roomId?: StudioRoomId; passId?: FoundingPassId }) {
    setKind(next.kind);
    if (next.roomId) setRoomId(next.roomId);
    if (next.passId) setPassId(next.passId);
    setReceived(false);
    document.getElementById("studios-request")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const payload = {
      kind,
      name,
      email,
      phone,
      roomId,
      passId,
      lengthId,
      preferredDate,
      preferredTime,
      notes,
      website,
    };
    const parsed = parseStudiosRequest(payload);
    if (parsed.ok === false) {
      if (!parsed.honeypot) setError(parsed.error);
      else setReceived(true);
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/public-campaigns/studios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "We could not save that request.");
      setReceived(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "We could not save that request.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Layout>
      <div className="bg-black text-white">
        <section className="px-6 pt-40">
          <div className="mx-auto max-w-5xl">
            <div className="aspect-video w-full overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-zinc-950 via-zinc-800 to-white" style={{ aspectRatio: "16 / 9" }} data-testid="studios-video">
              <div className="flex h-full items-end p-6 sm:p-10">
                <p className="text-xs uppercase tracking-[0.28em] text-white/80">Studio video</p>
              </div>
            </div>
            <div className="mx-auto mt-12 max-w-xl text-center">
              <p className="text-sm text-teal-200">Part of {LEGAL_BUSINESS_NAME}</p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl" data-testid="studios-hero">{STUDIOS_NAME}</h1>
              <p className="mt-4 text-lg text-white/75">{STUDIOS_NAME} at {STUDIOS_PLACE}.</p>
              <a href="#studios-request" className="mt-8 inline-flex rounded-full bg-white px-7 py-3 text-sm font-semibold text-black">
                Request a studio time
              </a>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-xl space-y-16 px-6 py-24 text-center">
          {roomCards.map((room) => (
            <article key={room.id} data-testid={`studio-${room.id}`}>
              <p className="text-sm text-white/60">{room.vibe}</p>
              <h2 className="mt-2 text-3xl font-semibold">{room.name}</h2>
              <p className="mt-3 text-base leading-relaxed text-white/75">{room.teaser}</p>
              <button
                type="button"
                className="mt-6 text-sm font-semibold underline underline-offset-4"
                onClick={() => openRequest({ kind: "session", roomId: room.id })}
              >
                Request {room.name}
              </button>
            </article>
          ))}
        </section>

        <section className="mx-auto max-w-xl px-6 pb-16 text-center">
          <h2 className="text-sm uppercase tracking-[0.22em] text-white/60">Founding Pass</h2>
          <p className="mt-4 font-semibold text-amber-200" data-testid="founding-pass-draft">{FOUNDING_PASS_DRAFT_LABEL}</p>
          <p className="mt-2 text-sm text-white/70">{FOUNDING_PASS_NOT_FINAL}</p>
          <div className="mt-10 space-y-8">
            {FOUNDING_PASSES.map((pass) => (
              <article key={pass.id} data-testid={`pass-${pass.id}`}>
                <h3 className="text-xl font-semibold">{pass.name}</h3>
                <p className="mt-2 text-3xl font-semibold">
                  <MoneyAmount>{formatDraftMonthly(pass.draftMonthly)}</MoneyAmount>
                </p>
                <button
                  type="button"
                  className="mt-3 text-sm font-semibold underline underline-offset-4"
                  onClick={() => openRequest({ kind: "pass", passId: pass.id })}
                >
                  Request pass
                </button>
              </article>
            ))}
          </div>
          <ProcessingFeeNote className="mt-10 text-sm text-white/70" />
          <p className="mt-4 text-sm text-white/70">
            Email <a className="underline underline-offset-4" href={BUSINESS_CONTACT.emailHref}>{BUSINESS_CONTACT.email}</a>
          </p>
        </section>

        <section id="studios-request" className="bg-white text-black py-16 scroll-mt-28">
          <div className="max-w-[760px] mx-auto px-6">
            <h2 className="text-3xl font-black uppercase tracking-tight">Request a time or a pass</h2>
            <p className="mt-3 text-neutral-700">{STUDIOS_CALENDAR_NOTE}</p>
            <ProcessingFeeNote className="mt-3 text-sm text-neutral-700" />
            {received ? (
              <p className="mt-8 rounded-2xl border border-black p-6" role="status" data-testid="studios-received">
                Request received. The office will confirm. This is not a charge.
              </p>
            ) : (
              <form className="mt-8 space-y-5" onSubmit={onSubmit} data-testid="studios-request-form" noValidate>
                <fieldset className="space-y-3">
                  <legend className="text-xs font-black uppercase tracking-[0.2em]">Request</legend>
                  <label className="flex items-center gap-3 text-sm font-semibold">
                    <input type="radio" name="kind" value="session" checked={kind === "session"} onChange={() => setKind("session")} />
                    Studio time
                  </label>
                  <label className="flex items-center gap-3 text-sm font-semibold">
                    <input type="radio" name="kind" value="pass" checked={kind === "pass"} onChange={() => setKind("pass")} />
                    Founding pass
                  </label>
                </fieldset>
                {kind === "session" ? (
                  <>
                    <label className="block text-xs font-black uppercase tracking-[0.2em]">
                      Room
                      <select id="studios-room" className={fieldClass} value={roomId} onChange={(event) => setRoomId(event.target.value as StudioRoomId)}>
                        <option value="">Choose</option>
                        {STUDIO_ROOMS.map((room) => (
                          <option key={room.id} value={room.id}>{room.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs font-black uppercase tracking-[0.2em]">
                      Date
                      <input id="studios-date" className={fieldClass} type="date" value={preferredDate} onChange={(event) => setPreferredDate(event.target.value)} />
                    </label>
                    <label className="block text-xs font-black uppercase tracking-[0.2em]">
                      Start time
                      <input id="studios-time" className={fieldClass} type="time" value={preferredTime} onChange={(event) => setPreferredTime(event.target.value)} />
                    </label>
                    <label className="block text-xs font-black uppercase tracking-[0.2em]">
                      Length
                      <select id="studios-length" className={fieldClass} value={lengthId} onChange={(event) => setLengthId(event.target.value as StudioLengthId)}>
                        <option value="">Choose</option>
                        {STUDIO_LENGTHS.map((item) => (
                          <option key={item.id} value={item.id}>{item.label}</option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : (
                  <label className="block text-xs font-black uppercase tracking-[0.2em]">
                    Pass
                    <select id="studios-pass" className={fieldClass} value={passId} onChange={(event) => setPassId(event.target.value as FoundingPassId)}>
                      <option value="">Choose</option>
                      {FOUNDING_PASSES.map((pass) => (
                        <option key={pass.id} value={pass.id}>{pass.name} — {formatDraftMonthly(pass.draftMonthly)} ({FOUNDING_PASS_DRAFT_LABEL})</option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="block text-xs font-black uppercase tracking-[0.2em]">
                  Name
                  <input id="studios-name" className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" />
                </label>
                <label className="block text-xs font-black uppercase tracking-[0.2em]">
                  Email
                  <input id="studios-email" className={fieldClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
                </label>
                <label className="block text-xs font-black uppercase tracking-[0.2em]">
                  Phone
                  <input id="studios-phone" className={fieldClass} type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" />
                </label>
                <label className="block text-xs font-black uppercase tracking-[0.2em]">
                  Notes
                  <textarea id="studios-notes" className={fieldClass} rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} />
                </label>
                <label className="absolute left-[-9999px]" aria-hidden="true">
                  Website
                  <input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} />
                </label>
                {error ? (
                  <p className="text-sm font-semibold text-red-700" role="alert" data-testid="studios-error">{error}</p>
                ) : null}
                <button
                  type="submit"
                  className="rounded-full bg-black px-8 py-4 text-xs font-black uppercase tracking-widest text-white disabled:opacity-60"
                  disabled={pending}
                  data-testid="studios-submit"
                >
                  {pending ? "Sending" : kind === "pass" ? "Request pass" : "Request studio time"}
                </button>
              </form>
            )}
            <p className="mt-8 text-sm">
              <Link className="font-bold underline underline-offset-4" to="/tis-the-season">’Tis the Season</Link>
              {" · "}
              <Link className="font-bold underline underline-offset-4" to="/thankful">Thankful</Link>
            </p>
            <PublicContactLine className="mt-4 text-sm" linkClassName="underline underline-offset-4" />
          </div>
        </section>
      </div>
    </Layout>
  );
}
