import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Mail, 
  Settings, 
  Save, 
  Tag, 
  Eye, 
  Clock,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { toast } from "sonner";

interface EmailTemplate {
  subject: string;
  body: string;
  trigger: string;
}

const MERGE_TAGS = [
  { label: "Client Name", tag: "{{clientName}}" },
  { label: "Client Email", tag: "{{clientEmail}}" },
  { label: "Client Phone", tag: "{{clientPhone}}" },
  { label: "Property Address", tag: "{{propertyAddress}}" },
  { label: "SqFt", tag: "{{sqft}}" },
  { label: "Service Date", tag: "{{serviceDate}}" },
  { label: "Service Time", tag: "{{serviceTime}}" },
  { label: "Selected Service", tag: "{{selectedService}}" },
  { label: "Total Estimate", tag: "{{totalEstimate}}" },
  { label: "Order ID", tag: "{{orderId}}" },
];

const SAMPLE_DATA = {
  clientName: "Sarah Jenkins",
  clientEmail: "sarah@example.com",
  clientPhone: "(555) 123-4567",
  propertyAddress: "1245 Willow Creek Dr, Houston, TX 77001",
  sqft: "2,450",
  serviceDate: "May 24, 2024",
  serviceTime: "10:00 AM",
  selectedService: "The Showcase Package",
  totalEstimate: "$549.00",
  orderId: "8245",
};

export default function AdminEmailTemplates() {
  const [activeTab, setActiveTab] = useState("clientConfirmation");
  const [templates, setTemplates] = useState<{ [key: string]: EmailTemplate }>({
    clientConfirmation: { subject: "", body: "", trigger: "immediate" },
    ownerNotification: { subject: "", body: "", trigger: "immediate" },
    appointmentReminders: { subject: "", body: "", trigger: "24h_before" },
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    async function fetchTemplates() {
      try {
        const docIds = ["clientConfirmation", "ownerNotification", "appointmentReminders"];
        const fetchedTemplates: { [key: string]: EmailTemplate } = {};

        for (const id of docIds) {
          const docRef = doc(db, "emailTemplates", id);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            fetchedTemplates[id] = docSnap.data() as EmailTemplate;
          } else {
            // Default templates if they don't exist
            fetchedTemplates[id] = {
              subject: id === "clientConfirmation" ? "Booking Confirmed: {{selectedService}}" : 
                       id === "ownerNotification" ? "New Booking: {{propertyAddress}}" : 
                       "Reminder: Your shoot at {{propertyAddress}} is tomorrow!",
              body: id === "clientConfirmation" ? "Hi {{clientName}},\n\nYour booking is confirmed for {{serviceDate}} at {{serviceTime}}.\n\nAddress: {{propertyAddress}}\nService: {{selectedService}}\nTotal: {{totalEstimate}}\n\nSee you then!" :
                    id === "ownerNotification" ? "New booking received from {{clientName}}.\n\nProperty: {{propertyAddress}}\nDate: {{serviceDate}} at {{serviceTime}}\nOrder ID: {{orderId}}" :
                    "Hi {{clientName}},\n\nThis is a friendly reminder for your shoot tomorrow at {{propertyAddress}}.\n\nTime: {{serviceTime}}\n\nBest,\nIconic Images",
              trigger: id === "appointmentReminders" ? "24h_before" : "immediate",
            };
          }
        }
        setTemplates(fetchedTemplates);
      } catch (error) {
        console.error("Error fetching templates:", error);
        toast.error("Failed to load templates");
      } finally {
        setLoading(false);
      }
    }
    fetchTemplates();
  }, []);

  const handleUpdate = (field: keyof EmailTemplate, value: string) => {
    setTemplates(prev => ({
      ...prev,
      [activeTab]: {
        ...prev[activeTab],
        [field]: value
      }
    }));
  };

  const insertTag = (tag: string) => {
    const textarea = bodyRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const body = templates[activeTab].body;
    const newBody = body.substring(0, start) + tag + body.substring(end);
    
    handleUpdate("body", newBody);
    
    // Focus back and set cursor after the tag
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + tag.length, start + tag.length);
    }, 0);
  };

  const saveTemplate = async () => {
    setSaving(true);
    try {
      const docRef = doc(db, "emailTemplates", activeTab);
      await setDoc(docRef, templates[activeTab]);
      toast.success("Template saved successfully");
    } catch (error) {
      console.error("Error saving template:", error);
      toast.error("Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  const renderPreview = (text: string) => {
    let preview = text;
    Object.entries(SAMPLE_DATA).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, "g");
      preview = preview.replace(regex, value);
    });
    return preview;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafafa]">
        <div className="w-8 h-8 border-4 border-[#0d9488] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#fafafa]">
      <Header />
      
      <main className="flex-1 pt-32 pb-24">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-12">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Mail className="w-5 h-5 text-[#0d9488]" />
                <h1 className="text-3xl font-black text-black tracking-tight uppercase">Email Templates</h1>
              </div>
              <p className="text-gray-400 font-bold text-xs uppercase tracking-widest">Manage Automated Communications</p>
            </div>
            
            <Button 
              onClick={saveTemplate} 
              disabled={saving}
              className="bg-[#0d9488] hover:bg-[#0f766e] text-white font-bold rounded-xl px-8 py-6 h-auto shadow-lg shadow-[#0d9488]/20 transition-all hover:scale-[1.02] active:scale-95"
            >
              {saving ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <Save className="w-5 h-5 mr-2" /> Save Template
                </>
              )}
            </Button>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="bg-white border border-gray-100 p-1 rounded-2xl mb-8 w-full md:w-auto h-auto grid grid-cols-1 md:flex">
              <TabsTrigger value="clientConfirmation" className="rounded-xl px-6 py-3 font-bold text-xs uppercase tracking-widest data-[state=active]:bg-[#f0fdfa] data-[state=active]:text-[#0d9488]">
                Client Confirmation
              </TabsTrigger>
              <TabsTrigger value="ownerNotification" className="rounded-xl px-6 py-3 font-bold text-xs uppercase tracking-widest data-[state=active]:bg-[#f0fdfa] data-[state=active]:text-[#0d9488]">
                New Booking Notification
              </TabsTrigger>
              <TabsTrigger value="appointmentReminders" className="rounded-xl px-6 py-3 font-bold text-xs uppercase tracking-widest data-[state=active]:bg-[#f0fdfa] data-[state=active]:text-[#0d9488]">
                Appointment Reminders
              </TabsTrigger>
            </TabsList>

            {Object.keys(templates).map((tabId) => (
              <TabsContent key={tabId} value={tabId} className="mt-0">
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                  {/* Editor Side */}
                  <div className="lg:col-span-3 space-y-6">
                    <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm">
                      <div className="space-y-6">
                        {/* Trigger Section */}
                        <div className="space-y-3">
                          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 flex items-center gap-2">
                            <Clock className="w-3 h-3" /> Sending Trigger
                          </label>
                          <select 
                            value={templates[tabId].trigger}
                            onChange={(e) => handleUpdate("trigger", e.target.value)}
                            className="w-full bg-[#fafafa] border border-gray-50 rounded-xl px-4 py-3 text-sm font-bold text-black focus:border-[#0d9488] outline-none transition-all"
                          >
                            <option value="immediate">Immediately upon booking</option>
                            <option value="1h_after">1 hour after booking</option>
                            <option value="2h_after">2 hours after booking</option>
                            <option value="24h_before">24 hours before appointment</option>
                            <option value="48h_before">48 hours before appointment</option>
                            <option value="1h_before">1 hour before appointment</option>
                          </select>
                        </div>

                        {/* Subject Line */}
                        <div className="space-y-3">
                          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 flex items-center gap-2">
                            <Mail className="w-3 h-3" /> Email Subject
                          </label>
                          <Input 
                            value={templates[tabId].subject}
                            onChange={(e) => handleUpdate("subject", e.target.value)}
                            placeholder="Enter subject line..."
                            className="bg-[#fafafa] border-gray-50 rounded-xl px-4 py-6 font-bold text-black"
                          />
                        </div>

                        {/* Merge Tags Toolbar */}
                        <div className="space-y-3">
                          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 flex items-center gap-2">
                            <Tag className="w-3 h-3" /> Insert Merge Tags
                          </label>
                          <div className="flex flex-wrap gap-2 p-3 bg-[#fafafa] rounded-2xl border border-gray-50">
                            {MERGE_TAGS.map((tag) => (
                              <button
                                key={tag.tag}
                                onClick={() => insertTag(tag.tag)}
                                className="px-3 py-1.5 bg-white border border-gray-100 rounded-lg text-[10px] font-bold text-gray-600 hover:border-[#0d9488] hover:text-[#0d9488] transition-all whitespace-nowrap"
                              >
                                {tag.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Body Text */}
                        <div className="space-y-3">
                          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 flex items-center gap-2">
                            <Settings className="w-3 h-3" /> Email Content
                          </label>
                          <Textarea 
                            ref={bodyRef}
                            value={templates[tabId].body}
                            onChange={(e) => handleUpdate("body", e.target.value)}
                            placeholder="Write your email here..."
                            className="min-h-[400px] bg-[#fafafa] border-gray-50 rounded-[2rem] p-6 font-medium text-black leading-relaxed"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Preview Side */}
                  <div className="lg:col-span-2 space-y-6">
                    <div className="bg-black rounded-[2.5rem] p-8 text-white h-full sticky top-32 overflow-hidden group">
                      <div className="absolute top-0 right-0 p-12 opacity-[0.05] group-hover:scale-110 transition-transform duration-700">
                        <Eye className="w-64 h-64" />
                      </div>
                      
                      <div className="relative z-10 flex flex-col h-full">
                        <div className="flex items-center justify-between mb-8">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-[#0d9488] animate-pulse"></div>
                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#0d9488]">Live Preview</span>
                          </div>
                          <span className="text-[10px] font-bold text-gray-500 italic">Sample Data Applied</span>
                        </div>

                        <div className="bg-white rounded-2xl p-6 text-black space-y-4 shadow-2xl">
                          <div className="pb-4 border-b border-gray-100">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Subject</p>
                            <p className="text-sm font-black">{renderPreview(templates[tabId].subject) || "No subject set"}</p>
                          </div>
                          
                          <div className="pt-2">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Message Body</p>
                            <div className="text-sm leading-relaxed whitespace-pre-line font-medium text-gray-700">
                              {renderPreview(templates[tabId].body) || "No content set"}
                            </div>
                          </div>
                        </div>

                        <div className="mt-auto pt-8">
                          <div className="bg-[#1a1a1a] rounded-2xl p-5 border border-white/5">
                            <div className="flex items-center gap-3 mb-3">
                              <div className="w-8 h-8 rounded-lg bg-[#0d9488]/20 flex items-center justify-center">
                                <CheckCircle2 className="w-4 h-4 text-[#0d9488]" />
                              </div>
                              <p className="text-xs font-bold">Automation Active</p>
                            </div>
                            <p className="text-[10px] text-gray-500 leading-relaxed font-medium">
                              This template will be sent using the <strong>{templates[tabId].trigger.replace('_', ' ')}</strong> trigger.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </main>

      <Footer />
    </div>
  );
}
