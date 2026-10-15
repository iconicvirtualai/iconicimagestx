import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import { isStudioEditorPath, midRenderPreview, type StudioProjectJob, type StudioProjectRecord } from "@shared/studioProjects";
import { useAuth } from "@/contexts/AuthContext";
import {
  downloadStudioJobFile,
  getStudioJobManager,
  setStudioJobTokenGetter,
  watchStudioJobs,
} from "@/lib/studioJobRuntime";

interface StudioJobsContextValue {
  jobs: StudioProjectJob[];
  projects: StudioProjectRecord[];
  activeCount: number;
  viewerUid: string;
  retry: (job: StudioProjectJob) => void;
  download: (job: StudioProjectJob) => void;
}

const StudioJobsContext = createContext<StudioJobsContextValue>({
  jobs: [],
  projects: [],
  activeCount: 0,
  viewerUid: "",
  retry: () => undefined,
  download: () => undefined,
});

export function useStudioJobs(): StudioJobsContextValue {
  return useContext(StudioJobsContext);
}

export default function StudioJobRoot({ children }: { children?: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const [version, setVersion] = useState(0);
  const manager = getStudioJobManager();

  useEffect(() => {
    setStudioJobTokenGetter(() => {
      if (!user) return Promise.reject(new Error("Sign in again before rendering."));
      return user.getIdToken();
    });
  }, [user]);

  useEffect(() => watchStudioJobs(user?.uid || null), [user?.uid]);

  useEffect(() => {
    const onJobs = () => {
      const finished = manager.takeFinished();
      if (!isStudioEditorPath(location.pathname)) {
        for (const job of finished) {
          if (job.status === "done") toast.success(`${job.fileName} is ready in My Projects.`);
          if (job.status === "failed") toast.error(`${job.fileName} failed. Retry it from My Projects.`);
        }
      }
      setVersion((current) => current + 1);
    };
    return manager.subscribe(onJobs);
  }, [location.pathname, manager]);

  useEffect(() => {
    if (!user || user.uid !== "temp-admin-uid") return;
    const params = new URLSearchParams(location.search);
    if (params.get("preview") !== "mid-render") return;
    const preview = midRenderPreview(Date.now());
    manager.hydrate(preview.jobs, [preview.project], preview.project.id);
  }, [location.search, manager, user]);

  const state = manager.getState();
  const viewerUid = user?.uid || "";
  const value: StudioJobsContextValue = {
    jobs: state.jobs,
    projects: state.projects,
    activeCount: viewerUid ? manager.activeCount(viewerUid) : 0,
    viewerUid,
    retry: (job) => {
      if (!viewerUid) return;
      manager.retry(job.id, viewerUid);
    },
    download: (job) => {
      void downloadStudioJobFile(job).catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : "That download is not available.");
      });
    },
  };

  return (
    <StudioJobsContext.Provider value={value}>
      <span className="hidden" data-studio-jobs-version={version} />
      {children}
    </StudioJobsContext.Provider>
  );
}
