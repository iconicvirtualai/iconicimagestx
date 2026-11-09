/**
 * Podcast and marketing content.
 * The same task record is on the checklist. Does not email, text, or post.
 */

import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import AdminLayout from "@/components/AdminLayout";
import { ContentWorkspace, type ContentSection } from "@/components/taskBoard/ContentWorkspace";
import { useOfficeEvents } from "@/lib/useOfficeEvents";
import { useTaskBoardData } from "@/lib/useTaskBoardData";
import { fetchAdminInsights } from "@/lib/insightsApi";
import {
  sampleContentInsights,
  setContentStage,
  setPublishDate,
  trackInsight,
  type ContentInsight,
} from "@shared/contentPlan";
import {
  createContentItem,
  withAssignee,
  withToggled,
  type ContentStage,
  type TaskAssignee,
} from "@shared/taskBoard";

function sectionFrom(value: string | null): ContentSection {
  if (value === "promo" || value === "calendar") return value;
  return "podcast";
}

export default function AdminContent() {
  const data = useTaskBoardData();
  const office = useOfficeEvents(data.sample, data.today);
  const [params, setParams] = useSearchParams();
  const section = sectionFrom(params.get("section"));
  const [month, setMonth] = useState(data.today.slice(0, 7));
  const [insights, setInsights] = useState<ContentInsight[]>(data.sample ? sampleContentInsights(data.today) : []);
  const selectedId = params.get("item");

  useEffect(() => {
    setInsights(data.sample ? sampleContentInsights(data.today) : []);
  }, [data.sample, data.today]);

  useEffect(() => {
    if (data.sample || !data.user) return undefined;
    let cancelled = false;
    void data.user.getIdToken()
      .then((token) => fetchAdminInsights(token))
      .then((posts) => {
        if (cancelled) return;
        setInsights(posts.map((post) => ({
          id: post.id,
          title: post.title,
          publishedAt: post.publishedAt,
          updatedAt: post.updatedAt,
          readyForSocial: post.readyForSocial,
          categories: post.categories,
        })));
      })
      .catch(() => {
        if (!cancelled) setInsights([]);
      });
    return () => {
      cancelled = true;
    };
  }, [data.sample, data.user]);

  const setSection = (next: ContentSection, item?: string) => {
    const updated = new URLSearchParams(params);
    updated.set("section", next);
    if (item) updated.set("item", item);
    else if (next === "calendar") updated.delete("item");
    setParams(updated, { replace: true });
  };

  const { tasks, commit } = data;
  const stamp = () => new Date().toISOString();

  return (
    <AdminLayout title="Content">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          {data.sample ? "Sample content for layout review. Not a live show or campaign." : "Podcast and promo items are the same records as the task board."}
        </p>
        <Link to={data.sample ? "/admin/content" : "/admin/content?sample=1"} className="text-xs font-bold uppercase tracking-widest text-[#0d9488]">
          {data.sample ? "Live content" : "View sample"}
        </Link>
      </div>
      {data.loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#0d9488] border-t-transparent" />
        </div>
      ) : (
        <ContentWorkspace
          tasks={tasks}
          staff={data.staff}
          insights={insights}
          events={office.events.map((event) => ({ id: event.id, name: event.name, date: event.date, sample: event.sample }))}
          today={data.today}
          month={month}
          section={section}
          selectedId={selectedId}
          sample={data.sample}
          onSection={(next) => setSection(next)}
          onMonth={setMonth}
          onSelect={(id) => {
            const task = tasks.find((item) => item.id === id);
            setSection(task?.contentKind === "promo" ? "promo" : "podcast", id);
          }}
          onStage={(id, stage: ContentStage) => commit(setContentStage(tasks, id, stage, stamp()))}
          onAssign={(id, assignee: TaskAssignee | null) => commit(withAssignee(tasks, id, assignee, stamp()))}
          onPublish={(id, publishOn) => commit(setPublishDate(tasks, id, publishOn, stamp()))}
          onToggle={(id) => commit(withToggled(tasks, id, stamp()))}
          onCreate={(input) => {
            const created = createContentItem({
              id: `content:${crypto.randomUUID()}`,
              kind: input.kind,
              title: input.title,
              contentStage: "idea",
              publishOn: input.publishOn,
              assignee: null,
              sample: data.sample,
              at: stamp(),
            });
            if (created.ok === false) {
              toast.error(created.error);
              return;
            }
            commit([...tasks, created.task]);
            setSection(input.kind, created.task.id);
            toast("Added to the content plan and the checklist.");
          }}
          onTrackInsight={(insight) => {
            const tracked = trackInsight(tasks, insight, stamp());
            const kind = tracked.tasks.find((task) => task.id === tracked.id)?.contentKind === "podcast" ? "podcast" : "promo";
            if (tracked.tasks.length === tasks.length) {
              setSection(kind, tracked.id);
              toast("That Insights post is already on the plan.");
              return;
            }
            commit(tracked.tasks);
            setSection(kind, tracked.id);
          }}
        />
      )}
    </AdminLayout>
  );
}
