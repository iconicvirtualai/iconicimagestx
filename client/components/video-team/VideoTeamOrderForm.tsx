import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  Calendar,
  Check,
  Clapperboard,
  Clock3,
  Home,
  MapPin,
  Megaphone,
  PartyPopper,
  PenLine,
  Smile,
  SunMedium,
  Target,
  UserRound,
  Wallet,
} from "lucide-react";
import { PublicContactLine } from "@/components/PublicContactLine";
import { cn } from "@/lib/utils";
import { BUSINESS_CONTACT } from "@shared/businessContact";
import {
  MIKE_CALL_WINDOW_LABEL,
  mikeCallSlots,
  type MikeCallSlot,
} from "@shared/mikeCallSlots";
import {
  AVAILABILITY_OPTIONS,
  BUDGET_OPTIONS,
  CAMERA_HELPER,
  CAMERA_OPTIONS,
  FILM_OPTIONS,
  GOAL_OPTIONS,
  PLACE_OPTIONS,
  USAGE_OPTIONS,
  recommendVideoTeamPackages,
  videoTeamAnswerNote,
  videoTeamCheckoutPath,
  type VideoAvailabilityId,
  type VideoBudgetId,
  type VideoCameraId,
  type VideoFilmId,
  type VideoGoalId,
  type VideoPlaceId,
  type VideoTeamAnswers,
  type VideoTeamCatalogRow,
  type VideoUsageId,
} from "@shared/videoTeamInquiry";

const STEPS = ["contact", "film", "where", "when", "usage", "budget", "availability", "camera", "goal"] as const;
type StepId = (typeof STEPS)[number];

const FIELD = "h-14 w-full rounded-[1.25rem] border-2 border-black bg-white px-5 text-base font-bold text-black outline-none placeholder:text-gray-400";

const FILM_ICONS: Record<VideoFilmId, ReactNode> = {
  "on-camera": <UserRound className="h-4 w-4" />,
  listing: <Home className="h-4 w-4" />,
  commercial: <Megaphone className="h-4 w-4" />,
  event: <PartyPopper className="h-4 w-4" />,
  product: <Clapperboard className="h-4 w-4" />,
  "twilight-aerial": <SunMedium className="h-4 w-4" />,
  custom: <PenLine className="h-4 w-4" />,
};

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

function emailOk(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function Choice({
  selected,
  onClick,
  icon,
  label,
}: {
  selected: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border-2 bg-white p-4 text-left transition-all",
        selected ? "border-black shadow-lg" : "border-gray-100 hover:border-gray-200",
      )}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-black">{icon}</span>
      <span className="min-w-0 flex-1 text-sm font-black uppercase leading-tight tracking-wide text-black">{label}</span>
      {selected ? (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black">
          <Check className="h-3 w-3 text-white" strokeWidth={4} />
        </span>
      ) : null}
    </button>
  );
}

export default function VideoTeamOrderForm() {
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);
  const [view, setView] = useState<"form" | "results" | "calendar" | "done">("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [film, setFilm] = useState<VideoFilmId | "">("");
  const [filmCustom, setFilmCustom] = useState("");
  const [placeKind, setPlaceKind] = useState<VideoPlaceId | "">("");
  const [placeText, setPlaceText] = useState("");
  const [whenDate, setWhenDate] = useState("");
  const [whenText, setWhenText] = useState("");
  const [usage, setUsage] = useState<VideoUsageId[]>([]);
  const [budgetBand, setBudgetBand] = useState<VideoBudgetId | "">("");
  const [customBudget, setCustomBudget] = useState("");
  const [availability, setAvailability] = useState<VideoAvailabilityId | "">("");
  const [camera, setCamera] = useState<VideoCameraId | "">("");
  const [goal, setGoal] = useState<VideoGoalId | "">("");
  const [catalog, setCatalog] = useState<VideoTeamCatalogRow[] | undefined>(undefined);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState<"buy" | "call" | null>(null);
  const [slots, setSlots] = useState<MikeCallSlot[]>(() => mikeCallSlots());
  const [slotsLive, setSlotsLive] = useState(false);
  const [slotDay, setSlotDay] = useState("");
  const [slot, setSlot] = useState<MikeCallSlot | null>(null);
  const [orderNumber, setOrderNumber] = useState("");

  const step = STEPS[stepIndex];
  const answers = useMemo<VideoTeamAnswers | null>(() => {
    if (!film || !placeKind || !budgetBand || !availability || !camera || !goal) return null;
    const amount = Number(customBudget);
    return {
      film,
      filmCustom,
      placeKind,
      placeText,
      whenDate,
      whenText,
      usage,
      budgetBand,
      customBudget: budgetBand === "custom" && Number.isFinite(amount) ? amount : null,
      availability,
      camera,
      goal,
    };
  }, [film, filmCustom, placeKind, placeText, whenDate, whenText, usage, budgetBand, customBudget, availability, camera, goal]);

  const picks = useMemo(
    () => (answers ? recommendVideoTeamPackages(answers, catalog) : []),
    [answers, catalog],
  );
  const selected = picks.find((pick) => pick.id === selectedId) || picks[0] || null;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/bookings/catalog")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !Array.isArray(data?.packages)) return;
        setCatalog(data.packages);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!picks.length) return;
    if (!picks.some((pick) => pick.id === selectedId)) setSelectedId(picks[0].id);
  }, [picks, selectedId]);

  useEffect(() => {
    if (view !== "calendar") return;
    let cancelled = false;
    fetch("/api/video-team/mike-slots")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !Array.isArray(data?.slots)) return;
        if (data.live || data.slots.length) {
          setSlots(data.slots);
          setSlotsLive(Boolean(data.live));
        }
      })
      .catch(() => {
        if (!cancelled) setSlotsLive(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view]);

  const days = useMemo(() => {
    const groups = new Map<string, MikeCallSlot[]>();
    for (const item of slots) {
      const list = groups.get(item.date) || [];
      list.push(item);
      groups.set(item.date, list);
    }
    return [...groups.entries()];
  }, [slots]);

  useEffect(() => {
    if (!slotDay && days[0]) setSlotDay(days[0][0]);
  }, [days, slotDay]);

  const daySlots = days.find(([date]) => date === slotDay)?.[1] || [];
  const morning = daySlots.filter((item) => item.window === "morning");
  const afternoon = daySlots.filter((item) => item.window === "afternoon");

  function stepError(): string {
    if (step === "contact") {
      if (name.trim().length < 2) return "Add your name.";
      if (!email.trim() && !phone.trim()) return "Add an email or a phone number.";
      if (email.trim() && !emailOk(email.trim())) return "That email does not look right.";
      if (phone.trim() && digits(phone).length < 10) return "That phone number needs 10 digits.";
    }
    if (step === "film") {
      if (!film) return "Choose what you want to film.";
      if (film === "custom" && filmCustom.trim().length < 2) return "Tell us what you want to film.";
    }
    if (step === "where") {
      if (!placeKind) return "Choose where you want to film.";
      if (placeKind === "location" && placeText.trim().length < 4) return "Add the filming address.";
    }
    if (step === "when" && !whenDate && whenText.trim().length < 2) return "Add a target date or a timeframe.";
    if (step === "usage" && usage.length === 0) return "Choose how you want the film used.";
    if (step === "budget") {
      if (!budgetBand) return "Choose a budget.";
      if (budgetBand === "custom") {
        const amount = Number(customBudget);
        if (!Number.isFinite(amount) || amount <= 0) return "Add a budget amount.";
      }
    }
    if (step === "availability" && !availability) return "Choose how often you can film.";
    if (step === "camera" && !camera) return "Tell us how you feel on camera.";
    if (step === "goal" && !goal) return "Choose what matters most.";
    return "";
  }

  function continueStep() {
    const problem = stepError();
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    if (stepIndex >= STEPS.length - 1) {
      setView("results");
      return;
    }
    setStepIndex((index) => index + 1);
  }

  function toggleUsage(id: VideoUsageId) {
    setUsage((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    setError("");
  }

  async function submit(intent: "buy" | "call") {
    if (!answers || !selected) return;
    if (intent === "call" && !slot) {
      setError("Choose a time for the call.");
      return;
    }
    setSubmitting(intent);
    setError("");
    try {
      const response = await fetch("/api/video-team/inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone,
          companyWebsite,
          ...answers,
          intent,
          packageId: selected.id,
          slot: intent === "call" ? slot : null,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Please call ${BUSINESS_CONTACT.phoneDisplay}.`);
      if (intent === "buy") {
        const address = answers.placeKind === "studio" ? BUSINESS_CONTACT.address : answers.placeText;
        navigate(videoTeamCheckoutPath({
          pick: selected,
          name,
          email,
          phone,
          address,
          note: videoTeamAnswerNote(answers, selected),
        }));
        return;
      }
      setOrderNumber(typeof data.orderNumber === "string" ? data.orderNumber : "");
      setView("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : `Please call ${BUSINESS_CONTACT.phoneDisplay}.`);
    } finally {
      setSubmitting(null);
    }
  }

  const title: Record<StepId, string> = {
    contact: "Name | Contact",
    film: "What do you want to film?",
    where: "Where do you want to film?",
    when: "When do you want to film?",
    usage: "How do you want your content to be used?",
    budget: "Do you have a budget?",
    availability: "Are you available for filming at least up to 10 days per month? (1-2 on average)",
    camera: "Are you comfortable on camera?",
    goal: "What's the most important thing you want to come from this venture?",
  };

  return (
    <div>
      <div data-testid="video-team-order-form" className="mx-auto max-w-xl rounded-[2rem] border border-gray-100 bg-white p-6 text-neutral-950 shadow-xl sm:p-8">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-400">Video order</p>
        <h2 id="video-order-heading" className="mt-2 text-3xl font-black uppercase leading-none tracking-tight text-black">
          Book your video shoot
        </h2>

        {view === "form" ? (
          <div data-testid="video-team-step" className="mt-8">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
              {stepIndex + 1} of {STEPS.length}
            </p>
            <div className="mt-3 flex gap-1.5" aria-hidden="true">
              {STEPS.map((item, index) => (
                <span key={item} className={cn("h-1.5 flex-1 rounded-full", index <= stepIndex ? "bg-black" : "bg-gray-100")} />
              ))}
            </div>
            <h3 className="mt-6 text-xl font-black uppercase leading-tight tracking-tight text-black sm:text-2xl">{title[step]}</h3>
            {step === "camera" ? <p className="mt-2 text-sm font-bold text-gray-500">{CAMERA_HELPER}</p> : null}

            <div className="mt-6 space-y-3">
              {step === "contact" ? (
                <>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400" htmlFor="video-team-name">Name</label>
                  <input id="video-team-name" className={FIELD} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} />
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400" htmlFor="video-team-email">Email</label>
                  <input id="video-team-email" type="email" className={FIELD} autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400" htmlFor="video-team-phone">Phone</label>
                  <input id="video-team-phone" type="tel" className={FIELD} autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
                  <input
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden="true"
                    className="absolute h-0 w-0 overflow-hidden opacity-0"
                    value={companyWebsite}
                    onChange={(event) => setCompanyWebsite(event.target.value)}
                  />
                </>
              ) : null}

              {step === "film" ? (
                <>
                  {FILM_OPTIONS.map((option) => (
                    <Choice
                      key={option.id}
                      selected={film === option.id}
                      onClick={() => { setFilm(option.id); setError(""); }}
                      icon={FILM_ICONS[option.id]}
                      label={option.label}
                    />
                  ))}
                  {film === "custom" ? (
                    <textarea
                      className={`${FIELD} h-28 py-4`}
                      placeholder="Tell us what you want to film"
                      value={filmCustom}
                      onChange={(event) => setFilmCustom(event.target.value)}
                    />
                  ) : null}
                </>
              ) : null}

              {step === "where" ? (
                <>
                  <Choice selected={placeKind === "studio"} onClick={() => { setPlaceKind("studio"); setError(""); }} icon={<Building2 className="h-4 w-4" />} label="Studio 105" />
                  <Choice selected={placeKind === "location"} onClick={() => { setPlaceKind("location"); setError(""); }} icon={<MapPin className="h-4 w-4" />} label="On-location" />
                  {placeKind === "studio" ? (
                    <p className="rounded-2xl bg-gray-50 px-4 py-3 text-sm font-bold text-gray-600">{BUSINESS_CONTACT.address}</p>
                  ) : null}
                  {placeKind === "location" ? (
                    <input className={FIELD} placeholder="Address or location" autoComplete="street-address" value={placeText} onChange={(event) => setPlaceText(event.target.value)} />
                  ) : null}
                </>
              ) : null}

              {step === "when" ? (
                <>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400" htmlFor="video-team-date">Target date</label>
                  <input id="video-team-date" type="date" className={FIELD} value={whenDate} onChange={(event) => setWhenDate(event.target.value)} />
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400" htmlFor="video-team-when">Or a timeframe</label>
                  <input id="video-team-when" className={FIELD} placeholder="Next two weeks, a Friday morning…" value={whenText} onChange={(event) => setWhenText(event.target.value)} />
                </>
              ) : null}

              {step === "usage" ? USAGE_OPTIONS.map((option) => (
                <Choice
                  key={option.id}
                  selected={usage.includes(option.id)}
                  onClick={() => toggleUsage(option.id)}
                  icon={<Clapperboard className="h-4 w-4" />}
                  label={option.label}
                />
              )) : null}

              {step === "budget" ? (
                <>
                  {BUDGET_OPTIONS.map((option) => (
                    <Choice
                      key={option.id}
                      selected={budgetBand === option.id}
                      onClick={() => { setBudgetBand(option.id); setError(""); }}
                      icon={<Wallet className="h-4 w-4" />}
                      label={option.label}
                    />
                  ))}
                  {budgetBand === "custom" ? (
                    <input className={FIELD} inputMode="decimal" placeholder="Your amount" value={customBudget} onChange={(event) => setCustomBudget(event.target.value)} />
                  ) : null}
                </>
              ) : null}

              {step === "availability" ? AVAILABILITY_OPTIONS.map((option) => (
                <Choice key={option.id} selected={availability === option.id} onClick={() => { setAvailability(option.id); setError(""); }} icon={<Clock3 className="h-4 w-4" />} label={option.label} />
              )) : null}

              {step === "camera" ? CAMERA_OPTIONS.map((option) => (
                <Choice key={option.id} selected={camera === option.id} onClick={() => { setCamera(option.id); setError(""); }} icon={<Smile className="h-4 w-4" />} label={option.label} />
              )) : null}

              {step === "goal" ? GOAL_OPTIONS.map((option) => (
                <Choice key={option.id} selected={goal === option.id} onClick={() => { setGoal(option.id); setError(""); }} icon={<Target className="h-4 w-4" />} label={option.label} />
              )) : null}
            </div>

            {error ? <p className="mt-4 text-sm font-bold text-red-600" role="alert">{error}</p> : null}
            <div className="mt-8 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => { setError(""); setStepIndex((index) => Math.max(0, index - 1)); }}
                className={cn("text-xs font-black uppercase tracking-widest text-gray-400", stepIndex === 0 && "invisible")}
              >
                Back
              </button>
              <button
                type="button"
                data-testid="video-team-next"
                onClick={continueStep}
                className="inline-flex h-12 items-center justify-center rounded-full bg-black px-8 text-xs font-black uppercase tracking-[0.14em] text-white"
              >
                {step === "goal" ? "See packages" : "Continue"}
              </button>
            </div>
          </div>
        ) : null}

        {view === "results" && selected ? (
          <div data-testid="video-team-recommendations" className="mt-8">
            <h3 className="text-xl font-black uppercase leading-tight tracking-tight text-black">Recommended Iconic Video Packages</h3>
            <p className="mt-2 text-sm font-bold text-gray-500">Catalog prices only. Custom cards are quotes.</p>
            <div className="mt-6 space-y-3">
              {picks.map((pick) => {
                const active = pick.id === selected.id;
                return (
                  <button
                    key={pick.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelectedId(pick.id)}
                    className={cn(
                      "w-full rounded-2xl border-2 bg-white p-5 text-left transition-all",
                      active ? "border-black shadow-lg" : "border-gray-100 hover:border-gray-200",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        {pick.primary ? (
                          <span className="inline-flex rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">Recommended</span>
                        ) : null}
                        <h4 className={cn("font-black uppercase leading-tight text-black", pick.primary ? "mt-2" : "", "text-sm")}>{pick.name}</h4>
                      </div>
                      {active ? (
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black">
                          <Check className="h-3 w-3 text-white" strokeWidth={4} />
                        </span>
                      ) : null}
                    </div>
                    <p className={cn("mt-3 font-black text-black", pick.customQuote ? "text-sm uppercase tracking-wide" : "text-2xl tabular-nums")}>{pick.priceLabel}</p>
                    <p className="mt-2 text-xs font-medium leading-relaxed text-gray-500">{pick.reason}</p>
                    {pick.features.length ? (
                      <ul className="mt-3 space-y-1">
                        {pick.features.map((feature) => (
                          <li key={feature} className="text-[11px] font-bold text-gray-600">{feature}</li>
                        ))}
                      </ul>
                    ) : null}
                  </button>
                );
              })}
            </div>
            {error ? <p className="mt-4 text-sm font-bold text-red-600" role="alert">{error}</p> : null}
            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                data-testid="video-team-buy-now"
                disabled={submitting !== null}
                onClick={() => submit("buy")}
                className="inline-flex h-12 items-center justify-center rounded-full bg-black px-8 text-xs font-black uppercase tracking-[0.14em] text-white disabled:opacity-40"
              >
                {submitting === "buy" ? "Saving…" : "Buy Now"}
              </button>
              <button
                type="button"
                data-testid="video-team-book-call"
                onClick={() => { setError(""); setView("calendar"); }}
                className="inline-flex h-12 items-center justify-center rounded-full border-2 border-black bg-white px-8 text-xs font-black uppercase tracking-[0.14em] text-black"
              >
                Book a Call with Mike
              </button>
            </div>
            <button type="button" onClick={() => { setView("form"); setStepIndex(STEPS.length - 1); }} className="mt-4 text-xs font-black uppercase tracking-widest text-gray-400">
              Back
            </button>
          </div>
        ) : null}

        {view === "calendar" ? (
          <div data-testid="video-team-calendar" className="mt-8">
            <h3 className="text-xl font-black uppercase leading-tight tracking-tight text-black">Book a Call with Mike</h3>
            <p className="mt-2 text-sm font-bold text-gray-500">
              {slotsLive ? "Open times on Mike's calendar." : MIKE_CALL_WINDOW_LABEL}
            </p>
            <div className="mt-5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {days.map(([date, items]) => {
                const active = date === slotDay;
                const label = items[0]?.label.split(" · ")[0] || date;
                return (
                  <button
                    key={date}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSlotDay(date)}
                    className={cn(
                      "shrink-0 rounded-full px-4 py-2 text-xs font-black uppercase tracking-wide",
                      active ? "bg-black text-white" : "bg-gray-50 text-gray-500",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {[{ name: "Morning · 9:00 AM–12:00 PM", items: morning }, { name: "Afternoon · 2:00 PM–4:00 PM", items: afternoon }].map((group) => (
              group.items.length ? (
                <div key={group.name} className="mt-5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{group.name}</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {group.items.map((item) => {
                      const active = slot?.start === item.start;
                      return (
                        <button
                          key={item.start}
                          type="button"
                          data-testid="mike-slot"
                          aria-pressed={active}
                          onClick={() => { setSlot(item); setError(""); }}
                          className={cn(
                            "rounded-2xl border-2 px-3 py-3 text-sm font-black tabular-nums",
                            active ? "border-black bg-black text-white" : "border-gray-100 bg-white text-black",
                          )}
                        >
                          {item.time}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null
            ))}
            {days.length === 0 ? <p className="mt-4 text-sm font-bold text-gray-500">Call {BUSINESS_CONTACT.phoneDisplay} and we will find a time.</p> : null}
            {error ? <p className="mt-4 text-sm font-bold text-red-600" role="alert">{error}</p> : null}
            <button
              type="button"
              data-testid="video-team-request-call"
              disabled={submitting !== null}
              onClick={() => submit("call")}
              className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-full bg-black px-8 text-xs font-black uppercase tracking-[0.14em] text-white disabled:opacity-40"
            >
              {submitting === "call" ? "Saving…" : "Request this call"}
            </button>
            <button type="button" onClick={() => { setError(""); setView("results"); }} className="mt-4 text-xs font-black uppercase tracking-widest text-gray-400">
              Back to packages
            </button>
          </div>
        ) : null}

        {view === "done" && slot ? (
          <div data-testid="video-team-call-confirmation" className="mt-8 rounded-[1.75rem] border-2 border-black p-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black text-white">
              <Calendar className="h-4 w-4" />
            </span>
            <h3 className="mt-4 text-2xl font-black uppercase leading-tight tracking-tight text-black">Call requested</h3>
            <p className="mt-3 text-base font-black text-black">{slot.label} CT</p>
            <p className="mt-1 text-sm font-bold text-gray-500">with Mike Luna</p>
            {orderNumber ? <p className="mt-4 text-sm font-black uppercase tracking-widest text-black">Request {orderNumber}</p> : null}
            <p className="mt-3 text-sm font-medium leading-relaxed text-gray-600">
              We'll confirm this time. Nothing is charged for the call.
            </p>
            {selected ? <p className="mt-3 text-xs font-bold text-gray-500">{selected.name} · {selected.priceLabel}</p> : null}
          </div>
        ) : null}
      </div>
      <PublicContactLine className="mx-auto mt-6 max-w-xl text-center text-xs font-medium leading-relaxed text-[#5b5249]" linkClassName="underline decoration-[#e4dacb] underline-offset-4" />
    </div>
  );
}
