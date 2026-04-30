import { useState, useEffect } from "react";
import AdminLayout from "@/components/AdminLayout";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import { Calendar, Clock, MapPin, User } from "lucide-react";

interface ScheduleItem {
  id: string;
  clientName: string;
  address: string;
  time: string;
  photographer: string;
  date: string;
  status: "confirmed" | "pending" | "completed";
}

export default function AdminSchedule() {
  const [appointments, setAppointments] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAppointments = async () => {
      try {
        const q = collection(db, "listings");
        const snapshot = await getDocs(q);

        const data = snapshot.docs
          .map((doc) => {
            const docData = doc.data();
            if (docData.apptDate) {
              return {
                id: doc.id,
                clientName: docData.clientName || "Unknown Client",
                address: docData.address || docData.city || "No address",
                time: docData.apptTime || "TBD",
                photographer: docData.photographer || "Unassigned",
                date: docData.apptDate,
                status: docData.status || "pending",
              } as ScheduleItem;
            }
            return null;
          })
          .filter(Boolean) as ScheduleItem[];

        setAppointments(data);
      } catch (error) {
        console.error("Error fetching appointments:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAppointments();
  }, []);

  const groupedByDate = appointments.reduce(
    (acc, apt) => {
      const date = apt.date;
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(apt);
      return acc;
    },
    {} as Record<string, ScheduleItem[]>
  );

  const sortedDates = Object.keys(groupedByDate).sort();

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed":
        return "bg-green-50 text-green-700 border-green-200";
      case "pending":
        return "bg-yellow-50 text-yellow-700 border-yellow-200";
      case "completed":
        return "bg-blue-50 text-blue-700 border-blue-200";
      default:
        return "bg-gray-50 text-gray-700 border-gray-200";
    }
  };

  const today = new Date().toISOString().split("T")[0];
  const upcomingDates = sortedDates.filter((date) => date >= today);

  return (
    <AdminLayout title="Schedule">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="rounded-2xl border border-gray-100 shadow-sm p-6 bg-white mb-8">
          <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">
            Summary
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-gray-600">Total Appointments</p>
              <p className="text-2xl font-bold text-gray-900">
                {appointments.length}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Upcoming</p>
              <p className="text-2xl font-bold text-[#0d9488]">
                {upcomingDates.length}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Confirmed</p>
              <p className="text-2xl font-bold text-green-600">
                {appointments.filter((a) => a.status === "confirmed").length}
              </p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-600">Loading schedule...</p>
          </div>
        ) : upcomingDates.length === 0 ? (
          <div className="rounded-2xl border border-gray-100 shadow-sm p-12 bg-white text-center">
            <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600">No upcoming appointments scheduled</p>
          </div>
        ) : (
          <div className="space-y-6">
            {upcomingDates.map((date) => (
              <div
                key={date}
                className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
              >
                <div className="bg-gradient-to-r from-[#0d9488] to-[#0f766e] px-6 py-4">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Calendar className="w-5 h-5" />
                    {new Date(date + "T00:00:00").toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </h3>
                  <p className="text-sm text-teal-50 mt-1">
                    {groupedByDate[date].length} appointment{groupedByDate[date].length !== 1 ? "s" : ""}
                  </p>
                </div>

                <div className="bg-white divide-y divide-gray-100">
                  {groupedByDate[date]
                    .sort((a, b) => a.time.localeCompare(b.time))
                    .map((apt) => (
                      <div
                        key={apt.id}
                        className="p-6 hover:bg-gray-50 transition"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                          <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                              Client
                            </p>
                            <p className="text-lg font-bold text-gray-900">
                              {apt.clientName}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className={'inline-block px-3 py-1 rounded-full text-xs font-semibold border ' + getStatusColor(apt.status)}>
                              {apt.status.charAt(0).toUpperCase() + apt.status.slice(1)}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="flex items-center gap-2 text-gray-700">
                            <Clock className="w-4 h-4 text-[#0d9488]" />
                            <span>{apt.time}</span>
                          </div>
                          <div className="flex items-center gap-2 text-gray-700">
                            <MapPin className="w-4 h-4 text-[#0d9488]" />
                            <span className="text-sm">{apt.address}</span>
                          </div>
                        </div>

                        <div className="mt-4 pt-4 border-t border-gray-100">
                          <div className="flex items-center gap-2 text-gray-700">
                            <User className="w-4 h-4 text-gray-400" />
                            <span className="text-sm font-medium">
                              Photographer: {apt.photographer}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}