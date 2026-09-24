import * as React from "react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot } from "firebase/firestore";
import {
  startOfWeek,
  isWithinInterval,
  differenceInHours,
  subDays,
  isAfter,
  addHours,
  setHours,
  addDays,
} from "date-fns";
import {
  appointmentRevenue,
  centralNoonDate,
  chicagoDateKey,
  getAssignedNames,
  isScheduledRecord,
  scheduleRecordDate,
  staffDisplayName,
  toDate,
} from "@/lib/scheduleRecords";
import { useAuth } from "@/contexts/AuthContext";

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
  activeShooterCount: number;
  activeShooterNames: string[];
  topClientRev: [string, { rev: number; vol: number; last: Date }] | null;
  topClientVol: [string, { rev: number; vol: number; last: Date }] | null;
  topTeamRev: [string, { rev: number; vol: number; last: Date }] | null;
  topTeamVol: [string, { rev: number; vol: number; last: Date }] | null;
  unassignedAppointmentsThisWeek: number;
  atRiskCount: number;
}

export function useOperationsMetrics() {
  const { user } = useAuth();
  const [orderRequests, setOrderRequests] = React.useState<any[]>([]);
  const [listings, setListings] = React.useState<any[]>([]);
  const [appointments, setAppointments] = React.useState<any[]>([]);
  const [invoices, setInvoices] = React.useState<any[]>([]);
  const [staff, setStaff] = React.useState<any[]>([]);
  const [calendarEvents, setCalendarEvents] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const unsubOrders = onSnapshot(collection(db, "orderRequests"), (snap) => {
      setOrderRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.error("[useOperationsMetrics] orderRequests snapshot error:", err);
    });

    const unsubListings = onSnapshot(collection(db, "listings"), (snap) => {
      setListings(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      console.error("[useOperationsMetrics] listings snapshot error:", err);
      setLoading(false);
    });

    const unsubAppointments = onSnapshot(collection(db, "appointments"), (snap) => {
      setAppointments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.error("[useOperationsMetrics] appointments snapshot error:", err);
    });

    const unsubInvoices = onSnapshot(collection(db, "invoices"), (snap) => {
      setInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.error("[useOperationsMetrics] invoices snapshot error:", err);
    });

    const unsubStaff = onSnapshot(collection(db, "staff"), (snap) => {
      setStaff(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.error("[useOperationsMetrics] staff snapshot error:", err);
    });

    return () => { unsubOrders(); unsubListings(); unsubAppointments(); unsubInvoices(); unsubStaff(); };
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    async function loadCalendarEvents() {
      if (!user?.getIdToken) return;
      const todayKey = chicagoDateKey(new Date());
      const weekStart = startOfWeek(centralNoonDate(todayKey), { weekStartsOn: 1 });
      const weekEnd = addDays(weekStart, 7);
      const defaultCalendars = [
        { id: "mike@iconicimagestx.com", name: "Mike Luna" },
        { id: "armando@iconicimagestx.com", name: "Armando" },
        { id: "pedro@iconicimagestx.com", name: "Pedro" },
        { id: "steven@iconicimagestx.com", name: "Steven" },
        { id: "cadi@iconicimagestx.com", name: "Cadi" },
        { id: "daniel@iconicimagestx.com", name: "Daniel" },
      ];
      const staffCalendars = staff
        .map((person) => ({
          id: person.googleCalendarId || person.calendarId || person.calendarEmail || person.email,
          name: staffDisplayName(person) || person.email,
        }))
        .filter((item) => item.id);
      const calendars = Array.from(
        new Map(defaultCalendars.concat(staffCalendars).map((item) => [item.id.toLowerCase(), item])).values()
      );

      try {
        const token = await user.getIdToken();
        const response = await fetch("/api/calendar/schedule", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            calendars,
            timeMin: weekStart.toISOString(),
            timeMax: weekEnd.toISOString(),
          }),
        });
        if (!response.ok) throw new Error(await response.text());
        const data = await response.json();
        if (!cancelled) setCalendarEvents(Array.isArray(data.events) ? data.events : []);
      } catch (error) {
        console.warn("[useOperationsMetrics] Google Calendar sync unavailable:", error);
        if (!cancelled) setCalendarEvents([]);
      }
    }

    loadCalendarEvents();
    return () => { cancelled = true; };
  }, [staff, user]);

  const metrics = React.useMemo(() => {
    if (loading) return null;

    const now = new Date();
    const todayKey = chicagoDateKey(now);
    const weekStart = startOfWeek(centralNoonDate(todayKey), { weekStartsOn: 1 }); // Monday in Iconic's Central work week
    const weekKeys = new Set(Array.from({ length: 7 }, (_, i) => chicagoDateKey(addDays(weekStart, i))));
    const monthKey = todayKey.slice(0, 7);

    const getApptDate = (item: any) => {
      return scheduleRecordDate(item);
    };

    const getCreatedAt = (item: any) => {
      const d = item.createdAt || item.submittedAt;
      if (!d) return null;
      if (d.toDate) return d.toDate();
      return new Date(d);
    };

    const isToday = (d: Date | null) => d && chicagoDateKey(d) === chicagoDateKey(now);
    const isThisWeek = (d: Date | null) => d && weekKeys.has(chicagoDateKey(d));
    const isThisMonth = (d: Date | null) => d && chicagoDateKey(d).slice(0, 7) === monthKey;

    const isActiveScheduledStatus = (item: any) => isScheduledRecord(item);

    const uniqueItems = listings.concat(
      orderRequests.filter(or => !listings.some(l => l.orderRequestId === or.id))
    );

    const visibleAppointments = appointments.filter(isScheduledRecord);
    const appointmentKeys = new Set(visibleAppointments.flatMap(scheduleRecordKeys));
    const scheduledFallbackItems = uniqueItems.filter((item) => {
      if (!isScheduledRecord(item)) return false;
      return !scheduleRecordKeys(item).some((key) => appointmentKeys.has(key));
    });
    const appointmentItems = visibleAppointments.concat(scheduledFallbackItems);

    const scheduledToday = appointmentItems.filter(i => isToday(getApptDate(i)));
    const scheduledWeek = appointmentItems.filter(i => isThisWeek(getApptDate(i)));
    const scheduledMonth = appointmentItems.filter(i => isThisMonth(getApptDate(i)));
    const calendarWeekEvents = calendarEvents
      .map(normalizeCalendarMetricEvent)
      .filter((event): event is any => Boolean(event) && isThisWeek(getApptDate(event)));

    const revToday = scheduledToday.reduce((s, i) => s + appointmentRevenue(i), 0);
    const revWeek = scheduledWeek.reduce((s, i) => s + appointmentRevenue(i), 0);
    const revMonth = scheduledMonth.reduce((s, i) => s + appointmentRevenue(i), 0);
    const revProjected = appointmentItems.filter(i => {
      const d = getApptDate(i);
      return d && chicagoDateKey(d) >= todayKey && !["paid", "delivered_paid"].includes((i.status || "").toLowerCase());
    }).reduce((s, i) => s + appointmentRevenue(i), 0);

    const shooters: Record<string, number> = {};
    let unassignedAppointmentsThisWeek = 0;
    const matchedCalendarIds = new Set<string>();
    scheduledWeek.forEach(i => {
      const calendarMatch = calendarWeekEvents.find((event) => !matchedCalendarIds.has(event.id) && matchesCalendarMetricEvent(i, event));
      if (calendarMatch) matchedCalendarIds.add(calendarMatch.id);
      const names = getAssignedNames(i, staff);
      const resolvedNames = names.length > 0 ? names : (calendarMatch?.photographerName ? [calendarMatch.photographerName] : []);
      if (resolvedNames.length === 0) unassignedAppointmentsThisWeek += 1;
      resolvedNames.forEach((name) => {
        shooters[name] = (shooters[name] || 0) + 1;
      });
    });
    calendarWeekEvents.forEach((event) => {
      if (matchedCalendarIds.has(event.id) || !event.photographerName) return;
      shooters[event.photographerName] = (shooters[event.photographerName] || 0) + 1;
    });

    const notScheduledCount = orderRequests.filter(or => {
      const s = (or.status || "").toLowerCase();
      return ["new", "needs_scheduled", "unscheduled", "request"].includes(s) && !or.appointmentDate;
    }).length;

    const urgentRequestsCount = orderRequests.filter(or => {
      const status = String(or.status || "").toLowerCase();
      if (["confirmed", "cancelled", "archived", "declined"].includes(status)) return false;
      const d = getApptDate(or);
      return d && d >= now && differenceInHours(d, now) <= 24;
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

    const revenueAppointments = appointmentItems.filter((item) => appointmentRevenue(item) > 0);

    const clientData: Record<string, { rev: number; vol: number; last: Date }> = {};
    revenueAppointments.forEach(i => {
      const name = i.clientName || i.customerName || "Unknown";
      if (name === "Unknown") return;
      const date = getApptDate(i) || getCreatedAt(i) || new Date(0);
      if (!clientData[name]) clientData[name] = { rev: 0, vol: 0, last: date };
      clientData[name].rev += appointmentRevenue(i);
      clientData[name].vol += 1;
      if (isAfter(date, clientData[name].last)) clientData[name].last = date;
    });

    const teamData: Record<string, { rev: number; vol: number; last: Date }> = {};
    revenueAppointments.forEach(i => {
      const calendarMatch = calendarWeekEvents.find((event) => matchesCalendarMetricEvent(i, event));
      const names = getAssignedNames(i, staff);
      const resolvedNames = names.length > 0 ? names : (calendarMatch?.photographerName ? [calendarMatch.photographerName] : []);
      const date = getApptDate(i) || getCreatedAt(i) || new Date(0);
      const revenue = appointmentRevenue(i);
      resolvedNames.forEach((name) => {
        if (!teamData[name]) teamData[name] = { rev: 0, vol: 0, last: date };
        teamData[name].rev += revenue;
        teamData[name].vol += 1;
        if (isAfter(date, teamData[name].last)) teamData[name].last = date;
      });
    });

    const topClientRev = Object.entries(clientData).sort((a, b) => b[1].rev - a[1].rev)[0] as [string, { rev: number; vol: number; last: Date }] | undefined;
    const topClientVol = Object.entries(clientData).sort((a, b) => b[1].vol - a[1].vol)[0] as [string, { rev: number; vol: number; last: Date }] | undefined;
    const topTeamRev = Object.entries(teamData).sort((a, b) => b[1].rev - a[1].rev)[0] as [string, { rev: number; vol: number; last: Date }] | undefined;
    const topTeamVol = Object.entries(teamData).sort((a, b) => b[1].vol - a[1].vol)[0] as [string, { rev: number; vol: number; last: Date }] | undefined;
    const atRiskCount = Object.values(clientData).filter(c => differenceInHours(now, c.last) > 24 * 30).length;

    const orderRequestsFiltered = orderRequests.filter(r => ["new", "needs_scheduled", "unscheduled", "request"].includes((r.status||"").toLowerCase()));
    
    const activeAppointmentsCount = appointmentItems.filter(l => {
        const d = getApptDate(l);
        if (!d) return false;
        return chicagoDateKey(d) >= todayKey;
    }).length;

    const listingsInProgressCount = listings.filter(l => ["in_progress", "delivered"].includes((l.status || "").toLowerCase())).length;
    
    const paidRevenue = invoices.reduce((sum, invoice: any) => (
      sum + (Number(invoice.total) || Number(invoice.amountDue) + Number(invoice.amountPaid) || 0)
    ), 0);

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
      activeShooterCount: Object.keys(shooters).length,
      activeShooterNames: Object.keys(shooters),
      topClientRev: topClientRev || null,
      topClientVol: topClientVol || null,
      topTeamRev: topTeamRev || null,
      topTeamVol: topTeamVol || null,
      unassignedAppointmentsThisWeek,
      atRiskCount,
    };
  }, [loading, orderRequests, listings, appointments, invoices, staff, calendarEvents]);

  return { metrics, loading };
}

function normalizeCalendarMetricEvent(event: any) {
  const start = toDate(event.start);
  if (!start) return null;
  const summaryParts = String(event.summary || "").split(/\s+[—-]\s+/).map((part) => part.trim()).filter(Boolean);
  return {
    id: `google-${event.calendarId}-${event.id}`,
    clientName: summaryParts[0] || "",
    address: event.location || summaryParts[1] || "",
    appointmentDate: start,
    appointmentTime: start.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/Chicago",
    }),
    photographerName: event.photographerName,
  };
}

function matchesCalendarMetricEvent(local: any, event: any) {
  const localDate = toDate(local.scheduledDate || local.appointmentDate || local.apptDate);
  const eventDate = toDate(event.appointmentDate);
  if (!localDate || !eventDate) return false;
  if (chicagoDateKey(localDate) !== chicagoDateKey(eventDate)) return false;
  if (normalizeMetricTime(local.scheduledTime || local.appointmentTime || local.apptTime) !== normalizeMetricTime(event.appointmentTime)) return false;

  const localClient = String(local.clientName || local.customerName || "").toLowerCase();
  const localAddress = String(local.addressLabel || local.address || local.shootLocation || "").toLowerCase();
  const eventClient = String(event.clientName || "").toLowerCase();
  const eventAddress = String(event.address || "").toLowerCase();
  return tokenMetricOverlap(localClient, eventClient) || tokenMetricOverlap(localAddress, eventAddress);
}

function normalizeMetricTime(value: any) {
  if (!value) return "";
  const date = new Date(`2026-01-01 ${value}`);
  if (Number.isNaN(date.getTime())) return String(value).trim().toLowerCase();
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}

function tokenMetricOverlap(a: string, b: string) {
  const tokensA = new Set(String(a || "").toLowerCase().match(/[a-z0-9]+/g) || []);
  const tokensB = new Set(String(b || "").toLowerCase().match(/[a-z0-9]+/g) || []);
  return Array.from(tokensA).some((token) => token.length > 2 && tokensB.has(token));
}

function scheduleRecordKeys(record: any) {
  return [
    record.id,
    record.orderRequestId,
    record.orderId,
    record.convertedToOrderId,
    record.listingId,
  ].filter(Boolean).map(String);
}
