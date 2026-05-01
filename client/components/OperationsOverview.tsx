import * as React from "react";
import { Link } from "react-router-dom";
import { 
  DollarSign, 
  Calendar, 
  AlertCircle, 
  TrendingUp, 
  Users, 
  CheckCircle, 
  Sun, 
  MessageSquare,
  TrendingDown,
  AlertTriangle,
  Clock,
  Star,
  Cloud,
  LayoutGrid
} from "lucide-react";
import { useOperationsMetrics } from "@/hooks/useOperationsMetrics";

// ─── Modular Overview Card ───────────────────────────────────────────────────

function OverviewCard({ title, items, color = "gray", icon }: {
  title: string;
  items: { label: string; value: string | number; sub?: string; trend?: "up" | "down"; status?: "green" | "yellow" | "red" | "gray" }[];
  color?: "red" | "orange" | "green" | "blue" | "gray" | "black";
  icon?: React.ReactNode;
}) {
  const colorMap = {
    red: "border-red-100 bg-red-50/30",
    orange: "border-orange-100 bg-orange-50/30",
    green: "border-green-100 bg-green-50/30",
    blue: "border-blue-100 bg-blue-50/30",
    gray: "border-gray-100 bg-gray-50/30",
    black: "border-gray-800 bg-black text-white",
  };

  const statusMap = {
    green: "text-green-600",
    yellow: "text-orange-500",
    red: "text-red-500",
    gray: "text-gray-400",
  };

  return (
    <div className={`rounded-3xl border p-5 transition-all hover:shadow-md ${colorMap[color]}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className={`text-[10px] font-black uppercase tracking-[0.2em] ${color === "black" ? "text-gray-400" : "text-gray-500"}`}>
          {title}
        </h3>
        {icon && <div className={`${color === "black" ? "text-gray-600" : "text-gray-300"}`}>{icon}</div>}
      </div>
      <div className="space-y-4">
        {items.map((item, i) => (
          <div key={i} className="flex flex-col">
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-bold ${color === "black" ? "text-gray-500" : "text-gray-400"}`}>
                {item.label}
              </span>
              {item.trend && (
                item.trend === "up" ? <TrendingUp className="w-3 h-3 text-green-500" /> : <TrendingDown className="w-3 h-3 text-red-500" />
              )}
            </div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className={`text-xl font-black ${item.status ? statusMap[item.status] : (color === "black" ? "text-white" : "text-black")}`}>
                {item.value}
              </span>
              {item.sub && (
                <span className={`text-[9px] font-medium uppercase tracking-wider ${color === "black" ? "text-gray-600" : "text-gray-400"}`}>
                  {item.sub}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const fmtCurrency = (n: number) =>
  "$" + (n || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export default function OperationsOverview() {
  const { metrics, loading } = useOperationsMetrics();
  const [weather, setWeather] = React.useState<any>(null);

  React.useEffect(() => {
    // Houston fallback
    fetch("https://api.open-meteo.com/v1/forecast?latitude=29.7604&longitude=-95.3698&current_weather=true")
      .then(r => r.json())
      .then(data => {
        if (data.current_weather) {
          setWeather({
            temp: Math.round(data.current_weather.temperature * 9/5 + 32),
            condition: getWeatherLabel(data.current_weather.weathercode),
            code: data.current_weather.weathercode
          });
        }
      })
      .catch((err) => {
        console.warn("[OperationsOverview] Weather fetch failed (this is non-critical):", err);
      });
  }, []);

  function getWeatherLabel(code: number) {
    if (code <= 3) return "Sunny/Clear";
    if (code <= 48) return "Cloudy/Foggy";
    if (code <= 67) return "Rainy";
    if (code <= 77) return "Snowy";
    if (code <= 99) return "Stormy";
    return "Cloudy";
  }

  const overviewData = React.useMemo(() => {
    if (!metrics) return null;

    const shooterList = Object.entries(metrics.shooters).map(([name, count]) => `${name}(${count})`).join(", ");

    return {
      revenue: [
        { label: "Today", value: fmtCurrency(metrics.revToday), status: metrics.revToday > 0 ? "green" as const : "gray" as const },
        { label: "This Week", value: fmtCurrency(metrics.revWeek), sub: "Mon-Sun" },
        { label: "Month to Date", value: fmtCurrency(metrics.revMonth) },
        { label: "Projected", value: fmtCurrency(metrics.revProjected), sub: "Scheduled" },
      ],
      operations: [
        { label: "Appts Today", value: metrics.scheduledToday.length },
        { label: "Appts This Week", value: metrics.scheduledWeek.length },
        { label: "Active Shooters", value: Object.keys(metrics.shooters).length, sub: shooterList || "None" },
      ],
      actionRequired: [
        { label: "Pending Requests", value: metrics.notScheduledCount, status: metrics.notScheduledCount > 0 ? "red" as const : "gray" as const, sub: "Not Scheduled" },
        { label: "Urgent Requests", value: metrics.urgentRequestsCount, status: metrics.urgentRequestsCount > 0 ? "red" as const : "gray" as const, sub: "<24hr Notice" },
        { label: "Overdue Delivery", value: metrics.overdueDeliveriesCount, status: metrics.overdueDeliveriesCount > 0 ? "yellow" as const : "gray" as const },
        { label: "Missing Uploads", value: metrics.missingUploadsCount, status: metrics.missingUploadsCount > 0 ? "yellow" as const : "gray" as const, sub: "RAWs Needed" },
      ],
      stability: [
        { label: "Reschedules", value: metrics.reschedulesCount, sub: "Last 7 Days" },
        { label: "Cancellations", value: metrics.cancellationsCount, sub: "Last 7 Days" },
        { label: "No-Shows", value: metrics.noShowsCount, status: metrics.noShowsCount > 0 ? "red" as const : "green" as const },
      ],
      clients: [
        { label: "Top (Rev)", value: metrics.topClientRev ? metrics.topClientRev[0] : "—", sub: metrics.topClientRev ? fmtCurrency(metrics.topClientRev[1].rev) : "" },
        { label: "Top (Vol)", value: metrics.topClientVol ? metrics.topClientVol[0] : "—", sub: metrics.topClientVol ? `${metrics.topClientVol[1].vol} Orders` : "" },
        { label: "At-Risk", value: metrics.atRiskCount, status: metrics.atRiskCount > 5 ? "red" as const : "yellow" as const, sub: "Inactive > 30d" },
      ],
      performance: [
        { label: "On-Time Rate", value: "96%", status: "green" as const },
        { label: "Late Appts", value: 0, status: "green" as const },
        { label: "SLA (24hr)", value: "92%", status: "green" as const },
      ],
      feedback: [
        { label: "Complaints", value: 0, status: "green" as const },
        { label: "Compliments", value: 0, status: "gray" as const },
        { label: "Reviews", value: "—", icon: <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" /> },
      ],
      external: [
        { label: "Weather", value: weather ? `${weather.temp}°F` : "—", sub: weather ? weather.condition : "Houston, TX", icon: weather ? <Sun className="w-5 h-5 text-orange-400" /> : <Cloud className="w-5 h-5 text-gray-300" /> },
        { label: "Impacted Appts", value: 0, status: "green" as const },
      ],
      alerts: generateAlerts(metrics)
    };
  }, [metrics, weather]);

  function generateAlerts(m: any) {
    const list = [];
    if (m.overdueDeliveriesCount > 0) list.push({ text: `${m.overdueDeliveriesCount} overdue deliveries`, status: "red" });
    if (m.urgentRequestsCount > 0) list.push({ text: `${m.urgentRequestsCount} urgent requests (<24h)`, status: "red" });
    if (m.missingUploadsCount > 0) list.push({ text: `${m.missingUploadsCount} missing uploads`, status: "yellow" });
    if (m.notScheduledCount > 5) list.push({ text: `${m.notScheduledCount} pending order requests`, status: "yellow" });
    if (m.revToday > 1000) list.push({ text: `Strong revenue day: ${fmtCurrency(m.revToday)}`, status: "green" });

    if (list.length === 0) list.push({ text: "All operations running smoothly", status: "green" });
    return list.slice(0, 3);
  }

  return (
    <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm min-h-full">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#0d9488]/10 rounded-lg">
            <LayoutGrid className="w-5 h-5 text-[#0d9488]" />
          </div>
          <h2 className="text-sm font-black text-black uppercase tracking-widest">Daily Overview</h2>
        </div>
        <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
          {new Date().toLocaleDateString("en-US", { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
      </div>

      {/* Alerts Bar */}
      <div className="mb-8 space-y-2">
        {!overviewData ? (
          <div className="h-10 bg-gray-50 animate-pulse rounded-2xl" />
        ) : overviewData.alerts.map((alert: any, i: number) => (
          <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest border ${
            alert.status === "red" ? "bg-red-50 border-red-100 text-red-600" :
            alert.status === "yellow" ? "bg-orange-50 border-orange-100 text-orange-600" :
            "bg-green-50 border-green-100 text-green-600"
          }`}>
            {alert.status === "red" ? <AlertTriangle className="w-4 h-4" /> :
             alert.status === "yellow" ? <Clock className="w-4 h-4" /> :
             <CheckCircle className="w-4 h-4" />}
            {alert.text}
          </div>
        ))}
      </div>

      {/* Modular Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {!overviewData ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-48 bg-gray-50 animate-pulse rounded-3xl" />
          ))
        ) : (
          <>
            <OverviewCard title="Revenue" items={overviewData.revenue} color="green" icon={<DollarSign className="w-4 h-4" />} />
            <OverviewCard title="Operations" items={overviewData.operations} color="blue" icon={<Calendar className="w-4 h-4" />} />
            <OverviewCard title="Action Required" items={overviewData.actionRequired} color="red" icon={<AlertCircle className="w-4 h-4" />} />
            <OverviewCard title="Stability (7d)" items={overviewData.stability} color="orange" icon={<TrendingUp className="w-4 h-4" />} />
            <OverviewCard title="Client Insights" items={overviewData.clients} color="gray" icon={<Users className="w-4 h-4" />} />
            <OverviewCard title="Team Performance" items={overviewData.performance} color="green" icon={<CheckCircle className="w-4 h-4" />} />
            <OverviewCard title="External Factors" items={overviewData.external} />
            <OverviewCard title="Feedback" items={overviewData.feedback} color="gray" icon={<MessageSquare className="w-4 h-4" />} />
          </>
        )}
      </div>
    </div>
  );
}
