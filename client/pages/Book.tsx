import { FormEvent, useMemo, useState } from "react";
import Layout from "@/components/Layout";

type Item = { id: string; name: string; price: number | null; detail: string };

const mainOptions: Item[] = [
  { id: "hollywood", name: "Hollywood", price: 199, detail: "30 daytime photos + branded listing website" },
  { id: "hall-of-fame", name: "Hall of Fame", price: 299, detail: "Hollywood package + aerials + 5 additional photos" },
  { id: "red-carpet", name: "Red Carpet", price: 499, detail: "45 photos, 5 aerials, reel, and amenities" },
  { id: "luxe", name: "Luxe", price: null, detail: "50 photos, 5 aerials, plus full listing video or 3D tour" },
  { id: "photo-0-2", name: "Photography only — up to 2,000 sq ft", price: 175, detail: "Unlimited photos" },
  { id: "photo-2-3", name: "Photography only — 2,001–3,000 sq ft", price: 200, detail: "Unlimited photos" },
  { id: "photo-3-4", name: "Photography only — 3,001–4,000 sq ft", price: 225, detail: "Unlimited photos" },
  { id: "photo-4-5", name: "Photography only — 4,001–5,000 sq ft", price: 275, detail: "Unlimited photos" },
];

const addOns: Item[] = [
  { id: "grass", name: "Grass replacement", price: 12, detail: "Per image" },
  { id: "aerial-video", name: "Aerial video upgrade", price: 125, detail: "Cinematic drone video" },
  { id: "twilight-one", name: "Twilight conversion", price: 25, detail: "One image" },
  { id: "twilight-five", name: "Five twilight conversions", price: 75, detail: "Five-image package" },
  { id: "floorplan", name: "2D floorplan", price: 150, detail: "Standalone floorplan" },
];

export default function BookPage() {
  const [selected, setSelected] = useState("");
  const [extras, setExtras] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const selectedItem = mainOptions.find((item) => item.id === selected);
  const selectedExtras = addOns.filter((item) => extras.includes(item.id));
  const total = useMemo(() => (selectedItem?.price ?? 0) + selectedExtras.reduce((sum, item) => sum + (item.price ?? 0), 0), [selectedItem, selectedExtras]);

  const toggleExtra = (id: string) => setExtras((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedItem) return;
    setStatus("sending");
    const form = new FormData(event.currentTarget);
    const lineItems = [
      { name: selectedItem.name, price: selectedItem.price ?? 0, detail: selectedItem.detail },
      ...selectedExtras.map((item) => ({ name: item.name, price: item.price ?? 0, detail: item.detail })),
    ];
    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.get("firstName"), lastName: form.get("lastName"), email: form.get("email"),
          phone: form.get("phone"), address: form.get("address"), squareFootage: form.get("squareFootage"),
          scheduledDate: form.get("preferredDate") || null, scheduledTime: form.get("preferredTime") || null,
          accessMethod: form.get("accessMethod"), lockboxCode: form.get("accessCode"),
          propertyStatus: form.get("propertyStatus"), furnishingStatus: "Not specified", vibeNote: form.get("notes"),
          lineItems, total, pricing: { subtotal: total, total, needsQuote: selectedItem.price === null },
          source: "iconic-booking-bridge",
        }),
      });
      if (!response.ok) throw new Error("Unable to submit");
      setStatus("success");
    } catch { setStatus("error"); }
  }

  if (status === "success") return <Layout><main className="min-h-screen bg-zinc-50 p-8"><div className="mx-auto max-w-xl rounded-3xl bg-white p-10 text-center shadow-sm"><h1 className="text-3xl font-black">Request received.</h1><p className="mt-3 text-zinc-600">Our office will confirm your appointment shortly.</p><button className="mt-6 rounded-xl bg-black px-5 py-3 font-bold text-white" onClick={() => setStatus("idle")}>Submit another request</button></div></main></Layout>;

  return (
    <Layout>
      <main className="min-h-screen bg-zinc-50 py-10 sm:py-16">
        <div className="mx-auto max-w-4xl px-4">
          <header className="mb-8 rounded-3xl bg-black px-6 py-8 text-white sm:px-10"><p className="mb-2 text-xs font-bold uppercase tracking-[0.22em] text-teal-300">Iconic Images</p><h1 className="text-3xl font-black sm:text-5xl">Request your media appointment.</h1><p className="mt-3 text-zinc-300">Choose your package and preferred time. We’ll confirm availability shortly.</p></header>
          <form onSubmit={submit} className="space-y-6">
            <section className="rounded-3xl bg-white p-6 shadow-sm sm:p-8"><h2 className="text-xl font-black">1. Choose a service</h2><div className="mt-5 grid gap-3 sm:grid-cols-2">{mainOptions.map((item) => <label key={item.id} className={"cursor-pointer rounded-2xl border p-4 transition " + (selected === item.id ? "border-black bg-zinc-950 text-white" : "border-zinc-200 hover:border-zinc-500")}><input className="sr-only" type="radio" name="package" checked={selected === item.id} onChange={() => setSelected(item.id)} /><span className="block font-black">{item.name}</span><span className={"mt-1 block text-sm " + (selected === item.id ? "text-zinc-300" : "text-zinc-600")}>{item.detail}</span><span className={"mt-3 block font-bold " + (selected === item.id ? "text-teal-300" : "text-zinc-950")}>{item.price === null ? "Custom quote" : "$" + item.price}</span></label>)}</div></section>
            <section className="rounded-3xl bg-white p-6 shadow-sm sm:p-8"><h2 className="text-xl font-black">2. Add-ons</h2><div className="mt-5 grid gap-3 sm:grid-cols-2">{addOns.map((item) => <label key={item.id} className="flex cursor-pointer gap-3 rounded-2xl border border-zinc-200 p-4 hover:border-zinc-500"><input type="checkbox" checked={extras.includes(item.id)} onChange={() => toggleExtra(item.id)} className="mt-1 h-4 w-4 accent-black" /><span><span className="block font-bold">{item.name}</span><span className="block text-sm text-zinc-600">{item.detail + " · $" + item.price}</span></span></label>)}</div></section>
            <section className="rounded-3xl bg-white p-6 shadow-sm sm:p-8"><h2 className="text-xl font-black">3. Property and contact details</h2><div className="mt-5 grid gap-4 sm:grid-cols-2"><input required name="firstName" placeholder="First name" className="rounded-xl border border-zinc-300 px-4 py-3" /><input required name="lastName" placeholder="Last name" className="rounded-xl border border-zinc-300 px-4 py-3" /><input required type="email" name="email" placeholder="Email" className="rounded-xl border border-zinc-300 px-4 py-3" /><input required type="tel" name="phone" placeholder="Mobile number" className="rounded-xl border border-zinc-300 px-4 py-3" /><input required name="address" placeholder="Property address" className="rounded-xl border border-zinc-300 px-4 py-3 sm:col-span-2" /><input name="squareFootage" placeholder="Approx. square footage" className="rounded-xl border border-zinc-300 px-4 py-3" /><select name="propertyStatus" className="rounded-xl border border-zinc-300 px-4 py-3"><option>Vacant</option><option>Occupied</option></select><input type="date" name="preferredDate" className="rounded-xl border border-zinc-300 px-4 py-3" /><input type="time" name="preferredTime" className="rounded-xl border border-zinc-300 px-4 py-3" /><select name="accessMethod" className="rounded-xl border border-zinc-300 px-4 py-3"><option>Lockbox</option><option>Supra</option><option>Agent will meet</option><option>Other</option></select><input name="accessCode" placeholder="Access / lockbox code" className="rounded-xl border border-zinc-300 px-4 py-3" /><textarea name="notes" placeholder="Anything we should know?" className="min-h-28 rounded-xl border border-zinc-300 px-4 py-3 sm:col-span-2" /></div></section>
            <section className="sticky bottom-4 rounded-3xl bg-zinc-950 p-5 text-white shadow-2xl sm:flex sm:items-center sm:justify-between"><div><p className="text-sm text-zinc-300">Estimated order total</p><p className="text-3xl font-black">{selectedItem?.price === null && selectedItem ? "Custom quote" : "$" + total.toFixed(2)}</p></div><button disabled={!selectedItem || status === "sending"} className="mt-4 w-full rounded-xl bg-teal-300 px-6 py-4 font-black text-black disabled:opacity-40 sm:mt-0 sm:w-auto">{status === "sending" ? "Sending…" : "Submit order request"}</button></section>
            {status === "error" && <p className="rounded-xl bg-red-50 p-4 font-medium text-red-700">We couldn’t submit this request. Please call 281-356-0965 so we can get you scheduled right away.</p>}
          </form>
        </div>
      </main>
    </Layout>
  );
}
