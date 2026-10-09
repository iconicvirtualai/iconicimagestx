import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { marketingApi } from "@/lib/marketingApi";
import { buildImportPlan, mapTable, type ColumnMapping, type ImportField, type ImportSummary } from "@shared/emailMarketing/importContacts";
import type { MarketingContact } from "@shared/emailMarketing/types";
import MarketingFrame, { buttonCls, cardCls, ghostCls, inputCls, labelCls } from "@/components/marketing/MarketingFrame";

const FIELD_OPTIONS: { value: ImportField; label: string }[] = [
  { value: "ignore", label: "Skip" },
  { value: "email", label: "Email" },
  { value: "firstName", label: "First name" },
  { value: "lastName", label: "Last name" },
  { value: "company", label: "Company" },
  { value: "phone", label: "Phone" },
  { value: "tags", label: "Tags" },
  { value: "custom", label: "Custom field" },
];

interface ParseResult {
  headers: string[];
  rows: string[][];
  rowCount: number;
  suggested: ColumnMapping;
}

export default function ImportPage() {
  const { user } = useAuth();
  const token = () => user?.getIdToken();
  const [paste, setPaste] = useState("email,first name,last name,company,tags\nada@example.com,Ada,Lovelace,Analytical,vip");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [extraTag, setExtraTag] = useState("");
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState("");
  const [existing, setExisting] = useState<MarketingContact[]>([]);

  const preview = useMemo(() => {
    if (!parsed) return null;
    return buildImportPlan({
      rows: mapTable({ headers: parsed.headers, rows: parsed.rows }, mapping),
      existing,
      now: new Date().toISOString(),
      extraTags: extraTag ? [extraTag] : [],
    });
  }, [parsed, mapping, existing, extraTag]);

  async function loadExisting() {
    const data = await marketingApi<{ contacts: MarketingContact[] }>(token, "/api/marketing/contacts");
    setExisting(data.contacts);
  }

  async function parsePayload(body: Record<string, string>) {
    setError("");
    setSummary(null);
    const result = await marketingApi<ParseResult>(token, "/api/marketing/imports/parse", {
      method: "POST",
      body: JSON.stringify(body),
    });
    setParsed(result);
    setMapping(result.suggested);
    await loadExisting();
  }

  async function onFile(file: File) {
    const filename = file.name;
    if (filename.toLowerCase().endsWith(".csv") || file.type.includes("csv") || file.type.startsWith("text/")) {
      const text = await file.text();
      setPaste(text);
      await parsePayload({ text, filename });
      return;
    }
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const value = String(reader.result || "");
        resolve(value.split(",")[1] || "");
      };
      reader.onerror = () => reject(new Error("Could not read that file."));
      reader.readAsDataURL(file);
    });
    await parsePayload({ base64, filename });
  }

  async function commit() {
    if (!parsed) return;
    setError("");
    try {
      const result = await marketingApi<{ summary: ImportSummary }>(token, "/api/marketing/imports/commit", {
        method: "POST",
        body: JSON.stringify({
          headers: parsed.headers,
          rows: parsed.rows,
          mapping,
          extraTags: extraTag ? [extraTag] : [],
        }),
      });
      setSummary(result.summary);
      await loadExisting();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    }
  }

  return (
    <MarketingFrame title="Import" subtitle="Paste a sheet, or upload CSV or Excel. Map the columns, check bad and duplicate emails, then import.">
      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={`${cardCls} p-5`}>
          <label className={labelCls}>Paste</label>
          <textarea className={`${inputCls} min-h-48 font-mono text-xs`} value={paste} onChange={(event) => setPaste(event.target.value)} />
          <button type="button" className={`${buttonCls} mt-3`} onClick={() => parsePayload({ text: paste, filename: "paste.csv" }).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not read that paste."))}>Preview paste</button>
        </section>
        <section className={`${cardCls} p-5`}>
          <p className={labelCls}>CSV or XLSX</p>
          <input
            className={inputCls}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onFile(file).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not read that file."));
            }}
          />
          <p className="mt-3 text-sm text-gray-500">The first row is the header. Duplicate emails update the existing person instead of creating a second contact.</p>
        </section>
      </div>

      {parsed ? (
        <section className={`${cardCls} mt-4 p-5`}>
          <h2 className="text-sm font-black uppercase tracking-widest text-gray-900">Column mapping · {parsed.rowCount} rows</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {parsed.headers.map((header) => (
              <label key={header}>
                <span className={labelCls}>{header}</span>
                <select className={inputCls} value={mapping[header] || "ignore"} onChange={(event) => setMapping({ ...mapping, [header]: event.target.value as ImportField })}>
                  {FIELD_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            ))}
            <label>
              <span className={labelCls}>Also tag everyone</span>
              <input className={inputCls} value={extraTag} placeholder="Optional tag" onChange={(event) => setExtraTag(event.target.value)} />
            </label>
          </div>
          {preview ? (
            <div className="mt-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["New", preview.summary.created],
                  ["Updated", preview.summary.updated],
                  ["Duplicates in file", preview.summary.duplicatesInFile],
                  ["Invalid", preview.summary.invalid.length],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-xl bg-gray-50 p-3">
                    <p className={labelCls}>{label}</p>
                    <p className="text-2xl font-black text-gray-900">{value}</p>
                  </div>
                ))}
              </div>
              {preview.summary.invalid.length ? (
                <ul className="mt-4 max-h-40 space-y-1 overflow-auto text-sm text-red-700">
                  {preview.summary.invalid.slice(0, 20).map((issue) => (
                    <li key={`${issue.row}-${issue.email}`}>Row {issue.row}: {issue.reason}{issue.email ? ` (${issue.email})` : ""}</li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-4 overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                    <tr><th className="py-2">Email</th><th>Name</th><th>Tags</th></tr>
                  </thead>
                  <tbody>
                    {preview.upserts.slice(0, 8).map((contact) => (
                      <tr key={contact.email} className="border-t border-gray-100">
                        <td className="py-2 font-semibold">{contact.email}</td>
                        <td>{contact.firstName} {contact.lastName}</td>
                        <td>{contact.tags.join(", ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" className={`${buttonCls} mt-4`} onClick={commit}>Import {preview.summary.created + preview.summary.updated} contacts</button>
            </div>
          ) : null}
        </section>
      ) : null}

      {summary ? (
        <section className={`${cardCls} mt-4 p-5`}>
          <h2 className="text-sm font-black uppercase tracking-widest text-gray-900">Import summary</h2>
          <p className="mt-2 text-sm text-gray-600">{summary.created} created, {summary.updated} updated, {summary.duplicatesInFile} duplicate rows collapsed, {summary.invalid.length} rows skipped.</p>
          <Link className={`${ghostCls} mt-4`} to="/admin/communications/email/contacts">View contacts</Link>
        </section>
      ) : null}
    </MarketingFrame>
  );
}
