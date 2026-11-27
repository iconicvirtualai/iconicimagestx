/**
 * Dev-only screenshot of the Projects workspace Send to Client flow.
 * The project, invoice, and recipient are a labeled sample. Nothing is written
 * to Firestore and the sample send route does not email anyone.
 */

import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { navGroups } from "@/lib/adminNav";
import { unreadCounts } from "@shared/adminUnread";
import { AdminSidebarNav } from "@/components/admin/AdminSidebarNav";
import { GalleryUploadBoard } from "@/components/gallery-delivery/GalleryUploadBoard";
import { SendToClientButton, SendToClientModal } from "@/components/delivery/SendToClientModal";
import { sampleDeliveryDraft } from "@shared/clientDelivery";

const draft = sampleDeliveryDraft();

function sampleProject() {
  const mediaOrigin = window.location.origin;
  return {
  id: "preview",
  projectType: "real_estate",
  clientName: "Jordan Hale",
  clientEmail: "jordan.hale@example.com",
  address: "1842 Live Oak Lane, Spring, TX 77380",
  orderNumber: "#1042",
  images: [
    { id: "front", url: `${mediaOrigin}/media/portal-v2/deliver-hero.jpg`, name: "Front elevation.jpg", type: "photo" },
    { id: "living", url: `${mediaOrigin}/media/portal-v2/deliver-living.jpg`, name: "Living room.jpg", type: "photo" },
    { id: "kitchen", url: `${mediaOrigin}/media/portal-v2/deliver-kitchen.jpg`, name: "Kitchen.jpg", type: "photo" },
    { id: "bath", url: `${mediaOrigin}/media/portal-v2/deliver-bath.jpg`, name: "Primary bath.jpg", type: "photo" },
    { id: "yard", url: `${mediaOrigin}/media/portal-v2/deliver-yard.jpg`, name: "Backyard.jpg", type: "photo" },
  ],
  videos: [{ id: "walk", url: `${mediaOrigin}/media/portal-v2/deliver-dining.jpg`, name: "Walkthrough.mp4", type: "video" }],
  floorplans: [{ id: "plan", url: `${mediaOrigin}/media/playtest/TEST-delivery-qa-floorplan.png`, name: "Floor plan.png", type: "floorplan" }],
  tourUrl: "https://my.matterport.com/show/?m=sample",
  };
}

export default function AdminProjectsDeliveryFixture() {
  const [params] = useSearchParams();
  const project = sampleProject();
  const [open, setOpen] = useState(params.get("compose") === "1");
  const [tab, setTab] = useState(0);

  return (
    <main className="min-h-screen bg-[#f4f7f8] text-slate-900">
      <p data-testid="projects-fixture-banner" className="bg-amber-100 px-4 py-2 text-center text-xs font-bold text-amber-950">
        Sample project for review. Not stored in Firestore. Send stays in preview and does not email a client.
      </p>
      <div className="grid min-h-screen lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="hidden bg-[#0a0a0a] lg:block" data-testid="projects-fixture-nav">
          <div className="border-b border-gray-800 p-5">
            <span className="block text-xs font-black uppercase tracking-widest text-white">Iconic</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Ops Portal</span>
          </div>
          <AdminSidebarNav groups={navGroups} activeHref="/admin/listings" role="admin" counts={unreadCounts({})} />
        </aside>
        <div className="min-w-0 px-4 py-6 sm:px-6">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Projects</p>
          <div className="mb-4 mt-2 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-gray-100 bg-white px-5 py-4 shadow-sm" data-testid="send-to-client-bar">
            <div>
              <h1 className="text-lg font-black text-black">1842 Live Oak Lane</h1>
              <p className="text-xs text-gray-500">Photos are organized. Send the client presentation and invoice.</p>
            </div>
            <SendToClientButton onClick={() => setOpen(true)} />
          </div>
          <GalleryUploadBoard
            project={project}
            userId="fixture"
            activeTab={tab}
            onTab={setTab}
            onSaveArrangement={async () => undefined}
            onPatch={async () => undefined}
          />
        </div>
      </div>
      <SendToClientModal
        open={open}
        draft={draft}
        onClose={() => setOpen(false)}
        onSend={async (body) => {
          const res = await fetch("/api/deliver/preview/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(typeof data.note === "string" ? data.note : "Could not send this delivery.");
          return { note: typeof data.note === "string" ? data.note : "No email was sent." };
        }}
      />
    </main>
  );
}
