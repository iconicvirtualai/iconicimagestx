/**
 * Dev-only screenshot page for the Orders desk.
 * The rows are sample orders, not live Firestore, and this route is omitted
 * from production builds.
 */

import * as React from "react";
import { AdminOrdersBrowser } from "@/components/admin/AdminOrdersBrowser";
import { visualDeskOrders, visualDeskStaff } from "./ordersDeskVisualSeed";

const NOW = new Date("2026-11-24T18:00:00.000Z");

export function ordersDeskFixtureOrders(): Record<string, unknown>[] {
  const seeded = visualDeskOrders().map((order) => {
    const number = Number(String(order.orderNumber ?? "").replace(/\D/g, "")) || 0;
    const createdAt = new Date(Date.UTC(2026, 10, 1, 12, 0, 0) + number * 60_000).toISOString();
    return { ...order, createdAt };
  });
  const duplicateCopies = [1, 2].map((copy) => ({
    id: `twin-220-${copy}`,
    orderNumber: 220,
    status: "request",
    clientName: "Lena Ortiz",
    email: "lena.ortiz@example.com",
    address: "14 Heron Lakes Ct, The Woodlands, TX 77380",
    projectType: "real_estate",
    createdAt: `2024-03-0${copy}T15:00:00.000Z`,
    selectedService: "The Essentials",
  }));
  const oldRequests = [3, 4, 5].map((day) => ({
    id: `old-request-${day}`,
    orderNumber: 300 + day,
    status: "request",
    clientName: `Old Request ${day}`,
    email: `old.request.${day}@example.com`,
    address: `${day} Old Request Ln, Conroe, TX 77301`,
    projectType: "real_estate",
    createdAt: `2024-06-${String(day).padStart(2, "0")}T15:00:00.000Z`,
    selectedService: "The Essentials",
  }));
  const bookedWithoutGallery = [1, 2, 3, 4].map((day) => ({
    id: `sched-nogallery-${day}`,
    orderNumber: 400 + day,
    status: "scheduled",
    clientName: `Booked Shoot ${day}`,
    email: `booked.${day}@example.com`,
    address: `${day} Booked St, Spring, TX 77380`,
    appointmentDate: "2026-08-01",
    appointmentTime: "10:00 AM",
    assignedPhotographerName: "Mike Luna",
    projectType: "real_estate",
    createdAt: `2026-08-0${day}T15:00:00.000Z`,
    selectedService: "Hollywood",
  }));
  const deliveredWithoutPhotographer = [1, 2, 3].map((day) => ({
    id: `delivered-nophoto-${day}`,
    orderNumber: 500 + day,
    status: "delivered",
    clientName: `Delivered ${day}`,
    email: `delivered.${day}@example.com`,
    address: `${day} Done Ave, Houston, TX 77002`,
    appointmentDate: "2025-05-01",
    appointmentTime: "1:00 PM",
    galleryStatus: "delivered",
    projectType: "real_estate",
    createdAt: `2025-05-0${day}T15:00:00.000Z`,
    selectedService: "The Essentials",
    invoice: { status: "paid", amountPaid: 199, total: 199, paidAt: "2025-05-02T15:00:00.000Z" },
  }));
  return [
    ...seeded,
    ...duplicateCopies,
    ...oldRequests,
    ...bookedWithoutGallery,
    ...deliveredWithoutPhotographer,
    {
      id: "AbCdEfGhIjKlMnOpQrStUv",
      orderCode: "ORD - L - 104829",
      status: "new",
      clientName: "Sam Rivera",
      email: "sam.rivera@example.com",
      address: "1 Sample Creek Dr, The Woodlands, TX 77380",
      projectType: "real_estate",
      createdAt: "2026-11-20T18:00:00.000Z",
      selectedService: "The Essentials",
      total: 199,
      brokerage: "Creek & Co.",
      aryeoOrderNumber: "ARY-10482",
    },
    {
      id: "play-row",
      orderNumber: 899,
      status: "new",
      playtest: true,
      clientName: "Playtest Row",
      email: "playtest.row@example.com",
      address: "9 Playtest Rd, Conroe, TX 77301",
      projectType: "real_estate",
      createdAt: "2026-11-21T18:00:00.000Z",
      selectedService: "The Essentials",
    },
  ];
}

export default function AdminOrdersDeskFixture() {
  const [selection, setSelection] = React.useState<Set<string>>(new Set());
  const orders = React.useMemo(() => ordersDeskFixtureOrders(), []);
  const staff = React.useMemo(() => visualDeskStaff(), []);
  return (
    <div className="min-h-screen bg-[#f4f6f5] text-[#1a1d1c]">
      <p data-testid="orders-fixture-banner" className="bg-amber-100 px-4 py-2 text-center text-xs font-bold text-amber-950">
        Sample orders for layout review. Not live Firestore.
      </p>
      <div className="lg:pl-60">
        <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-gray-800 bg-[#0a0a0a] text-white lg:flex">
          <div className="border-b border-gray-800 p-5">
            <span className="block text-xs font-black uppercase tracking-widest">Iconic</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Ops Portal</span>
          </div>
          <p className="px-5 py-4 text-xs font-bold uppercase tracking-widest text-[#5eead4]">Orders</p>
        </aside>
        <AdminOrdersBrowser
          orders={orders}
          staff={staff}
          selection={selection}
          storageKey="adminOrdersView:fixture"
          now={NOW}
          onToggleSelect={(id) => {
            setSelection((prev) => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            });
          }}
          onSelectIds={() => undefined}
          onStudioChange={() => undefined}
        />
      </div>
    </div>
  );
}
