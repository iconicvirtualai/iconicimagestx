import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { Zap, Mail, FileText, CheckCircle2 } from "lucide-react";

interface AutomationRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  lastTriggered: string;
}

const AUTOMATION_RULES: AutomationRule[] = [
  {
    id: "auto-status",
    name: "Auto Status Updates",
    description: "Automatically update order status based on photographer activity",
    enabled: true,
    lastTriggered: "2 hours ago",
  },
  {
    id: "delivery-email",
    name: "Delivery Email Trigger",
    description: "Send delivery notification emails when photos are ready",
    enabled: true,
    lastTriggered: "30 minutes ago",
  },
  {
    id: "invoice-gen",
    name: "Invoice Generation",
    description: "Automatically generate invoices when orders complete",
    enabled: true,
    lastTriggered: "1 hour ago",
  },
  {
    id: "reminder-sms",
    name: "Appointment Reminders",
    description: "Send SMS reminders 24 hours before scheduled appointments",
    enabled: false,
    lastTriggered: "yesterday",
  },
  {
    id: "photo-backup",
    name: "Automatic Photo Backup",
    description: "Back up all photos to cloud storage after upload",
    enabled: true,
    lastTriggered: "3 hours ago",
  },
  {
    id: "team-notify",
    name: "Team Notifications",
    description: "Notify team members of new orders and messages",
    enabled: true,
    lastTriggered: "10 minutes ago",
  },
];

export default function AdminAutomation() {
  const [rules, setRules] = useState<AutomationRule[]>(AUTOMATION_RULES);

  const toggleRule = (ruleId: string) => {
    setRules(
      rules.map((rule) =>
        rule.id === ruleId ? { ...rule, enabled: !rule.enabled } : rule
      )
    );
  };

  const enabledCount = rules.filter((r) => r.enabled).length;

  return (
    <AdminLayout title="Automation">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Overview Card */}
        <div className="rounded-2xl border border-gray-100 shadow-sm p-6 bg-white mb-8">
          <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">
            Status
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Automations</p>
              <p className="text-3xl font-bold text-[#0d9488]">
                {enabledCount} of {rules.length}
              </p>
            </div>
            <Zap className="w-12 h-12 text-[#0d9488] opacity-20" />
          </div>
        </div>

        {/* Automation Rules Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="rounded-2xl border border-gray-100 shadow-sm p-6 bg-white hover:shadow-md transition"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-3">
                  <div className={'p-2 rounded-lg ' + (rule.enabled ? 'bg-[#0d9488] text-white' : 'bg-gray-100 text-gray-400')}>
                    {rule.id === 'auto-status' && <CheckCircle2 className="w-5 h-5" />}
                    {rule.id === 'delivery-email' && <Mail className="w-5 h-5" />}
                    {rule.id === 'invoice-gen' && <FileText className="w-5 h-5" />}
                    {rule.id === 'reminder-sms' && <Zap className="w-5 h-5" />}
                    {rule.id === 'photo-backup' && <FileText className="w-5 h-5" />}
                    {rule.id === 'team-notify' && <Mail className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">{rule.name}</h3>
                    <p className="text-xs text-gray-600 mt-1">
                      {rule.description}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => toggleRule(rule.id)}
                  className={'px-3 py-1 rounded-lg text-xs font-semibold transition ' + (rule.enabled ? 'bg-[#0d9488] text-white hover:bg-[#0f766e]' : 'bg-gray-200 text-gray-700 hover:bg-gray-300')}
                >
                  {rule.enabled ? "ON" : "OFF"}
                </button>
              </div>

              <div className="pt-4 border-t border-gray-100">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                  Last Triggered
                </p>
                <p className="text-sm text-gray-700">{rule.lastTriggered}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Help Section */}
        <div className="rounded-2xl border border-gray-100 shadow-sm p-6 bg-gray-50 mt-8">
          <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">
            Tips
          </div>
          <div className="space-y-2 text-sm text-gray-700">
            <p>
              - Enabling automations will help streamline your business operations
            </p>
            <p>
              - Each automation can be toggled independently based on your needs
            </p>
            <p>
              - Check the "Last Triggered" time to monitor automation activity
            </p>
            <p>
              - Automations respect your team's working hours and preferences
            </p>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}