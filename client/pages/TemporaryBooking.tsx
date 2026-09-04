import { FormEvent, useMemo, useState } from "react";
import Layout from "@/components/Layout";

type Service = { id: string; name: string; price: number | null; description: string; group: "New" | "Classic" };
const services: Service[] = [
  { id: "hollywood", name: "Hollywood", price: 199, description: "30 daytime photos + branded listing website", group: "New" },
  { id: "hall-of-fame", name: "Hall of Fame", price: 299, description: "Hollywood plus aerials and 5 additional photos", group: "New" },
  { id: "red-carpet", name: "Red Carpet", price: 499, description: "45 photos, 5 aerials, reel, and amenities", group: "New" },
  { id: "luxe", name: "Luxe", price: null, description: "50 photos, 5 aerials, and your choice of listing video or 3D tour", group: "New" },
  { id: "essentials", name: "The Essentials", price: 249, description: "30 images, Snap Reel, twilight render, and same-day delivery", group: "Classic" },
  { id: "showcase", name: "The Showcase", price: 549, description: "50 images, aerials, reels, floorplan, and twilight renders", group: "Classic" },
  { id: "legacy", name: "The Legacy", price: 899, description: "Full media production with cinematic video and agent intro/outro", group: "Classic" },
  { id: "market-leader", name: "The Market Leader", price: 1599, description: "Full-cycle media and marketing campaign", group: "Classic" },
];
const addOns = [
  { id: "grass", name: "Grass replacement", price: 12 },
  { id: "aerial-video", name: "Aerial video upgrade", price: 125 },
  { id: "twilight-one", name: "Twilight conversion", price: 25 },
  { id: "twilight-five", name: "Five twilight conversions", price: 75 },
  { id: "floorplan", name: "2D floorplan", price: 150 },
];

export default function TemporaryBookingPage() {
  const [selectedId, setSelectedId] = useState("");
  const [extras, setExtras] = useState<string[]>([]);
  const [result, setResult] = useState<"idle" | "sending" | "success" | "error">("idle");
  const selected = services.find((service) => service.id === selectedId);
  const chosenExtras = addOns.filter((item) => extras.includes(item.id));
  const total = useMemo(() => (selected?.price ?? 0) + chosenExtras.reduce((sum, item) => sum + item.price, 0), [selected, chosenExtras]);
  const toggleExtra = (id: string) => setExtras((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setResult("sending");
    const form = new FormData(event.currentTarget);
    const lineItems = [{ name: selected.name, price: selected.price ?? 0, description: selected.description }, ...chosenExtras.map((item) => ({ name: item.name, price: item.price }))];
    try {
      const response = await fetch("/api/bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        firstName: form.get("firstName"), lastName: form.get("lastName"), email: form.get("email"), phone: form.get("phone"),
        address: form.get("address"), squareFootage: form.get("squareFootage"), scheduledDate: form.get("preferredDate") || null,
        scheduledTime: form.get("preferredTime") || null, accessMethod: form.get("accessMethod"), lockboxCode: form.get("accessCode"),
        propertyStatus: form.get("propertyStatus"), furnishingStatus: "Not specified", vibeNote: form.get("notes"),
        lineItems, total, pricing: { subtotal: total, total, needsQuote: selected.price === null }, source: "temporary-booking-page",
      })});
      if (!response.ok) throw new Error("Unable to submit");
      setResult("success");
    } catch { setResult("error"); }
  }

  if (result === "success") return <Layout><main className="min-h-screen bg-zinc-950 px-4 py-24 text-white"><div className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-white/5 p-10 text-center"><p className="text-sm font-bold uppercase tracking-[.25em] text-teal-300">Iconic Images</p><h1 className="mt-3 text-4xl font-black">You’re on the list.</h1><p className="mt-4 text-zinc-300">We received your request and will confirm your appointment shortly.</p><button onClick={() => setResult("idle")} className="mt-8 rounded-xl bg-teal-300 px-6 py-3 font-black text-black">Start another request</button></div></main></Layout>;

  return <Layout><main className="min-h-screen bg-zinc-950 pb-20 text-white">
    <section className="border-b border-white/10 bg-gradient-to-br from-zinc-950 via-zinc-950 to-teal-950/40 px-4 py-16 sm:py-24"><div className="mx-auto max-w-5xl"><p className="text-xs font-black uppercase tracking-[.28em] text-teal-300">Iconic Images Media & Marketing</p><h1 className="mt-5 max-w-4xl text-4xl font-black leading-tight sm:text-6xl">A better booking experience is coming.</h1><p className="mt-6 max-w-2xl text-lg leading-relaxed text-zinc-300">While we finish the new experience, use this page to request your listing media appointment. Our office will personally confirm availability and details.</p><div className="mt-8 inline-flex rounded-full border border-teal-300/30 bg-teal-300/10 px-4 py-2 text-sm font-bold text-teal-200">Changes are coming. Stay tuned.</div></div></section>
    <form onSubmit={onSubmit} className="mx-auto max-w-5xl space-y-10 px-4 pt-12">
      <section><div className="mb-5"><p className="text-sm font-bold uppercase tracking-widest text-teal-300">New packages</p><h2 className="mt-2 text-3xl font-black">Fresh, fast, listing-ready.</h2></div><div className="grid gap-4 md:grid-cols-2">{services.filter((service) => service.group === "New").map((service) => <label key={service.id} className={"cursor-pointer rounded-3xl border p-6 transition " + (selectedId === service.id ? "border-teal-300 bg-teal-300 text-black" : "border-white/10 bg-white/5 hover:border-white/30")}><input className="sr-only" type="radio" name="service" checked={selectedId === service.id} onChange={() => setSelectedId(service.id)} /><div className="flex items-start justify-between gap-4"><h3 className="text-2xl font-black">{service.name}</h3><span className={"rounded-full px-3 py-1 text-sm font-black " + (selectedId === service.id ? "bg-black text-white" : "bg-white/10 text-teal-200")}>{service.price === null ? "Custom" : "$" + service.price}</span></div><p className={"mt-3 text-sm leading-relaxed " + (selectedId === service.id ? "text-zinc-800" : "text-zinc-300")}>{service.description}</p></label>)}</div></section>
      <section className="border-t border-white/10 pt-10"><div className="mb-5"><p className="text-sm font-bold uppercase tracking-widest text-zinc-400">Classic packages</p><h2 className="mt-2 text-3xl font-black">Still available while we transition.</h2></div><div className="grid gap-4 md:grid-cols-2">{services.filter((service) => service.group === "Classic").map((service) => <label key={service.id} className={"cursor-pointer rounded-3xl border p-6 transition " + (selectedId === service.id ? "border-teal-300 bg-teal-300 text-black" : "border-white/10 bg-white/5 hover:border-white/30")}><input className="sr-only" type="radio" name="service" checked={selectedId === service.id} onChange={() => setSelectedId(service.id)} /><div className="flex items-start justify-between gap-4"><h3 className="text-xl font-black">{service.name}</h3><span className={"rounded-full px-3 py-1 text-sm font-black " + (selectedId === service.id ? "bg-black text-white" : "bg-white/10 text-teal-200")}>{"$" + service.price}</span></div><p className={"mt-3 text-sm leading-relaxed " + (selectedId === service.id ? "text-zinc-800" : "text-zinc-300")}>{service.description}</p></label>)}</div></section>
      <section className="rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8"><h2 className="text-2xl font-black">Add-ons</h2><div className="mt-5 grid gap-3 sm:grid-cols-2">{addOns.map((item) => <label key={item.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 p-4 hover:border-white/30"><input type="checkbox" checked={extras.includes(item.id)} onChange={() => toggleExtra(item.id)} className="h-4 w-4 accent-teal-300" /><span className="flex-1 font-bold">{item.name}</span><span className="text-teal-200">{"$" + item.price}</span></label>)}</div></section>
      <section className="rounded-3xl bg-white p-6 text-black sm:p-8"><h2 className="text-2xl font-black">Appointment details</h2><p className="mt-2 text-sm text-zinc-600">A requested date and time are not confirmed until our office responds.</p><div className="mt-6 grid gap-4 sm:grid-cols-2"><input required name="firstName" placeholder="First name" className="rounded-xl border border-zinc-300 px-4 py-3" /><input required name="lastName" placeholder="Last name" className="rounded-xl border border-zinc-300 px-4 py-3" /><input required type="email" name="email" placeholder="Email" className="rounded-xl border border-zinc-300 px-4 py-3" /><input required type="tel" name="phone" placeholder="Mobile number" className="rounded-xl border border-zinc-300 px-4 py-3" /><input required name="address" placeholder="Property address" className="rounded-xl border border-zinc-300 px-4 py-3 sm:col-span-2" /><input name="squareFootage" placeholder="Approx. square footage" className="rounded-xl border border-zinc-300 px-4 py-3" /><select name="propertyStatus" className="rounded-xl border border-zinc-300 px-4 py-3"><option>Vacant</option><option>Occupied</option></select><input type="date" name="preferredDate" className="rounded-xl border border-zinc-300 px-4 py-3" /><input type="time" name="preferredTime" className="rounded-xl border border-zinc-300 px-4 py-3" /><select name="accessMethod" className="rounded-xl border border-zinc-300 px-4 py-3"><option>Lockbox</option><option>Supra</option><option>Agent will meet</option><option>Other</option></select><input name="accessCode" placeholder="Access / lockbox code" className="rounded-xl border border-zinc-300 px-4 py-3" /><textarea name="notes" placeholder="Anything we should know?" className="min-h-28 rounded-xl border border-zinc-300 px-4 py-3 sm:col-span-2" /></div></section>
      <section className="sticky bottom-4 rounded-3xl border border-teal-300/30 bg-zinc-900/95 p-5 shadow-2xl backdrop-blur sm:flex sm:items-center sm:justify-between"><div><p className="text-sm text-zinc-400">Estimated order total</p><p className="text-3xl font-black">{selected?.price === null && selected ? "Custom quote" : "$" + total.toFixed(2)}</p></div><button disabled={!selected || result === "sending"} className="mt-4 w-full rounded-xl bg-teal-300 px-7 py-4 font-black text-black disabled:opacity-40 sm:mt-0 sm:w-auto">{result === "sending" ? "Sending…" : "Request appointment"}</button></section>
      {result === "error" && <p className="rounded-xl bg-red-500/20 p-4 font-medium text-red-100">We couldn’t submit the request. Please call 281-356-0965 so we can get you scheduled immediately.</p>}
    </form>
  </main></Layout>;
}
