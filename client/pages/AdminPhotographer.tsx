import * as React from "react";
import AdminLayout from "@/components/AdminLayout";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import {
  Camera,
  MapPin,
  Clock,
  CheckCircle2,
  Upload,
  Calendar,
  DollarSign,
  ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminPhotographer() {
  const { user } = useAuth();
  const [jobs, setJobs] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, "listings"),
      where("photographerUid", "==", user.uid),
      orderBy("shootDate", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setJobs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [user?.uid]);

  const upcoming = jobs.filter((j) => j.status === "scheduled" || j.status === "pending");
  const completed = jobs.filter((j) => j.status === "completed" || j.status === "uploaded");

  const statCards = [
    { label: "Upcoming Jobs", value: upcoming.length.toString(), icon: <Calendar className="w-5 h-5" />, color: "bg-[#0d9488]" },
    { label: "Completed", value: completed.length.toString(), icon: <CheckCircle2 className="w-5 h-5" />, color: "bg-blue-500" },
    { label: "Total Jobs", value: jobs.length.toString(), icon: <Camera className="w-5 h-5" />, color: "bg-purple-500" },
    { label: "This Month", value: "$0", icon: <DollarSign className="w-5 h-5" />, color: "bg-orange-500" },
  ];

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      scheduled: "bg-teal-500/10 text-teal-600",
      pending:   "bg-yellow-500/10 text-yellow-600",
      uploaded:  "bg-blue-500/10 text-blue-600",
      completed: "bg-gray-100 text-gray-500",
    };
    return map[status] ?? "bg-gray-100 text-gray-500";
  };

  return (
    <AdminLayout title="My Jobs">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        {statCards.map((s) => (
          <div key={s.label} className="bg-white rounded-[2rem] p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-xl text-white ${s.color} shadow-lg`}>{s.icon}</div>
              <ArrowUpRight className="w-4 h-4 text-gray-300" />
            </div>
            <h3 className="text-2xl font-black text-black mb-1">{s.value}</h3>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Upcoming */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-black text-black uppercase tracking-widest">Upcoming Jobs</h2>
          <Button asChild size="sm" className="bg-[#0d9488] hover:bg-[#0f766e] text-white font-bold rounded-xl">
            <Link to="/admin/upload"><Upload className="w-3.5 h-3.5 mr-1.5" /> Upload Photos</Link>
          </Button>
        </div>

        {loading ? (
          <div className="bg-white rounded-[2rem] border border-gray-100 p-12 text-center">
            <div className="w-8 h-8 rounded-full bg-[#0d9488]/20 mx-auto mb-3 animate-pulse" />
            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Loading...</p>
          </div>
        ) : upcoming.length === 0 ? (
          <div className="bg-white rounded-[2rem] border border-gray-100 p-12 text-center">
            <Camera className="w-10 h-10 text-gray-200 mx-auto mb-4" />
            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No upcoming jobs</p>
            <p className="text-xs text-gray-300 mt-1">You're all caught up — check back soon.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {upcoming.map((job) => (
              <Link
                key={job.id}
                to={`/admin/listing/${job.id}`}
                className="bg-white rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-md transition-shadow p-6 flex items-center justify-between gap-6 group"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-[#0d9488]/10 flex items-center justify-center flex-shrink-0">
                    <Camera className="w-5 h-5 text-[#0d9488]" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-black text-sm text-black truncate">{job.propertyAddress || "Address TBD"}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="flex items-center gap-1 text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                        <MapPin className="w-3 h-3" /> {job.city || "—"}
                      </span>
                      {job.shootDate && (
                        <span className="flex items-center gap-1 text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                          <Clock className="w-3 h-3" /> {new Date(job.shootDate.seconds * 1000).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full ${statusBadge(job.status)}`}>
                    {job.status}
                  </span>
                  <ArrowUpRight className="w-4 h-4 text-gray-300 group-hover:text-[#0d9488] transition-colors" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Completed */}
      {completed.length > 0 && (
        <div>
          <h2 className="text-sm font-black text-black uppercase tracking-widest mb-5">Completed</h2>
          <div className="space-y-3">
            {completed.map((job) => (
              <Link
                key={job.id}
                to={`/admin/listing/${job.id}`}
                className="bg-white rounded-[2rem] border border-gray-100 p-5 flex items-center justify-between gap-6 opacity-60 hover:opacity-100 transition-opacity group"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="w-4 h-4 text-gray-400" />
                  </div>
                  <p className="font-bold text-sm text-black truncate">{job.propertyAddress || "Address TBD"}</p>
                </div>
                <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full ${statusBadge(job.status)}`}>
                  {job.status}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
