import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";
import { PhotographerPortal } from "@/components/photographer/PhotographerPortal";
import { useAuth } from "@/contexts/AuthContext";
import {
  buildPhotographerPortal,
  chicagoDateKey,
  type PhotographerStudioJob,
  type PhotographerTab,
} from "@shared/photographerPortal";
import {
  DEMO_PHOTOGRAPHER_FIRST_NAME,
  DEMO_PHOTOGRAPHER_ID,
  DEMO_PHOTOGRAPHER_LABEL,
  DEMO_PHOTOGRAPHER_PAY_RATE,
  demoPhotographerJobs,
  isDemoPhotographer,
} from "@shared/photographerPreview";
import { OPS_PATH } from "@shared/opsLifecycle";

interface PreviewPhotographer {
  id: string;
  firstName: string;
  lastName: string;
}

export default function AdminPhotographerPreview() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const selected = params.get("photographer") || DEMO_PHOTOGRAPHER_ID;
  const demo = isDemoPhotographer(selected);
  const [tab, setTab] = useState<PhotographerTab>("next");
  const [roster, setRoster] = useState<PreviewPhotographer[]>([]);
  const [liveJobs, setLiveJobs] = useState<ReturnType<typeof buildPhotographerPortal> | null>(null);
  const [firstName, setFirstName] = useState(DEMO_PHOTOGRAPHER_FIRST_NAME);
  const [payRate, setPayRate] = useState(DEMO_PHOTOGRAPHER_PAY_RATE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/staff", { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json().catch(() => []);
        if (!res.ok || cancelled) return;
        const people = (Array.isArray(data) ? data : [])
          .filter((person) => person?.role === "photographer" && person?.isActive !== false && person?.qaOnly !== true && person?.playtest !== true)
          .map((person) => ({
            id: String(person.id || person.uid || ""),
            firstName: String(person.firstName || "").trim(),
            lastName: String(person.lastName || "").trim(),
          }))
          .filter((person) => person.id);
        if (!cancelled) setRoster(people);
      } catch {
        if (!cancelled) setRoster([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user || demo) {
      setLiveJobs(null);
      setFirstName(DEMO_PHOTOGRAPHER_FIRST_NAME);
      setPayRate(DEMO_PHOTOGRAPHER_PAY_RATE);
      setError("");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/ops/photographer-preview?staffId=${encodeURIComponent(selected)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || "Could not load that photographer.");
        setFirstName(String(data.photographer?.firstName || "Photographer"));
        setPayRate(typeof data.photographer?.payRate === "number" ? data.photographer.payRate : DEMO_PHOTOGRAPHER_PAY_RATE);
        setLiveJobs(buildPhotographerPortal({
          listings: Array.isArray(data.listings) ? data.listings : [],
          studioJobs: (Array.isArray(data.studioJobs) ? data.studioJobs : []) as PhotographerStudioJob[],
          today: chicagoDateKey(new Date()),
        }));
      } catch (err) {
        if (!cancelled) {
          setLiveJobs([]);
          setError(err instanceof Error ? err.message : "Could not load that photographer.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, demo, selected]);

  const jobs = useMemo(
    () => (demo ? demoPhotographerJobs(chicagoDateKey(new Date())) : liveJobs || []),
    [demo, liveJobs],
  );
  const chosen = roster.find((person) => person.id === selected);
  const who = demo
    ? DEMO_PHOTOGRAPHER_LABEL
    : [chosen?.firstName, chosen?.lastName].filter(Boolean).join(" ") || firstName;

  return (
    <AdminLayout title="Photographer preview">
      <div
        data-testid="photographer-preview-banner"
        className="sticky top-0 z-20 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3"
      >
        <p className="max-w-3xl text-sm font-black text-amber-950">
          Preview only. This is the photographer portal for {who}. Nothing on this screen is sent or saved.
        </p>
        <Link
          to={OPS_PATH}
          data-testid="preview-exit"
          className="inline-flex shrink-0 items-center rounded-xl bg-black px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white"
        >
          Exit
        </Link>
      </div>

      <label className="mb-6 block max-w-md">
        <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-gray-500">Photographer</span>
        <select
          aria-label="Photographer"
          value={demo ? DEMO_PHOTOGRAPHER_ID : selected}
          onChange={(event) => {
            const next = new URLSearchParams(params);
            next.set("photographer", event.target.value);
            setParams(next, { replace: true });
            setTab("next");
          }}
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-bold"
        >
          <option value={DEMO_PHOTOGRAPHER_ID}>{DEMO_PHOTOGRAPHER_LABEL}</option>
          {roster.map((person) => (
            <option key={person.id} value={person.id}>
              {[person.firstName, person.lastName].filter(Boolean).join(" ") || "Photographer"}
            </option>
          ))}
        </select>
      </label>

      <PhotographerPortal
        firstName={demo ? DEMO_PHOTOGRAPHER_FIRST_NAME : firstName}
        jobs={jobs}
        tab={tab}
        onTab={setTab}
        loading={loading}
        error={error}
        iconicPolish={false}
        onIconicPolish={() => undefined}
        payRate={payRate}
        onUpload={() => undefined}
        readOnly
      />
    </AdminLayout>
  );
}
