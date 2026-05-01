import * as React from "react";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { 
  Calendar as CalendarIcon, 
  List, 
  ChevronDown, 
  ChevronUp, 
  Clock, 
  MapPin, 
  User, 
  FileText, 
  DollarSign,
  ChevronLeft,
  ChevronRight,
  X
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
  addDays, 
  eachDayOfInterval,
  parseISO,
  startOfDay
} from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Appointment {
  id: string;
  clientName: string;
  address: string;
  apptDate: any; // Date string or Timestamp
  apptTime: string;
  services: string[];
  total: number;
  projectType: "real_estate" | "business";
  photographerNames: string[];
  status: string;
  orderNumber?: string;
  duration?: string;
  city?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseDate(d: any): Date | null {
  if (!d) return null;
  if (d.toDate) return d.toDate();
  if (typeof d === "string") {
    if (d.includes("T")) return parseISO(d);
    return parseISO(`${d}T12:00:00`); // Noon to avoid TZ shifts
  }
  return new Date(d);
}

function fmtCurrency(n: number): string {
  return "$" + (n || 0).toLocaleString("en-US", { minimumFractionDigits: 2 });
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminSchedule() {
  const [viewMode, setViewMode] = React.useState<"calendar" | "list">("list");
  const [appointments, setAppointments] = React.useState<Appointment[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [currentMonth, setCurrentMonth] = React.useState(new Date());
  const [collapsedDates, setCollapsedDates] = React.useState<Set<string>>(new Set());
  const [selectedAppt, setSelectedAppt] = React.useState<Appointment | null>(null);

  React.useEffect(() => {
    // Listen to listings with scheduled statuses
    const q = query(
      collection(db, "listings"),
      where("status", "in", ["scheduled", "appt_scheduled", "consult_scheduled"])
    );

    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => {
        const d = doc.data();
        const apptDate = parseDate(d.apptDate);
        
        // Extract city from address if possible
        let city = "TBD";
        if (d.address && typeof d.address === "string") {
          const parts = d.address.split(",");
          if (parts.length > 1) city = parts[parts.length - 3]?.trim() || parts[1]?.trim() || "TBD";
        }

        return {
          id: doc.id,
          clientName: d.clientName || "Unknown Client",
          address: d.address || d.shootLocation || "No address",
          apptDate: apptDate,
          apptTime: d.apptTime || "TBD",
          services: d.services || [],
          total: Number(d.total) || 0,
          projectType: d.projectType || "real_estate",
          photographerNames: d.photographerNames || (d.assignedProviders || []).map((p: any) => p.name) || [],
          status: d.status,
          orderNumber: d.orderRequestId?.substring(0, 6) || doc.id.substring(0, 6),
          duration: d.duration || "1hr", // Mock duration if not present
          city: city
        } as Appointment;
      });

      // Sort by date and time
      data.sort((a, b) => {
        const da = a.apptDate?.getTime() || 0;
        const db = b.apptDate?.getTime() || 0;
        if (da !== db) return da - db;
        return (a.apptTime || "").localeCompare(b.apptTime || "");
      });

      setAppointments(data);
      
      // Initialize all dates as collapsed
      const dates = new Set<string>();
      data.forEach(a => {
        if (a.apptDate) dates.add(format(a.apptDate, "yyyy-MM-dd"));
      });
      setCollapsedDates(dates);
      
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const toggleDateCollapse = (dateStr: string) => {
    const next = new Set(collapsedDates);
    if (next.has(dateStr)) next.delete(dateStr);
    else next.add(dateStr);
    setCollapsedDates(next);
  };

  const groupedByDate = React.useMemo(() => {
    const groups: Record<string, Appointment[]> = {};
    appointments.forEach(a => {
      if (!a.apptDate) return;
      const key = format(a.apptDate, "yyyy-MM-dd");
      if (!groups[key]) groups[key] = [];
      groups[key].push(a);
    });
    return groups;
  }, [appointments]);

  const sortedDateKeys = Object.keys(groupedByDate).sort();

  return (
    <AdminLayout title="Schedule">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* View Toggle & Controls */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
          <div className="flex bg-gray-100 p-1 rounded-xl">
            <button 
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${viewMode === "list" ? "bg-white text-black shadow-sm" : "text-gray-500 hover:text-black"}`}
            >
              <List className="w-4 h-4" /> Line Item View
            </button>
            <button 
              onClick={() => setViewMode("calendar")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${viewMode === "calendar" ? "bg-white text-black shadow-sm" : "text-gray-500 hover:text-black"}`}
            >
              <CalendarIcon className="w-4 h-4" /> Calendar View
            </button>
          </div>

          {viewMode === "calendar" && (
            <div className="flex items-center gap-4 bg-white border border-gray-100 rounded-xl px-4 py-2 shadow-sm">
              <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1 hover:bg-gray-50 rounded-lg text-gray-400 hover:text-black transition-colors">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-sm font-black uppercase tracking-widest min-w-[140px] text-center">
                {format(currentMonth, "MMMM yyyy")}
              </span>
              <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1 hover:bg-gray-50 rounded-lg text-gray-400 hover:text-black transition-colors">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-4 border-[#0d9488] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {viewMode === "list" ? (
              <div className="space-y-4">
                {sortedDateKeys.length === 0 ? (
                  <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-12 text-center">
                    <CalendarIcon className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                    <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">No scheduled appointments found</p>
                  </div>
                ) : (
                  sortedDateKeys.map(dateStr => {
                    const appts = groupedByDate[dateStr];
                    const isCollapsed = collapsedDates.has(dateStr);
                    return (
                      <div key={dateStr} className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                        {/* Group Header */}
                        <div 
                          onClick={() => toggleDateCollapse(dateStr)}
                          className="px-8 py-5 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-50"
                        >
                          <div className="flex items-center gap-4">
                            <div className="bg-[#0d9488]/10 p-2 rounded-xl">
                              <CalendarIcon className="w-5 h-5 text-[#0d9488]" />
                            </div>
                            <div>
                              <h3 className="text-sm font-black uppercase tracking-widest text-black">
                                {format(parseISO(dateStr), "EEEE, MMMM do, yyyy")}
                              </h3>
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                {appts.length} Appointment{appts.length !== 1 ? "s" : ""}
                              </p>
                            </div>
                          </div>
                          {isCollapsed ? <ChevronDown className="w-5 h-5 text-gray-300" /> : <ChevronUp className="w-5 h-5 text-gray-300" />}
                        </div>

                        {/* Appointment List */}
                        {!isCollapsed && (
                          <div className="divide-y divide-gray-50 bg-white">
                            {appts.map(appt => (
                              <div key={appt.id} className="p-8 hover:bg-gray-50/50 transition-colors group">
                                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                                  {/* Info Primary */}
                                  <div className="lg:col-span-1">
                                    <div className="flex items-center gap-2 mb-2">
                                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${appt.projectType === "business" ? "bg-black text-white" : "bg-[#0d9488] text-white"}`}>
                                        {appt.projectType === "business" ? "Business" : "Real Estate"}
                                      </span>
                                      <span className="text-[10px] font-mono text-gray-400">#{appt.orderNumber}</span>
                                    </div>
                                    <h4 className="text-lg font-black text-black mb-1">{appt.clientName}</h4>
                                    <div className="flex items-center gap-2 text-xs font-bold text-[#0d9488]">
                                      <Clock className="w-3.5 h-3.5" />
                                      {appt.apptTime}
                                      {appt.apptDate && (
                                        <span className="text-gray-300 ml-1">
                                          • {format(appt.apptDate, "MMM d")}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Address & Services */}
                                  <div className="lg:col-span-2 space-y-4">
                                    <div className="flex items-start gap-3">
                                      <MapPin className="w-4 h-4 text-gray-300 mt-0.5" />
                                      <p className="text-sm font-bold text-gray-600 leading-relaxed">{appt.address}</p>
                                    </div>
                                    <div className="flex items-start gap-3">
                                      <FileText className="w-4 h-4 text-gray-300 mt-0.5" />
                                      <div className="flex flex-wrap gap-1.5">
                                        {appt.services.map((s, i) => (
                                          <span key={i} className="text-[10px] font-bold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-lg border border-gray-200/50">
                                            {s}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Staff & Total */}
                                  <div className="lg:col-span-1 flex flex-col justify-between items-end">
                                    <div className="text-right">
                                      <div className="flex items-center justify-end gap-2 text-gray-400 mb-1">
                                        <User className="w-3.5 h-3.5" />
                                        <span className="text-[10px] font-black uppercase tracking-widest">Assigned</span>
                                      </div>
                                      <p className="text-sm font-bold text-black italic">
                                        {appt.photographerNames.join(", ") || "Unassigned"}
                                      </p>
                                    </div>
                                    <div className="text-right mt-4">
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
              <CalendarView 
                appointments={appointments} 
                currentMonth={currentMonth} 
                onSelectAppt={setSelectedAppt}
              />
            )}
          </>
        )}
      </div>

      {/* Details Popup */}
      {selectedAppt && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-black text-white px-8 py-6 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500 mb-1">Appointment Details</p>
                <h3 className="text-xl font-bold">#{selectedAppt.orderNumber}</h3>
              </div>
              <button onClick={() => setSelectedAppt(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
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
                  <span className={`inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${selectedAppt.projectType === "business" ? "bg-black text-white" : "bg-[#0d9488] text-white"}`}>
                    {selectedAppt.projectType === "business" ? "Business" : "Real Estate"}
                  </span>
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
                  <p className="text-sm font-bold text-black">{selectedAppt.apptTime}</p>
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
                  {selectedAppt.services.map((s, i) => (
                    <span key={i} className="text-[10px] font-bold bg-gray-100 text-gray-600 px-3 py-1 rounded-xl border border-gray-200">
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 pt-4 border-t border-gray-100">
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Assigned Photographer</p>
                  <p className="text-sm font-bold text-black italic">{selectedAppt.photographerNames.join(", ") || "Unassigned"}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total</p>
                  <p className="text-xl font-black text-[#0d9488]">{fmtCurrency(selectedAppt.total)}</p>
                </div>
              </div>
            </div>

            <div className="px-8 pb-8 flex gap-3">
              <Button onClick={() => setSelectedAppt(null)} className="flex-1 bg-black text-white rounded-2xl h-12 font-bold uppercase tracking-widest text-xs">Close</Button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

// ─── Calendar View ───────────────────────────────────────────────────────────

function CalendarView({ appointments, currentMonth, onSelectAppt }: any) {
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const days = eachDayOfInterval({ start: startDate, end: endDate });

  return (
    <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-xl overflow-hidden">
      {/* Days of Week Header */}
      <div className="grid grid-cols-7 border-b border-gray-50">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
          <div key={day} className="py-4 text-center">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">{day}</span>
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 auto-rows-[minmax(120px,1fr)]">
        {days.map((day, i) => {
          const appts = appointments.filter((a: any) => a.apptDate && isSameDay(a.apptDate, day));
          const isCurrentMonth = isSameMonth(day, monthStart);
          const isTodayDate = isSameDay(day, new Date());

          return (
            <div 
              key={day.toString()} 
              className={`border-r border-b border-gray-50 p-2 flex flex-col gap-1 transition-colors ${!isCurrentMonth ? "bg-gray-50/30 opacity-40" : ""} ${isTodayDate ? "bg-[#0d9488]/5" : ""}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-black ${isTodayDate ? "bg-[#0d9488] text-white w-6 h-6 flex items-center justify-center rounded-lg shadow-sm" : "text-gray-400"}`}>
                  {format(day, "d")}
                </span>
                {appts.length > 0 && (
                  <span className="text-[9px] font-black text-[#0d9488] bg-[#0d9488]/10 px-1.5 py-0.5 rounded-md">
                    {appts.length}
                  </span>
                )}
              </div>

              <div className="flex-1 space-y-1 overflow-y-auto max-h-[100px] scrollbar-hide">
                {appts.map((a: any) => (
                  <div 
                    key={a.id}
                    onClick={() => onSelectAppt(a)}
                    className={`p-1.5 rounded-lg border cursor-pointer hover:scale-[1.02] transition-transform shadow-sm flex flex-col gap-0.5 ${a.projectType === "business" ? "bg-black border-black text-white" : "bg-[#0d9488] border-[#0d9488] text-white"}`}
                  >
                    <div className="flex items-center gap-1">
                      <span className="text-[7px] font-black opacity-80">{a.projectType === "business" ? "(B)" : "(RE)"}</span>
                      <span className="text-[8px] font-black truncate">#{a.orderNumber}</span>
                    </div>
                    <div className="text-[8px] font-bold opacity-90 truncate leading-none">
                      {a.apptTime} • {a.duration}
                    </div>
                    <div className="text-[7px] font-medium opacity-70 truncate leading-none">
                      {a.city}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
