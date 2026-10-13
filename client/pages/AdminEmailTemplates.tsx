import * as React from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { db } from "@/lib/firebase";
import { collection, deleteDoc, doc, onSnapshot, setDoc } from "firebase/firestore";
import { ChevronLeft, Eye, Mail, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import {
  CLIENT_EMAIL_TEMPLATES,
  EMAIL_TEMPLATES_COLLECTION,
  type ClientEmailTemplateKey,
  type EmailTemplateOverride,
  clientEmailPreview,
  defaultEmailTemplate,
  isClientEmailTemplate,
  readEmailTemplateOverride,
} from "@shared/clientEmailTemplates";

function blankDrafts(): Record<ClientEmailTemplateKey, EmailTemplateOverride> {
  return Object.fromEntries(
    CLIENT_EMAIL_TEMPLATES.map((meta) => [meta.id, defaultEmailTemplate(meta.id)]),
  ) as Record<ClientEmailTemplateKey, EmailTemplateOverride>;
}

function sameAsDefault(key: ClientEmailTemplateKey, draft: EmailTemplateOverride): boolean {
  const defaults = defaultEmailTemplate(key);
  return draft.subject === defaults.subject && draft.htmlBody === defaults.htmlBody;
}

export function EmailPreviewFrame({
  templateKey,
  draft,
}: {
  templateKey: ClientEmailTemplateKey;
  draft: EmailTemplateOverride;
}) {
  const preview = clientEmailPreview(templateKey, draft);
  const srcDoc = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#ffffff;">${preview.html}</body></html>`;
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white overflow-hidden" data-email-preview={templateKey}>
      <div className="bg-slate-50 p-4 border-b border-slate-200">
        <div className="flex gap-2 mb-2" aria-hidden="true">
          <div className="w-3 h-3 rounded-full bg-slate-200" />
          <div className="w-3 h-3 rounded-full bg-slate-200" />
          <div className="w-3 h-3 rounded-full bg-slate-200" />
        </div>
        <p className="text-[11px] font-bold text-slate-500" data-email-subject={templateKey}>
          <span className="text-slate-700">Subject:</span> {preview.subject}
        </p>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">
          {preview.builtin ? "Built-in email" : "Your edited email"}
        </p>
      </div>
      <iframe
        title={`${templateKey} preview`}
        sandbox=""
        srcDoc={srcDoc}
        className="w-full h-[640px] border-0 bg-white"
      />
    </div>
  );
}

export function ClientEmailTemplateStudio({
  initialKey = "booking_received",
  subscribe = true,
}: {
  initialKey?: ClientEmailTemplateKey;
  /** Tests and local previews can skip the Firestore listener. */
  subscribe?: boolean;
}) {
  const [drafts, setDrafts] = React.useState(blankDrafts);
  const [selected, setSelected] = React.useState<ClientEmailTemplateKey>(initialKey);
  const [saving, setSaving] = React.useState(false);
  const hydrated = React.useRef(false);

  React.useEffect(() => {
    if (!subscribe) return undefined;
    let unsubscribe = () => {};
    try {
      unsubscribe = onSnapshot(
        collection(db, EMAIL_TEMPLATES_COLLECTION),
        (snapshot) => {
          if (hydrated.current) return;
          hydrated.current = true;
          setDrafts((current) => {
            const next = { ...current };
            snapshot.forEach((row) => {
              if (!isClientEmailTemplate(row.id)) return;
              const override = readEmailTemplateOverride(row.data());
              if (override) next[row.id] = override;
            });
            return next;
          });
        },
        () => {
          hydrated.current = true;
        },
      );
    } catch {
      hydrated.current = true;
    }
    return () => unsubscribe();
  }, [subscribe]);

  const meta = CLIENT_EMAIL_TEMPLATES.find((item) => item.id === selected) || CLIENT_EMAIL_TEMPLATES[0];
  const draft = drafts[meta.id];

  const updateDraft = (field: keyof EmailTemplateOverride, value: string) => {
    setDrafts((current) => ({
      ...current,
      [meta.id]: { ...current[meta.id], [field]: value },
    }));
  };

  const insertPlaceholder = (field: keyof EmailTemplateOverride, name: string) => {
    const token = `{{${name}}}`;
    const element = document.getElementById(`${meta.id}-${field}`) as HTMLInputElement | HTMLTextAreaElement | null;
    const text = draft[field] || "";
    if (!element) {
      updateDraft(field, `${text}${token}`);
      return;
    }
    const start = element.selectionStart ?? text.length;
    const end = element.selectionEnd ?? text.length;
    updateDraft(field, text.slice(0, start) + token + text.slice(end));
    window.setTimeout(() => {
      element.focus();
      const cursor = start + token.length;
      element.setSelectionRange(cursor, cursor);
    }, 0);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const ref = doc(db, EMAIL_TEMPLATES_COLLECTION, meta.id);
      if (sameAsDefault(meta.id, draft)) {
        await deleteDoc(ref);
        toast.success("Using the built-in email");
      } else {
        await setDoc(ref, { subject: draft.subject, htmlBody: draft.htmlBody });
        toast.success("Template saved");
      }
    } catch (error) {
      console.error(error);
      toast.error("Could not save this template");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setDrafts((current) => ({ ...current, [meta.id]: defaultEmailTemplate(meta.id) }));
    try {
      await deleteDoc(doc(db, EMAIL_TEMPLATES_COLLECTION, meta.id));
      toast.success("Reset to the built-in email");
    } catch (error) {
      console.error(error);
      toast.error("The editor was reset. The saved copy could not be removed.");
    }
  };

  return (
    <div className="max-w-[1180px] mx-auto px-6 mt-8" data-client-email-studio>
      <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-slate-100">
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight">Client email editor</h2>
          <p className="text-xs font-medium text-slate-500 mt-1">
            Edit the subject and HTML for each automated client email. The preview uses sample order #104.
            An empty or invalid save falls back to the built-in copy.
          </p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)]">
          <div className="border-b lg:border-b-0 lg:border-r border-slate-100 p-4 space-y-2">
            {CLIENT_EMAIL_TEMPLATES.map((item) => (
              <button
                key={item.id}
                type="button"
                data-template={item.id}
                onClick={() => setSelected(item.id)}
                className={`w-full text-left rounded-2xl px-4 py-3 transition-colors ${
                  item.id === meta.id ? "bg-[#0d9488] text-white" : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                <span className="block text-xs font-black uppercase tracking-tight">{item.label}</span>
                <span className={`block text-[10px] mt-1 ${item.id === meta.id ? "text-white/80" : "text-slate-400"}`}>
                  {item.id}
                </span>
              </button>
            ))}
          </div>
          <div className="p-6 lg:p-8 grid grid-cols-1 xl:grid-cols-2 gap-8">
            <div className="space-y-5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{meta.trigger}</p>
              <div className="space-y-2">
                <Label htmlFor={`${meta.id}-subject`} className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Email subject
                </Label>
                <Input
                  id={`${meta.id}-subject`}
                  value={draft.subject}
                  onChange={(event) => updateDraft("subject", event.target.value)}
                  className="rounded-xl border-slate-200 font-bold"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${meta.id}-htmlBody`} className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  HTML body
                </Label>
                <Textarea
                  id={`${meta.id}-htmlBody`}
                  value={draft.htmlBody}
                  onChange={(event) => updateDraft("htmlBody", event.target.value)}
                  className="min-h-[320px] rounded-2xl border-slate-200 font-mono text-xs leading-relaxed"
                />
              </div>
              <div className="space-y-2">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Placeholders</p>
                <div className="flex flex-wrap gap-2">
                  {meta.placeholders.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => insertPlaceholder("htmlBody", name)}
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md text-[10px] font-bold"
                    >
                      {`{{${name}}}`}
                    </button>
                  ))}
                </div>
              </div>
              {meta.id === "payment_receipt" && sameAsDefault(meta.id, draft) ? (
                <p className="text-xs text-slate-500">
                  Leaving this source unchanged keeps the branded receipt, including the processing line and download unlock note.
                </p>
              ) : null}
              <div className="flex gap-3">
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 h-12 bg-[#0d9488] hover:bg-[#0f766e] text-white font-black text-xs uppercase tracking-widest rounded-2xl"
                >
                  <Save className="w-4 h-4 mr-2" /> Save template
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleReset}
                  className="h-12 rounded-2xl font-black text-xs uppercase tracking-widest"
                >
                  <RotateCcw className="w-4 h-4 mr-2" /> Reset to default
                </Button>
              </div>
            </div>
            <div className="space-y-3">
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Eye className="w-3 h-3" /> Live preview
              </Label>
              <EmailPreviewFrame templateKey={meta.id} draft={draft} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminEmailTemplates() {
  return (
    <div className="flex flex-col min-h-screen bg-[#f8fafc]">
      <Header />
      <main className="flex-1 pt-24 pb-12">
        <div className="bg-white border-b border-slate-200 sticky top-[72px] z-30 px-6 py-3">
          <div className="max-w-[1180px] mx-auto flex items-center gap-3">
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
              <p className="text-[10px] font-bold text-slate-400 uppercase">Client emails</p>
            </div>
          </div>
        </div>
        <ClientEmailTemplateStudio />
      </main>
      <Footer />
    </div>
  );
}

export default AdminEmailTemplates;
