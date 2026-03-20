import * as React from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, collection, onSnapshot } from "firebase/firestore";
import { Mail, Save, Code, Eye, Info, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

interface EmailTemplate {
  id: string;
  label: string;
  trigger: string;
  subject: string;
  body: string;
}

const TEMPLATE_METADATA = [
  {
    id: "clientConfirmation",
    label: "Client Order Confirmation",
    trigger: "Sent to client when a new order is created",
  },
  {
    id: "ownerNotification",
    label: "Owner New Order Alert",
    trigger: "Sent to orders@iconicimagestx.com when a new order is created",
  },
  {
    id: "clientAppointmentConfirmed",
    label: "Appointment Confirmation",
    trigger: "Sent to client when appointment status changes to 'confirmed'",
  },
  {
    id: "clientReminder3Day",
    label: "3-Day Appointment Reminder",
    trigger: "Sent to client 3 days before appointment start time",
  },
  {
    id: "clientReminder24Hour",
    label: "24-Hour Appointment Reminder",
    trigger: "Sent to client 24 hours before appointment start time",
  },
];

const ORDER_TAGS = [
  "{clientName}", "{clientEmail}", "{clientPhone}", 
  "{propertyAddress}", "{services}", "{notes}", "{orderId}"
];

const APPOINTMENT_TAGS = [
  "{appointmentDate}", "{appointmentTime}", "{appointmentAddress}", 
  "{city}", "{state}", "{zip}", "{status}"
];

const SAMPLE_DATA: Record<string, string> = {
  "{clientName}": "John Doe",
  "{clientEmail}": "john.doe@example.com",
  "{clientPhone}": "(555) 123-4567",
  "{propertyAddress}": "123 Iconic Lane, Austin, TX 78701",
  "{services}": "Standard Photography, Social Media Optimized",
  "{notes}": "Gate code: 1234. Please capture the sunset view.",
  "{orderId}": "ORD-12345",
  "{appointmentDate}": "2023-10-25",
  "{appointmentTime}": "10:00 AM",
  "{appointmentAddress}": "123 Iconic Lane, Austin, TX 78701",
  "{city}": "Austin",
  "{state}": "TX",
  "{zip}": "78701",
  "{status}": "confirmed"
};

export default function AdminEmailTemplates() {
  const [templates, setTemplates] = React.useState<Record<string, { subject: string; body: string }>>({});
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const unsub = onSnapshot(collection(db, "emailTemplates"), (snapshot) => {
      const data: Record<string, { subject: string; body: string }> = {};
      snapshot.forEach((doc) => {
        data[doc.id] = doc.data() as { subject: string; body: string };
      });
      setTemplates(data);
      setLoading(false);
      
      // Check for missing templates and initialize them
      initializeMissingTemplates(data);
    });

    return () => unsub();
  }, []);

  const initializeMissingTemplates = async (currentData: Record<string, { subject: string; body: string }>) => {
    const missing = ["clientAppointmentConfirmed", "clientReminder3Day", "clientReminder24Hour"].filter(
      (id) => !currentData[id]
    );

    if (missing.length > 0) {
      for (const id of missing) {
        const metadata = TEMPLATE_METADATA.find(m => m.id === id);
        await setDoc(doc(db, "emailTemplates", id), {
          subject: `${metadata?.label || id} - {propertyAddress}`,
          body: `Hi {clientName},\n\nThis is a notification regarding your appointment at {propertyAddress}.\n\nDate: {appointmentDate}\nTime: {appointmentTime}\n\nThank you!`
        });
      }
      toast.info("Initialized missing templates");
    }
  };

  const handleSave = async (id: string) => {
    const template = templates[id];
    if (!template) return;

    try {
      await setDoc(doc(db, "emailTemplates", id), template);
      toast.success(`Template '${id}' saved successfully!`);
    } catch (error) {
      console.error(error);
      toast.error("Failed to save template.");
    }
  };

  const updateTemplate = (id: string, field: "subject" | "body", value: string) => {
    setTemplates((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value
      }
    }));
  };

  const insertTag = (id: string, field: "subject" | "body", tag: string) => {
    const element = document.getElementById(`${id}-${field}`) as HTMLTextAreaElement | HTMLInputElement;
    if (!element) return;

    const start = element.selectionStart || 0;
    const end = element.selectionEnd || 0;
    const text = templates[id]?.[field] || "";
    const newValue = text.substring(0, start) + tag + text.substring(end);
    
    updateTemplate(id, field, newValue);

    // Re-focus and set cursor position after render
    setTimeout(() => {
      element.focus();
      const newPos = start + tag.length;
      element.setSelectionRange(newPos, newPos);
    }, 10);
  };

  const renderPreview = (text: string) => {
    let preview = text;
    Object.entries(SAMPLE_DATA).forEach(([tag, value]) => {
      preview = preview.replaceAll(tag, value);
    });
    return preview;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0d9488]"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#f8fafc]">
      <Header />
      
      <main className="flex-1 pt-24 pb-12">
        {/* Sub-Header */}
        <div className="bg-white border-b border-slate-200 sticky top-[72px] z-30 px-6 py-3">
          <div className="max-w-[1000px] mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button asChild variant="ghost" size="sm" className="rounded-xl h-9 hover:bg-slate-100">
                <Link to="/admin/edit-site">
                  <ChevronLeft className="w-4 h-4 mr-1" /> Back
                </Link>
              </Button>
              <div className="w-px h-6 bg-slate-200" />
              <div className="p-2 bg-slate-100 rounded-lg">
                <Mail className="w-4 h-4 text-[#0d9488]" />
              </div>
              <div>
                <h1 className="text-sm font-black text-slate-900 uppercase tracking-widest">Email Templates</h1>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Manage Notifications & Automation</p>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-[1000px] mx-auto px-6 mt-8">
          <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden mb-8">
            <div className="p-8 border-b border-slate-50 flex items-center gap-4">
              <div className="p-3 bg-blue-50 rounded-2xl">
                <Info className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">System Notification Editor</h3>
                <p className="text-xs font-medium text-slate-400">Use merge tags to personalize emails with dynamic data from orders and appointments.</p>
              </div>
            </div>
            
            <div className="p-8">
              <Accordion type="single" collapsible className="space-y-4">
                {TEMPLATE_METADATA.map((meta) => (
                  <AccordionItem 
                    key={meta.id} 
                    value={meta.id}
                    className="border border-slate-200 rounded-3xl overflow-hidden px-4 transition-all data-[state=open]:border-[#0d9488]/30 data-[state=open]:bg-[#0d9488]/[0.02]"
                  >
                    <AccordionTrigger className="hover:no-underline py-6">
                      <div className="flex flex-col items-start text-left gap-1">
                        <span className="text-sm font-black text-slate-900 uppercase tracking-tight">{meta.label}</span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{meta.trigger}</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-8 pt-2">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Editor Side */}
                        <div className="space-y-6">
                          <div className="space-y-3">
                            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Email Subject</Label>
                            <Input 
                              id={`${meta.id}-subject`}
                              value={templates[meta.id]?.subject || ""}
                              onChange={(e) => updateTemplate(meta.id, "subject", e.target.value)}
                              className="rounded-xl border-slate-200 font-bold"
                              placeholder="Email subject line..."
                            />
                          </div>

                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Email Body</Label>
                              <div className="flex gap-1">
                                <Code className="w-3 h-3 text-slate-400" />
                              </div>
                            </div>
                            <Textarea 
                              id={`${meta.id}-body`}
                              value={templates[meta.id]?.body || ""}
                              onChange={(e) => updateTemplate(meta.id, "body", e.target.value)}
                              className="min-h-[300px] rounded-2xl border-slate-200 focus:ring-[#0d9488]/20 text-sm leading-relaxed"
                              placeholder="Write your email content here..."
                            />
                          </div>

                          {/* Merge Tag Toolbar */}
                          <div className="space-y-4 pt-4 border-t border-slate-100">
                            <div className="space-y-2">
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Order Tags</p>
                              <div className="flex flex-wrap gap-2">
                                {ORDER_TAGS.map(tag => (
                                  <button
                                    key={tag}
                                    onClick={() => insertTag(meta.id, "body", tag)}
                                    className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md text-[10px] font-bold transition-colors"
                                  >
                                    {tag}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Appointment Tags</p>
                              <div className="flex flex-wrap gap-2">
                                {APPOINTMENT_TAGS.map(tag => (
                                  <button
                                    key={tag}
                                    onClick={() => insertTag(meta.id, "body", tag)}
                                    className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md text-[10px] font-bold transition-colors"
                                  >
                                    {tag}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>

                          <Button 
                            onClick={() => handleSave(meta.id)}
                            className="w-full h-12 bg-[#0d9488] hover:bg-[#0f766e] text-white font-black text-xs uppercase tracking-widest rounded-2xl"
                          >
                            <Save className="w-4 h-4 mr-2" /> Save Template
                          </Button>
                        </div>

                        {/* Preview Side */}
                        <div className="space-y-4">
                          <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <Eye className="w-3 h-3" /> Live Preview
                          </Label>
                          <Card className="rounded-[2rem] border-slate-200 shadow-none bg-white overflow-hidden h-full min-h-[500px]">
                            <div className="bg-slate-50 p-4 border-b border-slate-200">
                              <div className="flex gap-2 mb-2">
                                <div className="w-3 h-3 rounded-full bg-slate-200" />
                                <div className="w-3 h-3 rounded-full bg-slate-200" />
                                <div className="w-3 h-3 rounded-full bg-slate-200" />
                              </div>
                              <p className="text-[11px] font-bold text-slate-400"><span className="text-slate-600">Subject:</span> {renderPreview(templates[meta.id]?.subject || "")}</p>
                            </div>
                            <CardContent className="p-8 pt-6">
                              <div className="prose prose-sm max-w-none">
                                <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                                  {renderPreview(templates[meta.id]?.body || "")}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
