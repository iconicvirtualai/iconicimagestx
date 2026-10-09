import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { marketingApi } from "@/lib/marketingApi";
import { EMPTY_SEGMENT_FILTER, type SegmentFilter } from "@shared/emailMarketing/types";
import MarketingFrame, { buttonCls, cardCls, ghostCls, inputCls, labelCls } from "@/components/marketing/MarketingFrame";

interface SegmentRow {
  id: string;
  name: string;
  filter: SegmentFilter;
  count: number;
}

function tagsFrom(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export default function SegmentsPage() {
  const { user } = useAuth();
  const token = () => user?.getIdToken();
  const [segments, setSegments] = useState<SegmentRow[]>([]);
  const [name, setName] = useState("");
  const [filter, setFilter] = useState<SegmentFilter>(EMPTY_SEGMENT_FILTER);
  const [tagText, setTagText] = useState({ all: "", any: "", none: "" });
  const [editing, setEditing] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const data = await marketingApi<{ segments: SegmentRow[] }>(token, "/api/marketing/segments");
    setSegments(data.segments);
  }

  useEffect(() => {
    load().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load segments."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await marketingApi(token, "/api/marketing/segments", {
        method: "POST",
        body: JSON.stringify({ id: editing || undefined, name, filter }),
      });
      setName("");
      setFilter(EMPTY_SEGMENT_FILTER);
      setTagText({ all: "", any: "", none: "" });
      setEditing("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the segment.");
    }
  }

  async function remove(id: string) {
    await marketingApi(token, `/api/marketing/segments/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <MarketingFrame title="Segments" subtitle="A segment is a saved filter. Campaigns can send to one segment instead of the whole list.">
      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
      <form onSubmit={save} className={`${cardCls} mb-4 grid gap-3 p-5 md:grid-cols-2`}>
        <label className="md:col-span-2"><span className={labelCls}>Name</span><input className={inputCls} value={name} onChange={(event) => setName(event.target.value)} required placeholder="Austin agents" /></label>
        <label><span className={labelCls}>Search</span><input className={inputCls} value={filter.query} onChange={(event) => setFilter({ ...filter, query: event.target.value })} /></label>
        <label><span className={labelCls}>Has all tags</span><input className={inputCls} value={tagText.all} placeholder="vip, austin" onChange={(event) => { setTagText({ ...tagText, all: event.target.value }); setFilter({ ...filter, tagsAll: tagsFrom(event.target.value) }); }} /></label>
        <label><span className={labelCls}>Has any tag</span><input className={inputCls} value={tagText.any} placeholder="vip, austin" onChange={(event) => { setTagText({ ...tagText, any: event.target.value }); setFilter({ ...filter, tagsAny: tagsFrom(event.target.value) }); }} /></label>
        <label><span className={labelCls}>Excludes tags</span><input className={inputCls} value={tagText.none} onChange={(event) => { setTagText({ ...tagText, none: event.target.value }); setFilter({ ...filter, tagsNone: tagsFrom(event.target.value) }); }} /></label>
        <label>
          <span className={labelCls}>Source</span>
          <select className={inputCls} value={filter.source} onChange={(event) => setFilter({ ...filter, source: event.target.value as SegmentFilter["source"] })}>
            <option value="">Any</option>
            <option value="client">Customer</option>
            <option value="import">Import</option>
            <option value="manual">Added here</option>
          </select>
        </label>
        <label>
          <span className={labelCls}>Verified</span>
          <select className={inputCls} value={filter.verified} onChange={(event) => setFilter({ ...filter, verified: event.target.value as SegmentFilter["verified"] })}>
            <option value="">Any</option>
            <option value="yes">Verified</option>
            <option value="no">Never verified</option>
          </select>
        </label>
        <label>
          <span className={labelCls}>Custom field</span>
          <input className={inputCls} placeholder="City" value={filter.fields[0]?.key || ""} onChange={(event) => setFilter({ ...filter, fields: [{ key: event.target.value, value: filter.fields[0]?.value || "" }] })} />
        </label>
        <label>
          <span className={labelCls}>Equals</span>
          <input className={inputCls} placeholder="Austin" value={filter.fields[0]?.value || ""} onChange={(event) => setFilter({ ...filter, fields: [{ key: filter.fields[0]?.key || "", value: event.target.value }] })} />
        </label>
        <div className="md:col-span-2 flex gap-2">
          <button className={buttonCls} type="submit">{editing ? "Update segment" : "Save segment"}</button>
          {editing ? <button className={ghostCls} type="button" onClick={() => { setEditing(""); setName(""); setFilter(EMPTY_SEGMENT_FILTER); setTagText({ all: "", any: "", none: "" }); }}>Cancel</button> : null}
        </div>
      </form>
      <div className="grid gap-3">
        {segments.length === 0 ? <p className={`${cardCls} p-6 text-sm text-gray-500`}>No saved segments yet.</p> : segments.map((segment) => (
          <article key={segment.id} className={`${cardCls} flex flex-wrap items-center justify-between gap-3 p-4`}>
            <div>
              <h2 className="font-black text-gray-900">{segment.name}</h2>
              <p className="text-sm text-gray-500">{segment.count} contacts · {[...segment.filter.tagsAll, ...segment.filter.tagsAny].join(", ") || "No tag filter"}</p>
            </div>
            <div className="flex gap-2">
              <button type="button" className={ghostCls} onClick={() => { setEditing(segment.id); setName(segment.name); setFilter(segment.filter); setTagText({ all: segment.filter.tagsAll.join(", "), any: segment.filter.tagsAny.join(", "), none: segment.filter.tagsNone.join(", ") }); }}>Edit</button>
              <button type="button" className={ghostCls} onClick={() => remove(segment.id).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not delete."))}>Delete</button>
            </div>
          </article>
        ))}
      </div>
    </MarketingFrame>
  );
}
