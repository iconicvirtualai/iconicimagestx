import * as React from "react";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/firebase";
import { collection, onSnapshot } from "firebase/firestore";
import {
  appointmentRevenue,
  chicagoDateKey,
  getAssignedNames,
  isScheduledRecord,
  orderServices,
  scheduleRecordDate,
  staffDisplayName,
  toDate,
} from "@/lib/scheduleRecords";
import { useAuth } from "@/contexts/AuthContext";
import {
  Calendar as CalendarIcon,
  List,
  ChevronDown,
  ChevronUp,
  Clock,
  MapPin,
  User,
  FileText,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isSameDay,
  eachDayOfInterval,
  parseISO,
} from "date-fns";
import OperationsStatsGrid from "@/components/OperationsStatsGrid";
import {
  ICONIC_CALENDAR_ROSTER,
  calendarRoster,
  classifyCalendarEvent,
  countUnassignedShoots,
  dayLoadCue,
  dayOpsSummary,
  recordHasTwilight,
  scheduleBlockDateKeys,
  shooterCuesForDay,
  textHasTwilight,
  type CalendarRosterPerson,
  type ShooterCue,
} from "@shared/scheduleBoard";
import {
  ScheduleCalendarChip,
  ScheduleDayShoots,
  ScheduleDayStrip,
  TwilightLabel,
} from "@/components/schedule/ScheduleAvailability";

interface Appointment {
  id: string;
  clientName: string;
  address: string;
  apptDate: Date | null;
  apptTime: string;
  services: string[];
  total: number;
  projectType: "real_estate" | "business";
  photographerNames: string[];
  status: string;
  orderNumber?: string;
  duration?: string;
  city?: string;
  googleCalendarUrl?: string | null;
  source?: string;
  twilight: boolean;
}

interface ScheduleBlock {
  id: string;
  photographerName: string;
  dateKey: string;
  kind: "hold" | "unavailable";
}

type CalendarSync = "checking" | "live" | "partial" | "offline";

function parseDate(d: any): Date | null {
  return toDate(d);
}

function fmtCurrency(n: number): string {
  return "$" + (n || 0).toLocaleString("en-US", { minimumFractionDigits: 2 });
}

function orderLabel(appt: Appointment) {
  if (appt.source === "google-calendar") return "Calendar";
  return `#${appt.orderNumber || ""}`;
}

function visibleServices(services: string[]) {
  return services.filter((service) => !textHasTwilight(service) && !/^calendar$/i.test(service.trim()));
}

function shortPhotographerNames(names: string[]) {
  if (names.length === 0) return "Unassigned";
  return names.map((name) => name.split(" ")[0]).join(", ");
}

function isBlockOnDay(dateKey: string, day: Date) {
  return isSameDay(new Date(`${dateKey}T12:00:00-06:00`), day);
}

function syncNote(sync: CalendarSync) {
  if (sync === "checking") return "Checking team calendars.";
  if (sync === "offline") return "Team calendars offline. Availability uses Iconic bookings.";
  if (sync === "partial") return "Some team calendars did not respond.";
  return "Team calendars connected.";
}

export default function AdminSchedule() {
  const { user } = useAuth();
  const [viewMode, setViewMode] = React.useState<"calendar" | "list">("calendar");
  const [rawAppointments, setRawAppointments] = React.useState<any[]>([]);
  const [rawListings, setRawListings] = React.useState<any[]>([]);
  const [rawOrderRequests, setRawOrderRequests] = React.useState<any[]>([]);
  const [calendarEvents, setCalendarEvents] = React.useState<any[]>([]);
  const [calendarSync, setCalendarSync] = React.useState<CalendarSync>("checking");
  const [staff, setStaff] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [currentMonth, setCurrentMonth] = React.useState(new Date());
  const [selectedDay, setSelectedDay] = React.useState(new Date());
  const [collapseOverrides, setCollapseOverrides] = React.useState<Record<string, boolean>>({});
  const [selectedAppt, setSelectedAppt] = React.useState<Appointment | null>(null);

  const roster = React.useMemo(() => {
    const staffCalendars = staff.map((person) => ({
      id: person.googleCalendarId || person.calendarId || person.calendarEmail || person.email,
      name: staffDisplayName(person) || person.email,
    }));
    return calendarRoster(ICONIC_CALENDAR_ROSTER.concat(staffCalendars));
  }, [staff]);

  React.useEffect(() => {
    const ready = () => setLoading(false);
    const fail = (label: string) => (error: Error) => {
      console.warn(`[AdminSchedule] ${label} snapshot unavailable:`, error);
      ready();
    };
    const unsubAppointments = onSnapshot(collection(db, "appointments"), (snap) => {
      setRawAppointments(snap.docs.map(doc => ({ id: doc.id, source: "appointment", ...doc.data() })));
      ready();
    }, fail("appointments"));
    const unsubListings = onSnapshot(collection(db, "listings"), (snap) => {
      setRawListings(snap.docs.map(doc => ({ id: doc.id, source: "listing", ...doc.data() })));
    }, fail("listings"));
    const unsubOrderRequests = onSnapshot(collection(db, "orderRequests"), (snap) => {
      setRawOrderRequests(snap.docs.map(doc => ({ id: doc.id, source: "order-request", ...doc.data() })));
      ready();
    }, fail("order requests"));
    const unsubStaff = onSnapshot(collection(db, "staff"), (snap) => {
      setStaff(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      ready();
    }, fail("staff"));

    return () => { unsubAppointments(); unsubListings(); unsubOrderRequests(); unsubStaff(); };
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    async function loadCalendarEvents() {
      if (!user?.getIdToken) {
        if (!cancelled) {
          setCalendarEvents([]);
          setCalendarSync("offline");
        }
        return;
      }
      const startDate = startOfWeek(startOfMonth(currentMonth));
      const endDate = endOfWeek(endOfMonth(currentMonth));
      setCalendarSync("checking");

      try {
        const token = await user.getIdToken();
        const response = await fetch("/api/calendar/schedule", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            calendars: roster,
            timeMin: startDate.toISOString(),
            timeMax: endDate.toISOString(),
          }),
        });
        if (!response.ok) throw new Error(await response.text());
        const data = await response.json();
        const events = Array.isArray(data.events) ? data.events : [];
        if (cancelled) return;
        setCalendarEvents(events);
        const failures = Number(data.readFailures) || 0;
        if (!data.configured || (failures > 0 && events.length === 0)) setCalendarSync("offline");
        else if (failures > 0) setCalendarSync("partial");
        else setCalendarSync("live");
      } catch (error) {
        console.warn("[AdminSchedule] Google Calendar sync unavailable:", error);
        if (!cancelled) {
          setCalendarEvents([]);
          setCalendarSync("offline");
        }
      }
    }

    loadCalendarEvents();
    return () => { cancelled = true; };
  }, [currentMonth, roster, user]);

  const { appointments, blocks } = React.useMemo(() => {
    const visibleAppointments = rawAppointments.filter(isScheduledRecord);
    const appointmentKeys = new Set(visibleAppointments.flatMap(scheduleRecordKeys));
    const fallbackListings = rawListings.filter((item) => isScheduledRecord(item) && !scheduleRecordKeys(item).some((key) => appointmentKeys.has(key)));
    const listingKeys = new Set(fallbackListings.flatMap(scheduleRecordKeys));
    const fallbackOrderRequests = rawOrderRequests.filter((item) => {
      if (!isScheduledRecord(item)) return false;
      const keys = scheduleRecordKeys(item);
      return !keys.some((key) => appointmentKeys.has(key) || listingKeys.has(key));
    });
    const localAppointments = visibleAppointments.concat(fallbackListings, fallbackOrderRequests).map((record) => normalizeAppointment(record, staff));
    const parsedGoogle = calendarEvents.map(parseGoogleScheduleEvent);
    const googleAppointments = parsedGoogle.flatMap((item) => item.appointment ? [item.appointment] : []);
    const googleBlocks = parsedGoogle.flatMap((item) => item.blocks);
    const usedGoogleIds = new Set<string>();

    const data = localAppointments.map((appointment) => {
      const match = googleAppointments.find((event) => !usedGoogleIds.has(event.id) && matchesCalendarEvent(appointment, event));
      if (!match) return appointment;
      usedGoogleIds.add(match.id);
      return {
        ...appointment,
        photographerNames: appointment.photographerNames.length > 0 ? appointment.photographerNames : match.photographerNames,
        googleCalendarUrl: match.googleCalendarUrl,
        twilight: appointment.twilight || match.twilight,
      };
    }).concat(googleAppointments.filter((event) => !usedGoogleIds.has(event.id)));

    data.sort((a, b) => {
      const da = a.apptDate?.getTime() || 0;
      const db = b.apptDate?.getTime() || 0;
      if (da !== db) return da - db;
      return (a.apptTime || "").localeCompare(b.apptTime || "");
    });

    return { appointments: data, blocks: googleBlocks };
  }, [rawAppointments, rawListings, rawOrderRequests, calendarEvents, staff]);

  const todayKey = format(new Date(), "yyyy-MM-dd");

  const isDateCollapsed = React.useCallback((dateStr: string) => {
    if (dateStr in collapseOverrides) return collapseOverrides[dateStr];
    return dateStr < todayKey;
  }, [collapseOverrides, todayKey]);

  const toggleDateCollapse = (dateStr: string) => {
    setSelectedDay(parseISO(dateStr));
    setCollapseOverrides((current) => ({ ...current, [dateStr]: !isDateCollapsed(dateStr) }));
  };

  const showMonth = (nextMonth: Date, day?: Date) => {
    setCurrentMonth(nextMonth);
    setSelectedDay(day || startOfMonth(nextMonth));
  };

  const cuesForDay = React.useCallback((day: Date): ShooterCue[] => {
    const dayShoots = appointments.filter((appt) => appt.apptDate && isSameDay(appt.apptDate, day));
    const dayBlocks = blocks.filter((block) => isBlockOnDay(block.dateKey, day));
    return shooterCuesForDay({ roster, shoots: dayShoots, blocks: dayBlocks });
  }, [appointments, blocks, roster]);

  const selectedShoots = appointments.filter((appt) => appt.apptDate && isSameDay(appt.apptDate, selectedDay));
  const selectedCues = cuesForDay(selectedDay);
  const selectedSummary = dayOpsSummary({
    shootCount: selectedShoots.length,
    twilightCount: selectedShoots.filter((appt) => appt.twilight).length,
    openCount: selectedCues.filter((cue) => cue.status === "open").length,
    unassignedCount: countUnassignedShoots(selectedShoots, roster),
  });

  const monthAppointments = appointments.filter((appt) => appt.apptDate && isSameMonth(appt.apptDate, currentMonth));
  const groupedByDate = React.useMemo(() => {
    const groups: Record<string, Appointment[]> = {};
    monthAppointments.forEach((appt) => {
      if (!appt.apptDate) return;
      const key = format(appt.apptDate, "yyyy-MM-dd");
      if (!groups[key]) groups[key] = [];
      groups[key].push(appt);
    });
    return groups;
  }, [monthAppointments]);

  const sortedDateKeys = Object.keys(groupedByDate).sort((a, b) => {
    const aUpcoming = a >= todayKey;
    const bUpcoming = b >= todayKey;
    if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
    if (aUpcoming) return a.localeCompare(b);
    return b.localeCompare(a);
  });

  return (
    <AdminLayout title="Schedule">
      <div className="w-full min-w-0">
        <div className="pb-8">
          <OperationsStatsGrid />
        </div>

        <div className="mb-6 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div className="flex bg-gray-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${viewMode === "list" ? "bg-white text-black shadow-sm" : "text-gray-500 hover:text-black"}`}
            >
              <List className="w-4 h-4" /> Line Item View
            </button>
            <button
              type="button"
              onClick={() => setViewMode("calendar")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${viewMode === "calendar" ? "bg-white text-black shadow-sm" : "text-gray-500 hover:text-black"}`}
            >
              <CalendarIcon className="w-4 h-4" /> Calendar View
            </button>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2 shadow-sm">
            <button type="button" onClick={() => showMonth(subMonths(currentMonth, 1))} className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-50 hover:text-black" aria-label="Previous month">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="min-w-[140px] text-center text-sm font-black uppercase tracking-widest">
              {format(currentMonth, "MMMM yyyy")}
            </span>
            <button type="button" onClick={() => showMonth(addMonths(currentMonth, 1))} className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-50 hover:text-black" aria-label="Next month">
              <ChevronRight className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => showMonth(new Date(), new Date())}
              className="ml-1 rounded-lg px-3 py-1 text-[10px] font-black uppercase tracking-widest text-[#0d9488] hover:bg-[#0d9488]/10"
            >
              Today
            </button>
          </div>
        </div>

        <ScheduleDayStrip
          dayLabel={format(selectedDay, "EEEE, MMMM d")}
          summary={selectedSummary}
          syncNote={syncNote(calendarSync)}
          shooters={selectedCues}
        />

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-4 border-[#0d9488] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : viewMode === "list" ? (
          <div className="space-y-4">
            {sortedDateKeys.length === 0 ? (
              <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-12 text-center">
                <CalendarIcon className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">No shoots this month</p>
              </div>
            ) : (
              sortedDateKeys.map(dateStr => {
                const appts = groupedByDate[dateStr];
                const collapsed = isDateCollapsed(dateStr);
                const day = parseISO(dateStr);
                const cues = cuesForDay(day);
                const summary = dayOpsSummary({
                  shootCount: appts.length,
                  twilightCount: appts.filter((appt) => appt.twilight).length,
                  openCount: cues.filter((cue) => cue.status === "open").length,
                  unassignedCount: countUnassignedShoots(appts, roster),
                });
                return (
                  <div key={dateStr} className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                    <div
                      onClick={() => toggleDateCollapse(dateStr)}
                      className="px-6 py-5 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-50 sm:px-8"
                    >
                      <div className="flex items-center gap-4">
                        <div className="bg-[#0d9488]/10 p-2 rounded-xl">
                          <CalendarIcon className="w-5 h-5 text-[#0d9488]" />
                        </div>
                        <div>
                          <h3 className="text-sm font-black uppercase tracking-widest text-black">
                            {format(day, "EEEE, MMMM do, yyyy")}
                          </h3>
                          <p className="text-[11px] font-bold text-gray-500">
                            {summary}
                          </p>
                        </div>
                      </div>
                      {collapsed ? <ChevronDown className="w-5 h-5 text-gray-300" /> : <ChevronUp className="w-5 h-5 text-gray-300" />}
                    </div>

                    {!collapsed && (
                      <div className="divide-y divide-gray-50 bg-white">
                        {appts.map(appt => (
                          <div key={appt.id} className="p-6 hover:bg-gray-50/50 transition-colors group sm:p-8">
                            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 lg:gap-8">
                              <div className="lg:col-span-1">
                                <div className="flex flex-wrap items-center gap-2 mb-2">
                                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${appt.projectType === "business" ? "bg-black text-white" : "bg-[#0d9488] text-white"}`}>
                                    {appt.projectType === "business" ? "Business" : "Real Estate"}
                                  </span>
                                  {appt.twilight ? <TwilightLabel /> : null}
                                  <span className="text-[10px] font-mono text-gray-400">{orderLabel(appt)}</span>
                                </div>
                                <h4 className="text-lg font-black text-black mb-1">{appt.clientName}</h4>
                                <div className="flex items-center gap-2 text-sm font-bold text-[#0d9488]">
                                  <Clock className="w-3.5 h-3.5" />
                                  {appt.apptTime}
                                  {appt.duration ? <span className="text-gray-400">{appt.duration}</span> : null}
                                </div>
                              </div>

                              <div className="lg:col-span-2 space-y-4">
                                <div className="flex items-start gap-3">
                                  <MapPin className="w-4 h-4 text-gray-300 mt-0.5" />
                                  <p className="text-sm font-bold text-gray-600 leading-relaxed">{appt.address}</p>
                                </div>
                                <div className="flex items-start gap-3">
                                  <FileText className="w-4 h-4 text-gray-300 mt-0.5" />
                                  <div className="flex flex-wrap gap-1.5">
                                    {visibleServices(appt.services).map((service, index) => (
                                      <span key={`${service}-${index}`} className="text-[10px] font-bold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-lg border border-gray-200/50">
                                        {service}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </div>

                              <div className="lg:col-span-1 flex flex-col justify-between items-start lg:items-end">
                                <div className="lg:text-right">
                                  <div className="flex items-center gap-2 text-gray-400 mb-1 lg:justify-end">
                                    <User className="w-3.5 h-3.5" />
                                    <span className="text-[10px] font-black uppercase tracking-widest">Assigned</span>
                                  </div>
                                  <p className="text-sm font-bold text-black">
                                    {appt.photographerNames.join(", ") || "Unassigned"}
                                  </p>
                                </div>
                                <div className="lg:text-right mt-4">
                                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Order Total</p>
                                  <p className="text-xl font-black text-[#0d9488]">{fmtCurrency(appt.total)}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <>
            <ScheduleDayShoots
              shoots={selectedShoots.map((appt) => ({
                id: appt.id,
                time: appt.apptTime,
                clientName: appt.clientName,
                address: appt.address,
                photographers: shortPhotographerNames(appt.photographerNames),
                twilight: appt.twilight,
              }))}
              onSelect={(id) => {
                const match = selectedShoots.find((appt) => appt.id === id);
                if (match) setSelectedAppt(match);
              }}
            />
            <CalendarView
              appointments={appointments}
              blocks={blocks}
              roster={roster}
              currentMonth={currentMonth}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
              onSelectAppt={setSelectedAppt}
            />
          </>
        )}
      </div>

      {selectedAppt && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-black text-white px-8 py-6 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500 mb-1">Appointment Details</p>
                <h3 className="text-xl font-bold">{orderLabel(selectedAppt)}</h3>
              </div>
              <button type="button" onClick={() => setSelectedAppt(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors" aria-label="Close appointment">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Client</p>
                  <p className="text-lg font-black text-black">{selectedAppt.clientName}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Type</p>
                  <div className="flex flex-wrap justify-end gap-2">
                    <span className={`inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${selectedAppt.projectType === "business" ? "bg-black text-white" : "bg-[#0d9488] text-white"}`}>
                      {selectedAppt.projectType === "business" ? "Business" : "Real Estate"}
                    </span>
                    {selectedAppt.twilight ? <TwilightLabel /> : null}
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100 grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center gap-2 text-gray-400 mb-1">
                    <CalendarIcon className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Date</span>
                  </div>
                  <p className="text-sm font-bold text-black">{selectedAppt.apptDate ? format(selectedAppt.apptDate, "MMM do, yyyy") : "TBD"}</p>
                </div>
                <div>
                  <div className="flex items-center gap-2 text-gray-400 mb-1">
                    <Clock className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Time</span>
                  </div>
                  <p className="text-sm font-bold text-black">
                    {selectedAppt.apptTime}
                    {selectedAppt.duration ? ` · ${selectedAppt.duration}` : ""}
                  </p>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 text-gray-400 mb-2">
                  <MapPin className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Location</span>
                </div>
                <p className="text-sm font-bold text-gray-600 leading-relaxed">{selectedAppt.address}</p>
              </div>

              <div>
                <div className="flex items-center gap-2 text-gray-400 mb-2">
                  <FileText className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Services</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedAppt.twilight ? <TwilightLabel /> : null}
                  {visibleServices(selectedAppt.services).map((service, index) => (
                    <span key={`${service}-${index}`} className="text-[10px] font-bold bg-gray-100 text-gray-600 px-3 py-1 rounded-xl border border-gray-200">
                      {service}
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 pt-4 border-t border-gray-100">
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Assigned Photographer</p>
                  <p className="text-sm font-bold text-black">{selectedAppt.photographerNames.join(", ") || "Unassigned"}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total</p>
                  <p className="text-xl font-black text-[#0d9488]">{fmtCurrency(selectedAppt.total)}</p>
                </div>
              </div>

              {selectedAppt.googleCalendarUrl ? (
                <a href={selectedAppt.googleCalendarUrl} target="_blank" rel="noreferrer" className="inline-block text-xs font-bold text-[#0d9488] underline">
                  Open calendar event
                </a>
              ) : null}
            </div>

            <div className="px-8 pb-8 flex gap-3">
              <Button type="button" onClick={() => setSelectedAppt(null)} className="flex-1 bg-black text-white rounded-2xl h-12 font-bold uppercase tracking-widest text-xs">Close</Button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

function normalizeAppointment(record: any, staff: any[]): Appointment {
  const apptDate = scheduleRecordDate(record);
  const address = record.addressLabel || record.address || record.propertyAddress || record.shootLocation || "No address";
  const city = extractCity(address);
  const services = Array.isArray(record.services) && record.services.length > 0
    ? record.services.map((item: any) => typeof item === "string" ? item : item.name || String(item))
    : orderServices(record);

  return {
    id: record.id,
    clientName: record.clientName || record.customerName || `${record.firstName || ""} ${record.lastName || ""}`.trim() || "Unknown Client",
    address,
    apptDate,
    apptTime: record.scheduledTime || record.appointmentTime || record.apptTime || "TBD",
    services,
    total: appointmentRevenue(record),
    projectType: record.projectType || "real_estate",
    photographerNames: getAssignedNames(record, staff),
    status: record.status,
    orderNumber: record.orderRequestId?.substring(0, 6) || record.orderId?.substring(0, 6) || record.convertedToOrderId?.substring(0, 6) || record.id.substring(0, 6),
    duration: record.duration || "1.5hr",
    city,
    googleCalendarUrl: record.googleCalendarUrl || null,
    source: record.source || "appointment",
    twilight: recordHasTwilight(services, [record.notes, record.vibeNote, record.serviceNote, record.internalNotes]),
  };
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

function parseGoogleScheduleEvent(event: any): { appointment: Appointment | null; blocks: ScheduleBlock[] } {
  const kind = classifyCalendarEvent({
    summary: event.summary,
    description: event.description,
    location: event.location,
    transparency: event.transparency,
    eventType: event.eventType,
    allDay: Boolean(event.allDay),
    status: event.status,
    start: event.start,
    end: event.end,
  });
  const dateKeys = kind === "free" ? [] : scheduleBlockDateKeys(event.start, event.end, Boolean(event.allDay));

  if (kind === "shoot") {
    const appointment = normalizeCalendarAppointment(event);
    if (!appointment) return { appointment: null, blocks: [] };
    return {
      appointment: {
        ...appointment,
        twilight: recordHasTwilight(appointment.services, [event.summary, event.description]),
      },
      blocks: [],
    };
  }

  if (kind === "hold" || kind === "unavailable") {
    return {
      appointment: null,
        blocks: dateKeys.map((dateKey) => ({
          id: `${event.calendarId}-${event.id}-${dateKey}`,
          photographerName: String(event.photographerName || ""),
          dateKey,
          kind,
        })),
    };
  }

  return { appointment: null, blocks: [] };
}

function normalizeCalendarAppointment(event: any): Appointment | null {
  const apptDate = parseDate(event.start);
  if (!apptDate) return null;
  const parts = String(event.summary || "").split(/\s+[—-]\s+/).map((part: string) => part.trim()).filter(Boolean);
  const clientName = parts[0]?.replace(/^Iconic Images:\s*/i, "") || "Calendar appointment";
  const address = event.location || parts[1] || "No address";
  const services = parts.slice(2);

  return {
    id: `google-${event.calendarId}-${event.id}`,
    clientName,
    address,
    apptDate,
    apptTime: apptDate.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/Chicago",
    }),
    services: services.length ? services : ["Calendar"],
    total: 0,
    projectType: "real_estate",
    photographerNames: event.photographerName ? [event.photographerName] : [],
    status: "scheduled",
    orderNumber: "Calendar",
    duration: calendarDuration(event.start, event.end),
    city: extractCity(address),
    googleCalendarUrl: event.htmlLink || null,
    source: "google-calendar",
    twilight: false,
  };
}

function matchesCalendarEvent(local: Appointment, googleEvent: Appointment) {
  if (!local.apptDate || !googleEvent.apptDate) return false;
  if (chicagoDateKey(local.apptDate) !== chicagoDateKey(googleEvent.apptDate)) return false;

  const localTime = normalizeTime(local.apptTime);
  const googleTime = normalizeTime(googleEvent.apptTime);
  const sameTime = localTime && googleTime && localTime === googleTime;
  const localText = `${local.clientName} ${local.address}`.toLowerCase();
  const googleText = `${googleEvent.clientName} ${googleEvent.address}`.toLowerCase();
  const sameClient = tokenOverlap(local.clientName, googleEvent.clientName);
  const sameAddress = tokenOverlap(local.address, googleEvent.address);

  return Boolean(sameTime && (sameClient || sameAddress || googleText.includes(local.clientName.toLowerCase()) || localText.includes(googleEvent.clientName.toLowerCase())));
}

function normalizeTime(value: string) {
  if (!value) return "";
  const date = new Date(`2026-01-01 ${value}`);
  if (Number.isNaN(date.getTime())) return value.trim().toLowerCase();
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}

function tokenOverlap(a: string, b: string) {
  const tokensA = new Set(String(a || "").toLowerCase().match(/[a-z0-9]+/g) || []);
  const tokensB = new Set(String(b || "").toLowerCase().match(/[a-z0-9]+/g) || []);
  return Array.from(tokensA).some((token) => token.length > 2 && tokensB.has(token));
}

function calendarDuration(start: any, end: any) {
  const startDate = toDate(start);
  const endDate = toDate(end);
  if (!startDate || !endDate) return "1.5hr";
  const minutes = Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
  if (!minutes) return "1.5hr";
  if (minutes % 60 === 0) return `${minutes / 60}hr`;
  return `${minutes}min`;
}

function extractCity(address: any) {
  if (!address || typeof address !== "string") return "TBD";
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 3) return parts[parts.length - 2];
  if (parts.length >= 2) return parts[1];
  return "TBD";
}

function CalendarView({
  appointments,
  blocks,
  roster,
  currentMonth,
  selectedDay,
  onSelectDay,
  onSelectAppt,
}: {
  appointments: Appointment[];
  blocks: ScheduleBlock[];
  roster: CalendarRosterPerson[];
  currentMonth: Date;
  selectedDay: Date;
  onSelectDay: (day: Date) => void;
  onSelectAppt: (appt: Appointment) => void;
}) {
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: startDate, end: endDate });

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px] bg-white rounded-[2.5rem] border border-gray-100 shadow-xl overflow-hidden">
        <div className="grid grid-cols-7 border-b border-gray-50">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
            <div key={day} className="py-4 text-center">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">{day}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 auto-rows-[minmax(148px,auto)]">
          {days.map((day) => {
            const appts = appointments.filter((appt) => appt.apptDate && isSameDay(appt.apptDate, day));
            const dayBlocks = blocks.filter((block) => isBlockOnDay(block.dateKey, day));
            const cues = shooterCuesForDay({ roster, shoots: appts, blocks: dayBlocks });
            const cue = dayLoadCue({
              cues,
              twilightShootCount: appts.filter((appt) => appt.twilight).length,
            });
            const isCurrentMonth = isSameMonth(day, monthStart);
            const isTodayDate = isSameDay(day, new Date());
            const isSelected = isSameDay(day, selectedDay);
            const twilightCue = cue === "Twilight" || Boolean(cue && cue.includes("twilight"));

            return (
              <div
                key={day.toISOString()}
                onClick={() => onSelectDay(day)}
                className={`flex cursor-pointer flex-col gap-1 border-b border-r border-gray-50 p-2 transition-colors ${!isCurrentMonth ? "bg-gray-50/30 opacity-50" : ""} ${isTodayDate ? "bg-[#0d9488]/5" : ""} ${isSelected ? "ring-2 ring-inset ring-[#0d9488]" : ""}`}
              >
                <div className="mb-1 flex items-center justify-between gap-1">
                  <span className={`text-sm font-black ${isTodayDate ? "flex h-7 w-7 items-center justify-center rounded-lg bg-[#0d9488] text-white shadow-sm" : "text-gray-500"}`}>
                    {format(day, "d")}
                  </span>
                  {appts.length > 0 ? (
                    <span className="rounded-md bg-[#0d9488]/10 px-1.5 py-0.5 text-[10px] font-black text-[#0d9488]">
                      {appts.length}
                    </span>
                  ) : null}
                </div>
                {cue ? (
                  <div className={`text-[10px] font-black uppercase tracking-widest ${twilightCue ? "text-[#9a6b24]" : "text-gray-400"}`}>
                    {cue}
                  </div>
                ) : null}

                <div className="flex flex-1 flex-col gap-1">
                  {appts.map((appt) => (
                    <div
                      key={appt.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelectDay(day);
                        onSelectAppt(appt);
                      }}
                    >
                      <ScheduleCalendarChip
                        time={appt.apptTime}
                        clientName={appt.clientName}
                        photographer={shortPhotographerNames(appt.photographerNames)}
                        twilight={appt.twilight}
                        business={appt.projectType === "business"}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
