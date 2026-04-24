import { useState, useEffect } from "react";
import AdminLayout from "@/components/AdminLayout";
import { db } from "@/lib/firebase";
import { collection, query, orderBy, limit, getDocs } from "firebase/firestore";
import { Activity, CheckCircle2, Clock } from "lucide-react";

interface Agent {
  id: string;
  name: string;
  status: "active" | "idle" | "offline";
  lastAction: string;
  lastActionTime: string;
  enabled: boolean;
}

interface AgentExecution {
  agentName: string;
  timestamp: string;
  status: string;
}

const AGENT_CONFIGS: Agent[] = [
  {
    id: "nora",
    name: "NORA",
    status: "active",
    lastAction: "Process booking request",
    lastActionTime: "2 mins ago",
    enabled: true,
  },
  {
    id: "aicon",
    name: "AICON",
    status: "active",
    lastAction: "Monitor operations",
    lastActionTime: "30 secs ago",
    enabled: true,
  },
  {
    id: "lens",
    name: "LENS",
    status: "idle",
    lastAction: "Edit photo batch",
    lastActionTime: "1 hour ago",
    enabled: true,
  },
];

export default function AdminAicon() {
  const [agents, setAgents] = useState<Agent[]>(AGENT_CONFIGS);
  const [executions, setExecutions] = useState<AgentExecution[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchExecutions = async () => {
      try {
        const q = query(
          collection(db, "agentExecutions"),
          orderBy("timestamp", "desc"),
          limit(20)
        );
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map((doc) => ({
          ...doc.data(),
        })) as AgentExecution[];
        setExecutions(data);
      } catch (error) {
        console.error("Error fetching agent executions:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchExecutions();
  }, []);

  const toggleAgent = (agentId: string) => {
    setAgents(
      agents.map((agent) =>
        agent.id === agentId ? { ...agent, enabled: !agent.enabled } : agent
      )
    );
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "active":
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case "idle":
        return <Clock className="w-5 h-5 text-yellow-500" />;
      default:
        return <Activity className="w-5 h-5 text-gray-400" />;
    }
  };

  return (
    <AdminLayout title="AI Agents">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Agents Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="rounded-2xl border border-gray-100 shadow-sm p-6 bg-white hover:shadow-md transition"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    {agent.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-2">
                    {getStatusIcon(agent.status)}
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">
                      {agent.status}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => toggleAgent(agent.id)}
                  className={'px-3 py-1 rounded-lg text-xs font-semibold transition ' + (agent.enabled ? 'bg-[#0d9488] text-white hover:bg-[#0f766e]' : 'bg-gray-200 text-gray-700 hover:bg-gray-300')}
                >
                  {agent.enabled ? "ON" : "OFF"}
                </button>
              </div>

              <div className="space-y-3 pt-4 border-t border-gray-100">
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
                    Last Action
                  </p>
                  <p className="text-sm text-gray-700 font-medium">
                    {agent.lastAction}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
                    Last Triggered
                  </p>
                  <p className="text-sm text-gray-600">
                    {agent.lastActionTime}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Recent Activity */}
        <div className="rounded-2xl border border-gray-100 shadow-sm p-6 bg-white">
          <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6">
            Recent Activity
          </div>

          {loading ? (
            <div className="text-center py-8">
              <p className="text-gray-600">Loading activity...</p>
            </div>
          ) : executions.length === 0 ? (
            <div className="text-center py-8">
              <Activity className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-600">No recent activity</p>
            </div>
          ) : (
            <div className="space-y-2">
              {executions.map((exec, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100 hover:bg-gray-100 transition"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-[#0d9488]"></div>
                    <div>
                      <p className="font-semibold text-gray-900">
                        {exec.agentName}
                      </p>
                      <p className="text-xs text-gray-600">
                        {new Date(exec.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <span className={'px-3 py-1 rounded-full text-xs font-semibold ' + (exec.status === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-yellow-50 text-yellow-700 border border-yellow-200")}>
                    {exec.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}