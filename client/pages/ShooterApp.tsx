import { useEffect, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Bell, Briefcase, MessageSquare, Share } from "lucide-react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { PhotographerPortal } from "@/components/photographer/PhotographerPortal";
import { PushNotice, TeamChatLive, TeamChatSample } from "@/components/communications/TeamChat";
import {
  buildPhotographerPortal,
  chicagoDateKey,
  type PhotographerJobCard,
  type PhotographerStudioJob,
  type PhotographerTab,
} from "@shared/photographerPortal";
import { fetchAssignedListings } from "@/lib/listingUpload";
import { fetchStudioWorkspace } from "@/lib/studioApi";
import type { TeamChatSampleView } from "@/components/communications/teamChatSample";
import { useAuth } from "@/contexts/AuthContext";

const VIEWS = new Set(["list", "channel", "group", "dm", "new", "log"]);

function sampleJobs() {
  return buildPhotographerPortal({
    today: "2026-11-10",
    listings: [
      {
        id: "oak",
        status: "scheduled",
        address: "10 Oak Street, Spring, TX",
        clientName: "Example Agent",
        apptDate: "2026-11-10T16:00:00.000Z",
        apptTime: "10:00 AM",
        accessInfo: "Lockbox 4481",
        images: [],
      },
    ],
    studioJobs: [],
  });
}

function useShooterPwa() {
  useEffect(() => {
    const manifest = document.querySelector<HTMLLinkElement>("link[data-shooter-manifest]") || document.createElement("link");
    manifest.rel = "manifest";
    manifest.href = "/shooter.webmanifest";
    manifest.dataset.shooterManifest = "true";
    document.head.appendChild(manifest);
    const metas: Array<[string, string]> = [
      ["apple-mobile-web-app-capable", "yes"],
      ["mobile-web-app-capable", "yes"],
      ["apple-mobile-web-app-title", "Shooter"],
      ["apple-mobile-web-app-status-bar-style", "black-translucent"],
    ];
    const nodes = metas.map(([name, content]) => {
      const meta = document.createElement("meta");
      meta.name = name;
      meta.content = content;
      meta.dataset.shooterMeta = "true";
      document.head.appendChild(meta);
      return meta;
    });
    const icon = document.createElement("link");
    icon.rel = "apple-touch-icon";
    icon.href = "/shooter-icon-180.png";
    icon.dataset.shooterIcon = "true";
    document.head.appendChild(icon);
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/shooter-sw.js", { scope: "/shooter" }).catch(() => undefined);
    }
    return () => {
      manifest.remove();
      icon.remove();
      nodes.forEach((node) => node.remove());
    };
  }, []);
}

export default function ShooterApp() {
  const [params] = useSearchParams();
  const sample = params.get("sample") === "1";
  useShooterPwa();
  if (sample) {
    const requested = params.get("view") || "channel";
    const view = (VIEWS.has(requested) ? requested : "channel") as TeamChatSampleView;
    return (
      <ShooterShell
        sample
        firstName="Alex"
        panel={params.get("panel") === "jobs" ? "jobs" : "communications"}
        view={view}
        notice={params.get("notice") === "1"}
      />
    );
  }
  return (
    <ProtectedRoute requiredRole="staff">
      <LiveShooter />
    </ProtectedRoute>
  );
}

function LiveShooter() {
  const { user, staffProfile } = useAuth();
  const [params] = useSearchParams();
  const [jobs, setJobs] = useState<PhotographerJobCard[]>([]);
  useEffect(() => {
    if (!user) return;
    void Promise.allSettled([
      fetchAssignedListings(),
      fetchStudioWorkspace(undefined, () => user.getIdToken()),
    ]).then(([assigned, studio]) => {
      const listings = assigned.status === "fulfilled" ? assigned.value : [];
      const studioJobs = studio.status === "fulfilled" ? (studio.value.jobs || []) as PhotographerStudioJob[] : [];
      setJobs(buildPhotographerPortal({
        listings,
        studioJobs,
        today: chicagoDateKey(new Date()),
      }));
    });
  }, [user]);
  return (
    <ShooterShell
      firstName={staffProfile?.firstName || ""}
      panel={params.get("panel") === "jobs" ? "jobs" : "communications"}
      threadId={params.get("thread") || ""}
      jobs={jobs}
      getToken={() => user?.getIdToken() || Promise.resolve("")}
    />
  );
}

function ShooterShell({
  sample = false,
  firstName,
  panel,
  view = "channel",
  notice = false,
  threadId = "",
  jobs,
  getToken,
}: {
  sample?: boolean;
  firstName: string;
  panel: "jobs" | "communications";
  view?: TeamChatSampleView;
  notice?: boolean;
  threadId?: string;
  jobs?: PhotographerJobCard[];
  getToken?: () => Promise<string>;
}) {
  const [tab, setTab] = useState<PhotographerTab>("next");
  const [hint, setHint] = useState("");
  const visibleJobs = jobs && jobs.length > 0 ? jobs : sample ? sampleJobs() : [];
  return (
    <main className="relative min-h-screen bg-[#f5f2ea] text-stone-900">
      {notice ? (
        <PushNotice
          title="Iconic · #dispatch"
          body="Cadi: Client asked to start in the backyard."
        />
      ) : null}
      <header className="bg-[#0d9488] px-4 py-4 text-white">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#e8c872]">Iconic Images</p>
        <div className="mt-1 flex items-end justify-between gap-3">
          <h1 className="text-2xl font-black">Shooter</h1>
          <p className="text-xs font-bold text-teal-50">{firstName ? firstName : "Team"}</p>
        </div>
      </header>
      <InstallStrip sample={sample} hint={hint} onPush={() => void enablePush(sample, setHint, getToken)} />
      <nav className="flex border-b border-[#e7e0d2] bg-white" aria-label="Shooter">
        <TabLink id="jobs" current={panel} icon={<Briefcase className="h-4 w-4" />} label="Jobs" />
        <TabLink id="communications" current={panel} icon={<MessageSquare className="h-4 w-4" />} label="Communications" />
      </nav>
      {panel === "communications" ? (
        <div data-testid="shooter-communications">
          {sample ? <TeamChatSample view={view} viewerId="alex" /> : <TeamChatLive initialThreadId={threadId} />}
        </div>
      ) : (
        <div className="p-4">
          <PhotographerPortal
            firstName={firstName}
            jobs={visibleJobs}
            tab={tab}
            onTab={setTab}
            iconicPolish={false}
            onIconicPolish={() => undefined}
            payRate={75}
            onUpload={() => undefined}
            readOnly={sample}
          />
          {sample ? null : (
            <p className="mt-4 text-sm text-stone-600">
              Assigned shoots stay on <Link className="font-bold text-[#0f766e]" to="/admin/photographer">My jobs</Link>.
            </p>
          )}
        </div>
      )}
    </main>
  );
}

function TabLink({
  id,
  current,
  icon,
  label,
}: {
  id: "jobs" | "communications";
  current: string;
  icon: ReactNode;
  label: string;
}) {
  const sample = typeof window !== "undefined" && window.location.search.includes("sample=1");
  const params = new URLSearchParams(sample ? "sample=1" : "");
  params.set("panel", id);
  return (
    <Link
      to={`/shooter?${params.toString()}`}
      data-testid={`shooter-tab-${id}`}
      aria-current={current === id ? "page" : undefined}
      className={`flex flex-1 items-center justify-center gap-2 px-3 py-3 text-[10px] font-black uppercase tracking-widest ${current === id ? "border-b-2 border-[#0d9488] text-[#0f766e]" : "text-stone-400"}`}
    >
      {icon}
      {label}
    </Link>
  );
}

function InstallStrip({
  sample,
  hint,
  onPush,
}: {
  sample: boolean;
  hint: string;
  onPush: () => void;
}) {
  return (
    <section className="border-b border-[#e7e0d2] bg-white px-4 py-3">
      <p className="flex items-center gap-2 text-xs font-bold text-stone-700">
        <Share className="h-3.5 w-3.5 text-[#0d9488]" /> Add Shooter to your Home Screen, then turn on push.
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-stone-500">
        iPhone and iPad: open this page in Safari, tap Share, then Add to Home Screen. Push works after that on iOS 16.4 or later. Android: use the browser install prompt, or the button below.
      </p>
      <button type="button" onClick={onPush} className="mt-2 inline-flex items-center gap-2 rounded-xl bg-[#0f766e] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white">
        <Bell className="h-3.5 w-3.5" /> {sample ? "Push is the alert" : "Enable push"}
      </button>
      {hint ? <p className="mt-2 text-xs text-stone-600">{hint}</p> : null}
    </section>
  );
}

async function enablePush(
  sample: boolean,
  setHint: (value: string) => void,
  getToken?: () => Promise<string>,
) {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone = window.matchMedia("(display-mode: standalone)").matches
    || ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
  if (ios && !standalone) {
    setHint("On iPhone, add Shooter to the Home Screen first. iOS delivers web push only to installed apps, and only on iOS 16.4 or later.");
    return;
  }
  if (sample) {
    setHint("Sample mode shows the alert in the app. A real login registers this device for push.");
    return;
  }
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    setHint("This browser does not offer web push. Texts remain the fallback when TEAM_SMS_LIVE is on.");
    return;
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    setHint("Push stays off until you allow notifications.");
    return;
  }
  const registration = await navigator.serviceWorker.ready;
  const token = getToken ? await getToken() : "";
  const keyResponse = await fetch("/api/team-chat/push/public-key", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const keyData = await keyResponse.json().catch(() => ({}));
  if (!keyResponse.ok || typeof keyData.publicKey !== "string") {
    setHint("Push keys are not configured yet. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.");
    return;
  }
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
  });
  const json = subscription.toJSON();
  const saved = await fetch("/api/team-chat/push/subscribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
  });
  setHint(saved.ok ? "Push is on for this device. Texts stay the fallback." : "The browser allowed push, but the server did not save it.");
}

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index);
  return output;
}
