import * as React from "react";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Save, Settings, Shield, Bell, Clock, DollarSign, Camera, Mail, Globe } from "lucide-react";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";

const labelCls = "text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1";
const inputCls = "w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#0d9488]/30";

function Toggle({ label, description, value, onChange }: { label: string; description?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between py-3">
      <div className="flex-1 mr-4">
        <p className="text-sm font-bold text-black">{label}</p>
        {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
      </div>
      <button onClick={() => onChange(!value)}
        className={`w-10 h-6 rounded-full transition-colors relative flex-shrink-0 ${value ? "bg-[#0d9488]" : "bg-gray-200"}`}>
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${value ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}

export default function AdminSettings() {
  const [settings, setSettings] = React.useState<any>({
    // Company
    companyName: "Iconic Images Photography, LLC",
    companyEmail: "cadi@iconicimagestx.com",
    companyPhone: "",
    companyAddress: "2219 Sawdust Rd. #1304 Spring, TX 77380",
    website: "https://iconicimagestx.vercel.app",

    // Booking
    appointmentChangeCutoffHours: 24,
    autoConfirmBookings: false,
    requireDepositForBooking: false,
    depositPercentage: 0,
    defaultAppointmentDuration: 60,

    // Security defaults (new projects)
    defaultLockDownloads: true,
    defaultRequirePayment: true,
    defaultLockStudio: false,
    defaultSocialPermission: false,

    // Notifications
    sendBookingConfirmationEmail: true,
    sendBookingConfirmationText: true,
    sendScheduleConfirmationEmail: true,
    sendDeliveryEmail: true,
    sendInvoiceEmail: true,
    sendPaymentReceiptEmail: true,

    // Editing
    autoEnhanceApiKey: "",
    autoProcessUploads: true,
    requireHumanReview: true,
    editingBatchTime: "22:00",

    // Financials
    taxRate: 8.25,
    defaultPayRate: 75,
    payRateType: "flat_per_project",
    payPeriod: "biweekly",
    editingCostPerPhoto: 0.50,
    avgPhotosPerOrder: 25,
    stripeFeePercent: 2.9,
    stripeFeeFlat: 0.30,

    // Gallery
    galleryExpirationDays: 90,
    maxRevisionRequests: 3,
    watermarkEnabled: true,
  });

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [activeSection, setActiveSection] = React.useState("company");

  React.useEffect(() => {
    getDoc(doc(db, "settings", "global")).then(snap => {
      if (snap.exists()) setSettings((prev: any) => ({ ...prev, ...snap.data() }));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, "settings", "global"), { ...settings, updatedAt: serverTimestamp() }, { merge: true });
      // Also save defaults doc for new project creation
      await setDoc(doc(db, "settings", "defaults"), {
        lockDownloads: settings.defaultLockDownloads,
        requirePayment: settings.defaultRequirePayment,
        lockStudio: settings.defaultLockStudio,
        socialPermission: settings.defaultSocialPermission,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      toast.success("Settings saved!");
    } catch (err) { console.error(err); toast.error("Failed to save."); }
    finally { setSaving(false); }
  };

  const set = (key: string, val: any) => setSettings((prev: any) => ({ ...prev, [key]: val }));

  const sections = [
    { id: "company", label: "Company", icon: Globe },
    { id: "booking", label: "Booking", icon: Clock },
    { id: "security", label: "Security Defaults", icon: Shield },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "editing", label: "Editing Pipeline", icon: Camera },
    { id: "financials", label: "Financials & Payouts", icon: DollarSign },
    { id: "gallery", label: "Gallery & Delivery", icon: Mail },
  ];

  if (loading) return <AdminLayout title="Settings"><div className="flex items-center justify-center py-32"><div className="w-8 h-8 border-4 border-[#0d9488] border-t-transparent rounded-full animate-spin" /></div></AdminLayout>;

  return (
    <AdminLayout title="Settings">
      <div className="flex items-center justify-between mb-6">
        <p className="text-xs text-gray-400">Configure system defaults, notifications, and business rules.</p>
        <Button onClick={handleSave} disabled={saving} className="bg-[#0d9488] hover:bg-[#0f766e] text-white rounded-xl text-xs font-bold">
          <Save className="w-3.5 h-3.5 mr-1.5" />{saving ? "Saving..." : "Save All Settings"}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Section nav */}
        <div className="space-y-1">
          {sections.map(s => {
            const Icon = s.icon;
            return (
              <button key={s.id} onClick={() => setActiveSection(s.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all text-left ${activeSection === s.id ? "bg-[#0d9488]/10 text-[#0d9488]" : "text-gray-400 hover:bg-gray-50 hover:text-gray-700"}`}>
                <Icon className="w-4 h-4 flex-shrink-0" />{s.label}
              </button>
            );
          })}
        </div>

        {/* Settings content */}
        <div className="lg:col-span-3">
          {/* COMPANY */}
          {activeSection === "company" && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
              <h3 className={`${labelCls} text-sm mb-2`}>Company Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div><p className={labelCls}>Company Name</p><input value={settings.companyName} onChange={e => set("companyName", e.target.value)} className={inputCls} /></div>
                <div><p className={labelCls}>Email</p><input value={settings.companyEmail} onChange={e => set("companyEmail", e.target.value)} className={inputCls} /></div>
                <div><p className={labelCls}>Phone</p><input value={settings.companyPhone} onChange={e => set("companyPhone", e.target.value)} className={inputCls} /></div>
                <div><p className={labelCls}>Website</p><input value={settings.website} onChange={e => set("website", e.target.value)} className={inputCls} /></div>
              </div>
              <div><p className={labelCls}>Address</p><input value={settings.companyAddress} onChange={e => set("companyAddress", e.target.value)} className={inputCls} /></div>
            </div>
          )}

          {/* BOOKING */}
          {activeSection === "booking" && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
              <h3 className={`${labelCls} text-sm mb-2`}>Booking Rules</h3>
              <div className="grid grid-cols-2 gap-4">
                <div><p className={labelCls}>Change Cutoff (hours before appt)</p><input type="number" value={settings.appointmentChangeCutoffHours} onChange={e => set("appointmentChangeCutoffHours", Number(e.target.value))} className={inputCls} /></div>
                <div><p className={labelCls}>Default Appointment Duration (min)</p><input type="number" value={settings.defaultAppointmentDuration} onChange={e => set("defaultAppointmentDuration", Number(e.target.value))} className={inputCls} /></div>
              </div>
              <Toggle label="Auto-confirm bookings" description="Skip manual review for returning clients" value={settings.autoConfirmBookings} onChange={v => set("autoConfirmBookings", v)} />
              <Toggle label="Require deposit" description="Require upfront payment to confirm booking" value={settings.requireDepositForBooking} onChange={v => set("requireDepositForBooking", v)} />
              {settings.requireDepositForBooking && (
                <div><p className={labelCls}>Deposit Percentage</p><input type="number" value={settings.depositPercentage} onChange={e => set("depositPercentage", Number(e.target.value))} className={`${inputCls} w-32`} placeholder="%" /></div>
              )}
            </div>
          )}

          {/* SECURITY */}
          {activeSection === "security" && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h3 className={`${labelCls} text-sm mb-2`}>Default Security for New Projects</h3>
              <p className="text-xs text-gray-400 mb-4">These defaults are applied to every new project when created.</p>
              <Toggle label="Lock Downloads" description="Prevent clients from downloading until payment" value={settings.defaultLockDownloads} onChange={v => set("defaultLockDownloads", v)} />
              <Toggle label="Require Payment" description="Invoice must be paid before gallery access" value={settings.defaultRequirePayment} onChange={v => set("defaultRequirePayment", v)} />
              <Toggle label="Lock Studio" description="Disable client editing studio access" value={settings.defaultLockStudio} onChange={v => set("defaultLockStudio", v)} />
              <Toggle label="Social Permission" description="Allow clients to share on social media" value={settings.defaultSocialPermission} onChange={v => set("defaultSocialPermission", v)} />
            </div>
          )}

          {/* NOTIFICATIONS */}
          {activeSection === "notifications" && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h3 className={`${labelCls} text-sm mb-2`}>Notification Preferences</h3>
              <Toggle label="Booking confirmation email" description="Send email when a booking request is received" value={settings.sendBookingConfirmationEmail} onChange={v => set("sendBookingConfirmationEmail", v)} />
              <Toggle label="Booking confirmation text" description="Send SMS when a booking request is received" value={settings.sendBookingConfirmationText} onChange={v => set("sendBookingConfirmationText", v)} />
              <Toggle label="Schedule confirmation email" description="Send email when appointment is confirmed" value={settings.sendScheduleConfirmationEmail} onChange={v => set("sendScheduleConfirmationEmail", v)} />
              <Toggle label="Delivery email" description="Send gallery link when media is delivered" value={settings.sendDeliveryEmail} onChange={v => set("sendDeliveryEmail", v)} />
              <Toggle label="Invoice email" description="Send invoice to client" value={settings.sendInvoiceEmail} onChange={v => set("sendInvoiceEmail", v)} />
              <Toggle label="Payment receipt email" description="Send receipt when payment is received" value={settings.sendPaymentReceiptEmail} onChange={v => set("sendPaymentReceiptEmail", v)} />
            </div>
          )}

          {/* EDITING */}
          {activeSection === "editing" && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
              <h3 className={`${labelCls} text-sm mb-2`}>Editing Pipeline</h3>
              <div><p className={labelCls}>Autoenhance.ai API Key</p><input type="password" value={settings.autoEnhanceApiKey} onChange={e => set("autoEnhanceApiKey", e.target.value)} placeholder="Enter your API key" className={inputCls} /></div>
              <Toggle label="Auto-process uploads" description="Automatically send uploaded photos to Autoenhance.ai" value={settings.autoProcessUploads} onChange={v => set("autoProcessUploads", v)} />
              <Toggle label="Require human review" description="Flag edited photos for manual review before delivery" value={settings.requireHumanReview} onChange={v => set("requireHumanReview", v)} />
              <div><p className={labelCls}>Nightly Batch Time</p><input type="time" value={settings.editingBatchTime} onChange={e => set("editingBatchTime", e.target.value)} className={`${inputCls} w-40`} /></div>
            </div>
          )}

          {/* FINANCIALS */}
          {activeSection === "financials" && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
              <h3 className={`${labelCls} text-sm mb-2`}>Financial Settings</h3>
              <div className="grid grid-cols-2 gap-4">
                <div><p className={labelCls}>Tax Rate (%)</p><input type="number" step="0.01" value={settings.taxRate} onChange={e => set("taxRate", Number(e.target.value))} className={inputCls} /></div>
                <div><p className={labelCls}>Default Photographer Pay ($)</p><input type="number" value={settings.defaultPayRate} onChange={e => set("defaultPayRate", Number(e.target.value))} className={inputCls} /></div>
                <div>
                  <p className={labelCls}>Pay Rate Type</p>
                  <select value={settings.payRateType} onChange={e => set("payRateType", e.target.value)} className={inputCls}>
                    <option value="flat_per_project">Flat per Project</option>
                    <option value="hourly">Hourly</option>
                    <option value="percentage">Percentage of Order</option>
                  </select>
                </div>
                <div>
                  <p className={labelCls}>Pay Period</p>
                  <select value={settings.payPeriod} onChange={e => set("payPeriod", e.target.value)} className={inputCls}>
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Bi-Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div><p className={labelCls}>Editing Cost per Photo ($)</p><input type="number" step="0.01" value={settings.editingCostPerPhoto} onChange={e => set("editingCostPerPhoto", Number(e.target.value))} className={inputCls} /></div>
                <div><p className={labelCls}>Avg Photos per Order</p><input type="number" value={settings.avgPhotosPerOrder} onChange={e => set("avgPhotosPerOrder", Number(e.target.value))} className={inputCls} /></div>
                <div><p className={labelCls}>Stripe Fee (%)</p><input type="number" step="0.1" value={settings.stripeFeePercent} onChange={e => set("stripeFeePercent", Number(e.target.value))} className={inputCls} /></div>
                <div><p className={labelCls}>Stripe Flat Fee ($)</p><input type="number" step="0.01" value={settings.stripeFeeFlat} onChange={e => set("stripeFeeFlat", Number(e.target.value))} className={inputCls} /></div>
              </div>
            </div>
          )}

          {/* GALLERY */}
          {activeSection === "gallery" && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
              <h3 className={`${labelCls} text-sm mb-2`}>Gallery & Delivery</h3>
              <div className="grid grid-cols-2 gap-4">
                <div><p className={labelCls}>Gallery Expiration (days)</p><input type="number" value={settings.galleryExpirationDays} onChange={e => set("galleryExpirationDays", Number(e.target.value))} className={inputCls} /></div>
                <div><p className={labelCls}>Max Revision Requests</p><input type="number" value={settings.maxRevisionRequests} onChange={e => set("maxRevisionRequests", Number(e.target.value))} className={inputCls} /></div>
              </div>
              <Toggle label="Watermark photos" description="Apply watermark to preview photos until payment" value={settings.watermarkEnabled} onChange={v => set("watermarkEnabled", v)} />
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
