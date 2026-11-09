import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { createOrder } from "@/lib/createOrder";
import { trackConversion } from "@/lib/tracking";
import { BUSINESS_CONTACT } from "@shared/businessContact";
import { isStudioRoomId, studioRoomRequestName, type StudioRoomId } from "@shared/studio105";

const ROOMS: Array<{ id: StudioRoomId; name: string }> = [
  { id: "studio-noir", name: "Studio Noir" },
  { id: "studio-blanc", name: "Studio Blanc" },
];

const TIMES = ["9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM"];

function todayKey(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export default function Studio105BookForm() {
  const [params] = useSearchParams();
  const requested = params.get("room") || "";
  const [roomId, setRoomId] = useState<StudioRoomId>(isStudioRoomId(requested) ? requested : "studio-noir");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredTime, setPreferredTime] = useState("10:00 AM");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [received, setReceived] = useState("");
  const room = useMemo(() => ROOMS.find((item) => item.id === roomId) || ROOMS[0], [roomId]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !phone.trim() || !preferredDate) {
      setError("Name, email, phone, and a preferred date are required.");
      return;
    }
    setPending(true);
    try {
      const result = await createOrder({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        address: BUSINESS_CONTACT.address,
        serviceDate: preferredDate,
        serviceTime: preferredTime,
        selectedService: studioRoomRequestName(room.name),
        lineItems: [{ name: studioRoomRequestName(room.name), price: 0 }],
        total: 0,
        pricing: { subtotal: 0, total: 0 },
        vibeNote: [
          `Room: ${room.name} (${room.id})`,
          notes.trim(),
          "Request only. Confirm availability and the rate. Do not charge a card.",
        ].filter(Boolean).join("\n"),
        leadSource: "Studio 105",
        accessInfo: "Studio 105",
        propertyStatus: "Not specified",
        furnishingStatus: "Not specified",
      });
      trackConversion({ name: "studio_request", packageId: room.id, value: 0 });
      setReceived(result.orderNumber || result.requestId || "received");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The request did not go through. Call the studio and we will take it.");
    } finally {
      setPending(false);
    }
  }

  if (received) {
    return (
      <div data-testid="studio105-request-received" className="rounded-[2rem] border border-white/10 bg-zinc-950 p-8">
        <p className="text-[11px] font-black uppercase tracking-[0.28em] text-[#2dd4bf]">Request received</p>
        <h2 className="mt-3 text-3xl font-black uppercase tracking-tight">{room.name}</h2>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-gray-300">
          We have the request. We confirm availability and the rate. This page does not charge a card.
        </p>
        <p className="mt-4 text-sm text-white/60">Reference {received}</p>
      </div>
    );
  }

  return (
    <form data-testid="studio105-book-form" onSubmit={onSubmit} className="space-y-6 rounded-[2rem] border border-white/10 bg-zinc-950 p-6 sm:p-8">
      <fieldset>
        <legend className="text-[11px] font-black uppercase tracking-[0.22em] text-white/60">Room</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {ROOMS.map((item) => (
            <label key={item.id} className={`cursor-pointer rounded-2xl border p-4 ${roomId === item.id ? "border-[#2dd4bf] bg-white/5" : "border-white/10"}`}>
              <input
                type="radio"
                name="room"
                value={item.id}
                checked={roomId === item.id}
                onChange={() => setRoomId(item.id)}
                className="mr-2 accent-[#0d9488]"
              />
              <span className="font-black uppercase tracking-tight">{item.name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold">
          First name
          <input required value={firstName} onChange={(event) => setFirstName(event.target.value)} className="mt-2 w-full rounded-xl border border-white/15 bg-black px-4 py-3 text-white" />
        </label>
        <label className="block text-sm font-semibold">
          Last name
          <input required value={lastName} onChange={(event) => setLastName(event.target.value)} className="mt-2 w-full rounded-xl border border-white/15 bg-black px-4 py-3 text-white" />
        </label>
        <label className="block text-sm font-semibold">
          Email
          <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-white/15 bg-black px-4 py-3 text-white" />
        </label>
        <label className="block text-sm font-semibold">
          Phone
          <input required type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-2 w-full rounded-xl border border-white/15 bg-black px-4 py-3 text-white" />
        </label>
        <label className="block text-sm font-semibold">
          Preferred date
          <input required type="date" min={todayKey()} value={preferredDate} onChange={(event) => setPreferredDate(event.target.value)} className="mt-2 w-full rounded-xl border border-white/15 bg-black px-4 py-3 text-white" />
        </label>
        <label className="block text-sm font-semibold">
          Preferred time
          <select value={preferredTime} onChange={(event) => setPreferredTime(event.target.value)} className="mt-2 w-full rounded-xl border border-white/15 bg-black px-4 py-3 text-white">
            {TIMES.map((time) => <option key={time}>{time}</option>)}
          </select>
        </label>
      </div>
      <label className="block text-sm font-semibold">
        Notes
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} className="mt-2 w-full rounded-xl border border-white/15 bg-black px-4 py-3 text-white" />
      </label>
      <p className="text-sm leading-relaxed text-white/70">
        Request the room and a time. We confirm availability and the rate. This page does not charge a card.
      </p>
      {error ? <p role="alert" className="text-sm font-semibold text-red-300">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-12 items-center rounded-full bg-white px-8 text-xs font-black uppercase tracking-widest text-black disabled:opacity-60"
      >
        {pending ? "Sending request..." : `Request ${room.name}`}
      </button>
    </form>
  );
}
