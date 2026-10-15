import AdminLayout from "@/components/AdminLayout";
import { MyProjectsPanel } from "@/components/studio-jobs/MyProjectsPanel";
import { useStudioJobs } from "@/components/studio-jobs/StudioJobRoot";

export default function AdminMyProjects() {
  const studio = useStudioJobs();
  return (
    <AdminLayout title="My Projects">
      <MyProjectsPanel
        jobs={studio.jobs}
        projects={studio.projects}
        viewerUid={studio.viewerUid}
        now={Date.now()}
        onRetry={studio.retry}
        onDownload={studio.download}
      />
    </AdminLayout>
  );
}
