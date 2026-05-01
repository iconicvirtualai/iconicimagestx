import * as React from "react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot } from "firebase/firestore";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  isSameDay,
  isWithinInterval,
  parseISO,
  differenceInHours,
  subDays,
  isAfter,
  addHours,
  setHours,
} from "date-fns";

export interface OperationMetrics {
  orderRequestsCount: number;
  activeAppointmentsCount: number;
  listingsInProgressCount: number;
  paidRevenue: number;
  revToday: number;
  revWeek: number;
  revMonth: number;
  revProjected: number;
  scheduledToday: any[];
  scheduledWeek: any[];
  notScheduledCount: number;
  urgentRequestsCount: number;
  overdueDeliveriesCount: number;
  missingUploadsCount: number;
  reschedulesCount: number;
  cancellationsCount: number;
  noShowsCount: number;
  shooters: Record<string, number>;
  topClientRev: [string, { rev: number; vol: number; last: Date }] | null;
  topClientVol: [string, { rev: number; vol: number; last: Date }] | null;
  atRiskCount: number;
}

export function useOperationsMetrics() {
  const [orderRequests, setOrderRequests] = React.useState<any[]>([]);
  const [listings, setListings] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const unsubOrders = onSnapshot(collection(db, "orderRequests"), (snap) => {
      setOrderRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubListings = onSnapshot(collection(db, "listings"), (snap) => {
      setListings(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    return () => { unsubOrders(); unsubListings(); };
  }, []);

  const metrics = React.useMemo(() => {
    if (loading) return null;

    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
    const monthStart = startOfMonth(now);

    const getApptDate = (item: any) => {
      const d = item.appointmentDate || item.apptDate || item.scheduledDate;
      if (!d) return null;
      if (d.toDate) return d.toDate();
      if (typeof d === "string") {
        if (d.includes("T")) return parseISO(d);
        return parseISO(`${d}T12:00:00`);
      }
      return new Date(d);
    };

    const getCreatedAt = (item: any) => {
      const d = item.createdAt || item.submittedAt;
      if (!d) return null;
      if (d.toDate) return d.toDate();
      return new Date(d);
    };

    const isToday = (d: Date | null) => d && isSameDay(d, now);
    const isThisWeek = (d: Date | null) => d && isWithinInterval(d, { start: weekStart, end: weekEnd });
    const isThisMonth = (d: Date | null) => d && isAfter(d, monthStart);

    const uniqueItems = listings.concat(
      orderRequests.filter(or => !listings.some(l => l.orderRequestId === or.id))
    );

    const scheduledToday = uniqueItems.filter(i => isToday(getApptDate(i)));
    const scheduledWeek = uniqueItems.filter(i => isThisWeek(getApptDate(i)));
    const scheduledMonth = uniqueItems.filter(i => isThisMonth(getApptDate(i)));

    const revToday = scheduledToday.reduce((s, i) => s + (Number(i.total) || 0), 0);
    const revWeek = scheduledWeek.reduce((s, i) => s + (Number(i.total) || 0), 0);
    const revMonth = scheduledMonth.reduce((s, i) => s + (Number(i.total) || 0), 0);
    const revProjected = uniqueItems.filter(i => {
      const d = getApptDate(i);
      return d && isAfter(d, now) && !["paid", "delivered_paid"].includes((i.status || "").toLowerCase());
    }).reduce((s, i) => s + (Number(i.total) || 0), 0);

    const shooters: Record<string, number> = {};
    scheduledToday.forEach(i => {
      const names = i.photographerNames || (i.assignedProviders || []).map((p: any) => p.name) || [];
      if (Array.isArray(names)) {
        names.forEach((n: string) => shooters[n] = (shooters[n] || 0) + 1);
      } else if (typeof names === "string") {
        shooters[names] = (shooters[names] || 0) + 1;
      }
    });

    const notScheduledCount = orderRequests.filter(or => {
      const s = (or.status || "").toLowerCase();
      return ["new", "needs_scheduled", "unscheduled", "request"].includes(s) && !or.appointmentDate;
    }).length;

    const urgentRequestsCount = orderRequests.filter(or => {
      const d = getApptDate(or) || getCreatedAt(or);
      return d && Math.abs(differenceInHours(d, now)) <= 24;
    }).length;

    const overdueDeliveriesCount = listings.filter(l => {
      const appt = getApptDate(l);
      if (!appt || isAfter(appt, now)) return false;
      const status = (l.status || "").toLowerCase();
      if (["delivered", "paid", "delivered_paid"].includes(status)) return false;
      const cutoff = setHours(addHours(appt, 24), 10);
      return isAfter(now, cutoff);
    }).length;

    const missingUploadsCount = listings.filter(l => {
      const status = (l.status || "").toLowerCase();
      return (status === "in_progress" || status === "delivered_unpaid") && (!l.images || l.images.length === 0);
    }).length;

    const last7Days = { start: subDays(now, 7), end: now };
    const stabilityItems = uniqueItems.filter(i => {
      const d = getApptDate(i) || getCreatedAt(i);
      return d && isWithinInterval(d, last7Days);
    });
    const reschedulesCount = stabilityItems.filter(i => (i.status || "").toLowerCase().includes("rescheduled")).length;
    const cancellationsCount = stabilityItems.filter(i => (i.status || "").toLowerCase() === "cancelled").length;
    const noShowsCount = stabilityItems.filter(i => (i.status || "").toLowerCase() === "no_show").length;

    const clientData: Record<string, { rev: number; vol: number; last: Date }> = {};
    uniqueItems.forEach(i => {
      const name = i.clientName || i.customerName || "Unknown";
      const date = getApptDate(i) || getCreatedAt(i) || new Date(0);
      if (!clientData[name]) clientData[name] = { rev: 0, vol: 0, last: date };
      clientData[name].rev += (Number(i.total) || 0);
      clientData[name].vol += 1;
      if (isAfter(date, clientData[name].last)) clientData[name].last = date;
    });

    const topClientRev = Object.entries(clientData).sort((a, b) => b[1].rev - a[1].rev)[0] as [string, { rev: number; vol: number; last: Date }] | undefined;
    const topClientVol = Object.entries(clientData).sort((a, b) => b[1].vol - a[1].vol)[0] as [string, { rev: number; vol: number; last: Date }] | undefined;
    const atRiskCount = Object.values(clientData).filter(c => differenceInHours(now, c.last) > 24 * 30).length;

    const orderRequestsFiltered = orderRequests.filter(r => ["new", "needs_scheduled", "unscheduled", "request"].includes((r.status||"").toLowerCase()));
    
    const activeAppointmentsCount = listings.filter(l => {
        const s = (l.status || "").toLowerCase().replace(/\s+/g, "_");
        if (!["scheduled", "appt_scheduled", "consult_scheduled"].includes(s)) return false;
        const d = getApptDate(l);
        if (!d) return false;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return d >= today;
    }).length;

    const listingsInProgressCount = listings.filter(l => ["in_progress", "delivered"].includes((l.status || "").toLowerCase())).length;
    
    const paidRevenue = listings.filter(l => {
      const s = (l.status || "").toLowerCase();
      return s === "paid" || s === "delivered_paid";
    }).reduce((s, l) => s + (Number(l.total) || 0), 0);

    return {
      orderRequestsCount: orderRequestsFiltered.length,
      activeAppointmentsCount,
      listingsInProgressCount,
      paidRevenue,
      revToday,
      revWeek,
      revMonth,
      revProjected,
      scheduledToday,
      scheduledWeek,
      notScheduledCount,
      urgentRequestsCount,
      overdueDeliveriesCount,
      missingUploadsCount,
      reschedulesCount,
      cancellationsCount,
      noShowsCount,
      shooters,
      topClientRev: topClientRev || null,
      topClientVol: topClientVol || null,
      atRiskCount,
    };
  }, [loading, orderRequests, listings]);

  return { metrics, loading };
}
